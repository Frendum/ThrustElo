'use strict';
window.$ = window.jQuery = require('jquery')
const electron = require('electron'),
  { ipcRenderer } = electron,
  moment = require('moment');

import Chart from 'chart.js/auto'
import zoomPlugin from 'chartjs-plugin-zoom';
import 'bootstrap-icons/font/bootstrap-icons.css'
Chart.register(zoomPlugin);
import annotationPlugin from 'chartjs-plugin-annotation';
Chart.register(annotationPlugin);
Chart.defaults.borderColor = 'rgba(50,205,50,0.2)';
const localtime = false

let version = null;
let player = null;
let zoomlastday = false;
let activepage = "rankings"

const ranking = {
  __table: $('#rankings-table'),
  __ranking: null,
  searchterm: null,
  __resultarray: null,
  __loaded: 0,
  __favorites: [],
  newdata: function(data){
    if(data){
      this.__ranking = data.ranking
      this.__favorites = data.favorites
      $("#header-ranking").html("Last updated: " + moment(data.updated).toISOString(localtime))
    }

    $("#rankingtablehead th").removeClass("asc desc")
    $("#rankingtablehead th[data-sort='rank']").addClass("asc")
    this.sort(["rank", 1])
  },
  populate: function(){
    let i = this.__loaded;
    const end = i + 100;
    // console.log("populate", i, end);

    while(i < end && i < this.__resultarray.length){
      const tr = document.createElement('tr')

      const player = this.__resultarray[i]

      const fav = document.createElement('td')
      fav.innerHTML = this.__favorites.includes(player.id) ? "⭐":"★";
      fav.style.textAlign = "center";
      fav.style.cursor = "pointer";

      const graph = document.createElement('td')
      graph.innerHTML = "📈";
      graph.style.cursor = "pointer";

      const info = document.createElement('td')
      info.innerHTML = "ℹ️";
      info.style.cursor = "pointer";

      const rank = document.createElement('td')
      rank.innerHTML = player.isBanned ? '😭' : player.rank;
      rank.style.textAlign = "center";
  
      const elo = document.createElement('td')
      elo.innerHTML = Math.round(player.elo);
  
      const name = document.createElement('td')
      const pilotnames = [...new Set(player.pilotNames)];
      name.innerHTML = `${pilotnames.shift()}`;
      if(pilotnames.length > 0){
        const sup = document.createElement('sup')
        sup.innerHTML = ` (${pilotnames.length + 1})`;
        sup.style.cursor = "help";
        $(sup).attr("data-toggle", "tooltip");
        $(sup).attr("title", "aka. " + pilotnames);
        name.appendChild(sup)
      }
  
      const k = document.createElement('td');
      k.innerHTML = player.kills;
  
      const d = document.createElement('td');
      d.innerHTML = player.deaths;
  
      const kd = document.createElement('td')
      kd.innerHTML = `${player.kd}`

      const tk = document.createElement('td');
      tk.innerHTML = player.teamKills;

      $(fav).on('click', async function () {
        const active = await ipcRenderer.invoke("flipfavorite", player.id)
        $(this).html(active ? "⭐" : "★")
        if(active){
          ranking.__favorites.push(player.id);
        }
        else{
          ranking.__favorites = ranking.__favorites.filter((pId) => pId !== player.id);
        }
      });

      $(graph).on('click', async function () {
        $("#rankings-table tr").removeClass("selected");
        $(tr).addClass("selected");
        invokeplayerdata(player.id,"history")
      });

      $(info).on('click', async function () {
        $("#rankings-table tr").removeClass("selected");
        $(tr).addClass("selected");
        invokeplayerdata(player.id,"info")
      });

      const selectuser = () => {
        $("#rankings-table tr").removeClass("selected");
        $(tr).addClass("selected");
        console.log(player.id);
        
      };

      for(let elem of [rank,elo,name,k,d,kd,tk]){
        elem.onclick = selectuser
      }
  
      tr.append(fav);
      tr.append(info);
      tr.append(graph);
      tr.append(rank);
      tr.append(elo);
      tr.append(name);
      tr.append(k);
      tr.append(d);
      tr.append(kd);
      // tr.append(tk)
      this.__table.append(tr);

      i++;
    }

    this.__loaded = i;
    this.scroll()
  },
  search: function(term){
    if(term == "" || !term)this.searchterm = null;
    else this.searchterm = term;
    
    this.searchterm = term;
    this.__table.empty();
    this.__loaded = 0;
    this.__resultarray = this.__ranking
    
    if($('#favfilter').hasClass('active')){
      this.__resultarray = this.__resultarray.filter(item => this.__favorites.includes(item.id));
    }
    
    if(/^\d{17}$/.test(this.searchterm)){
      console.log("steamid?", this.searchterm);
      this.__resultarray = this.__resultarray.filter((item) => {
        return item.id === this.searchterm;
      });
    }
    else if(this.searchterm){
      console.log("searching for ",this.searchterm);
      if(this.searchterm.endsWith("?")){
        this.__resultarray = this.__resultarray.filter((item) => {
          return item.pilotNames.find((name) => name.toLowerCase().includes(this.searchterm.slice(0,-1).toLowerCase()));
        });
      }
      else{
        this.__resultarray = this.__resultarray.filter((item) => {
          return item.pilotNames[0].toLowerCase().includes(this.searchterm.toLowerCase());
        });
      }
    }
    this.populate();
  },
  scroll: function(){
    if(activepage != "rankings") return;
    if ($(window).scrollTop() > $(document).height() - $(window).height() - 800 && this.__loaded < this.__resultarray.length) {
      this.populate();
    }
  },
  sort: function(sortby){
    this.__ranking.sort(function (a, b){
      if(b[sortby[0]] == null){return -1;}
      if(a[sortby[0]] == null){return 1;}
      return (a[sortby[0]]-b[sortby[0]]) * sortby[1];
    });

    this.search(this.searchterm)
  },
}

