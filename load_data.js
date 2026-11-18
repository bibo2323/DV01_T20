const G20 = (window.G20 = window.G20 || {});
G20.DATA_DIR = 'knime%20data/';
G20.FILES = {
  line: 'chart1_road_user_by_year.csv',
  map: 'chart2_state_road_user_share.csv',
  remoteness: 'chart3_remoteness_share.csv',
  scatter: 'chart4_stay_scatter.csv',
  age: 'chart5_age_mix_by_year.csv'
};
G20.YEARS = Array.from({ length: 11 }, (_, i) => 2011 + i);
G20.AGE_ORDER = ['0-7', '8-16', '17-25', '26-39', '40-64', '65-74', '75+'];
G20.COLORS = ['#fe0606', '#0072B2', '#e65c00', '#aa0abc', '#009E73', '#666666', '#F0E442'];


G20.parseCSV = function (text) {
  const rows = [], headers = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (!headers.length) headers.push(...row);
      else if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    if (!headers.length) headers.push(...row);
    else rows.push(row);
  }
  return rows.map(values => Object.fromEntries(headers.map((header, i) => [header, values[i] || ''])));
};

G20.loadData = async function () {
  const entries = Object.entries(G20.FILES);
  const candidates = [
    G20.DATA_DIR,
    'knime%20data/',
    'knime data/',
    'Knime%20Data/',
    'Knime Data/'
  ];

  async function fetchFile(file) {
    for (const dir of candidates) {
      try {
        const response = await fetch(dir + file);
        if (response.ok) {
          return G20.parseCSV(await response.text());
        }
      } catch (e) {
        // try next candidate path
      }
    }
    throw new Error(`Unable to load ${file}`);
  }

  const values = await Promise.all(entries.map(([, file]) => fetchFile(file)));
  return Object.fromEntries(entries.map(([key], i) => [key, values[i]]));
};

G20.number = value => Number(value) || 0;
G20.escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
G20.format = value => Math.round(value).toLocaleString();
G20.percent = value => `${value.toFixed(1)}%`;
G20.size = svg => {
  const bounds = svg.getBoundingClientRect();
  return [Math.max(260, bounds.width), Math.max(180, bounds.height)];
};
G20.clear = selector => {
  const svg = document.querySelector(selector);
  svg.innerHTML = '';
  return svg;
};
G20.svg = (tag, attributes, parent) => {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attributes || {}).forEach(([key, value]) => element.setAttribute(key, value));
  if (parent) parent.appendChild(element);
  return element;
};
G20.tooltip = (svg, content, x, y) => {
  G20.hideTooltip();
  const container = svg.parentElement;
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  if (typeof content === 'string' && /<[a-z][\s\S]*>/i.test(content)) {
    tip.innerHTML = content;
  } else {
    tip.textContent = content;
  }
  container.appendChild(tip);

  const containerRect = container.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let left = x;
  let top = y - 14;

  const halfWidth = tipRect.width / 2;
  if (left - halfWidth < 8) left = halfWidth + 8;
  else if (left + halfWidth > containerRect.width - 8) left = containerRect.width - halfWidth - 8;

  if (top - tipRect.height < 8) {
    top = y + tipRect.height + 16;
    tip.classList.add('tooltip-below');
  }

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.style.zIndex = '9999';
};
G20.hideTooltip = () => document.querySelectorAll('.tooltip').forEach(tip => tip.remove());

// Dismiss tooltip on touch/click outside interactive data elements on mobile phones
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('circle, path, rect, button, .tooltip, .tab-btn, .pill-btn')) {
    G20.hideTooltip();
  }
});
G20.options = (selector, values) => {
  const control = document.querySelector(selector), current = control.value;
  control.innerHTML = values.map(value => `<option value="${value}">${value}</option>`).join('');
  if (values.includes(current)) control.value = current;
};
