import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken = 'pk.eyJ1IjoiYmNhbiIsImEiOiJjbWFyNzY2cWMwODE3Mm5weTVtdzR1NDlpIn0.BDn2iQV5rRHu-Fv5-qUcxg';

let stations = [];
let trips = [];
let circles;
let radiusScale;
let stationFlow;
let timeFilter = -1;

// Step 5.2 helper: formatTime
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}

// Step 5.3 helper: minutesSinceMidnight
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Step 5.3: filterTripsbyTime
function filterTripsbyTime(trips, timeFilter) {
  return timeFilter === -1
    ? trips
    : trips.filter(trip => {
        const sm = minutesSinceMidnight(trip.started_at);
        const em = minutesSinceMidnight(trip.ended_at);
        return Math.abs(sm - timeFilter) <= 60 || Math.abs(em - timeFilter) <= 60;
      });
}

// Step 5.3: computeStationTraffic
function computeStationTraffic(stations, trips) {
  const deps = d3.rollup(trips, v => v.length, d => d.start_station_id);
  const arrs = d3.rollup(trips, v => v.length, d => d.end_station_id);
  return stations.map(s => {
    const id = s.short_name;
    s.departures   = deps.get(id) || 0;
    s.arrivals     = arrs.get(id) || 0;
    s.totalTraffic = s.departures + s.arrivals;
    return s;
  });
}

// Step 5.3: updateScatterPlot
function updateScatterPlot(tf) {
  const filtered = filterTripsbyTime(trips, tf);
  const updated  = computeStationTraffic(stations, filtered);

  tf === -1 
    ? radiusScale.range([0, 25]) 
    : radiusScale.range([3, 50]);

  circles = circles
    .data(updated, d => d.short_name)
    .join('circle')
      .attr('r', d => radiusScale(d.totalTraffic))
      .style('--departure-ratio', d => stationFlow(d.departures / d.totalTraffic));
}

// original helpers
function getCoords(station) {
  const p = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(p);
  return { cx: x, cy: y };
}
function updatePositions() {
  if (!circles) return;
  circles
    .attr('cx', d => getCoords(d).cx)
    .attr('cy', d => getCoords(d).cy);
}

// map + data load
const map = new mapboxgl.Map({
  container: 'map',
  style:     'mapbox://styles/mapbox/streets-v12',
  center:    [-71.09415, 42.36027],
  zoom:      12,
  minZoom:   5,
  maxZoom:   18,
});

map.on('load', async () => {
  // bike lanes unchanged…

  // 1) load stations
  const jsonData = await d3.json('https://dsc106.com/labs/lab07/data/bluebikes-stations.json');
  stations = jsonData.data.stations;

  // 2) load trips (with Date parsing)
  trips = await d3.csv(
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
    trip => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at   = new Date(trip.ended_at);
      return trip;
    }
  );

  // 3) now that `trips` exists, compute traffic & scales
  stations = computeStationTraffic(stations, trips);
  radiusScale = d3.scaleSqrt()
                  .domain([0, d3.max(stations, d=>d.totalTraffic)])
                  .range([0,25]);
  stationFlow = d3.scaleQuantize()
                  .domain([0,1])
                  .range([0,0.5,1]);

  // 4) initial circles
  const svg = d3.select('#map').select('svg');
  circles = svg.selectAll('circle')
    .data(stations, d => d.short_name)
    .enter().append('circle')
      .attr('r', d => radiusScale(d.totalTraffic))
      .attr('fill','steelblue')
      .attr('stroke','white')
      .attr('stroke-width',1)
      .attr('opacity',0.8)
      .each(function(d) {
        d3.select(this)
          .append('title')
          .text(`${d.totalTraffic} trips (${d.departures} dep, ${d.arrivals} arr)`);
      })
      .style('--departure-ratio', d => stationFlow(d.departures / d.totalTraffic));

  // 5) map events
  updatePositions();
  ['move','zoom','resize','moveend'].forEach(e => map.on(e, updatePositions));

  // 6) slider hookup (note NO '#' in getElementById)
  const timeSlider   = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  function updateTimeDisplay() {
    timeFilter = Number(timeSlider.value);
    if (timeFilter === -1) {
      selectedTime.textContent = '';
      anyTimeLabel.style.display = 'block';
    } else {
      selectedTime.textContent = formatTime(timeFilter);
      anyTimeLabel.style.display = 'none';
    }
    updateScatterPlot(timeFilter);
  }

  timeSlider.addEventListener('input', updateTimeDisplay);
  updateTimeDisplay();
});