$("#update-ranking").on("click", () => {
  console.log("update-ranking");
  ipcRenderer.send("updateranking");
});

$("#update-solo").on("click", async () => {
  console.log("update-solo");
  if(!player.id) return;
  invokeplayerdata(player.id, null, true)
});

$("#solo-zoom-out").on("click", () => {setzoomlastday(false)})
$("#solo-zoom-in").on("click", () => {setzoomlastday(true)})

$("#solo-information").on("click", () => {changepage("info")})
$("#info-graph").on("click", () => {changepage("history")})

$("#rankingtablehead #tablesearchname span").on("click", function(e) {
  ranking.search("")
  
  $(this).html("")
  const input = document.createElement('input')
  input.type = "text";
  input.placeholder = "Search by name...";
  input.style.width = "200px";
  input.style.height = "25px";

  $(input).attr("data-toggle", "tooltip");
  $(input).attr("title", "append ? for search within AKAs");

  this.appendChild(input);
  input.focus()

  $(input).on("keydown", (e) => {
    if(!e.originalEvent.key.match(/[a-zA-Z0-9 ?]/) || !e.which === 13) e.preventDefault();
  });

  $(input).on("input", debounce(() => {
    ranking.search(input.value)
  },500));


  $(input).on("change focusout", () => {
    if(input.value == "") $(this).html(`<span>Name</span>`);
    else $(this).html(`<span>"${input.value}"</span>`);
  });
});

$("#favfilter").on("click", function() {
  const active = $(this).hasClass('active')
  if(active) $(this).removeClass('active')
  else $(this).addClass('active')
  ranking.newdata()
});

$('#rankingtablehead .sortable').on("click", function() {
  $(this).siblings().removeClass("asc desc");
  const sort = $(this).attr("data-sort")

  let dir = 1;
  if($(this).hasClass('desc')){
    $(this).addClass("asc").removeClass("desc");
  }
  else {
    $(this).addClass("desc").removeClass("asc");
    dir = -1;
  }

  ranking.sort([sort, dir])
});

const userhistory = async (data, lastday) => {
  player = data
  
  chart.resetZoom()
  hidetooltip()
  draw(data.history)
  $('head title').text(`ThrustElo | v${version} | ${data.isAlt ? '(Alt)' : ''} ${data.pilotName} (${Math.round(data.elo)})`)

  if(lastday && zoomlastday == true){
    setzoomlastday(true);
  }

  info.populate()
  duel.newdata(data.enemies)
};

const setzoomlastday = (state) => {
  zoomlastday = state;
  if(!state){
    chart.resetZoom()
  }else{
    if(drawlines.annotations.length){
      const min = Math.floor(drawlines.annotations.findLast((element) => element.event == "day").value)
      const max = chart.data.labels.length -1
      chart.zoomScale("x", {min:min,max:max}, "zoom");
      drawlines.draw()
    }
  }
}

const draw = (data) => {
  $('#header_solo').html(``);
  data = data.filter(item => item.newElo > 0 && ["Kill", "Death to"].includes(item.type));
  if(data.length == 0){
    footerlist.addMsg("Something went wrong, user has no history", 3000, "bg-danger")
    chart.data = {
      labels: [],
      datasets: []
    };
    chart.update();
    drawlines.draw();
    return;
  }

  let annotations = data.slice(0).reduce(function(arr, curr, index) {
    if(curr.afterlogin){
      arr[1].push({index: index, type:"login", color:"rgba(0,191,255,0.2)"});
    }

    if(!(
      (!localtime && moment(curr.time).utc().isSame(moment(arr[0]).utc(), 'day')) ||
      (localtime && moment(curr.time).isSame(moment(arr[0]), 'day'))
    )){
      arr[0] = curr.time;
      arr[1].push({index: index, type:"day", color:"rgba(255,255,255,0.7)"});
    }

    return arr
  }, [data[0].time,[{index: 0, type:"login", color:"rgba(0,191,255,0.2)"}]])[1]

  annotations = annotations.map(function(at) {
    if(["day", "login"].includes(at.type)){
      return {
        event: at.type,
        type: 'line',
        scaleID: 'x',
        value: at.index + (at.type === "day" ? -0.5 : -0.4),
        borderColor: at.color,
        borderWidth: 2,
      }
    };
  });

  let labels = data.map(item => item.time);
  labels.push("")

  let dataset = {
    label: 'New Elo',
    data: data.map(item => item.newElo),
    original: data.map(item => item),
    fill: false,
    segment: {
      borderColor: (ctx) => {
        return ctx.p0.raw < ctx.p1.raw ? "green" : "red"
      }
    },
    backgroundColor: data.map((item) => {
      return item.elo >= 0 ? "green" : "red";
    }),
  };

  data = {
    labels: labels,
    datasets: [dataset]
  }
  
  chart.data = data;
  drawlines.annotations = annotations
  chart.update();
  drawlines.draw(true)

  $("#menu div[data-target='history']").removeClass('inactive');
  $("#menu div[data-target='info']").removeClass('inactive');
  $("#menu div[data-target='duel']").removeClass('inactive');
}

