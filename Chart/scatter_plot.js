window.renderScatterPlot = function (data) {
  const { G20 } = window;
  const svg = G20.clear('#scatterChart');
  const [width, height] = G20.size(svg);
  const year = +document.querySelector('#q4Year').value;
  const user = document.querySelector('#q4Select').value;
  const sourceRows = data.filter(row => +row['Calendar year'] === year && row['Road user'] === user);
  const rows = G20.AGE_ORDER.map(age => {
    const ageRows = sourceRows.filter(row => row['Age group'] === age);
    const cases = ageRows.reduce((sum, row) => sum + G20.number(row['Sum(Hospitalisations)']), 0);
    const beds = ageRows.reduce((sum, row) => sum + G20.number(row['Sum(Bed days)']), 0);
    return { 'Age group': age, 'Sum(Hospitalisations)': cases, 'Average stay (days)': cases ? beds / cases : 0 };
  });
  const margin = { left: 58, right: 25, top: 22, bottom: 48 };
  const max = Math.max(...rows.map(row => G20.number(row['Average stay (days)'])), 1);
  const maxCases = Math.max(...rows.map(row => G20.number(row['Sum(Hospitalisations)'])), 1);
  const step = (width - margin.left - margin.right) / Math.max(G20.AGE_ORDER.length - 1, 1);
  const y = value => height - margin.bottom -
    (height - margin.top - margin.bottom) * value / max;

  for (let i = 0; i <= 4; i += 1) {
    const value = max * (1 - i / 4);
    const lineY = y(value);
    G20.svg('line', { x1: margin.left, x2: width - margin.right, y1: lineY, y2: lineY, class: 'grid-line' }, svg);
    G20.svg('text', { x: margin.left - 9, y: lineY + 4, 'text-anchor': 'end' }, svg).textContent = `${value.toFixed(0)}d`;
  }
  G20.AGE_ORDER.forEach((age, index) => {
    const row = rows.find(item => item['Age group'] === age);
    const average = G20.number(row?.['Average stay (days)']);
    const cases = G20.number(row?.['Sum(Hospitalisations)']);
    const x = margin.left + index * step;
    const circle = G20.svg('circle', {
      cx: x, cy: y(average), r: 5 + 13 * Math.sqrt(cases / maxCases),
      fill: '#00a2ff', class: 'dot'
    }, svg);
    circle.addEventListener('mouseenter', () => G20.tooltip(svg,
      `${age}: ${average.toFixed(1)} days · ${G20.format(cases)} cases`, x, y(average)));
    circle.addEventListener('mouseleave', G20.hideTooltip);
    G20.svg('text', { x, y: height - 15, 'text-anchor': 'middle' }, svg).textContent = age;
  });
  document.querySelector('#q4YearValue').value = year;
  const longest = rows.slice().sort((a, b) =>
    G20.number(b['Average stay (days)']) - G20.number(a['Average stay (days)']))[0];
  document.querySelector('#q4Insight').innerHTML =
    `Dot size shows case count. For <strong>${user.toLowerCase()}</strong> injuries in ${year}, the <strong>${longest?.['Age group']}</strong> group has the longest average stay at <strong>${G20.number(longest?.['Average stay (days)']).toFixed(1)} days</strong>.`;
};
