// Common utility functions
// TODO: Expand this out, make everything more modular and cleaner

// builds a dictionary of string -> color, in HSL format
function colorHashStrings(titles) {
  var groupColor = {};
  for(var i = 0, n = titles.length; i < n; ++i) {
    var title = titles[i];
    groupColor[title] = "hsl(" + Math.floor((i + 0.5) / n * 360) + ",100%,60%)";
  }
  return groupColor;
}

// Javascript promises utilites. I like promises <3
function get(url) {
  return new Promise(function(resolve, reject) {
    var req = new XMLHttpRequest();
    req.open('GET', url);
    req.onload = function() {
      if (req.status == 200) {
        resolve(req.response);
      }
      else {
        reject(Error(req.statusText));
      }
    };
    req.onerror = function() {
      reject(Error("Network Error"));
    };
    req.send();
  });
}

function getJSON(url) {
  // get returns a Promise
  return get(url).then(JSON.parse).catch(function(err) {
    console.log("getJSON failed for", url, err);
    throw err;
  });
}

function getJSON_CACHEHACK(url) {
  // Sometimes caching can refuse to retrieve a JSON object if
  // it has been updated. Appending a random number is a hacky
  // way of preventing this caching and ensures that the newest
  // version is retrieved
  var hackurl = url + '?sigh=' + Math.floor(100000*Math.random());
  return get(hackurl).then(JSON.parse).catch(function(err) {
    console.log("getJSON failed for", url, err);
    throw err;
  });
}

function rewind7am(date) {
  date = new Date(date);
  newDate = new Date(date);
  if (date.getHours() < 7) {
    newDate.setDate(newDate.getDate() - 1);
  }
  newDate.setHours(7);
  newDate.setMinutes(0);
  newDate.setSeconds(0);
  newDate.setMilliseconds(0);
  return newDate;
}

function fullDaysBetween(firstDate, secondDate) {
  return Math.floor((secondDate.getTime() - firstDate.getTime()) / (24 * 60 * 60 * 1000));
}

function writeHeader() {
  var date0 = new Date(eventsBeginTime*1000);
  var date1 = new Date(eventsEndTime*1000);
  $("#header").html(ppDate(date0) + ' &mdash; ' + ppDate(date1));
}

function startSpinner() {
  // create a spinner object
  var target = document.getElementById('spinnerdiv');
  opts = {left:'30px', top:'40px', radius: 10, color: "#FFF" };
  var spinner = new Spinner(opts).spin(target);
}
function stopSpinner() {
  $("#spinnerdiv").empty();
}


// takes window and key events (ew and ek) and assigns key events
// to groups. Returns the total number of keys pressed
// in every window. Uses a merge-sort-like strategy
function computeKeyStats(windowEvents, keyEvents) {
  var keyStats = {};

  var currentKeyEvent = 0;
  for (var currentWindowEvent = 0; currentWindowEvent < windowEvents.length; ++currentWindowEvent) {
    currentWindowGroup = currentWindowEvent > 0 ? windowEvents[currentWindowEvent - 1].group : '';
    currentWindowTime = windowEvents[currentWindowEvent].t;

    while (currentKeyEvent < keyEvents.length &&
        keyEvents[currentKeyEvent].t <= currentWindowTime) {
      if (currentWindowGroup !== '') {
        if(!keyStats.hasOwnProperty(currentWindowGroup)) {
          keyStats[currentWindowGroup] = {'f': 0, 'n': 0};
        }
        keyStats[currentWindowGroup].f += keyEvents[currentKeyEvent].s;
        ++keyStats[currentWindowGroup].n;
      }
      ++currentKeyEvent;
    }
  }

  return keyStats;
}


