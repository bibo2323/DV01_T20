// Chart 4: average hospital stay by age group, for ONE road user.
//
//   x = age group, y = average stay (days), bubble size = number of cases,
//   dashed line = average stay for all road users (for comparison).
// Controls: road user dropdown, sex filter, year slider and Play button.
// The y axis is fixed for each road user, so it does not jump when the year or sex changes.
//
// How transitions work: the chart is built ONCE (axes, groups). After that, redraws only
// update the dots, line and label with D3 transitions instead of wiping the SVG. The chart is
// rebuilt from scratch on the first draw, on resize, or after a "no cases" message.

window.renderScatterPlot = (function () {
  const margin = { left: 70, right: 40, top: 30, bottom: 62 };
  const DURATION = 600;

  // Remembered between redraws.
  const state = {
    built: false,
    width: 0,
    height: 0,
    x: null,
    y: null,
    overallByAge: new Map(),
    overallKey: ''
  };

  const INFO =
    '<strong>How to read this chart</strong>' +
    '<p><span class="size-key-dot size-key-dot-small"></span>' +
    '<span class="size-key-dot size-key-dot-large"></span>Bigger circle = more cases</p>' +
    '<p><span class="info-dash"></span>Dashed line = average stay for all road users</p>';

  const prefersReducedMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------------
  // Fixed y axis helpers (computed once per dataset and cached)
  // ---------------------------------------------------------------------------

  // Cases and bed days for every year / sex / road user / age group.
  const totalsCache = { data: null, value: null };
  const getTotals = (G20, data) => {
    if (totalsCache.data === data) return totalsCache.value;
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
      add(`${row['Calendar year']}|All|${tail}`, cases, beds);          // both sexes added first
      add(`${row['Calendar year']}|${row['Sex']}|${tail}`, cases, beds);
    });
    totalsCache.data = data;
    totalsCache.value = totals;
    return totals;
  };

  // Highest average stay this road user ever reaches across ALL years and ALL sex filters.
  const highestAverage = (G20, data, roadUser) => {
    let highest = 0;
    getTotals(G20, data).forEach((total, key) => {
      if (total.cases <= 0 || key.split('|')[2] !== roadUser) return;
      highest = Math.max(highest, total.beds / total.cases);
    });
    return highest;
  };

  // Highest average stay of the dashed "all road users" line, so the line always fits.
  const overallCache = { data: null, value: null };
  const highestOverall = (G20, data) => {
    if (overallCache.data === data) return overallCache.value;
    const combined = new Map(); // "year|sex|age" -> { cases, beds }
    getTotals(G20, data).forEach((total, key) => {
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
  // Draw the chart
  // ---------------------------------------------------------------------------
  function render(data) {
    const { G20 } = window;

    // Read the controls.
    const svgNode = document.querySelector('#scatterChart');
    const [width, height] = G20.size(svgNode);
    const svg = d3.select(svgNode);
    const year = +document.querySelector('#q4Year').value;
    const user = document.querySelector('#q4Select').value;
    const sex = document.querySelector('#q4Sex').value; // All, Male or Female
    const sexLabel = sex === 'All' ? 'all sexes' : sex.toLowerCase() + 's';
    const insight = document.querySelector('#q4Insight');
    document.querySelector('#q4YearValue').value = year;
    G20.hideTooltip();

    // Reading guide next to the chart (only if the page has that box).
    const info = document.querySelector('#q4InfoTip');
    if (info && !info.dataset.ready) { info.innerHTML = INFO; info.dataset.ready = 'true'; }

    // Build the chart from scratch on the first draw, on resize, or after a message.
    const rebuild = !state.built || width !== state.width || height !== state.height;
    if (rebuild) {
      G20.clear('#scatterChart');
      state.built = true;
      state.width = width;
      state.height = height;
    }
    svgNode.setAttribute('aria-label',
      `Scatter plot of average hospital stay by age group for ${user.toLowerCase()}, ${sexLabel}, ${year}`);

    // Add up cases and bed days FIRST, then divide (never average two averages).
    // roadUser = null means all road users (used for the comparison line).
    const matchesSex = row => sex === 'All' || row['Sex'] === sex;
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
