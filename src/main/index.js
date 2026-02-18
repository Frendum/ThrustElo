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
  
  if(Object.prototype.toString.call(favorites) === '[object Array]' || favorites === undefined) {
    store.set("favorites", {})
  }

  if(!context) {
    mainWindow.webContents.send('sendtohome');
    return
  }

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

  data = data.filter((player) => player.kills>=11 && player.pilotNames.length > 0);

  data.forEach((player) => {
    if(player.isBanned) player.rank = null;
  });

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

    let eloHistory = {
      start: null
    }
    
    if(data.eloHistory.length){
      eloHistory = data.eloHistory.sort((a, b) => a.time - b.time)
      eloHistory = eloHistory.reduce((acc, item) => {
        acc.nadir = Math.min(acc.nadir, item.elo);
        acc.peak = Math.max(acc.peak, item.elo);
        return acc
      }, {
        peak: -Infinity,
        nadir: Infinity,
        data: eloHistory,
        start: eloHistory[0].time,
        end: eloHistory[eloHistory.length - 1].time,
      });
    }

    let sessions = data.sessions.sort((a, b) => a.startTime - b.startTime)
      .filter((session) => { return session.startTime != 0 && session.endTime != 0 && session.startTime > eloHistory.start });

    if(sessions.length){
      const hours = sessions.reduce((acc, item) => {
        return acc + (item.endTime - item.startTime)
      }, 0) /(1000 * 3600);

      sessions = sessions.reduce((acc, item, index) => {
        if(index == 0){
          acc.data.push({
            start: item.startTime,
          })
        }
        else if (item.startTime > sessions[index - 1].endTime + 1000 * 3600 * 2){
          acc.data[acc.data.length - 1].end = sessions[index - 1].endTime;
          acc.data.push({
            start: item.startTime,
          })
        }
  
        if(index == sessions.length - 1){
          acc.data[acc.data.length - 1].end = item.endTime;
        }
        return acc
      },{
        start: sessions[0].startTime,
        end: sessions[sessions.length - 1].endTime,
        data: [],
      });

      sessions.hours = hours
    }
    else {
      sessions = null;
    }

    let enemies = history.filter(event => ["Death to", "Kill", "Teamkill", "Death to teamkill"].includes(event.type))
    .reduce((acc, event) => {
      let target = acc.find(t => t.name === event.player.name)
      if(target){
        if(["Death to", "Kill"].includes(event.type)){
          target.events++;
          target.eavarage = target.eavarage + event.player.elo;
          if(event.type === "Kill") target.k++;
          else target.d++;

          target.netelo = target.netelo + event.elo;
        }
        else {
          target.teamevents++;
          if(event.type === "Teamkill") target.tk++;
          else target.td++;
        }

      } else {
        acc.push({
          name: event.player.name,
          events: ["Death to", "Kill"].includes(event.type) ? 1 : 0,
          teamevents: ["Teamkill", "Death to teamkill"].includes(event.type) ? 1 : 0,
          eavarage: event.player.elo || 0,
          k: event.type === "Kill" ? 1 : 0,
          d: event.type === "Death to" ? 1 : 0,
          tk: event.type === "Teamkill" ? 1 : 0,
          td: event.type === "Death to teamkill" ? 1 : 0,
          netelo: event.elo,
        })
      }
      return acc;
    },[]);

    enemies.forEach(target => {
      target.eavarage = Math.round(target.eavarage / target.events);
      target.kd = +((target.k/target.d).toFixed(4))
    })
    
    enemies = enemies.sort((a, b) => {
      if(a.events === b.events){
        return a.name>b.name ? 1 : -1;
      } else {
        return a.events<b.events ? 1 : -1;
      }
    });
    
    let weapons = history.filter(event => ["Death to", "Kill"].includes(event.type))
    .reduce((acc, event) => {
      if(event.type === "Kill") {
        acc.plane.kill_in[event.gun.from] = (acc.plane.kill_in[event.gun.from] || 0) + 1;
        acc.plane.kill_to[event.gun.to] = (acc.plane.kill_to[event.gun.to] || 0) + 1;
        acc.weapon.kill[event.gun.type] = (acc.weapon.kill[event.gun.type] || 0) + 1;
      }
      else {
        acc.plane.death_in[event.gun.to] = (acc.plane.death_in[event.gun.to] ||0) + 1;
        acc.plane.death_by[event.gun.from] = (acc.plane.death_by[event.gun.from] || 0) + 1;
        acc.weapon.death[event.gun.type] = (acc.weapon.death[event.gun.type] || 0) + 1;
      }
      return acc
    },{
      plane: {
        kill_in: {},
        kill_to: {},
        death_in: {},
        death_by: {},
      },
      weapon: {
        kill: {},
        death: {}
      }
    });

    let avgdeltaelo = history.filter(event => ["Death to", "Kill"].includes(event.type))
    .reduce((acc, event) => {
      if(event.type === "Kill") {
        acc.elo.victim += event.player.elo
        acc.elo.deltavictim += event.elo*2 + event.player.elo - event.newElo
        acc.type.kill +=1
      }
      else {
        acc.elo.antagonist += event.player.elo 
        acc.elo.deltaantagonist += -event.elo*2 + event.player.elo - event.newElo
        acc.type.death +=1
      }
      return acc
    },{
      elo: {
        victim: 0,
        antagonist: 0,
        deltavictim: 0,
        deltaantagonist: 0,
      },
      type: {
        kill: 0,
        death: 0
      }
    });

    avgdeltaelo.elo.victim = Math.round(avgdeltaelo.elo.victim / avgdeltaelo.type.kill);
    avgdeltaelo.elo.antagonist = Math.round(avgdeltaelo.elo.antagonist / avgdeltaelo.type.death);
    avgdeltaelo.elo.deltavictim = Math.round(avgdeltaelo.elo.deltavictim / avgdeltaelo.type.kill);
    avgdeltaelo.elo.deltaantagonist = Math.round(avgdeltaelo.elo.deltaantagonist / avgdeltaelo.type.death);

    const tks = history.filter(event => event.type === 'Teamkill')
    const tds = history.filter(event => event.type === 'Death to teamkill')

    let tksinfo = tks.reduce((acc, event) => {
      let target = acc.find(t => t.name === event.player.name)
      if(target){
        target.events++;
      } else {
        acc.push({
          name: event.player.name,
          events:1,
        })
      }
      return acc;
    },[]).sort((a, b) => b.events - a.events);

    let tdsinfo = tds.reduce((acc, event) => {
      let target = acc.find(t => t.name === event.player.name)
      if(target){
        target.events++;
      } else {
        acc.push({
          name: event.player.name,
          events:1,
        })
      }
      return acc;
    },[]).sort((a, b) => b.events - a.events);
    
    const context = {
      history: history,
      enemies: enemies,
      // orig:data,
      elo: data.elo,
      id: data.id,
      pilotName: data.pilotNames[0],
      pilotNames: data.pilotNames,
      discordId: data.discordId,
      isAlt: data.isAlt,
      altIds: data.altIds,
      altParentId: data.altParentId,
      weapons: weapons,
      achievements: data.achievements,
      eloHistory: eloHistory,
      sessions: sessions,
      rank: data.isBanned ? null : data.rank,
      isBanned: data.isBanned,
      tks: tks.length,
      tds: tds.length,
      avgdeltaelo: avgdeltaelo,
      tksinfo: tksinfo,
      tdsinfo: tdsinfo,
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
  let afterlogin = true

  player.history.forEach((line) => {
    let test = line.split(/^\[(.*?)\] (.*)/)
    if(!test[1]){
      console.log("Error, could not parse line:", line);
      return;
    }
    let time = moment(test[1]).valueOf();

    if(['Login', 'Logout'].includes(test[2])){
      afterlogin = true; 
      data.push({time: time, type: test[2]});
    } else {
      let type = ["Death to teamkill", "Teamkill", "Kill", "Death to", "Replay link"].find(substr => test[2].startsWith(substr));

      if(!type) {
        console.log("Error, could not find type:", line);
        return;
      }
      else if(type === "Replay link") {
        // console.log(line); //TODO
        return
      }

      let params = test[2].replace(type + ' ', '');
      let player = {};
      let gun = {};
      let elo = undefined;
      let newElo = undefined;
      
      if(['Kill', 'Death to'].includes(type)) {
        let test1 = params.split(/(.*?) \((\d+)\) with (\w+)\-\>(\w+)\-\>(\w+) \((\d+\.\d+|\w+)\) (.+)/)
        
        if(!time){
          console.log("Error, could not parse line:", line);
        }
        test1.shift();
        test1.pop();
        player.name = test1.shift()
        player.elo = parseInt(test1.shift())
        gun.from = test1.shift()
        gun.type = test1.shift()
        gun.to = test1.shift()
        gun.multiplier = test1.shift();

        if(gun.multiplier == "undefined"){
          gun.multiplier = "?"
        }

        test1[0] = test1[0].trimStart()

        let distance = test1[0].split(/^Distance: (\d+\.\d)nm (.+)/)
        if(distance[1]){
          gun.distance = distance[1];
          test1[0] = distance[2]
        }

        elo = test1[0].split(/^Elo (lost|gained): (\d+)\. New Elo: (\d+)/)

        if(!elo[1]){
          console.log("Error, could not parse line:", line);
          return
        }
        newElo = parseInt(elo[3]);
        elo = elo[1] == "gained" ? Number(elo[2]) : -Number(elo[2]);
      }
      else if(type === "Teamkill"){
        let test2 = params.split(/(.*?) Elo lost: \d+. New Elo: (\d+)/)
        player.name = test2[1]
        newElo = parseInt(test2[2])
        elo = 0
      }
      else if(type === "Death to teamkill") {
        let test3 = params.split(/from (.*?) no elo lost/)
        player.name = test3[1]
        elo = 0
      }

      data.push({
        time: time,
        type: type,
        player: player,
        gun: gun,
        elo: elo,
        newElo: newElo,
        afterlogin: (afterlogin && ['Kill', 'Death to'].includes(type))
      });

      if(["Kill", "Death to"].includes(type)) {
        afterlogin = false
      };
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