// same idea as computeKeyStats, but outputs "hacking" events,
// which are contiguous areas of high keystroke activity. That means
// that the person is in hacking mode! :)
function computeHackingStats(windowEvents, keyEvents, hacking_titles) {

  var hacking_stats = {};
  var hacking_events = [];

  var hackingCounter = 0;
  var sessionResetCounter = 0;
  var isHackingNow = false;
  var sessionBeginTime = -1;
  var sessionKeys = 0;

  var totalHackingTime = 0;
  var totalHackingKeys = 0;

  var resetHackingSession = function(time) {
    ++sessionResetCounter;
    if(sessionResetCounter > 10) {
      if(isHackingNow) {
        // we were hacking and now it ended. record the session
        var hackingSession = {};
        hackingSession.beginTime = sessionBeginTime;
        hackingSession.endTime = time;
        hackingSession.length = hackingSession.endTime - hackingSession.beginTime; // convenience
        hackingSession.keys = sessionKeys;
        hackingSession.intensity = sessionKeys / hackingSession.length;

        totalHackingTime += hackingSession.length;
        totalHackingKeys += hackingSession.keys;

        hacking_events.push(hackingSession);
      }
      isHackingNow = false; // and reset tracking vars
      hackingCounter = 0;
      sessionResetCounter = 0;
      sessionKeys = 0;
    }
  }

  var currentKeyEvent = 0;
  for (var currentWindowEvent = 0; currentWindowEvent < windowEvents.length; ++currentWindowEvent) {
    currentWindowGroup = currentWindowEvent > 0 ? windowEvents[currentWindowEvent - 1].group : '';
    isHackingGroup = hacking_titles.indexOf(currentWindowGroup) > -1;
    currentWindowTime = windowEvents[currentWindowEvent].t;

    while (currentKeyEvent < keyEvents.length &&
        keyEvents[currentKeyEvent].t <= currentWindowTime) {
      if (currentWindowGroup !== '') {
        var keysPressed = keyEvents[currentKeyEvent].s;
        if(isHackingGroup) {
          if(keysPressed < 3) {  // per 9 seconds
            sessionResetCounter++;
            if(sessionResetCounter > 10) {
              resetHackingSession(keyEvents[currentKeyEvent].t);
            }
          } else {
            sessionResetCounter = Math.max(0, sessionResetCounter - 1);
            hackingCounter += 1;
            if(hackingCounter > 15 && !isHackingNow) {
              sessionBeginTime = keyEvents[currentKeyEvent].t;
              isHackingNow = true;
            }
            if(isHackingNow) {
              sessionKeys += keysPressed;
            }
          }
        } else {
          resetHackingSession(keyEvents[currentKeyEvent].t);
        }
      }
      ++currentKeyEvent;
    }
  }

  // store these for convenience
  hacking_stats.totalHackingKeys = totalHackingKeys;
  hacking_stats.totalHackingTime = totalHackingTime;
  hacking_stats.events = hacking_events;
  return hacking_stats;
}


key_stats_all = [] // global

var skipDraw = {}; // global...
function drawGroupsBarChart() {
  $("#groups-bar-chart").empty();

  // draw the legend on top of the svg
  var chartDiv = d3.select("#groups-bar-chart");
  var legendDiv = chartDiv.append("div").attr('class', 'legenddiv');

  titleGroups.forEach(group => {
    var pi = legendDiv.append('p').text(group).attr('style', 'color:' + groupColor[group]);

    if(skipDraw[group]) {
      pi.attr('class', 'skipdrawyes');
    } else {
      pi.attr('class', 'skipdrawno');
    }

    pi.on('click', () => {
      if(skipDraw[group] === false) {
        skipDraw[group] = true;
      } else {
        skipDraw[group] = false;
      }
      drawGroupsBarChart();
    });
  });


  var chartSvg = chartDiv.append("svg")

  var bottomOffset = 100;
  var leftOffset = 40;
  var barsWidth = parseInt(chartSvg.style('width')) - leftOffset;
  var barsHeight = parseInt(chartSvg.style('height')) - bottomOffset;

  var yscale = barsHeight * 1.0 / (25 * 60 * 60);

  // draw y axis labels
  for (var hour = 0; hour <= 24; ++hour) {
    var lineY = barsHeight - yscale * hour * 60 * 60;
    chartSvg.append("text")
      .attr("class", "bar-time")
      .attr("transform", "translate(1," + (lineY-3) + ")")
      .text(hour + "hr");

    chartSvg.append("line")
      .attr("x1", 0)
      .attr("x2", leftOffset + barsWidth)
      .attr("y1", lineY)
      .attr("y2", lineY)
      .attr("stroke", "#EEE")
      .attr("stroke-width", 1);
  }


  // draw x axis labels
  var N = dayDurations.length;
  var dsz = barsWidth / N;
  chartSvg.selectAll('.xlabel')
    .data(events)
  .enter()
    .append("text")
    .attr("transform", function(d, i) {
      var x = leftOffset + i * dsz;
      var y = barsHeight + 3;
      return "translate(" + x + "," + y + ")rotate(90)";})
    .attr("fill", "#333")
    .attr("font-family", "arial")
    .attr("font-size", "14px")
    .text(function(d) { var dobj = new Date(d['window_events'][0].t * 1000); return ppDateShort(dobj); })

  // draw vertical lines at week boundaries for easier visual consumption
  chartSvg.selectAll('.yd')
    .data(events)
  .enter()
    .append("line")
    .attr("stroke", function(d) {
      var dobj = new Date(d['window_events'][0].t * 1000);
      var isMonday = dobj.getDay() === 1;
      return isMonday ? "#BBB" : "#EEE"
    })
    .attr('x1', function(d, i) { return leftOffset + i * dsz; })
    .attr('x2', function(d, i) { return leftOffset + i * dsz; })
    .attr('y1', barsHeight)
    .attr('y2', 0);

  // draw the data
  for(var k=0;k<N;k++) {
    // convert from kv to list
    var dtimes = [];
    titleGroups.forEach(group => {
      if(skipDraw[group])
        return;
      dtimes.push({
        val: dayDurations[k].hasOwnProperty(group) ? dayDurations[k][group] : 0,
        col: groupColor[group]
      });
    })

    svgg = chartSvg.append('g')
      .attr("style", "cursor:pointer;")
      .on("click", function(q){
        return function(){
          window.location.href = 'index.html?gotoday=' + q;
        };
      }(k)); // have to closure k

    var gh = 0;
    svgg.selectAll(".day"+k)
      .data(dtimes)
    .enter()
      .append("rect")
      .attr("width", dsz)
      .attr("height", function(d) { return d.val * yscale; })
      .attr("x", leftOffset + k * dsz)
      .attr("y", function(d) { gh += d.val; return barsHeight - gh * yscale; })
      .attr("fill", function(d) { return d.col; } );
  }
}