const drawduel = (target, avarage) => {
  let data = player.history.filter(item => {
    return ["Death to", "Kill"].includes(item.type)
    && item.player.name === target;
  })
  
  // console.log(data);

  let labels = data.map(item => item.time);

  let dataset = {
    label: 'Delta Elo',
    data: data.map(item => item.elo),
    original: data.map(item => item),
    fill: true,
    backgroundColor: data.map((item) => {return item.elo >= 0 ? `rgb(132, 99, 255)`:`rgb(255, 99, 132)`}),
  };

  data = {
    labels: labels,
    datasets: [dataset],
  }

  chartduel.data = data;
  chartduel.update();
  segment.updateduel();
  $('#header_duelgraph').html(`<small>${player.pilotName} vs. ${target} (~${avarage})</small>`);
}

const drawlines = {
  draw: function(force){
    let [min,max] = [chart.scales.x.min, chart.scales.x.max];
    segment.update();
    if(max-min < 400 && (!this.visible || force)){
      chart.options.plugins.annotation.annotations = this.annotations;
      this.visible = true;
      chart.update();
    }
    else if(max-min > 400 && (this.visible || force)){
      chart.options.plugins.annotation.annotations = [];
      this.visible = false;
      chart.update();
    }
  },
  annotations: [],
  visible: false
};

const segment = {
  update: function(){
    const [min,max] = [chart.scales.x.min, chart.scales.x.max];
    if(chart.data.datasets.length == 0) return;
    const data = chart.data.datasets[0].original.slice(min, max+1);

    const positive = data.filter(d => d.type == 'Kill');
    const negative = data.filter(d => d.type == 'Death to');
    const ratio = parseFloat(positive.length / negative.length).toFixed(3);
    const gain = (positive.reduce((a,b) => a+b.elo,0)/positive.length).toFixed(2);
    const loss = (negative.reduce((a,b) => a+b.elo,0)/negative.length).toFixed(2);
    const peak = data.reduce((a,b) => Math.max(a,b.newElo), -Infinity);
    const nadir = data.reduce((a,b) => Math.min(a, b.newElo), Infinity);

    $('#header_solo').html(`<small>Segment: K/D/R = ${positive.length}/${negative.length}/${ratio} | Avarage Elo Gain/Loss = ${gain}/${loss} | Elo Peak/Nadir = ${peak}/${nadir}</small>`);
  },
  updateduel: function(){
    const [min,max] = [chartduel.scales.x.min, chartduel.scales.x.max];
    if(chartduel.data.datasets.length == 0) return;
    const data = chartduel.data.datasets[0].original.slice(min, max+1);
    
    const positive = data.filter(d => d.type == 'Kill');
    const negative = data.filter(d => d.type == 'Death to');
    const gain = (positive.reduce((a,b) => a+b.elo,0));
    const loss = Math.abs((negative.reduce((a,b) => a+b.elo,0)));

    $('#segment_duelgraph').html(`<small>Segment: ${data.length} events | Kills ${positive.length} - ${negative.length} | Elo Stolen ${gain} - ${loss}</small>`);
  },
}

