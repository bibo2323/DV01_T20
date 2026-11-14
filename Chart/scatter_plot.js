// Chart 4: average hospital stay by age group.
//
// Two views (switch with the "View" dropdown):
//   1. One road user  - age group on x, average stay on y, bubble size = cases,
//                       dashed line = average for all road users.
//   2. All road users - one dot per road user + age group. x = number of cases (log scale),
//                       y = average stay (log scale), colour = age group.
//                       Click an age group in the legend to highlight it.
// Shared: sex filter, year slider, Play button, fixed axes and smooth transitions.
//
// How transitions work: each view is built ONCE (axes, groups). After that, redraws only
// update the dots/line/label with D3 transitions instead of wiping the SVG. The chart is
// rebuilt from scratch on the first draw, on resize, when the view is switched, or after
// a "no cases" message.

window.renderScatterPlot = (function () {
  const margin = { left: 70, right: 40, top: 30, bottom: 62 };
  const DURATION = 600;

  // Remembered between redraws.
  const state = {
    built: false,
    mode: null,          // 'one' or 'all'
    width: 0,
    height: 0,
    x: null,
    y: null,
    overallByAge: new Map(),
    overallKey: '',
    highlight: null,     // age group highlighted in the "all" view
    data: null
  };

  const INFO_ONE =
    '<strong>How to read this chart</strong>' +
    '<p><span class="size-key-dot size-key-dot-small"></span>' +
    '<span class="size-key-dot size-key-dot-large"></span>Bigger circle = more cases</p>' +
    '<p><span class="info-dash"></span>Dashed line = average stay for all road users</p>';

  const INFO_ALL =
    '<strong>How to read this chart</strong>' +
    '<p>Each dot is one road user in one age group.</p>' +
    '<p>Further right = more cases. Higher = longer average stay.</p>' +
    '<p>Both axes are log scales, so equal distances mean equal ratios, not equal differences.</p>' +
    '<p>Click an age group under the chart to highlight it.</p>';

  const prefersReducedMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------------
  // Fixed axis helpers (computed once per dataset and cached)
  // ---------------------------------------------------------------------------

  // Totals for every year / sex / road user / age group, plus the extremes used for fixed axes.
  const extentsCache = { data: null, value: null };
  const getExtents = (G20, data) => {
    if (extentsCache.data === data) return extentsCache.value;

    const totals = new Map(); // "year|sex|road user|age" -> { cases, beds }
    const add = (key, cases, beds) => {
      const total = totals.get(key) || { cases: 0, beds: 0 };
      total.cases += cases;
      total.beds += beds;
      totals.set(key, total);
    };
    data.forEach(row => {
      const cases = G20.number(row['Sum(Hospitalisations)']);
      const beds = G20.number(row['Sum(Bed days)']);
      const tail = `${row['Road user']}|${row['Age group']}`;
      add(`${row['Calendar year']}|All|${tail}`, cases, beds);
      add(`${row['Calendar year']}|${row['Sex']}|${tail}`, cases, beds);
    });

    let maxCases = 1, maxAverage = 1, minAverage = Infinity;
    totals.forEach(total => {
      if (total.cases <= 0) return;
      const average = total.beds / total.cases;
      maxCases = Math.max(maxCases, total.cases);
      maxAverage = Math.max(maxAverage, average);
      minAverage = Math.min(minAverage, average);
    });

    const xDomain = [0.8, maxCases * 1.3];
    const yDomain = [Math.min(0.8, minAverage * 0.9), maxAverage * 1.25];
    const inside = (ticks, domain) => ticks.filter(v => v >= domain[0] && v <= domain[1]);

    extentsCache.data = data;
    extentsCache.value = {
      totals,
      xDomain,
      yDomain,
      xTicks: inside([1, 10, 100, 1000, 10000, 100000], xDomain),
      yTicks: inside([1, 2, 5, 10, 20, 50, 100, 200], yDomain)
    };
    return extentsCache.value;
  };

  // One-road-user view: the highest average stay that road user ever reaches across ALL years
  // and ALL sex filters, so the y axis does not move when year or sex changes.
  const highestAverage = (G20, data, roadUser) => {
    const { totals } = getExtents(G20, data);
    let highest = 0;
    totals.forEach((total, key) => {
      if (total.cases <= 0) return;
      if (roadUser !== null && key.split('|')[2] !== roadUser) return;
      // For "all road users" (the dashed line) we need the average across road users,
      // which is built separately below.
      if (roadUser === null) return;
      highest = Math.max(highest, total.beds / total.cases);
    });
    return highest;
  };

  const overallCache = { data: null, value: null };
  const highestOverall = (G20, data) => {
    if (overallCache.data === data) return overallCache.value;
    const { totals } = getExtents(G20, data);
    const combined = new Map(); // "year|sex|age" -> { cases, beds }
    totals.forEach((total, key) => {
      const [year, sex, , age] = key.split('|');
      const short = `${year}|${sex}|${age}`;
      const sum = combined.get(short) || { cases: 0, beds: 0 };
      sum.cases += total.cases;
      sum.beds += total.beds;
      combined.set(short, sum);
    });
    let highest = 0;
    combined.forEach(sum => {
      if (sum.cases > 0) highest = Math.max(highest, sum.beds / sum.cases);
    });
    overallCache.data = data;
    overallCache.value = highest;
    return highest;
  };

  // ---------------------------------------------------------------------------
  // View 1: one road user
  // ---------------------------------------------------------------------------
  function renderOne(ctx) {
    const { G20, data, svg, svgNode, width, height, year, sex, sexLabel, insight, rebuild } = ctx;
    const user = document.querySelector('#q4Select').value;
    const matchesSex = row => sex === 'All' || row['Sex'] === sex;

    // Add up cases and bed days FIRST, then divide (never average two averages).
    // roadUser = null means all road users (used for the comparison line).
    const summarise = roadUser => G20.AGE_ORDER.map(age => {
      const selected = data.filter(row =>
        +row['Calendar year'] === year &&
        matchesSex(row) &&
        (roadUser === null || row['Road user'] === roadUser) &&
        row['Age group'] === age);
      const cases = d3.sum(selected, row => G20.number(row['Sum(Hospitalisations)']));
      const beds = d3.sum(selected, row => G20.number(row['Sum(Bed days)']));
      return { age, cases, average: cases > 0 ? beds / cases : null };
    });

    const rows = summarise(user);
    const overall = summarise(null).filter(row => row.cases > 0);
    const overallByAge = new Map(overall.map(row => [row.age, row.average]));
    const shown = rows.filter(row => row.cases > 0); // no cases = no dot (not "0 days")

    // Nothing to draw: show a message and rebuild next time.
    if (!shown.length) {
      G20.clear('#scatterChart');
      state.built = false;
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .text(`No cases recorded for ${user.toLowerCase()} (${sexLabel}) in ${year}`);
      insight.textContent =
        `No hospitalisations are recorded for ${user.toLowerCase()} (${sexLabel}) in ${year}.`;
      return;
    }

    // Build the chart skeleton once.
    if (rebuild) {
      state.x = d3.scalePoint()
        .domain(G20.AGE_ORDER)
        .range([margin.left, width - margin.right])
        .padding(0.5);

      svg.append('g').attr('class', 'y-axis').attr('transform', `translate(${margin.left},0)`);

      svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(state.x).tickSizeOuter(0))
        .select('.domain').attr('class', 'axis-line');

      svg.append('text')
        .attr('x', (margin.left + width - margin.right) / 2)
        .attr('y', height - 8)
        .attr('text-anchor', 'middle')
        .text('Age group');
      svg.append('text')
        .attr('transform', `translate(16,${(margin.top + height - margin.bottom) / 2}) rotate(-90)`)
        .attr('text-anchor', 'middle')
        .text('Average stay (days)');

      svg.append('path')
        .attr('class', 'overall-line')
        .attr('fill', 'none')
        .attr('stroke', '#e87b45')
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '7 5');

      const key = svg.append('g').attr('transform', `translate(${margin.left + 12},${margin.top - 14})`);
      key.append('line')
        .attr('x1', 0).attr('x2', 30).attr('y1', 0).attr('y2', 0)
        .attr('stroke', '#e87b45').attr('stroke-width', 2.5).attr('stroke-dasharray', '7 5');
      key.append('text')
        .attr('x', 38).attr('y', 5)
        .attr('fill', '#e87b45')
        .text('All road users (average)');

      svg.append('g').attr('class', 'dots');

      svg.append('text')
        .attr('class', 'longest-label')
        .attr('fill', '#17232e')
        .style('font-weight', 700)
        .style('stroke', '#fff')
        .style('stroke-width', '4px')
        .style('paint-order', 'stroke');
    }

    state.overallByAge = overallByAge;
    const x = state.x;

    // Scales that change with the data. The y maximum is fixed per road user.
    const yMax = Math.max(highestAverage(G20, data, user), highestOverall(G20, data));
    const y = d3.scaleLinear()
      .domain([0, yMax])
      .nice()
      .range([height - margin.bottom, margin.top]);
    state.y = y;

    const radius = d3.scaleSqrt()
      .domain([0, d3.max(shown, row => row.cases)])
      .range([5, 18]);

    const animate = !rebuild && !prefersReducedMotion();
    const t = d3.transition().duration(animate ? DURATION : 0).ease(d3.easeCubicInOut);
    const move = selection => (rebuild ? selection : selection.transition(t));

    // Y axis (only changes when you switch road user).
    const yAxis = d3.axisLeft(y).ticks(5).tickSize(-(width - margin.left - margin.right));
    const yGroup = svg.select('g.y-axis');
    (rebuild ? yGroup : yGroup.transition(t)).call(yAxis);
    yGroup.select('.domain').remove();
    yGroup.selectAll('.tick line').attr('class', 'grid-line');

    // Dashed comparison line. If the set of age groups changed, jump instead of morphing.
    const line = d3.line().x(row => x(row.age)).y(row => y(row.average));
    const overallKey = overall.map(row => row.age).join('|');
    const path = svg.select('path.overall-line');
    if (rebuild || overallKey !== state.overallKey) path.attr('d', line(overall));
    else path.transition(t).attr('d', line(overall));
    state.overallKey = overallKey;

    // Dots: enter grows in, exit shrinks away, the rest glide.
    const showTip = (event, row) => {
      const all = state.overallByAge.get(row.age);
      const extra = all ? ` · all road users: ${all.toFixed(1)} days` : '';
      G20.tooltip(svgNode,
        `${row.age}: ${row.average.toFixed(1)} days · ${G20.format(row.cases)} cases${extra}`,
        state.x(row.age), state.y(row.average));
    };

    svg.select('g.dots')
      .selectAll('circle.dot')
      .data(shown, row => row.age)
      .join(
        enter => enter.append('circle')
          .attr('class', 'dot')
          .attr('cx', row => x(row.age))
          .attr('cy', row => y(row.average))
          .attr('r', 0)
          .attr('fill', '#00a2ff')
          .attr('tabindex', 0)
          .attr('role', 'img')
          .on('mouseenter focus', showTip)
          .on('mouseleave blur', G20.hideTooltip),
        update => update,
        exit => exit.transition(t).attr('r', 0).remove()
      )
      .attr('aria-label', row =>
        `Age ${row.age}: ${row.average.toFixed(1)} days average stay, ${G20.format(row.cases)} cases`)
      .transition(t)
      .attr('cx', row => x(row.age))
      .attr('cy', row => y(row.average))
      .attr('r', row => radius(row.cases));

    // Label on the longest-stay dot (above the dot, with a white outline).
    const longest = d3.greatest(shown, row => row.average);
    const nearRight = x(longest.age) > width - margin.right - 90;
    const label = svg.select('text.longest-label')
      .attr('text-anchor', nearRight ? 'end' : 'middle')
      .text(`Longest: ${longest.age}, ${longest.average.toFixed(1)} days`);
    move(label)
      .attr('x', nearRight ? x(longest.age) + 10 : x(longest.age))
      .attr('y', y(longest.average) - radius(longest.cases) - 8);

    // Sentence under the chart.
    const all = overallByAge.get(longest.age);
    let compare = '';
    if (all) {
      const diff = longest.average - all;
      const direction = Math.abs(diff) < 0.5 ? 'about the same as' : (diff > 0 ? 'above' : 'below');
      compare = ` That is <strong>${direction}</strong> the all-road-user average for that age group` +
        ` (${all.toFixed(1)} days).`;
    }
    const smallNote = shown.some(row => row.cases < 5)
      ? ' Averages based on fewer than 5 cases are less reliable.'
      : '';
    insight.innerHTML =
      `Dot size shows case count. For <strong>${user.toLowerCase()}</strong> injuries in ${year} ` +
      `(${sexLabel}), the <strong>${longest.age}</strong> group has the longest average stay at ` +
      `<strong>${longest.average.toFixed(1)} days</strong>.${compare}${smallNote}`;
  }

  // ---------------------------------------------------------------------------
  // View 2: all road users (one dot per road user + age group, both axes log scale)
  // ---------------------------------------------------------------------------
  function ensureLegend(G20) {
    const legend = document.querySelector('#q4Legend');
    if (!legend || legend.dataset.ready) return legend;
    legend.dataset.ready = 'true';
    legend.innerHTML = '<span class="legend-hint">Click to highlight:</span>' +
      G20.AGE_ORDER.map((age, i) =>
        `<button type="button" data-age="${age}" aria-pressed="false">` +
        `<i style="background:${G20.COLORS[i]}"></i>${age}</button>`).join('');
    legend.addEventListener('click', event => {
      const button = event.target.closest('button[data-age]');
      if (!button) return;
      state.highlight = state.highlight === button.dataset.age ? null : button.dataset.age;
      render(state.data);
    });
    return legend;
  }

  function renderAll(ctx) {
    const { G20, data, svg, svgNode, width, height, year, sex, sexLabel, insight, rebuild } = ctx;
    const ext = getExtents(G20, data);
    const legend = ensureLegend(G20);

    // Collect this year's dots for the chosen sex.
    const points = [];
    ext.totals.forEach((total, key) => {
      const [y, s, user, age] = key.split('|');
      if (+y !== year || s !== sex || total.cases <= 0) return;
      points.push({ key: `${user}|${age}`, user, age, cases: total.cases, average: total.beds / total.cases });
    });

    // Keep the legend buttons in step with the highlight.
    legend.querySelectorAll('button[data-age]').forEach(button => {
      const on = state.highlight === button.dataset.age;
      button.setAttribute('aria-pressed', String(on));
      button.classList.toggle('dim', state.highlight !== null && !on);
    });

    if (!points.length) {
      G20.clear('#scatterChart');
      state.built = false;
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .text(`No cases recorded (${sexLabel}) in ${year}`);
      insight.textContent = `No hospitalisations are recorded (${sexLabel}) in ${year}.`;
      return;
    }

    // Both axes are fixed (same for every year and sex), so only the dots move.
    const x = d3.scaleLog().domain(ext.xDomain).range([margin.left, width - margin.right]);
    const y = d3.scaleLog().domain(ext.yDomain).range([height - margin.bottom, margin.top]);
    state.x = x;
    state.y = y;
    const color = d3.scaleOrdinal().domain(G20.AGE_ORDER).range(G20.COLORS);

    if (rebuild) {
      const yAxis = svg.append('g')
        .attr('class', 'y-axis')
        .attr('transform', `translate(${margin.left},0)`)
        .call(d3.axisLeft(y)
          .tickValues(ext.yTicks)
          .tickFormat(value => value)
          .tickSize(-(width - margin.left - margin.right)));
      yAxis.select('.domain').remove();
      yAxis.selectAll('.tick line').attr('class', 'grid-line');

      svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x)
          .tickValues(ext.xTicks)
          .tickFormat(d3.format(','))
          .tickSizeOuter(0))
        .select('.domain').attr('class', 'axis-line');

      svg.append('text')
        .attr('x', (margin.left + width - margin.right) / 2)
        .attr('y', height - 8)
        .attr('text-anchor', 'middle')
        .text('Number of cases (log scale)');
      svg.append('text')
        .attr('transform', `translate(16,${(margin.top + height - margin.bottom) / 2}) rotate(-90)`)
        .attr('text-anchor', 'middle')
        .text('Average stay, days (log scale)');

      svg.append('g').attr('class', 'dots');
    }

    const animate = !rebuild && !prefersReducedMotion();
    const t = d3.transition().duration(animate ? DURATION : 0).ease(d3.easeCubicInOut);
    const opacity = point =>
      state.highlight === null ? 0.85 : (point.age === state.highlight ? 0.95 : 0.12);

    const showTip = (event, point) => G20.tooltip(svgNode,
      `${point.user}, ${point.age}: ${point.average.toFixed(1)} days · ${G20.format(point.cases)} cases`,
      state.x(point.cases), state.y(point.average));

    const dots = svg.select('g.dots')
      .selectAll('circle.dot')
      .data(points, point => point.key)
      .join(
        enter => enter.append('circle')
          .attr('class', 'dot')
          .attr('cx', point => x(point.cases))
          .attr('cy', point => y(point.average))
          .attr('r', 0)
          .attr('fill', point => color(point.age))
          .style('stroke-width', '1.5px')
          .attr('tabindex', 0)
          .attr('role', 'img')
          .on('mouseenter focus', showTip)
          .on('mouseleave blur', G20.hideTooltip),
        update => update,
        exit => exit.transition(t).attr('r', 0).remove()
      )
      .attr('aria-label', point =>
        `${point.user}, age ${point.age}: ${point.average.toFixed(1)} days average stay, ` +
        `${G20.format(point.cases)} cases`);

    dots.transition(t)
      .attr('cx', point => x(point.cases))
      .attr('cy', point => y(point.average))
      .attr('r', 7)
      .attr('opacity', opacity);

    dots.filter(point => point.age === state.highlight).raise(); // highlighted dots on top

    // Sentence under the chart. "Longest" only counts groups with at least 5 cases.
    const reliable = points.filter(point => point.cases >= 5);
    const longest = d3.greatest(reliable.length ? reliable : points, point => point.average);
    const busiest = d3.greatest(points, point => point.cases);
    const tiny = points.filter(point => point.cases < 5).length;
    const tinyNote = tiny
      ? ` ${tiny} dot${tiny === 1 ? ' rests' : 's rest'} on fewer than 5 cases and ` +
        `${tiny === 1 ? 'is' : 'are'} less reliable.`
      : '';
    insight.innerHTML =
      `Each dot is one road user and age group in ${year} (${sexLabel}). ` +
      `Among groups with at least 5 cases, <strong>${longest.user.toLowerCase()} (${longest.age})</strong> ` +
      `has the longest average stay at <strong>${longest.average.toFixed(1)} days</strong>. ` +
      `The most cases are <strong>${busiest.user.toLowerCase()} (${busiest.age})</strong> with ` +
      `<strong>${G20.format(busiest.cases)}</strong> cases and ${busiest.average.toFixed(1)} days.${tinyNote}`;
  }

  // ---------------------------------------------------------------------------
  // Dispatcher: reads the controls, handles the view switch, then draws.
  // ---------------------------------------------------------------------------
  function render(data) {
    const { G20 } = window;
    state.data = data;

    const svgNode = document.querySelector('#scatterChart');
    const [width, height] = G20.size(svgNode);
    const svg = d3.select(svgNode);
    const year = +document.querySelector('#q4Year').value;
    const sex = document.querySelector('#q4Sex').value; // All, Male or Female
    const mode = document.querySelector('#q4View').value === 'all' ? 'all' : 'one';
    const sexLabel = sex === 'All' ? 'all sexes' : sex.toLowerCase() + 's';
    const insight = document.querySelector('#q4Insight');
    document.querySelector('#q4YearValue').value = year;
    G20.hideTooltip();

    // View switch: show/hide the controls that belong to each view and rebuild the chart.
    if (mode !== state.mode) {
      state.mode = mode;
      state.built = false;
      const roadUserLabel = document.querySelector('#q4Select').closest('label');
      if (roadUserLabel) roadUserLabel.style.display = mode === 'all' ? 'none' : '';
      const legend = document.querySelector('#q4Legend');
      if (legend) legend.style.display = mode === 'all' ? '' : 'none';
      document.querySelector('#q4InfoTip').innerHTML = mode === 'all' ? INFO_ALL : INFO_ONE;
      svgNode.setAttribute('aria-label', mode === 'all'
        ? 'Scatter plot of number of cases against average hospital stay for every road user and age group'
        : 'Scatter plot of average hospital stay by age group');
    }

    const rebuild = !state.built || width !== state.width || height !== state.height;
    if (rebuild) {
      G20.clear('#scatterChart');
      state.built = true;
      state.width = width;
      state.height = height;
    }

    const ctx = { G20, data, svg, svgNode, width, height, year, sex, sexLabel, insight, rebuild };
    if (mode === 'all') renderAll(ctx);
    else renderOne(ctx);
  }

  return render;
})();