// enter .group field and build up titleGroups[]
var titleGroups = []
function assignGroups(events) {
  events.forEach(event => {
    event.group = mapwin(event.s);
    if(titleGroups.indexOf(event.group) === -1) {
      titleGroups.push(event.group);
      skipDraw[event.group] = false;
    }
  })
}


var dayDurations = []; // stores durations for groups for all days. Core structure!
var groupColor = {};
function analyzeEvents() {
  dayDurations = []; // reset global var

  var titles = events['window_events'];
  assignGroups(titles); // assign group names to structure in field .group, build titleGroups[]
  groupColor = colorHashStrings(titleGroups);

  var firstDayBeginTime = rewind7am(events['window_events'][0].t * 1000);

  events['window_events'].forEach((title, index, titles) => {
    if (title.s == '') {  // FIXME
      return;
    }
    if (index + 1 == titles.length) {
      title.length = 1;
    } else {
      title.length = titles[index + 1].t - title.t;
    }
    if (title.length > 600 && title.t > 1485651600) {
      // console.log(title.length, title);
      title.length = 600;
    }
    var dayNumber = fullDaysBetween(firstDayBeginTime, new Date(title.t * 1000));
    while (dayDurations.length <= dayNumber) {
      dayDurations.push({});
    }
    if (!dayDurations[dayNumber].hasOwnProperty(title.group)) {
      dayDurations[dayNumber][title.group] = 0;
    }
    dayDurations[dayNumber][title.group] += title.length;
  });
}


