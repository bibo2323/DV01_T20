window.G20 = window.G20 || {};
G20.DATA_DIR = 'Knime Data/';
G20.FILES = {
  line: 'chart1_road_user_by_year.csv',
  map: 'chart2_state_road_user_share.csv',
  remoteness: 'chart3_remoteness_share.csv',
  scatter: 'chart4_stay_scatter.csv',
  age: 'chart5_age_mix_by_year.csv'
};
G20.YEARS = Array.from({ length: 11 }, (_, i) => 2011 + i);
G20.AGE_ORDER = ['0-7', '8-16', '17-25', '26-39', '40-64', '65-74', '75+'];
G20.COLORS = ['#086f70', '#e87b45', '#477da5', '#d16d78', '#8a6fb0', '#d3a735', '#527d68'];

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
  const values = await Promise.all(entries.map(([, file]) =>
    fetch(G20.DATA_DIR + file).then(response => {
      if (!response.ok) throw new Error(`Unable to load ${file}`);
      return response.text();
    }).then(G20.parseCSV)
  ));
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
  return [Math.max(300, bounds.width), Math.max(220, bounds.height)];
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
G20.tooltip = (svg, text, x, y) => {
  G20.hideTooltip();
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.textContent = text;
  svg.parentElement.appendChild(tip);
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
};
G20.hideTooltip = () => document.querySelectorAll('.tooltip').forEach(tip => tip.remove());
G20.options = (selector, values) => {
  const control = document.querySelector(selector), current = control.value;
  control.innerHTML = values.map(value => `<option value="${value}">${value}</option>`).join('');
  if (values.includes(current)) control.value = current;
};
