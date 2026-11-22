// Chart 2: Injury share by state and territory (Choropleth Map)
// High-intensity, high-contrast color scale with direct on-map share labels

const AUSTRALIAN_STATES_URL = 'https://raw.githubusercontent.com/rowanhogan/australian-states/master/states.geojson';

const STATE_CODES = {
  'New South Wales': 'NSW',
  'Northern Territory': 'NT',
  'Queensland': 'Qld',
  'South Australia': 'SA',
  'Tasmania': 'Tas',
  'Victoria': 'Vic',
  'Western Australia': 'WA',
  'Australian Capital Territory': 'ACT'
};

// ABS 2021 Estimated Resident Population (ERP) for population context and per-100k calculations
const STATE_POPULATIONS = {
  'NSW': 8095000,
  'Vic': 6550000,
  'Qld': 5220000,
  'WA': 2760000,
  'SA': 1800000,
  'Tas': 570000,
  'ACT': 454000,
  'NT': 250000
};

let australianStates;

function loadAustralianStates() {
  if (!australianStates) {
    australianStates = fetch(AUSTRALIAN_STATES_URL).then(response => {
      if (!response.ok) throw new Error(`Unable to load Australian state boundaries (${response.status})`);
      return response.json();
    });
  }
  return australianStates;
}

// Ultra high-contrast Yellow to Dark Red sequential color ramp
// Maximizes visual distinction across pale yellow, golden amber, fiery vermilion, ruby crimson, and deep dark burgundy
const YL_OR_RD_RAMP = [
  [255, 255, 178], // 0.0: warm pale yellow (#ffffb2)
  [254, 178, 76],  // 0.25: golden amber (#feb24c)
  [253, 92, 34],   // 0.50: vivid vermilion orange (#fd5c22)
  [215, 25, 28],   // 0.75: ruby crimson (#d7191c)
  [103, 0, 31]     // 1.0: deep dark burgundy (#67001f)
];