function drawKeyEvents() {
  $("#keystats").empty();
  var binTime = 10 * 60;
  var binsNumber = 24 * 60 * 60 / binTime;

  var dailyKeystats = [];
  var globalKeystats = {bins: [], maxKeys: 0, sumKeys: 0};
  for (var i = 0; i < binsNumber; ++i) {
    globalKeystats.bins.push(0);
  }
  var maxKeysPerDay = 0;
  var maxKeysPerBin = 0;
  var firstDayBeginTime = rewind7am(events['window_events'][0].t * 1000);

  events['keyfreq_events'].forEach(keyEvent => {
    var dayNumber = fullDaysBetween(firstDayBeginTime, new Date(keyEvent.t * 1000));

    if (dailyKeystats[dayNumber] === undefined) {
      dailyKeystats[dayNumber] = {bins: [], maxKeys: 0, sumKeys: 0,
                                  dayBeginTime: rewind7am(keyEvent.t * 1000)};
      for (var i = 0; i < binsNumber; ++i) {
        dailyKeystats[dayNumber].bins.push(0);
      }
    }

    var bin = Math.floor(
        (keyEvent.t * 1000 - rewind7am(keyEvent.t * 1000).getTime()) / 1000 / binTime);
    dailyKeystats[dayNumber].bins[bin] += keyEvent.s;
    dailyKeystats[dayNumber].sumKeys += keyEvent.s;

    globalKeystats.bins[bin] += keyEvent.s;
    globalKeystats.sumKeys += keyEvent.s;
    globalKeystats.maxKeys = Math.max(globalKeystats.maxKeys, globalKeystats.bins[bin]);

    maxKeysPerDay = Math.max(maxKeysPerDay, dailyKeystats[dayNumber].sumKeys);
    maxKeysPerBin = Math.max(maxKeysPerBin, dailyKeystats[dayNumber].bins[bin]);
  });

  var width = $("#keystats").width();
  var height = 15;
  var offset = 100;

  // draw global key events across all days as line
  var div = d3.select("#keystats").append("div");

  var binWidth = (width - offset) / binsNumber;
  var svg = div.append("svg")
    .attr("width", width)
    .attr("height", 2 * height);

  var line = d3.svg.line()
    .x(function(d, i) { return (width - 2 * offset) * i / binsNumber + offset; })
    .y(function(d) { return 2 * height - d / globalKeystats.maxKeys * height * 2; });

  svg.append("path")
    .datum(globalKeystats.bins)
    .attr("class", "line")
    .attr("d", line);

  // draw x axis: times of the day
  var div = d3.select("#keystats").append("div");
  var svg = div.append("svg")
    .attr("width", width)
    .attr("height", 20);
  for (var hour = 0; hour < 24; ++hour) {
    svg.append('text')
    .attr('font-size', 14)
    .attr("font-family", "arial")
    .attr("transform", "translate(" + (hour / 24 * (width - 2 * offset) + 2 + offset) + ",16)")
    .text(function(d, i) { return ((hour + 7) % 24) + ':00'; });

    svg.append('line')
    .attr('x1', hour / 24 * (width - 2 * offset) + offset)
    .attr('x2', hour / 24 * (width - 2 * offset) + offset)
    .attr('y1', 0)
    .attr('y2', 20)
    .attr("stroke", "#000")
    .attr("stroke-width", 2);

  }

  for(var day = 0; day < dailyKeystats.length; ++day) {
    // var kevents = allkevents[k];
    var div = d3.select("#keystats").append("div").attr("class", "divkeys");

    var svg = div.append("svg")
    .attr("width", width)
    .attr("height", height);
    // var sx = kevents.length;

    svg.selectAll('.ke')
      .data(dailyKeystats[day].bins)
    .enter()
      .append('rect')
      .attr('x', function(d,i) { return (width - 2 * offset) * i / binsNumber + offset; })
      .attr('width', binWidth)  // TODO
      .attr('y', 0)
      .attr('height', height)
      .attr('fill', function(d) {
        var e = d / maxKeysPerBin;
        var r = Math.floor(Math.max(0, 255 - e*255));
        var g = Math.floor(Math.max(0, 255 - e*255));
        var b = 255;
        return 'rgb(' + r + ',' + g + ',' + b + ')';
      });

    // draw y axis: time
    svg.append('text')
      .attr("font-size", 14)
      .attr("transform", "translate(0,12)")
      .attr("font-family", "arial")
      .text(ppDateShort(dailyKeystats[day].dayBeginTime));

    // draw y axis: total number of keys
    svg.append('rect')
      .attr('x', width - offset + 5)
      .attr('y', 0)
      .attr('width', d => dailyKeystats[day].sumKeys / maxKeysPerDay * offset)
      .attr('height', height)
      .attr('fill', 'rgb(255, 100, 100)');

    svg.append('text')
      .attr('transform', 'translate(' + (width - offset + 7) + ', ' + 13 + ')')
      .attr('font-size', 14)
      .attr("font-family", "arial")
      .text(dailyKeystats[day].sumKeys);
  }

  div.append('p').text('total keys pressed: ' + globalKeystats.sumKeys + ' in ' +
      dailyKeystats.length + ' days (' + Math.floor(globalKeystats.sumKeys / dailyKeystats.length) +
      ' per day average)');
}

