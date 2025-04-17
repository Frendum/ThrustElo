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
    $("#rankingtablehead th[data-sort='elo']").addClass("desc")
    this.search(this.searchterm)
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

      const rank = document.createElement('td')
      rank.innerHTML = player.rank;
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
        let playerdata = await ipcRenderer.invoke("getplayerdata", player.id)
        if(playerdata) userhistory(playerdata);
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
      tr.append(graph);
      tr.append(rank);
      tr.append(elo);
      tr.append(name);
      tr.append(k);
      tr.append(d);
      tr.append(kd);
      tr.append(tk)
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
    
    if(this.searchterm){
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
    this.__table.empty();
    this.__loaded = 0;
    
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
  let playerdata = await ipcRenderer.invoke("getplayerdata", player.id)
  if(playerdata) userhistory(playerdata, true);
});

$("#solo-zoom-out").on("click", () => {setzoomlastday(false)})
$("#solo-zoom-in").on("click", () => {setzoomlastday(true)})

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
  changepage('history')
  player = data
  
  chart.resetZoom()
  hidetooltip()
  draw(data.data)
  $('head title').text(`ThrustElo | v${version} | ${data.pilotName}`)

  if(lastday && zoomlastday == true){
    setzoomlastday(true);
  }

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
  data = data.filter(item => item.newElo > 0);

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
        value: at.index -0.5,
        borderColor: at.color,
        borderWidth: 1.0,
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
    borderColor: 'rgb(255, 99, 132)',
  };

  data = {
    labels: labels,
    datasets: [dataset]
  }
  
  chart.data = data;
  drawlines.annotations = annotations
  chart.update();
  drawlines.draw()

  $("#menu div[data-target='history']").removeClass('inactive');
  $("#menu div[data-target='duel']").removeClass('inactive');
}

const drawduel = (target, avarage) => {
  let data = player.data.filter(item => {
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
  draw: function(){
    let [min,max] = [chart.scales.x.min, chart.scales.x.max];
    segment.update();
    if(max-min < 400 && !this.visible){
      console.log("visible");
      chart.options.plugins.annotation.annotations = this.annotations;
      this.visible = true;
      chart.update();
    }
    else if(max-min > 400 && this.visible){
      console.log("hidden");
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
    const negative = data.filter(d => d.type ==  'Death to');
    const ratio = parseFloat(positive.length / negative.length).toFixed(3);
    const gain = (positive.reduce((a,b) => a+b.elo,0)/positive.length).toFixed(2);
    const loss = (negative.reduce((a,b) => a+b.elo,0)/negative.length).toFixed(2);
    const peak = data.reduce((a,b) => Math.max(a,b.newElo),-Infinity);
    const nadir = data.reduce((a,b) => Math.min(a, b.newElo), Infinity);

    $('#header_solo').html(`<small>Segment: K/D/R = ${positive.length}/${negative.length}/${ratio} | Avarage Elo Gain/Loss = ${gain}/${loss} | Elo Peak/Nadir = ${peak}/${nadir}</small>`);
  },
  updateduel: function(){
    const [min,max] = [chartduel.scales.x.min, chartduel.scales.x.max];    
    if(chartduel.data.datasets.length == 0) return;
    const data = chartduel.data.datasets[0].original.slice(min, max+1);
    
    const positive = data.filter(d => d.type == 'Kill');
    const negative = data.filter(d => d.type ==  'Death to');
    const gain = (positive.reduce((a,b) => a+b.elo,0));
    const loss =  Math.abs((negative.reduce((a,b) => a+b.elo,0)));

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

      $(tr).on('click', async function () {
        $("#duel-table tr").removeClass("selected");
        $(tr).addClass("selected");
      });

      $(graph).on('click', async function () {
        $("#duel-table tr").removeClass("selected");
        $(tr).addClass("selected");
        chartduel.resetZoom()
        drawduel(player.name, player.eavarage)
        changepage("duelgraph")
      });

      tr.append(graph);
      tr.append(eavarage);
      tr.append(name);
      tr.append(events);
      tr.append(k);
      tr.append(d);
      tr.append(kd);
      tr.append(netelo);
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
      if(b[sortby[0]] == null){return -1;}
      if(a[sortby[0]] == null){return 1;}
      return (a[sortby[0]]-b[sortby[0]]) * sortby[1];
    });

    this.search(this.searchterm)
  },
}

$('#dueltablehead .sortable').on("click", function() {
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

const changepage = (page) => {
  console.log("changepage", page);
  hidetooltip();
  $('.page').hide();
  $(`#${page}`).show();
  activepage = page;

  $("#menu").children().removeClass("active");
  $("#menu div[data-target='" + page + "']").addClass('active');

  if(page === "duelgraph") {
    $("#menu div[data-target='duel']").addClass('active');
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

ipcRenderer.on('sendtoinfo', (event) => {
  console.log("nothing cached");
  changepage("info");
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
ipcRenderer.on('clearmsg',  (event, id) => { footerlist.clearmsg(id) });
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
}, 100));

$(window).on('scroll', ()=>{
  ranking.scroll()
  duel.scroll()
});

init()