const duel = {
  __table: $('#duel-table'),
  __enemies: null,
  searchterm: null,
  __resultarray: null,
  __loaded: 0,
  newdata: function(data){
    if(data){
      this.__enemies = data
    }

    $("#dueltablehead th").removeClass("asc desc")
    $("#dueltablehead th[data-sort='events']").addClass("desc")
    
    $("#header_duel").html(`${player.pilotName} vs.`)
    this.search(this.searchterm)
  },
  populate: function(){
    let i = this.__loaded;
    const end = i + 100;

    while(i < end && i < this.__resultarray.length){
      const player = this.__resultarray[i]
      const tr = document.createElement('tr')
  
      const graph = document.createElement('td')
      graph.innerHTML = "📈";
      graph.style.cursor = "pointer";

      const events = document.createElement('td')
      events.innerText = player.events

      const eavarage = document.createElement('td')
      eavarage.innerText = player.eavarage

      const name = document.createElement('td')
      name.innerText = player.name

      const k = document.createElement('td')
      k.innerText = player.k

      const d = document.createElement('td')
      d.innerText = player.d

      const kd = document.createElement('td')
      kd.innerText = player.kd

      const netelo = document.createElement('td')
      netelo.innerText = player.netelo

      const teamevents = document.createElement('td')
      teamevents.innerText = player.teamevents

      const tk = document.createElement('td')
      tk.innerText = player.tk

      const td = document.createElement('td')
      td.innerText = player.td

      $(tr).on('click', async function () {
        $("#duel-table tr").removeClass("selected");
        $(tr).addClass("selected");
      });

      $(graph).on('click', async function () {
        $("#duel-table tr").removeClass("selected");
        $(tr).addClass("selected");
        chartduel.resetZoom()
        drawduel(player.name, player.eavarage)
        changepage("duelgraph", "duel")
      });

      tr.append(graph);
      tr.append(eavarage);
      tr.append(name);
      tr.append(events);
      tr.append(k);
      tr.append(d);
      tr.append(kd);
      tr.append(netelo);
      tr.append(teamevents);
      tr.append(tk);
      tr.append(td);
      this.__table.append(tr);

      i++;
    }

    this.__loaded = i;
    this.scroll()
  },
  search: function(term){
    if(term == "" || !term)this.searchterm = null;
    else this.searchterm = term;
    
    this.searchterm = term;
    this.__table.empty();
    this.__loaded = 0;
    this.__resultarray = this.__enemies
    
    if(this.searchterm){
      console.log("searching for ",this.searchterm);
      this.__resultarray = this.__resultarray.filter((item) => {
        return item.name.toLowerCase().includes(this.searchterm.toLowerCase());
      });
    }
    this.populate();
  },
  scroll: function(){
    if(activepage != "duel") return;
    if ($(window).scrollTop() > $(document).height() - $(window).height() - 800 && this.__loaded < this.__resultarray.length) {
      this.populate();
    }
  },
  sort: function(sortby){
    this.__table.empty();
    this.__loaded = 0;

    this.__enemies.sort(function (a, b){
      if([null, NaN].includes(b[sortby[0]])){return -1;}
      if([null, NaN].includes(a[sortby[0]])){return 1;}
      return (a[sortby[0]]-b[sortby[0]]) * sortby[1];
    });

    this.search(this.searchterm)
  },
}

