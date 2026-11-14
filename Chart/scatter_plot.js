// Chart 4: average hospital stay by age group (for one road user, one year, one sex filter).
// Drawn with D3. Dot size = number of cases.
// Features: sex filter, dashed "all road users" comparison line, label on the longest-stay dot,
// play button, and smooth transitions (dots, line, label and axis glide when controls change).
//
// How the transitions work: the chart is built ONCE (axes, line, dots group, label). After that,
// each redraw only updates those elements with D3 transitions instead of wiping the SVG.
// The chart is rebuilt from scratch only on the first draw, when the window is resized,
// or after a "no cases" message.

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

  const prefersReducedMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fixed y-axis: the highest average stay a road user ever reaches across ALL years and
  // ALL sex filters (All / Male / Female), so the axis does not move when the year or sex
  // changes. Only switching road user can change it. Results are cached.
  const maxCache = { data: null, values: new Map() };
  const highestAverage = (G20, data, roadUser) => {
    if (maxCache.data !== data) { maxCache.data = data; maxCache.values.clear(); }
    if (maxCache.values.has(roadUser)) return maxCache.values.get(roadUser);

    const totals = new Map(); // "year|sex|age" -> { cases, beds }
    const add = (key, cases, beds) => {
      const total = totals.get(key) || { cases: 0, beds: 0 };
      total.cases += cases;
      total.beds += beds;
      totals.set(key, total);
    };
    data.forEach(row => {
      if (roadUser !== null && row['Road user'] !== roadUser) return;
      const cases = G20.number(row['Sum(Hospitalisations)']);
      const beds = G20.number(row['Sum(Bed days)']);
      const base = `${row['Calendar year']}|`;
      add(`${base}All|${row['Age group']}`, cases, beds);
      add(`${base}${row['Sex']}|${row['Age group']}`, cases, beds);
    });

    let highest = 0;
    totals.forEach(total => {
      if (total.cases > 0) highest = Math.max(highest, total.beds / total.cases);
    });
    maxCache.values.set(roadUser, highest);
    return highest;
  };

  return function (data) {
    const { G20 } = window;

    // 1. Read the current controls.
    const svgNode = document.querySelector('#scatterChart');
    const [width, height] = G20.size(svgNode);
    const svg = d3.select(svgNode);
    const year = +document.querySelector('#q4Year').value;
    const user = document.querySelector('#q4Select').value;
    const sex = document.querySelector('#q4Sex').value; // All, Male or Female
    const sexLabel = sex === 'All' ? 'all sexes' : sex.toLowerCase() + 's';
    const matchesSex = row => sex === 'All' || row['Sex'] === sex;
    const insight = document.querySelector('#q4Insight');
    document.querySelector('#q4YearValue').value = year;
    G20.hideTooltip();

    // 2. Add up cases and bed days FIRST, then divide (never average two averages).
    //    roadUser = null means all road users (used for the comparison line).
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

    // 3. Nothing to draw: show a message and rebuild next time.
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

    // 4. Build the chart skeleton once (or again after a resize).
    const rebuild = !state.built || width !== state.width || height !== state.height;

    if (rebuild) {
      G20.clear('#scatterChart');
      state.built = true;
      state.width = width;
      state.height = height;

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

      // Dashed comparison line (all road users).
      svg.append('path')
        .attr('class', 'overall-line')
        .attr('fill', 'none')
        .attr('stroke', '#e87b45')
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '7 5');

      // Small legend for the dashed line.
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

    // 5. Scales that change with the data: average stay -> y, cases -> dot radius.
    // Fixed maximum (same for every year and sex), including the all-road-user line so it never clips.
    const yMax = Math.max(highestAverage(G20, data, user), highestAverage(G20, data, null));
    const y = d3.scaleLinear()
      .domain([0, yMax])
      .nice()
      .range([height - margin.bottom, margin.top]);
    state.y = y;

    const radius = d3.scaleSqrt()
      .domain([0, d3.max(shown, row => row.cases)])
      .range([5, 18]);

    // One shared transition for everything that moves.
    const animate = !rebuild && !prefersReducedMotion();
    const t = d3.transition().duration(animate ? DURATION : 0).ease(d3.easeCubicInOut);
    const move = selection => (rebuild ? selection : selection.transition(t));

    // 6. Y axis: ticks and grid lines glide to the new scale.
    const yAxis = d3.axisLeft(y).ticks(5).tickSize(-(width - margin.left - margin.right));
    const yGroup = svg.select('g.y-axis');
    (rebuild ? yGroup : yGroup.transition(t)).call(yAxis);
    yGroup.select('.domain').remove();
    yGroup.selectAll('.tick line').attr('class', 'grid-line');

    // 7. Dashed comparison line. If the set of age groups changed, jump instead of morphing.
    const line = d3.line().x(row => x(row.age)).y(row => y(row.average));
    const overallKey = overall.map(row => row.age).join('|');
    const path = svg.select('path.overall-line');
    if (rebuild || overallKey !== state.overallKey) path.attr('d', line(overall));
    else path.transition(t).attr('d', line(overall));
    state.overallKey = overallKey;

    // 8. Dots: one per age group. Enter grows in, exit shrinks away, the rest glide.
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

    // 9. Label on the longest-stay dot (above the dot, with a white outline).
    const longest = d3.greatest(shown, row => row.average);
    const nearRight = x(longest.age) > width - margin.right - 90;
    const label = svg.select('text.longest-label')
      .attr('text-anchor', nearRight ? 'end' : 'middle')
      .text(`Longest: ${longest.age}, ${longest.average.toFixed(1)} days`);
    move(label)
      .attr('x', nearRight ? x(longest.age) + 10 : x(longest.age))
      .attr('y', y(longest.average) - radius(longest.cases) - 8);

    // 10. Sentence under the chart.
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
  };
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
