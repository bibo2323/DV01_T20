const AUSTRALIAN_STATES_URL = 'https://raw.githubusercontent.com/rowanhogan/australian-states/master/states.geojson';
const stateCodes = {
  'New South Wales': 'NSW', 'Northern Territory': 'NT', Queensland: 'Qld',
  'South Australia': 'SA', Tasmania: 'Tas', Victoria: 'Vic',
  'Western Australia': 'WA', 'Australian Capital Territory': 'ACT'
};
let australianStates;

function loadAustralianStates() {
  if (!australianStates) australianStates = fetch(AUSTRALIAN_STATES_URL).then(response => {
    if (!response.ok) throw new Error(`Unable to load Australian state boundaries (${response.status})`);
    return response.json();
  });
  return australianStates;
}

function mapColor(value, min, max) {
  if (max === min) return '#477da5';
  const ratio = (value - min) / (max - min);
  const start = [166, 97, 26], end = [8, 48, 107];
  return `rgb(${start.map((channel, index) =>
    Math.round(channel + (end[index] - channel) * ratio)).join(',')})`;
}

window.renderChoroplethMap = function (data) {
  const { G20 } = window;
  const svg = G20.clear('#mapChart');
  const [width, height] = G20.size(svg);
  const year = +document.querySelector('#q2Year').value;
  const user = document.querySelector('#q2Select').value;
  const rows = data.filter(row => +row['calendar year'] === year && row['road user'] === user);
  const published = rows.filter(row => row.Status !== 'Not published');
  const values = published.map(row => G20.number(row['Percent share']));
  const min = Math.min(...values, 0), max = Math.max(...values, 1);
  document.querySelector('#q2YearValue').value = year;
  document.querySelector('#mapLegend').innerHTML =
    '<span class="map-legend-item"><i class="map-low"></i><span>Lower published share</span></span>' +
    '<span class="map-legend-item"><i class="map-high"></i><span>Higher</span></span>' +
    '<span class="map-legend-item"><i class="map-np"></i><span>Not published</span></span>';

  loadAustralianStates().then(geojson => {
    const projection = d3.geoMercator().fitExtent([[24, 18], [width - 24, height - 18]], geojson);
    const path = d3.geoPath(projection);
    const group = G20.svg('g', {}, svg);
    geojson.features.forEach(feature => {
      const stateName = feature.properties.STATE_NAME;
      const code = stateCodes[stateName];
      if (!code) return;
      const row = rows.find(item => item['state or territory'] === code);
      const status = row?.Status || 'No cases listed';
      const isNotPublished = status === 'Not published';
      const isPublished = !isNotPublished;
      const value = row ? G20.number(row['Percent share']) : 0;
      const label = isNotPublished ? status : `${G20.percent(value)}${row ? '' : ' (no cases listed)'}`;
      const state = G20.svg('path', {
        d: path(feature),
        fill: isPublished ? mapColor(value, min, max) : '#c94c4c',
        stroke: '#fff', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke',
        tabindex: 0, role: 'img',
        'aria-label': `${stateName}: ${label}`
      }, group);
      const showTooltip = event => {
        const bounds = svg.getBoundingClientRect();
        const point = event.touches?.[0] || event;
        G20.tooltip(svg, `${stateName}: ${label}`,
          point.clientX - bounds.left, point.clientY - bounds.top);
      };
      state.addEventListener('mouseenter', showTooltip);
      state.addEventListener('mousemove', showTooltip);
      state.addEventListener('focus', showTooltip);
      state.addEventListener('mouseleave', G20.hideTooltip);
      state.addEventListener('blur', G20.hideTooltip);
    });
  }).catch(error => {
    console.error(error);
    document.querySelector('#q2Insight').textContent =
      'The map boundaries could not be loaded. Please check your connection and reload the page.';
  });

  const top = published.slice().sort((a, b) =>
    G20.number(b['Percent share']) - G20.number(a['Percent share']))[0];
  document.querySelector('#q2Insight').innerHTML = top
    ? `In ${year}, <strong>${top['state name']}</strong> has the largest published share of <strong>${user.toLowerCase()}</strong> injuries at ${G20.percent(G20.number(top['Percent share']))}.`
    : `No published cases are available for ${user.toLowerCase()} injuries in ${year}.`;
};