const info = {
  populate: function () {
    this.__contentrow.empty();
    $('#info #info-name').text(`${player.isAlt ? '🤡' : ''} ${player.pilotName} (${Math.round(player.elo)})`);

    //Pilot
    let pilotnames = [...new Set(player.pilotNames)];
    pilotnames = pilotnames.reduce((a,b) => a + b + ', ' ,'').slice(0,-2);
    
    const pilot_body = document.createElement('div')
    pilot_body.innerHTML = `
      <table>
        <tr><td>Rank:</td><td>${player.rank || (player.isBanned ? 'Banned 😭' : (player.isAlt ? '🤡' : ''))}</td></tr>
        <tr><td>Elo:</td><td>${Math.round(player.elo)}</td></tr>
        <tr><td>Peak:</td><td>${Math.round(player.eloHistory.peak)}</td></tr>
        <tr><td>Nadir:</td><td>${Math.round(player.eloHistory.nadir)}</td></tr>
        <tr><td>SteamId:</td><td>${player.id}</td></tr>
        <tr><td>Aliases:</td><td>${pilotnames}</td></tr>
      </table>
    `;

    const pilot = this.__cardcreator({
      header: "Pilot",
      body: [pilot_body],
    }, 'col-md-6')
    this.__contentrow.append(pilot)

    //ParentId
    if (player.altParentId){
      const main = ranking.__ranking.find((p) => p.id === player.altParentId);
      const parent_name = document.createElement("div");
      const parent_link = document.createElement("a");
      if(main){
        parent_link.innerText = `${main.pilotNames[0]} (${Math.round(main.elo)})`;
        parent_link.href = "#";
        parent_link.style.cursor = "pointer";
        parent_link.addEventListener('click', async () => {
          invokeplayerdata(main.id, "info")
        });
      } else {
        parent_link.innerText = `Unknown player id: ${player.altParentId}`;
      }
      parent_name.appendChild(parent_link);

      const parent = this.__cardcreator({
        header: "Main Pilot",
        body: [parent_name],
      }, 'col-md-6')
      this.__contentrow.append(parent)
    }


    //Discord
    if (player.discordId) {
      const discord_name = document.createElement("div");
      discord_name.innerHTML = `<br><div class="spinner"></div><br>`;
  
      const discord = this.__cardcreator({
        header: "Discord",
        body: [discord_name],
      }, 'col-md-6', 'discordcard')
      this.__contentrow.append(discord)
    }


    //Achievements
    if(player.achievements && player.achievements.length > 0){
      const achievements_body = document.createElement('div')
      let txt = ""
      for(let element of player.achievements){
        txt += `<span style="font-weight: bold;">${element.id}</span> * ${element.count} | First achieved ${moment(element.firstAchieved).format('YYYY-MM-DD')}<br>`;
      }

      achievements_body.innerHTML = txt;
      const achievements = this.__cardcreator({
        header: "Achievements",
        body: [achievements_body],
      }, 'col-md-6')
      this.__contentrow.append(achievements)
    }

    //Alts
    if(player.altIds && player.altIds.length > 0){
      const alts_body = document.createElement('div')

      for(let element of player.altIds){
        const child = ranking.__ranking.find((p) => p.id === element);
        const child_link = document.createElement("a");
        if(child){
          child_link.innerText = `${child.pilotNames[0]} (${Math.round(child.elo)})`;
          child_link.style.cursor = "pointer";
          child_link.href = "#";
          child_link.addEventListener('click', async () => {
            invokeplayerdata(child.id,"info")
          });
        } else {
          child_link.innerText = `Unknown player id: ${element}`;
        }
        alts_body.appendChild(child_link);
        alts_body.appendChild(document.createElement("br"));
        
      }

      const alts = this.__cardcreator({
        header: "Alts 🤡",
        body: [alts_body],
      }, 'col-md-6')
      this.__contentrow.append(alts)
    }

    //Kills/Deaths
    const kills = player.history.filter((e) => e.type === "Kill").length
    const deaths = player.history.filter((e) => e.type === "Death to").length
    const teamkills = player.tks.length
    const teamdeaths = player.tds.length
    const kdbody = document.createElement('div')
    kdbody.innerHTML = `
      <table>
        <tr><td>Kills:</td><td>${kills}</td></tr>
        <tr><td>Deaths:</td><td>${deaths}</td></tr>
        <tr><td>K/D:</td><td>${parseFloat(kills / deaths).toFixed(3)}</td></tr>
        <tr><td>Team Kills:</td><td>${teamkills}</td></tr>
        <tr><td>Team Deaths:</td><td>${teamdeaths}</td></tr>
        <tr><td>TK/TD:</td><td>${parseFloat(teamkills / teamdeaths).toFixed(3)}</td></tr>
      </table>
    `;

    const kd = this.__cardcreator({
      header: "Kills / Deaths",
      body: [kdbody],
    }, 'col-md-6')
    this.__contentrow.append(kd)

    //Weapons
    let weapons = [
      ["Kill With", player.weapons.plane.kill_in],
      ["Kill Against", player.weapons.plane.kill_to],
      ["Death In", player.weapons.plane.death_in],
      ["Death By", player.weapons.plane.death_by],
      ["Weapon Kill", player.weapons.weapon.kill],
      ["Weapon Death", player.weapons.weapon.death],
    ]

    for(let [header, weapon] of weapons){
      const killwith = this.__cardcreator({
        header: header,
        body: [this.__weaponcreator(weapon)],
      }, 'col-sm-3')
      this.__contentrow.append(killwith)
    }

    //Playtime
    const plbody = document.createElement('div')
    plbody.innerHTML = `
      <table>
        <tr><td>Hours:</td><td>${parseFloat(player.sessions.hours).toFixed(3)}</td></tr>
        <tr><td>KpH:</td><td>${parseFloat(kills/player.sessions.hours).toFixed(3)}</td></tr>
        <tr><td>DpH:</td><td>${parseFloat(deaths/player.sessions.hours).toFixed(3)}</td></tr>
        <tr><td>Sessions:</td><td>${player.sessions.data.length}</td></tr>
      </table>
    `;

    const pl = this.__cardcreator({
      header: "Playtime",
      body: [plbody],
    }, 'col-md-3')
    this.__contentrow.append(pl)
  },
  populateDiscord: async function () {
    const content = await ipcRenderer.invoke("getdiscordinfo", player.discordId);
    player.discord = content;

    if (content) {
      const discord_name = document.createElement("div");
      discord_name.innerHTML = 
      `<div style="font-weight: bold;">${content.display_name || content.username}</div>
      <div>@${content.username}</div>`;
      const discord = this.__cardcreator({
        header: "Discord",
        body: [discord_name],
        avatar: content.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/1.png',
      }, 'col-md-6', 'discordcard')
      $('#info #discordcard')[0].replaceWith(discord);
    }
    else{
      const discord_name = document.createElement("div");
      discord_name.innerHTML = `<div>Failed to retrieve Discord information.</div>`;
      const discord = this.__cardcreator({
        header: "Discord",
        body: [discord_name],
      }, 'col-md-6', 'discordcard')
      $('#info #discordcard')[0].replaceWith(discord);
    }
  },
  __cardcreator: (content, c, id) => {
    const col = document.createElement('div')
    col.classList.add(c);
    if(id) col.id = id;

    const card = document.createElement('div')
    card.classList.add('card');
  
    if(content.header){
      const header = document.createElement('div')
      header.classList.add('card-header');
      header.innerHTML = content.header;
      card.appendChild(header)
    }
  
    const body = document.createElement('div')
    body.classList.add('card-body');
  
    if(content.avatar){
      const avatar = document.createElement('img')
      avatar.src = content.avatar;
      avatar.alt = 'Avatar';
      avatar.classList.add('avatar');
      body.appendChild(avatar);
    }
  
    for(let element of content.body){
      body.append(element)
    }
    
    card.appendChild(body)
    col.appendChild(card)
    return col;
  },
  __weaponcreator: (content) => {
    const div = document.createElement('div')
    const stats = Object.entries(content).sort((a,b) => a[1] > b[1] ? -1 : 1)
    let txt = "<table>"
    for(let [key, value] of stats){
      txt += `<tr><td>${key}: </td><td>${value}</td></tr>`;
    }
    txt += "</table>";
    div.innerHTML = txt;
    return div;
  },
  __contentrow: $("#info .content .row"),
}