function mapColor(value, min, max) {
  if (max <= min) return 'rgb(215, 25, 28)';
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const n = YL_OR_RD_RAMP.length - 1;
  const scaled = ratio * n;
  const idx = Math.min(n - 1, Math.floor(scaled));
  const t = scaled - idx;
  const c1 = YL_OR_RD_RAMP[idx];
  const c2 = YL_OR_RD_RAMP[idx + 1];

  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

window.renderChoroplethMap = function (data) {
  const { G20 } = window;
  const svg = G20.clear('#mapChart');
  const [width, height] = G20.size(svg);

  const yearInput = document.querySelector('#q2Year');
  const userSelect = document.querySelector('#q2Select');
  const year = (yearInput && yearInput.value && !isNaN(+yearInput.value)) ? +yearInput.value : 2021;
  const user = (userSelect && userSelect.value) ? userSelect.value : (data[0]?.['road user'] || 'Car driver, passenger or unknown position');

  const rows = data.filter(row => +row['calendar year'] === year && row['road user'] === user);
  const published = rows.filter(row => row.Status === 'Published');
  const values = published.map(row => G20.number(row['Percent share']));

  // True dynamic range from actual lowest to highest published share
  // This utilizes 100% of the color intensity scale for maximum contrast between states
  let min = values.length ? Math.min(...values) : 0;
  let max = values.length ? Math.max(...values) : 1;

  if (max <= min) {
    max = min + 0.5;
  }

  const yearOut = document.querySelector('#q2YearValue');
  if (yearOut) yearOut.value = year;

  // Update Legend with stepped discrete color swatches
  const legendElem = document.querySelector('#mapLegend');
  if (legendElem) {
    // Build discrete legend grades from the data range
    const range = max - min;
    // Create ~8 evenly-spaced buckets across the actual data range (highest to lowest)
    const numBuckets = Math.min(8, Math.max(3, Math.ceil(range / 2.5)));
    const step = range / numBuckets;

    let gradesHtml = '';
    // Render from highest to lowest (darkest first) to match the reference style
    for (let i = numBuckets - 1; i >= 0; i--) {
      const bucketLow = min + i * step;
      const bucketHigh = min + (i + 1) * step;
      const midVal = (bucketLow + bucketHigh) / 2;
      const color = mapColor(midVal, min, max);

      // Format: show "0–X%" for the lowest bucket
      const lowLabel = bucketLow.toFixed(1).replace(/\.0$/, '');
      const highLabel = bucketHigh.toFixed(1).replace(/\.0$/, '');
      const label = `${lowLabel}–${highLabel}%`;

      gradesHtml += `<span class="legend-grade-item"><span class="grade-swatch" style="background:${color}"></span>${label}</span>`;
    }

    // Add "Not published" swatch
    gradesHtml += `<span class="map-legend-np-item"><span class="np-hatch-swatch"></span>Not published</span>`;

    legendElem.innerHTML = `
      <div class="map-legend-container">
        <div class="legend-header">
          <strong>Color Intensity: Share of state's road injuries (${G20.escape(user)})</strong>
        </div>
        <div class="map-stepped-legend-row">
          <div class="map-legend-grades">${gradesHtml}</div>
        </div>
      </div>
    `;
  }

  loadAustralianStates().then(geojson => {
    const projection = d3.geoMercator().fitExtent([[24, 18], [width - 24, height - 24]], geojson);
    const path = d3.geoPath(projection);

    const statesGroup = G20.svg('g', { class: 'states-group' }, svg);
    const labelsGroup = G20.svg('g', { class: 'state-labels-group' }, svg);

    geojson.features.forEach(feature => {
      const stateName = feature.properties.STATE_NAME;
      const code = STATE_CODES[stateName];
      if (!code) return;

      const row = rows.find(item => item['state or territory'] === code);
      const isNotPublished = !row || row.Status === 'Not published';
      const isPublished = !isNotPublished;
      const shareVal = row ? G20.number(row['Percent share']) : 0;
      const userCases = row ? G20.number(row['road_user_cases']) : 0;
      const totalStateCases = row ? G20.number(row['state_total_cases']) : 0;

      // Color intensity fill; unpublished states use solid neutral gray without backslashes
      const fillColor = isPublished ? mapColor(shareVal, min, max) : '#f1f5f9';

      const statePath = G20.svg('path', {
        d: path(feature),
        fill: fillColor,
        stroke: isPublished ? '#ffffff' : '#cbd5e1',
        'stroke-width': 1.8,
        'vector-effect': 'non-scaling-stroke',
        class: 'state-polygon',
        tabindex: 0,
        role: 'img',
        'aria-label': `${stateName}: ${isPublished ? `${shareVal.toFixed(1)}% share` : 'Not published'}`
      }, statesGroup);

      // Centroid for state name & share label
      const [cx, cy] = path.centroid(feature);

      let labelX = cx;
      let labelY = cy;
      if (code === 'ACT') {
        labelX = cx + 38;
        labelY = cy - 4;
        G20.svg('line', {
          x1: cx,
          y1: cy,
          x2: labelX - 16,
          y2: labelY,
          stroke: '#1e293b',
          'stroke-width': 1.2,
          'stroke-dasharray': '2 2'
        }, labelsGroup);
      } else if (code === 'NSW') {
        labelX = cx - 18;
        labelY = cy - 8;
      }

      // State label styling: uniform dark slate with white halo for clean readability
      const stateLabelG = G20.svg('text', {
        x: labelX,
        y: labelY,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        class: 'state-name-label'
      }, labelsGroup);

      // Code line
      G20.svg('tspan', {
        x: labelX,
        dy: isPublished ? '-0.5em' : '0',
        'font-weight': 800,
        'font-size': code === 'ACT' ? '12px' : '14px',
        fill: '#0f172a'
      }, stateLabelG).textContent = code;

      // Real value line directly visible on the map
      if (isPublished) {
        G20.svg('tspan', {
          x: labelX,
          dy: '1.25em',
          'font-weight': 700,
          'font-size': code === 'ACT' ? '11px' : '12px',
          fill: '#0f172a'
        }, stateLabelG).textContent = `${shareVal.toFixed(1)}%`;
      }

      // Rich Hover Tooltip with counts and share percentage
      const showTooltip = event => {
        const bounds = svg.getBoundingClientRect();
        const pt = event.touches?.[0] || event;
        const posX = pt.clientX - bounds.left;
        const posY = pt.clientY - bounds.top;

        let tooltipHtml = `<strong>${G20.escape(stateName)} (${code})</strong><br>`;
        tooltipHtml += `<small style="color:#94a3b8">${user} · ${year}</small><br>`;

        if (isPublished) {
          tooltipHtml += `Road user injuries: <strong>${G20.format(userCases)}</strong><br>`;
          tooltipHtml += `State total road injuries: <strong>${G20.format(totalStateCases)}</strong><br>`;
          tooltipHtml += `<strong>Share of state's total: ${shareVal.toFixed(1)}%</strong>`;
        } else {
          tooltipHtml += `<span style="color:#64748b">Status: Not published</span><br>`;
          tooltipHtml += `<small style="color:#cbd5e1">Data suppressed by AIHW/BITRE to protect privacy for small cell counts.</small>`;
        }

        G20.tooltip(svg, tooltipHtml, posX, posY);
      };

      statePath.addEventListener('mouseenter', showTooltip);
      statePath.addEventListener('mousemove', showTooltip);
      statePath.addEventListener('focus', showTooltip);
      statePath.addEventListener('mouseleave', G20.hideTooltip);
      statePath.addEventListener('blur', G20.hideTooltip);
    });
  }).catch(error => {
    console.error(error);
    const insight = document.querySelector('#q2Insight');
    if (insight) {
      insight.textContent = 'The map boundaries could not be loaded. Please check your connection and reload the page.';
    }
  });

  // Dynamic Insight Text
  const top = published.slice().sort((a, b) =>
    G20.number(b['Percent share']) - G20.number(a['Percent share']))[0];

  const insightElem = document.querySelector('#q2Insight');
  if (insightElem) {
    if (top) {
      const topPct = G20.number(top['Percent share']).toFixed(1);
      const topCases = G20.number(top['road_user_cases']);
      const stateTotal = G20.number(top['state_total_cases']);
      insightElem.innerHTML =
        `In ${year}, <strong>${G20.escape(top['state name'])}</strong> recorded the highest intensity share of ` +
        `<strong>${G20.escape(user.toLowerCase())}</strong> injuries at <strong>${topPct}%</strong> ` +
        `(${G20.format(topCases)} of ${G20.format(stateTotal)} total road hospitalisations). ` +
        `<em>Intensity reflects the relative road-user share within each jurisdiction.</em>`;
    } else {
      insightElem.innerHTML = `No published cases are available for ${G20.escape(user.toLowerCase())} injuries in ${year}.`;
    }
  }
};