function loadAllEvents() {

  // // load the master json file and all the other jsons
  // getJSON_CACHEHACK("export_list.json").then(function(days_list) {
  //   event_list = days_list; // global variable assign
  //   console.log("fetched export_list OK.")
  //   return Promise.all(days_list.map(function(x) { return getJSON_CACHEHACK(x.fname); }));
  // }).then(function(days) {
  //   events = days; // global variable assign
  // }).catch(function(err){
  //   console.log('some error happened: ' + err);
  // }).then(function() {

  loaded = false;
  // we do this random thing to defeat caching. Very annoying
  var json_path = 'events?begin_time=' + (new Date(0)).getTime() +
      '&end_time=' + (new Date()).getTime() +
      "&sigh=" + Math.floor(10000*Math.random());

  $.getJSON(json_path, function(data) {
    events = data;

    analyzeEvents();
    drawGroupsBarChart();

    key_stats_all = mergeWindowKeyEvents();
    visualizeKeySummary(key_stats_all);
    visualizeTimeSummary(dayDurations);

    drawKeyEvents(); // draw key events
  });
}

function mergeWindowKeyEvents() {
  return computeKeyStats(events['window_events'], events['keyfreq_events']);
}

function visualizeKeySummary(key_stats_all) {
  $("#keysummary").empty();

  // merge all keystats into a single global key stats
  var gstats = {};
  _.each(titleGroups, function(group) { gstats[group] = {name: group, val: 0, n:0, col: groupColor[group]}; });

  for(var j=0;j<titleGroups.length;j++) {
    var e = titleGroups[j];
    if(key_stats_all.hasOwnProperty(e)) {
      gstats[e].val += key_stats_all[e].f;
      gstats[e].n += key_stats_all[e].n;
    }
  }

  gstats = _.filter(gstats, function(d) { return d.val > 0; }); // cutoff at 0 keys
  _.each(gstats, function(d) { d.text = d.val + ' (' + (d.val/(d.n*9)).toFixed(2) + '/s) (' + d.name + ')'; });
  gstats = _.sortBy(gstats, 'val').reverse();

  // visualize as chart
  var chart_data = {};
  chart_data.width = 600;
  chart_data.barheight = 25;
  chart_data.textpad = 300;
  chart_data.textmargin = 10;
  chart_data.title = 'total keys per window';
  chart_data.data = gstats;
  d3utils.drawHorizontalBarChart(d3.select('#keysummary'), chart_data);
}

function visualizeTimeSummary(dayDurations) {
  $("#timesummary").empty();

  var gstats = {};
  _.each(titleGroups, function(group) { gstats[group] = {name: group, val: 0, n:0, col: groupColor[group]}; });
  var n = dayDurations.length;
  for(var i=0;i<n;i++) {
    var key_stats = dayDurations[i];
    for(var j=0;j<titleGroups.length;j++) {
      var e = titleGroups[j];
      if(key_stats.hasOwnProperty(e)) {
        gstats[e].val += key_stats[e];
      }
    }
  }
  gstats = _.filter(gstats, function(d) { return d.val > 0; }); // cutoff at 0 keys
  _.each(gstats, function(d) { d.text = (d.val/60/60).toFixed(2) + 'hr (' + d.name + ')'; });
  gstats = _.sortBy(gstats, 'val').reverse();

  // visualize as chart
  var chart_data = {};
  chart_data.width = 600;
  chart_data.barheight = 25;
  chart_data.textpad = 300;
  chart_data.textmargin = 10;
  chart_data.title = 'total time per window';
  chart_data.data = gstats;
  d3utils.drawHorizontalBarChart(d3.select('#timesummary'), chart_data);
}




// GLOBALS
var groupColor = {}; // mapped titles -> hsl color to draw with
var eventsBeginTime; // initial time for a day (time first event began)
var eventsEndTime; // final time for a day (time last event ended)
var ecounts = {};
var titleGroups = [];
var hacking_stats = {};

// renders pie chart showing distribution of time spent into #piechart
function createPieChart(es, titleGroups) {
  // count up the total amount of time spent in all windows
  var dtall = 0;
  var counts = {};
  _.each(es, function(e){
    counts[e.group] = (counts[e.group] || 0) + e.length;
    dtall += e.length;
  });
  var stats = _.map(titleGroups, function(group) {
    return {val: counts[group],
            name: group + " (" + (100*counts[group]/dtall).toFixed(1) + "%)",
            col: groupColor[group]
           };
  });

  // create a pie chart with d3
  var chart_data = {};
  chart_data.width = $(window).width() - 40;  // FIXME (causes horizontal scrolling)
  chart_data.height = 500;
  chart_data.title = "Total Time: " + strTimeDelta(dtall);
  chart_data.data = stats;
  d3utils.drawPieChart(d3.select('#piechart'), chart_data);
}