const timelinecanvas = {
  canvas: $('#timeline-canvas'),
  move: function(e){
    this.__latest = e;
    if(this.__timeout == null){
      this.__timeout = setTimeout(() => {
        this.__timeout = null;
        this.aftermovement(this.__latest.offsetX, this.__latest.offsetY);
      }, 100);
    }
  },
  aftermovement: function(x,y){
    const [time, elo] = this.__getdate(x,y);
    $("#timeline-at").text(`${moment(time).toISOString(localtime)} ${elo}`);

    
  },
  update: function(){
    if(activepage != "info") return;
    this.canvas[0].width = this.canvas.width()
    this.canvas[0].height = this.canvas.height()
    const ctx = this.canvas[0].getContext('2d');
    const [width, height] = [this.canvas[0].width, this.canvas[0].height]

    ctx.clearRect(0, 0, width, height)

    if(!player || !player.eloHistory || !player.sessions) {
      $("#timeline-start").text("");
      $("#timeline-end").text("");
      return;
    }

    ctx.fillStyle = "black"
    ctx.fillRect(0, 0, width, height);

    const sessions = player.sessions
    const history = player.eloHistory;

    const spanx = sessions.end - sessions.start;
    const spany = history.peak - history.nadir

    let coord = function(x, y) { return [
      5 + (width-10)/spanx * (x-sessions.start),
      5 + (height-10) - (height-10)/spany * (y- history.nadir),
    ]}

    $("#timeline-start").text(moment(sessions.start).toISOString(localtime));
    $("#timeline-end").text(moment(sessions.end).toISOString(localtime));


    history.data.forEach((element , index, array)=> {
      if(index > 0){
        ctx.fillStyle = element.elo > array[index-1].elo ? "green" : "red";
        ctx.fillRect( ...coord(element.time, element.elo), 1, 1 );
      } else {
        ctx.fillStyle = element.elo > 2000 ? "green" : "red";
        ctx.fillRect(  ...coord(element.time, element.elo), 1, 1 );
      }

    });
    
    coord = function(start, end) {
      return [
      5 + (width-10)/spanx * (start-sessions.start),
      0,
      Math.max((width-10) / spanx *(end-start), 1),
      5,
    ]}

    ctx.fillStyle = "blue"
    sessions.data.forEach(element => {
      ctx.fillRect(...coord(element.start, element.end + 1));

    });
  },
  __getdate: function(x,y){
    const [width, height] = [this.canvas[0].width, this.canvas[0].height]
    const sessions = player.sessions
    const history = player.eloHistory;
    const spanx = sessions.end - sessions.start;
    const spany = history.peak - history.nadir
    return [
      Math.floor((x-5)/(width-10)*spanx + sessions.start),
      Math.floor((y*spany - height*spany + 5*spany) / (-height + 10) + history.nadir),
    ];
  },
  __latest: null,
  __timeout: null,
};

timelinecanvas.canvas.on("mousemove", (e) => timelinecanvas.move(e));

$('#dueltablehead .sortable').on("click", function () {
  $(this).siblings().removeClass("asc desc");
  const sort = $(this).attr("data-sort")

  let dir = 1;
  if($(this).hasClass('desc')){
    $(this).addClass("asc").removeClass("desc");
  }
  else {
    $(this).addClass("desc").removeClass("asc");
    dir = -1;
  }

  duel.sort([sort, dir])
});

$("#dueltablehead #tablesearchname span").on("click", function(e) {
  duel.search("")
  
  $(this).html("")
  const input = document.createElement('input')
  input.type = "text";
  input.placeholder = "Search by name...";
  input.style.width = "200px";
  input.style.height = "25px";

  this.appendChild(input);
  input.focus()

  $(input).on("keydown", (e) => {
    if(!e.originalEvent.key.match(/[a-zA-Z0-9 ?]/) || !e.which === 13) e.preventDefault();
  });

  $(input).on("input", debounce(() => {
    duel.search(input.value)
  },500));


  $(input).on("change focusout", () => {
    if(input.value == "") $(this).html(`<span>Name</span>`);
    else $(this).html(`<span>"${input.value}"</span>`);
  });
});

