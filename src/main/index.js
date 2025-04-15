'use strict'
import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../build/icon.png?asset'
import Store from 'electron-store'
import {windowStateKeeper} from './stateKeeper'
import * as http from 'http'
import * as https from 'https'
const moment = require('moment');
const store = new Store()

const usetestapi = false

process.env.NODE_ENV = app.isPackaged ? 'prod' : 'dev';
const hsapidomain = app.isPackaged || !usetestapi ? "hs.vtolvr.live" : "127.0.0.1";
const hsapiport = app.isPackaged || !usetestapi ? 443 : 3001;
const restapi = app.isPackaged || !usetestapi ? https : http;


let mainWindowStateKeeper, mainWindow
const createWindow = async () => {
  mainWindowStateKeeper = await windowStateKeeper('main');

  // Create the browser window.
  mainWindow = new BrowserWindow({
    x: mainWindowStateKeeper.x,
    y: mainWindowStateKeeper.y,
    width: mainWindowStateKeeper.width,
    height: mainWindowStateKeeper.height,
    minHeight: 600,
    minWidth: 800,
    autoHideMenuBar: true,
    show: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false,
    }
  })
  
  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  Menu.setApplicationMenu(mainMenu);

  mainWindow.on('ready-to-show', async () => {
    if(mainWindowStateKeeper.isMaximized) mainWindow.maximize();
    mainWindow.show()
    mainWindowStateKeeper.track(mainWindow);
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.on('init', async (event) => {
  initdata()
});

const initdata = () => {
  console.log("initdata");
  const context = store.get("context");
  const favorites = store.get("favorites")
  if(!context) return;

  context.favorites = favorites ? Object.keys(favorites) : [];
  
  for(let player of context.ranking){
    if (player.kd === null) player.kd = Infinity
  }
  
  mainWindow.webContents.send('initdata', context);
}

ipcMain.on('updateranking', (event) => {
  getranking()
});

ipcMain.handle('getplayerdata', async (event, player) => {
  let data = await getplayerdata(player).catch((err) => {console.log(err)});
  return data
})

ipcMain.handle('flipfavorite', async (event, id) => {
  let status = store.get("favorites." + id)
  if(status === undefined){
    store.set("favorites." + id, true);
    return true;
  } else {
    store.delete("favorites." + id);
    return false;
  };
})

console.log("Appversion", app.getVersion());
ipcMain.handle('getAppversion', async (event) => {
  return app.getVersion()
})

const getranking =  async () => {
  console.log('getranking');
  spinnertext(true, "Getting rankings from server. This may take a while... <br>(Usually 15-30 seconds)");


  let data = await hsapiget("relevantUsers").catch((err) => {
    userMsg.send(err.message, false, "bg-danger", "readerror")
  });

  if(!data){
    spinnertext(false);
    return;
  }
  userMsg.clear("readerror")

  data = data.filter((player) => player.kills>=10 && player.pilotNames.length > 0);
  data = data.sort((a, b) => b.elo - a.elo)

  const favorites = store.get("favorites")

  const context = {
    ranking: data,
    updated: moment().valueOf(),
    favorites: favorites ? Object.keys(favorites) : [],
  }

  for(let player of data){
    const kd = +((player.kills / player.deaths).toFixed(4))
    player.kd = kd
  }

  store.set("context.ranking", context.ranking)
  store.set("context.updated", context.updated)

  mainWindow.webContents.send('initranking', context);
  spinnertext(false);
};

const getplayerdata = (playerid) => {
  return new Promise(async (resolve,reject) => {
    spinnertext(true, "Fetching Player Data");
    if(!playerid) return reject("No player provided");

    let data = await hsapiget("users/"+playerid).catch((err) => {
      userMsg.send(err.message, false, "bg-danger", "readerror")
      return reject();
    });

    if(!data){
      spinnertext(false);
      return reject()
    }

    userMsg.clear("readerror")

    
    const history = await hsparseuserhistory(data);

    if(history.length == 0){
      userMsg.send('Did not find any datapoints in recieved data', false, "bg-danger", "nodata")
      return reject()
    }
    else{
      userMsg.clear("nodata");
    }

    history.forEach((item, index, arr) => {
      if(item.type == "Login"){
        if(!arr[index + 1]){
          return;
          }
          else {
            arr[index + 1].afterlogin = true;
          }
      }
    })

    let enemies = history.filter(item => ["Death to", "Kill"].includes(item.type))
    enemies = enemies.reduce((acc, item) => {
      let target = acc.find(t => t[0] === item.player.name)
      if(target){
        target[1]++;
        target[2] = target[2] + parseInt(item.player.elo)
      } else {
        acc.push([item.player.name, 1, parseInt(item.player.elo)])
      }
      return acc;
    },[]);

    enemies.forEach(target => {
      target[2] = Math.round(target[2] / target[1]);
    })

    enemies = enemies.sort((a, b) => {
      if(a[1] === b[1]){
        return a[0]>b[0] ? 1 : -1;
      } else {
        return a[1]<b[1] ? 1 : -1;
      }
    });
    
    const context = {
      data: history,
      enemies: enemies,
      // orig:data,
      id: data.id,
      pilotName: data.pilotNames[0],
      pilotNames: data.pilotNames
    }

    spinnertext(false);
    resolve(context)
  });
};

const hsapiget = async (resource) => {
  return new Promise((resolve, reject) => {
    const options = {
      host: hsapidomain,
      port: hsapiport,
      path: '/api/v1/public/' + resource,
    }

    const req = restapi.get(options, (res) => {
      let chunks = [];
      res.on('data', function(chunk) {
        chunks.push(chunk);
      }).on('end', function() {
        let body = Buffer.concat(chunks);
        try {
          if(res.statusCode == 200 && res.headers['content-type'] == 'application/json; charset=utf-8'){
            resolve(JSON.parse(body));
          } else {
            if(res.headers['content-type'] == 'text/plain; charset=UTF-8'){
              throw new Error("Did not recieve a JSON response from the server: " + body.toString());
            }
            throw new Error("Did not recieve a JSON response from the server: unknown content-type");
          }
        } catch (error) {
          reject(error);
        }
      })
    });
    
    req.on('error', function(e) {
      console.log('ERROR: ' + e.message);
      reject(e);
    });
  });
};

const hsparseuserhistory = async (player) => {
  let data = [];

  player.history.forEach((line) => {
    let test = line.split(/^\[(.*?)\] (.*)/)
    if(!test[1]){
      console.log("Error, could not parse line:", line);
      return;
    }
    let time = moment(test[1]).valueOf();

    if(['Login', 'Logout'].includes(test[2])){
      data.push({time: time, type: test[2]});
    } else {
      let type = ["Death to teamkill", "Teamkill", "Death (unknown)", "Kill", "Death to"].find(substr => test[2].startsWith(substr));

      if(!type) {
        console.log("Error, could not find type:", line);
        return
      }

      let params = test[2].replace(type + ' ', '');
      let player = {};
      let gun = {};
      let elo = undefined;
      let newElo = undefined;
      
      if(['Kill', 'Death to'].includes(type)) {
        let test = params.split(/(.*?) \((\d+)\) with (\w+)\-\>(\w+)\-\>(\w+) \((\d+\.\d+|\w+)\) (.+)/)
        if(!time){
          console.log("Error, could not parse line:", line);
        }
        test.shift();
        test.pop();
        player.name = test.shift()
        player.elo = test.shift()
        gun.from = test.shift()
        gun.type = test.shift()
        gun.to = test.shift()
        gun.multiplier = test.shift();

        if(gun.multiplier == "undefined"){
          gun.multiplier = "?"
        }

        test[0] = test[0].trimStart()

        let distance = test[0].split(/^Distance: (\d+\.\d)nm (.+)/)
        if(distance[1]){
          gun.distance = distance[1];
          test[0] = distance[2]
        }

        elo = test[0].split(/^Elo (lost|gained): (\d+)\. New Elo: (\d+)/)

        if(!elo[1]){
          console.log("Error, could not parse line:", line);
          return
        }
        newElo = elo[3];
        elo = elo[1] == "gained" ? Number(elo[2]) : -Number(elo[2]);
      }
      else if(["Teamkill", "Death (unknown)"].includes(type)){
        player.name = params.split(' Elo lost:')[0] //TODO
      }
      else if(["Death to teamkill"].includes(type)) {
        // console.log("teamkilled"); TODO
      }

      data.push({
          time: time,
          type: type,
          player: player,
          gun: gun,
          elo: elo,
          newElo: newElo,
        }
      );
    }
  });

  data = data.sort((a, b) => a.time - b.time);
  
  return data;
};

const spinnertext = (state, text) => {
  mainWindow.send("spinnertext", [state, text]);
};

const userMsg = {
  /**
  * Footer message function
  * @param {string} msg - The message to be displayed in the footer
  * @param {int} timeout - How long the message should be shown for before it disappears. If set to false, the message will not disappear automatically.
  * @param {string} color - Add css class to change the color of the text
  * @param {string} id - Id for clearing later
  **/
  send: (msg, timeout, color, id) =>{
  mainWindow.webContents.send('showmsg', [msg,timeout,color,id]);
  },
  clear: (id) => {
    mainWindow.webContents.send('clearmsg', id);
  }
};

const mainMenuTemplate = [
  {
    label: 'Close',
    role: 'close',
    accelerator: process.platform ==  'darwin' ?  'Cmd+q' :  'Ctrl+Q',
  },
];

mainMenuTemplate.push({
  label: 'DevTools',
  submenu: [
    {
      label: 'Toggle Devtools',
      accelerator: 'CTRL+I',
      click(item, focusedWindow){
          focusedWindow.toggleDevTools();
      }
    },

  ]
})

if(process.env.NODE_ENV === 'dev') mainMenuTemplate.find((item) => item.label === 'DevTools').submenu.push({ role: 'reload', accelerator: 'CTRL+R' });

// Singleinstance handler
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) app.quit()
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.electron')
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
    createWindow()
    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})