// creates the main barcode time visualization for all mapped window titles
function visualizeEvents(window_events) {
  $("#eventvis").empty();
  display_groups.forEach(displayGroup => visualizeEvent(window_events, displayGroup));
}


// uses global variable hacking_events as input. Must be set
// and global total_hacking_time as well.
function visualizeHackingTimes(hacking_stats) {
  $("#hackingvis").empty();
  if(!draw_hacking) return; // global set in render_settings.js

  var c = "rgb(200,0,0)"; // color

  var div = d3.select("#hackingvis").append("div");
  div.append("p").attr("class", "group-title").attr("style", "color:"+c).text("Hacking Streak");
  var txt = strTimeDelta(hacking_stats.totalHackingTime);
  txt += " (total keys = " + hacking_stats.totalHackingKeys + ")";
  div.append("p").attr("class", "group-time").text(txt);

  var W = $(window).width() - 40;
  var svg = div.append("svg")
  .attr("width", W)
  .attr("height", 30);

  var sx = (eventsEndTime-eventsBeginTime) / W;
  var g = svg.selectAll(".h")
    .data(hacking_stats.events)
    .enter().append("g")
    .attr("class", "h")
    .on("mouseover", function(d){return tooltip.style("visibility", "visible").text(strTimeDelta(d.length));})
    .on("mousemove", function(){return tooltip.style("top", (event.pageY-10)+"px").style("left",(event.pageX+10)+"px");})
    .on("mouseout", function(){return tooltip.style("visibility", "hidden");});

  g.append("rect")
    .attr("x", function(session) { return (session.beginTime - eventsBeginTime) / sx; } )
    .attr("width", function(d) { return d.length / sx; } )
    .attr("y", function(d) {return 30-10*d.intensity} )
    .attr("height", function(d) {return 10*d.intensity; })
    .attr("fill", function(d) { return c; });
}

// number of keys pressed in every window type visualization
function visualizeKeyStats(key_stats, titleGroups) {
  $("#daily-keystats").empty();

  // format input for d3
  var stats = _.map(titleGroups, function(group) {
    return {
      name: group,
      val: key_stats.hasOwnProperty(group) ? key_stats[group].f : 0,
      col: groupColor[group],
    };
  });
  stats = _.filter(stats, function(d) { return d.val > 60 }); // cutoff at 1 minute
  _.each(stats, function(d) {
    var fn = (d.val / (key_stats[d.name].n * 9.0)).toFixed(2);
    d.text = d.val + ' (' + fn + '/s) ' + d.name;
  });
  stats = _.sortBy(stats, 'val').reverse();

  // visualize as horizontal bars with d3
  var chart_data = {};
  chart_data.width = 700;
  chart_data.barheight = 25;
  chart_data.textpad = 300;
  chart_data.textmargin = 10;
  chart_data.title = "Total number of key strokes";
  chart_data.data = stats;
  d3utils.drawHorizontalBarChart(d3.select('#daily-keystats'), chart_data);
}

// simple plot of key frequencies over time
function visualizeKeyFreq(es) {
  $("#keygraph").empty();

  var W = $(window).width() - 40;

  var div = d3.select("#keygraph").append("div");
  var svg = div.append("svg")
  .attr("width", "100%")
  .attr("height", 100);

  var sx = (eventsEndTime-eventsBeginTime) / W;
  var line = d3.svg.line()
    .x(function(d) { return (d.t -eventsBeginTime) / sx; })
    .y(function(d) { return 100 - d.s; });

  svg.append("path")
    .datum(es)
    .attr("class", "line")
    .attr("d", line);

  div.append("p").text("keystroke frequency");
}