const solotooltip = debounce((context) => {
  const {chart, tooltip} = context;
  const tooltipEl = $("#tooltips");
  
  if (tooltip.opacity === 0) {
    // hidetooltip()
    return;
  }
  tooltipEl.show()

  let element = tooltip.dataPoints[0].dataset.original[tooltip.dataPoints[0].dataIndex];
  
  if (element) {
    console.log("index", tooltip.dataPoints[0].dataIndex);
    
    let txt = `${element.gun.from} -> ${element.gun.type} -> ${element.gun.to} (${element.gun.multiplier})`;
    txt += `<br>Elo Δ = ${element.elo}`;
    txt += `<br>Elo ε = ${element.newElo}`;
    if(element.gun.distance) {
      txt += `<br>Distance: ${element.gun.distance}nm`;
    }
    txt+= `<br><em>${moment(element.time).toISOString(localtime)}</em>`;
    if(element.afterlogin) {
      txt += `<br>First event after login`;
    }

    tooltipEl.empty();

    let card = document.createElement('div');
    card.classList.add("card");
    card.style.width = "300px";
    let cardBody = document.createElement('div');
    cardBody.classList.add("card-body");
    cardBody.style.lineHeight = "1em";
    let title = document.createElement('h4');
    title.innerHTML = `${element.type} ${element.player.name} (${element.player.elo})`;
    title.className = "card-title";
    let text = document.createElement('p');
    text.innerHTML = txt;
    let close = document.createElement('button');
    close.innerHTML = "X";
    close.id = "cls-tooltip";
    close.classList.add("btn", "btn-success", "btn-sm");
    close.addEventListener("click", () => {
      hidetooltip();
    });
    
    cardBody.appendChild(title);
    cardBody.appendChild(text);
    cardBody.appendChild(close);
    card.appendChild(cardBody);
    tooltipEl.append(card);
  }

  const {offsetLeft: offsetX, offsetTop: offsetY } = chart.canvas;
  const {width: twidth, height: theight} = tooltipEl[0].getBoundingClientRect();
  
  const offset = 20
  let left = offsetX + tooltip.caretX + offset
  let top = offsetY + tooltip.caretY + offset
  if (left + twidth > $(chart.canvas).width()) left = left - (twidth + offset*2);
  if (top + theight > $(chart.canvas).height()) top = top - (theight + offset*2);

  tooltipEl.css({
    opacity: 0,
    left: `${left}px`,
    top: `${top}px`,

  });
  
  tooltipEl.animate({
    opacity: 1,
  }, 350);
}, 350);

const changepage = (page, marked) => {
  console.log("changepage", page);
  hidetooltip();
  $('.page').hide();
  $(`#${page}`).show();
  activepage = page;

  $("#menu").children().removeClass("active");
  $("#menu div[data-target='" + page + "']").addClass('active');

  if(marked) {
    $("#menu div[data-target='" + marked + "']").addClass('active');
  }

  if(page === "info"){
    timelinecanvas.update();
    window.scrollTo(0,0)

    if(player.discordId && player.discord === undefined){
      player.discord = null;
      console.log("update discord");
      info.populateDiscord()
    }
  }

  scrollup.animate({top:'-30px'},300);
}

const footer = $('#footer')
const footerlist = {
  __msg: [],
  /**
  * Footer message function
  * @param {string} msg - The message to be displayed in the footer
  * @param {integer} timeout - How long the message should be shown for before it disappears. If set to false, the message will not disappear automatically.
  * @param {string} color - Add css class to change the color of the text
  * @param {string} id - For use with clearmsg
  **/
  addMsg: function (msg, timeout = false, color = false, id=false) {
    if(id) this.clearmsg(id);
    this.__msg.push({
      msg : msg,
      timeout : timeout,
      color : color,
      id : id,
    });
    if (this.__msg.length == 1) this.__showMsg();
  },
  clearmsg: async function (id) {
    if(!this.__msg || !this.__msg.length) return;
    const active = this.__msg[0].id == id;
    this.__msg = this.__msg.filter(msg => msg.id != id);
    if (active) {
      footer.animate({ bottom: '-20px' }, 300)
      await snooze(300)
      this.__showMsg();
    };
  },
  __msgconfirm: async function () {
    footer.animate({ bottom: '-20px' }, 300)
    clearTimeout(this.__msg[0].timeout)
    await new Promise(resolve => setTimeout(() => resolve(), 300));
    this.__msg.shift();
    this.__showMsg();
  },
  __showMsg: async function () {
    const msg = this.__msg[0]
    if (!msg) {
      footer.hide();
      return;
    }
    footer[0].innerHTML = `<b>${msg.msg}</b>`;
    footer.removeClass()
    msg.color ? footer.addClass(msg.color) : null;
    footer.animate({ bottom: '0px' }, 300)
    footer.show()

    if (msg.timeout) {
      msg.timeout = setTimeout(() => this.__msgconfirm(), msg.timeout);
    }
  }
}

footer.on('click', function () { footerlist.__msgconfirm() });