// ---------------------------------------------------------------------------
// Play button for chart 4: steps the year slider from 2011 to 2021, one year per second.
// It sets the slider value and fires an "input" event, so main.js redraws as normal.
// Dragging the slider yourself stops the animation.
// ---------------------------------------------------------------------------
window.addEventListener('load', () => {
  const button = document.querySelector('#q4Play');
  const slider = document.querySelector('#q4Year');
  if (!button || !slider) return;

  const first = +slider.min, last = +slider.max, delay = 1000;
  let timer = null;

  const setLabel = playing => {
    button.textContent = playing ? '⏸ Pause' : '▶ Play';
    button.setAttribute('aria-label',
      playing ? 'Pause the year animation' : `Play years from ${first} to ${last}`);
  };

  const goTo = year => {
    slider.value = year;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const stop = () => {
    clearInterval(timer);
    timer = null;
    setLabel(false);
  };

  const start = () => {
    if (+slider.value >= last) goTo(first); // restart from the beginning
    setLabel(true);
    timer = setInterval(() => {
      if (+slider.value >= last) { stop(); return; }
      goTo(+slider.value + 1);
      if (+slider.value >= last) stop();
    }, delay);
  };

  button.addEventListener('click', () => (timer ? stop() : start()));

  // A real mouse/keyboard change to the slider (not our own event) pauses the animation.
  slider.addEventListener('input', event => { if (event.isTrusted && timer) stop(); });
});