function visualizeNotes(es) {
  console.log('number of notes:' + es.length);
  $("#notesvis").empty();
  if(!draw_notes) return; // draw_notes is set in render_settings.js
  if(es.length === 0) return; // nothing to do here...

  var coffees = [];
  var dts= [];
  for(var i=0,N=es.length;i<N;i++) {
    var e = es[i];
    var d = {};
    d.x = e.t-eventsBeginTime;
    d.s = e.s;
    if(e.s.indexOf("coffee")>-1) {
      // we had coffee
      coffees.push(e.t-eventsBeginTime);
    }
    dts.push(d);
  }

  console.log('drawing ' + dts.length + ' notes.');
  var div = d3.select("#notesvis").append("div");
  div.append("p").attr("class", "group-title").attr("style", "color: #964B00").text("Notes");
  var W = $(window).width() - 40;
  var svg = div.append("svg")
  .attr("width", W)
  .attr("height", 70);

  var sx = (eventsEndTime-eventsBeginTime) / W;

  // Draw coffee. Overlay
  // draw_coffee is set in render_settings.js
  if(draw_coffee) {
    var coffex = [];
    var nc = coffees.length;
    var alpha = Math.log(2)/20520; // 20,520 is half life of coffee, in seconds. Roughly 6 hours
    for(var i=0;i<100;i++) {
      there = i*(eventsEndTime-eventsBeginTime)/100.0;
      // coffee is assumed to add linearly in the body
      var amount = 0;
      for(var j=0;j<nc;j++) {
        if(there > coffees[j]) {
          amount += Math.exp(-alpha*(there - coffees[j]));
        }
      }
      coffex.push({t:there, a:30*amount}); // scale is roughly 30px = 150mg coffee, for now
    }
    var cdx = (eventsEndTime - eventsBeginTime)/100.0;
    var g = svg.selectAll(".c")
      .data(coffex)
      .enter()
      .append("rect")
      .attr("width", cdx/sx)
      .attr("x", function(d){ return d.t/sx; })
      .attr("y", function(d){ return 50-d.a; })
      .attr("height", function(d){ return d.a; })
      .attr("fill", "#E4CFBA");
  }

  // draw notes
  var g = svg.selectAll(".n")
    .data(dts)
    .enter().append("g")
    .attr("class", "n");

  g.append("rect")
    .attr("x", function(d) { return d.x/sx; } )
    .attr("width", 2)
    .attr("y", 0)
    .attr("height", 50)
    .attr("fill", "#964B00");

  g.append("text")
    .attr("transform", function(d,i) { return "translate(" + (d.x/sx+5) + "," + (10+15*(i%5)) + ")"; })
    .attr("font-family", "'Lato', sans-serif")
    .attr("font-size", 14)
    .attr("fill", "#333")
    .text(function(d) { return d.s; } );
}


var clicktime;
function visualizeEvent(windowEvents, categoryGroups) {
  var totalTime = 0;
  var groupTotalTime = {}
  categoryGroups.forEach(group => groupTotalTime[group] = 0);
  var groupColors = categoryGroups.map(group => groupColor[group]);

  var bars = [];
  windowEvents.forEach(event => {
    if (event.s == '') {
      return;
    }
    if (categoryGroups.indexOf(event.group) === -1) {
      return;
    }

    totalTime += event.length;
    groupTotalTime[event.group] += event.length;
    if(event.length < 10) {
      return; // less than few second event? skip drawing. Not a concentrated activity
    }

    var bar = {};
    bar.position = event.t - eventsBeginTime;
    bar.width = event.length;
    bar.title = event.s + " (" + strTimeDelta(event.length) + ")";
    bar.group = event.group;
    bars.push(bar);
  });
  if(totalTime < 60)
    return; // less than a minute of activity? skip

  console.log('drawing category ' + categoryGroups + ' with ' + bars.length + ' events.');

  var div = d3.select("#eventvis").append("div");

  var categoryDiv = div.append("div").attr("class", "fsdiv");
  categoryGroups.forEach(group => {
    if(groupTotalTime[group] === 0) {
      return;
    }

    var groupDiv = categoryDiv.append("div").attr("class", "fdiv");
    groupDiv.append("p").attr("class", "group-title")
      .attr("style", "color:" + groupColor[group])
      .text(group);
    groupDiv.append("p").attr("class", "group-time")
      .text(strTimeDelta(groupTotalTime[group]));
  });

  var width = $(window).width() - 40; // FIXME
  var svg = div.append("svg")
    .attr("width", width)
    .attr("height", 50);

  var sx = (eventsEndTime - eventsBeginTime) / width;
  var g = svg.selectAll(".e")
    .data(bars)
    .enter().append("g")
    .attr("class", "e")
    .on("mouseover", bar => tooltip.style("visibility", "visible").text(bar.title))
    .on("mousemove", () => tooltip.style("top", (event.pageY-10)+"px").style("left",(event.pageX+10)+"px"))
    .on("mouseout", () => tooltip.style("visibility", "hidden"))
    .on("click", bar => {
      $("#notesinfo").show();
      $("#notesmsg").html("clicked event <b>" + bar.title + "</b><br> Add note at time of this event:");
      $("#notetext").focus()
      clicktime = bar.position + eventsBeginTime;
      return 0;
    });

  g.append("rect")
    .attr("x", bar => bar.position / sx)
    .attr("width", bar => bar.width / sx)
    .attr("y", 0)
    .attr("height", 30)
    .attr("fill", bar => groupColor[bar.group]);


  // produce little axis numbers along the timeline
  var d0 = new Date(eventsBeginTime * 1000);
  d0.setMinutes(0);
  d0.setSeconds(0);
  d0.setMilliseconds(0);
  var t = d0.getTime() / 1000; // cropped hour
  while(t < eventsEndTime) {
    svg.append("text")
      .attr("transform", "translate(" + [(t-eventsBeginTime)/sx, 50] + ")")
      .attr("font-family", "'Lato', sans-serif")
      .attr("font-size", 14)
      .attr("fill", "#CCC")
      .text(new Date(t * 1000).getHours());
    t += 3600;
  }
}


