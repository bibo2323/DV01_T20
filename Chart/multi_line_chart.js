window.renderMultiLineChart = function (data) {
  const { G20 } = window;
  const svg = G20.clear('#lineChart');
  const [width, height] = G20.size(svg);
  const margin = { left: 78, right: 24, top: 24, bottom: 42 };
  const users = [...new Set(data.map(row => row['Road user']))];
  const selected = document.querySelector('#q1Select').value;
  const max = Math.max(...data.map(row => G20.number(row['Sum(Hospitalisations)'])), 1);
  const x = year => margin.left + (width - margin.left - margin.right) * (year - 2011) / 10;
  const threshold = 2719;
  const plotHeight = height - margin.top - margin.bottom;
  const lowerHeight = plotHeight * 0.62;
  const upperHeight = plotHeight - lowerHeight;
  const y = value => {
    if (value <= threshold) return height - margin.bottom - value / threshold * lowerHeight;
    return margin.top + (max - value) / (max - threshold) * upperHeight;
  };
  const colors = ['#005A8D', '#B83A00', '#007A5E', '#963C75', '#A86B00', '#16749B',
    '#333333', '#8A6800', '#5D2A78', '#176B58', '#A51D63', '#4B7D18'];
  const dash = ['none', '8 4', '2 3', '12 3 2 3'];

  const tickValues = [0, 900, 1800, threshold, 6000, 9000, 12000, max];
  [...new Set(tickValues)].forEach(value => {
    const lineY = y(value);
    G20.svg('line', {
      x1: margin.left, x2: width - margin.right, y1: lineY, y2: lineY, class: 'grid-line'
    }, svg);
    G20.svg('text', {
      x: margin.left - 12, y: lineY + 5, 'text-anchor': 'end', class: 'y-axis-label'
    }, svg).textContent = G20.format(value);
  });
  const breakY = y(threshold);
  G20.svg('path', {
    d: `M${margin.left - 7},${breakY - 5} l7,5 -7,5 M${margin.left - 1},${breakY - 5} l7,5 -7,5`,
    class: 'axis-break'
  }, svg);

  users.forEach((user, userIndex) => {
    const isSelected = selected === '__all__' || user === selected;
    const rows = G20.YEARS.map(year => data.find(row =>
      +row['Calendar year'] === year && row['Road user'] === user));
    const points = rows.map((row, i) => [
      x(G20.YEARS[i]), y(G20.number(row?.['Sum(Hospitalisations)']))
    ]);
    G20.svg('polyline', {
      points: points.map(point => point.join(',')).join(' '),
      class: `line ${isSelected ? 'selected' : 'muted'}`,
      stroke: colors[userIndex % colors.length],
      'stroke-dasharray': dash[userIndex % dash.length]
    }, svg);
    points.forEach((point, i) => {
      const circle = G20.svg('circle', {
        cx: point[0], cy: point[1], r: isSelected ? 4 : 2,
        class: 'dot', fill: colors[userIndex % colors.length],
        opacity: isSelected ? 1 : 0.65
      }, svg);
      circle.addEventListener('mouseenter', () => G20.tooltip(
        svg, `${user} · ${G20.YEARS[i]}: ${G20.format(G20.number(rows[i]?.['Sum(Hospitalisations)']))}`,
        point[0], point[1]
      ));
      circle.addEventListener('mouseleave', G20.hideTooltip);
    });
  });

  G20.YEARS.forEach(year =>
    G20.svg('text', {
      x: x(year), y: height - 12, 'text-anchor': 'middle'
    }, svg).textContent = year);

  const lastYear = data.filter(row => +row['Calendar year'] === 2021)
    .sort((a, b) => G20.number(b['Sum(Hospitalisations)']) - G20.number(a['Sum(Hospitalisations)']))[0];
  document.querySelector('#q1Insight').innerHTML =
    `In 2021, <strong>${G20.escape(lastYear?.['Road user'])}</strong> had the most hospitalisations at <strong>${G20.format(G20.number(lastYear?.['Sum(Hospitalisations)']))}</strong>.`;
};