const scrollup = $("#scrollup")
scrollup.on('click', function() {
  $("html, body").animate({scrollTop: 0}, 300);
  scrollup.animate({top:'-30px'},300);
});
window.addEventListener("scrollend", (event) => {
  if(activepage === "info") return;
  if(window.scrollY > 300 && scrollup.offset().top - window.scrollY < 10){
    scrollup.animate({top:'15px'},300)
  }
  else if(window.scrollY <= 300 && scrollup.offset().top - window.scrollY > 10){
    scrollup.animate({top:'-30px'},300)
  }
});

ipcRenderer.on('initdata', async (event, context) => {
  console.log("initdata");
  // console.log(context);

  if(context.ranking && context.updated){
    ranking.newdata(context)
  }
});

const invokeplayerdata = async (steamid, page, lastday) => {
  let playerdata = await ipcRenderer.invoke("getplayerdata", steamid)
  if (playerdata){
    userhistory(playerdata, lastday);
    if(page){
      changepage(page)
    }
  } 
};

ipcRenderer.on('sendtohome', (event) => {
  console.log("nothing cached");
  changepage("home");
});

ipcRenderer.on('initranking', (event, context) => {
  console.log(context);
  ranking.newdata(context)
});

ipcRenderer.on('spinnertext', (e, [state, text = ""]) => {
  if (state == true){
    $('#spinner').show()
    $('#spinnertext').html(text)
  }
  else
    $('#spinner').hide()
})

ipcRenderer.on('showmsg', (event, data) => { footerlist.addMsg(...data) });
ipcRenderer.on('clearmsg', (event, id) => { footerlist.clearmsg(id) });
ipcRenderer.invoke('getAppversion').then((result) => {
  console.log('Version:', result);
  version = result;
  $('head title').text(`ThrustElo | v${result}`);
});

function debounce(func, wait = 500) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(context, args);
    }, wait);
  };
}

function init() {
  window.addEventListener('DOMContentLoaded', () => {
    ipcRenderer.send('init')
  })
}

const hidetooltip = debounce( ()=> {
  const tooltipEl = $('#tooltips');
  if(tooltipEl.is(":visible")){
    tooltipEl.animate({
      opacity: 0,
    }, 350, () => {
      tooltipEl.hide();
    });
  }
},100);


const chart = new Chart(document.getElementById("Canvas").getContext("2d"), {
  type: 'line',
  options: {
    hoverRadius: 15,
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        display: false
      }
    },
    onClick: (event, elements, chart) => {
      if(!elements[0]){
        hidetooltip();
      }
    },
    plugins: {
      annotation: {
        // annotations: annotations
      },
      tooltip: {
        enabled: false,
        position: 'average',
        external: solotooltip
      },
      legend: {
        display: false
      },
      zoom: {
        enabled: true,
        zoom: {
          mode: 'x',
          wheel: {
            enabled: true
          },
          pinch: {
            enabled: false
          },
          drag: {
            enabled: true,
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderColor: 'rgb(255, 99, 132)',
            borderWidth: 1,
          },
          onZoomComplete: debounce( () =>{
            if(!chart.data.datasets.length) return;
            hidetooltip();
            drawlines.draw();
            
          },300),
        },
        pan: {
          enabled: true,
          mode: 'x',
          onPanComplete: hidetooltip,
          modifierKey: 'ctrl'
        }
      }
    },
  }
});

const chartduel = new Chart(document.getElementById("Canvas_duel").getContext("2d"), {
  type: 'bar',
  options: {
    hoverRadius: 15,
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        display: false
      }
    },
    onClick: (event, elements, chart) => {
      if(!elements[0]){
        hidetooltip();
      }
    },
    plugins: {
      annotation: {
        // annotations: annotations
      },
      tooltip: {
        enabled: false,
        position: 'average',
        external: solotooltip
      },
      legend: {
        display: false
      },
      zoom: {
        enabled: true,
        zoom: {
          mode: 'x',
          wheel: {
            enabled: true
          },
          pinch: {
            enabled: false
          },
          drag: {
            enabled: true,
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderColor: 'rgb(255, 99, 132)',
            borderWidth: 1,
          },
          onZoomComplete: debounce( () =>{
            if(!chart.data.datasets.length) return;
            hidetooltip();
            segment.updateduel();
            
          },300),
        },
        pan: {
          enabled: true,
          mode: 'x',
          onPanComplete: hidetooltip,
          modifierKey: 'ctrl'
        }
      }
    },
  }
});

$('#menu div').each(function(index){
  let top = 15 + 51 * index
  $(this).css({top:top + 'px'});

  $(this).animate({
    right: "-80px",
  },500);

  $(this).on("mouseover", function(){
    $(this).stop(true)
    $(this).animate({
      right: "0px",
    },200);
  });

  $(this).on("mouseout", function(){
    $(this).stop(true)
    $(this).animate({
      right: "-80px",
    },500);
  });

  $(this).on("click", function(){
    if($(this).hasClass("inactive")) return;
    changepage($(this).attr('data-target'));
  });
});

const snooze = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

$(window).on('resize', debounce(() => {
  hidetooltip();
  timelinecanvas.update();
}, 100));

$(window).on('scroll', ()=>{
  ranking.scroll()
  duel.scroll()
});

init()