// count up how much every event took
function processWindowEvents(windowEvents) {
  ecounts = {};
  titleGroups = [];

  windowEvents.forEach((windowEvent, index, windowEvents) => {
    if (index + 1 == windowEvents.length) {
      windowEvent.length = 1;
      return;
    }
    windowEvent.length = windowEvents[index + 1].t - windowEvent.t;
    if(ecounts.hasOwnProperty(windowEvent.group)) {
      ecounts[windowEvent.group] += windowEvent.length;
    } else {
      ecounts[windowEvent.group] = windowEvent.length;
      titleGroups.push(windowEvent.group);
    }
  });

  windowEvents = windowEvents.filter((windowEvent, index, windowEvents) => {
    if (index + 1 == windowEvents.length || windowEvent.s != windowEvents[index + 1].s) {
      return true;
    } else {
      windowEvents[index + 1].length += windowEvent.length;
      windowEvents[index + 1].t = windowEvent.t;
      return false;
    }
  });

  return windowEvents;
}



function fetchAndLoadEvents(beginTime, endTime) {
  loaded = false;
  // we do this random thing to defeat caching. Very annoying
  var json_path = 'events?begin_time=' + beginTime.getTime() +
      '&end_time=' + endTime.getTime() +
      "&sigh=" + Math.floor(10000*Math.random());

  // fill in blog area with blog for this day
  $.getJSON(json_path, function(data) {
    loaded = true;

    // save these as globals for later access
    events = data;

    // map all window titles through the (customizable) mapwin function
    _.each(events['window_events'], function(e) { e.group = mapwin(e.s); });

    // compute various statistics
    events['window_events'] = processWindowEvents(events['window_events']);

    // create color hash table, maps from window titles -> HSL color
    groupColor = colorHashStrings(_.uniq(_.pluck(events['window_events'], 'group')));

    // find the time extent: min and max time for this day
    if(events['window_events'].length > 0) {
      eventsBeginTime = _.min(_.pluck(events['window_events'], 't'));
      eventsEndTime = _.max(_.map(events['window_events'], function(e) { return e.t + e.length; }))
    } else {
      eventsBeginTime = beginTime.getTime() / 1000;
      eventsEndTime = endTime.getTime() / 1000;
    }

    // render blog entry
    blog = 'blog' in data ? data['blog'] : '';
    if(blog === '') { blog = 'click to enter blog for this day'; }
    $("#blogpre").text(blog);

    visualizeEvents(events['window_events']);
    writeHeader();
    createPieChart(events['window_events'], titleGroups);
    computeKeyStats(events['window_events'], events['keyfreq_events']);
    hacking_stats = computeHackingStats(events['window_events'], events['keyfreq_events'], hacking_titles);
    visualizeHackingTimes(hacking_stats);
    key_stats = computeKeyStats(events['window_events'], events['keyfreq_events']);
    visualizeKeyStats(key_stats, titleGroups);
    visualizeKeyFreq(events['keyfreq_events']);
    visualizeNotes(events['notes_events']);
  });
}
