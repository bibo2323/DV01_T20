// Chart 1: Hospitalisations by road user and year (multi-line trend chart)
// Split into Top 5 (High Volume), Lowest 5 (Zoomed), and All 12 Categories to eliminate visual clutter

window.renderMultiLineChart = (function () {
  let activeFilter = 'top5'; // 'top5', 'lowest5', or 'all'

  const TOP_5_USERS = [
    'Car driver',
    'Motorcyclist',
    'Pedal cyclist',
    'Car passenger',
    'Pedestrian'
  ];

  const LOWEST_5_USERS = [
    'Heavy transport driver',
    'Pick-up truck or van occupant',
    'Bus occupant',
    'Heavy transport passenger',
    'Heavy transport unknown position'
  ];

  // Specific high-contrast palette for Top 5
  const TOP_5_COLORS = {
    'Car driver': '#005a8d',      // Classic Navy
    'Motorcyclist': '#c2410c',    // Rust Orange
    'Pedal cyclist': '#0d9488',   // Dark Teal
    'Car passenger': '#7c3aed',   // Purple
    'Pedestrian': '#db2777'       // Deep Rose
  };

  // Specific vibrant palette for Lowest 5
  const LOWEST_5_COLORS = {
    'Heavy transport driver': '#b45309',             // Amber Brown
    'Pick-up truck or van occupant': '#059669',      // Emerald Green
    'Bus occupant': '#2563eb',                       // Royal Cobalt
    'Heavy transport passenger': '#9333ea',          // Violet
    'Heavy transport unknown position': '#dc2626'    // Vivid Crimson
  };

  // Comprehensive palette for all 12
  const ALL_COLORS = {
    ...TOP_5_COLORS,
    ...LOWEST_5_COLORS,
    'Car unknown position': '#475569',
    'Other or unknown': '#64748b'
  };

  return function (data) {
    const { G20 } = window;
    const svg = G20.clear('#lineChart');
    const [width, height] = G20.size(svg);
    const isMobile = width < 550;

    const margin = isMobile
      ? { left: 46, right: 18, top: 40, bottom: 36 }
      : { left: 82, right: 180, top: 56, bottom: 44 };
    const allUsers = [...new Set(data.map(row => row['Road user']))];

    // Determine users to display based on activeFilter
    let displayedUsers;
    if (activeFilter === 'top5') {
      displayedUsers = TOP_5_USERS;
    } else if (activeFilter === 'lowest5') {
      displayedUsers = LOWEST_5_USERS;
    } else {
      displayedUsers = allUsers;
    }

    const selectElem = document.querySelector('#q1Select');
    let selected = (selectElem && selectElem.value) ? selectElem.value : '__all__';

    // If selected user is not in displayedUsers and not '__all__', reset to '__all__'
    if (selected !== '__all__' && !displayedUsers.includes(selected)) {
      selected = '__all__';
      if (selectElem) selectElem.value = '__all__';
    }

    // Update select options to match the active category filter
    if (selectElem) {
      const currentOpts = Array.from(selectElem.options || []).map(o => o.value);
      const targetOpts = ['__all__', ...displayedUsers];
      if (JSON.stringify(currentOpts) !== JSON.stringify(targetOpts)) {
        selectElem.innerHTML = `<option value="__all__">All in ${activeFilter === 'top5' ? 'Top 5' : 'Lowest 5'}</option>` +
          displayedUsers.map(u => `<option value="${u}">${u}</option>`).join('');
        selectElem.value = selected;
      }
    }

    const getColor = (user) => {
      if (activeFilter === 'top5') return TOP_5_COLORS[user] || '#005a8d';
      if (activeFilter === 'lowest5') return LOWEST_5_COLORS[user] || '#b45309';
      return ALL_COLORS[user] || '#475569';
    };

    // Calculate Y-scale domain
    // For lowest5, zoom in to 0-500 (or 0-600) so trends are crystal clear!
    let yCeil;
    if (activeFilter === 'lowest5') {
      const maxLowest = Math.max(...data.filter(r => LOWEST_5_USERS.includes(r['Road user']))
        .map(r => G20.number(r['Sum(Hospitalisations)'])), 100);
      yCeil = Math.ceil(maxLowest / 100) * 100; // e.g. 500
    } else {
      const maxVal = Math.max(...data.map(row => G20.number(row['Sum(Hospitalisations)'])), 1);
      yCeil = Math.ceil(maxVal / 2000) * 2000; // e.g. 14,000
    }

    const yScale = d3.scaleLinear()
      .domain([0, yCeil])
      .range([height - margin.bottom, margin.top]);

    const x = year => margin.left + (width - margin.left - margin.right) * (year - 2011) / 10;

    // Y-axis tick labels (horizontal grid lines removed)
    const tickCount = activeFilter === 'lowest5' ? 5 : (isMobile ? 5 : 7);
    const yTicks = yScale.ticks(tickCount);
    yTicks.forEach(tickVal => {
      const lineY = yScale(tickVal);
      const formattedVal = isMobile && tickVal >= 1000
        ? `${Math.round(tickVal / 1000)}k`
        : G20.format(tickVal);

      G20.svg('text', {
        x: margin.left - (isMobile ? 8 : 12),
        y: lineY + 4,
        'text-anchor': 'end',
        class: 'y-axis-label',
        fill: '#64748b',
        'font-size': isMobile ? '11px' : '13px'
      }, svg).textContent = formattedVal;
    });

    // Y-axis Title with scale indicator (positioned on top tier at y=18 to prevent collision with milestones)
    const scaleLabel = activeFilter === 'lowest5'
      ? (isMobile ? 'Hospitalisations (Zoomed 0–500)' : 'Annual Hospitalisations (Zoomed: 0–500)')
      : (isMobile ? 'Hospitalisations / yr' : 'Annual Hospitalisations');
    G20.svg('text', {
      x: margin.left - (isMobile ? 8 : 12),
      y: isMobile ? 15 : 18,
      'text-anchor': 'start',
      'font-weight': 700,
      'font-size': isMobile ? '11.5px' : '14px',
      fill: '#17232e'
    }, svg).textContent = scaleLabel;

    // Timeline Event Milestones (Victoria 2012, NSW 2017, COVID-19 2020)
    const MILESTONES = [
      {
        year: 2012,
        badge: isMobile ? "'12 Vic" : '2012: Vic rule change',
        tooltip: '<strong>2012 Victoria Counting Change</strong><br>Victoria revised hospital admission criteria, altering series baseline.'
      },
      {
        year: 2017,
        badge: isMobile ? "'17 NSW" : '2017: NSW rule change',
        tooltip: '<strong>June 2017 NSW Counting Change</strong><br>NSW changed emergency department admission reporting, producing an artificial increase.'
      },
      {
        year: 2020,
        badge: isMobile ? "'20 COVID" : '2020: COVID-19 dip',
        tooltip: '<strong>2020 COVID-19 Mobility Dip</strong><br>Nationwide travel restrictions and lockdowns led to a notable temporary drop in road hospitalisations.'
      }
    ];

    const annotationsGroup = G20.svg('g', { class: 'timeline-annotations' }, svg);
    MILESTONES.forEach(milestone => {
      const mx = x(milestone.year);
      G20.svg('line', {
        x1: mx,
        x2: mx,
        y1: margin.top - 2,
        y2: height - margin.bottom,
        stroke: '#94a3b8',
        'stroke-width': 1.5,
        'stroke-dasharray': '3 3'
      }, annotationsGroup);

      const badgeG = G20.svg('g', {
        class: 'milestone-badge',
        style: 'cursor: pointer;'
      }, annotationsGroup);

      const textNode = G20.svg('text', {
        x: mx,
        y: margin.top - (isMobile ? 5 : 7),
        'text-anchor': 'middle',
        'font-size': isMobile ? '9.5px' : '11px',
        'font-weight': 600,
        fill: '#475569'
      }, badgeG);
      textNode.textContent = milestone.badge;

      const showMilestoneTip = () => {
        G20.tooltip(svg, milestone.tooltip, mx, margin.top + 10);
      };
      badgeG.addEventListener('mouseenter', showMilestoneTip);
      badgeG.addEventListener('click', showMilestoneTip);
      badgeG.addEventListener('touchstart', showMilestoneTip, { passive: true });
      badgeG.addEventListener('mouseleave', G20.hideTooltip);
    });

    // Render Solid Lines and Interactive Points
    const linesGroup = G20.svg('g', { class: 'lines-group' }, svg);
    const dotsGroup = G20.svg('g', { class: 'dots-group' }, svg);
    const labelsGroup = G20.svg('g', { class: 'end-labels-group' }, svg);

    // Sort displayed users so selected line renders on top
    const sortedUsers = [...displayedUsers].sort((a, b) => {
      if (a === selected) return 1;
      if (b === selected) return -1;
      return 0;
    });

    sortedUsers.forEach((user) => {
      const isSelected = selected === '__all__' || user === selected;
      const userColor = getColor(user);

      const rows = G20.YEARS.map(year => data.find(row =>
        +row['Calendar year'] === year && row['Road user'] === user));

      const points = rows.map((row, i) => [
        x(G20.YEARS[i]), yScale(G20.number(row?.['Sum(Hospitalisations)']))
      ]);

      const base2011 = G20.number(rows[0]?.['Sum(Hospitalisations)']);

      // Solid polyline with clean styling
      const lineElement = G20.svg('polyline', {
        points: points.map(pt => pt.join(',')).join(' '),
        class: `line line-user`,
        fill: 'none',
        stroke: userColor,
        'stroke-width': isSelected ? (selected === '__all__' ? 2.6 : 3.8) : 1.4,
        opacity: isSelected ? 1 : 0.2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      }, linesGroup);

      lineElement.addEventListener('mouseenter', () => {
        if (selected === '__all__') {
          lineElement.setAttribute('stroke-width', '4');
          lineElement.setAttribute('opacity', '1');
        }
      });
      lineElement.addEventListener('mouseleave', () => {
        if (selected === '__all__') {
          lineElement.setAttribute('stroke-width', '2.6');
          lineElement.setAttribute('opacity', '1');
        }
      });

      // Interactive points
      points.forEach((point, i) => {
        const year = G20.YEARS[i];
        const count = G20.number(rows[i]?.['Sum(Hospitalisations)']);
        const pctChange = base2011 ? ((count - base2011) / base2011 * 100) : 0;
        const changeSign = pctChange > 0 ? '+' : '';
        const changeText = i === 0 ? 'Baseline year' : `${changeSign}${pctChange.toFixed(1)}% vs 2011`;

        let note = '';
        if (year === 2012) note = '<br><span style="color:#d97706">⚠️ Victoria counting change</span>';
        else if (year === 2017) note = '<br><span style="color:#d97706">⚠️ NSW counting change</span>';
        else if (year === 2020) note = '<br><span style="color:#38bdf8">📉 COVID-19 pandemic drop</span>';

        const circle = G20.svg('circle', {
          cx: point[0],
          cy: point[1],
          r: isSelected ? (selected === '__all__' ? 4 : 5.5) : 2.5,
          class: 'dot',
          fill: userColor,
          stroke: '#ffffff',
          'stroke-width': isSelected ? 1.5 : 0.8,
          opacity: isSelected ? 1 : 0.35,
          style: 'cursor: pointer;'
        }, dotsGroup);

        const showDotTip = () => {
          G20.tooltip(
            svg,
            `<strong>${G20.escape(user)}</strong><br>Year: ${year}<br>Hospitalisations: <strong>${G20.format(count)}</strong><br><small style="color:#cbd5e1">${changeText}</small>${note}`,
            point[0],
            point[1]
          );
        };
        circle.addEventListener('mouseenter', showDotTip);
        circle.addEventListener('click', showDotTip);
        circle.addEventListener('touchstart', showDotTip, { passive: true });
        circle.addEventListener('mouseleave', G20.hideTooltip);
      });
    });

    // Direct line end-labels at year 2021 (Desktop only; on mobile the interactive legend pills identify categories without crowding)
    if (!isMobile) {
      const endLabels = [];
      sortedUsers.forEach(user => {
        if (selected === user || selected === '__all__') {
          const rows = G20.YEARS.map(year => data.find(row =>
            +row['Calendar year'] === year && row['Road user'] === user));
          const lastCount = G20.number(rows[rows.length - 1]?.['Sum(Hospitalisations)']);
          endLabels.push({
            user,
            count: lastCount,
            targetY: yScale(lastCount),
            y: yScale(lastCount),
            color: getColor(user)
          });
        }
      });

      // Move up labels with abundant headroom above them to prevent crowding with lower labels
      endLabels.forEach(lbl => {
        if (lbl.user === 'Heavy transport driver') {
          lbl.y -= 30; // Shift up into the large headroom above 383
        } else if (lbl.user === 'Heavy transport passenger') {
          lbl.y -= 30; // Shift up into the large headroom above 56
        }
      });

      // 2-Pass iterative relaxation algorithm to ensure labels have minimum 34px gap
      const minVerticalGap = 34;
      for (let iter = 0; iter < 25; iter++) {
        endLabels.sort((a, b) => a.y - b.y);
        for (let i = 1; i < endLabels.length; i++) {
          const diff = endLabels[i].y - endLabels[i - 1].y;
          if (diff < minVerticalGap) {
            const needed = minVerticalGap - diff;
            if (endLabels[i - 1].y - needed >= margin.top + 8) {
              endLabels[i - 1].y -= needed;
            } else {
              endLabels[i].y += needed;
            }
          }
        }
      }

      // Clamp within chart vertical bounds
      const minYBound = margin.top + 8;
      const maxYBound = height - margin.bottom - 4;
      for (let i = 0; i < endLabels.length; i++) {
        if (endLabels[i].y < minYBound) endLabels[i].y = minYBound;
        if (endLabels[i].y > maxYBound) endLabels[i].y = maxYBound;
      }
      for (let i = endLabels.length - 2; i >= 0; i--) {
        if (endLabels[i + 1].y - endLabels[i].y < minVerticalGap) {
          endLabels[i].y = endLabels[i + 1].y - minVerticalGap;
        }
      }

      // Render end labels and connector leader lines
      const labelX = x(2021) + 8;
      endLabels.forEach(lbl => {
        // Draw smooth curved connector leader line if label shifted by more than 3px
        if (Math.abs(lbl.y - lbl.targetY) > 3) {
          G20.svg('path', {
            d: `M ${x(2021) + 2} ${lbl.targetY} C ${x(2021) + 10} ${lbl.targetY}, ${labelX - 8} ${lbl.y}, ${labelX - 2} ${lbl.y}`,
            fill: 'none',
            stroke: lbl.color,
            'stroke-width': 1.2,
            opacity: 0.65
          }, labelsGroup);
        }

        const textElem = G20.svg('text', {
          x: labelX,
          y: lbl.y,
          fill: lbl.color,
          'font-size': '11px',
          'font-weight': 700,
          class: 'direct-end-label'
        }, labelsGroup);

        if (lbl.user === 'Heavy transport unknown position') {
          G20.svg('tspan', { x: labelX, dy: '-0.35em' }, textElem).textContent = 'Heavy transport';
          G20.svg('tspan', { x: labelX, dy: '1.2em' }, textElem).textContent = `unknown pos. (${G20.format(lbl.count)})`;
        } else if (lbl.user === 'Pick-up truck or van occupant') {
          G20.svg('tspan', { x: labelX, dy: '-0.35em' }, textElem).textContent = 'Pick-up truck / van';
          G20.svg('tspan', { x: labelX, dy: '1.2em' }, textElem).textContent = `occupant (${G20.format(lbl.count)})`;
        } else if (lbl.user === 'Heavy transport passenger') {
          G20.svg('tspan', { x: labelX, dy: '-0.35em' }, textElem).textContent = 'Heavy transport';
          G20.svg('tspan', { x: labelX, dy: '1.2em' }, textElem).textContent = `passenger (${G20.format(lbl.count)})`;
        } else if (lbl.user === 'Heavy transport driver') {
          G20.svg('tspan', { x: labelX, dy: '-0.35em' }, textElem).textContent = 'Heavy transport';
          G20.svg('tspan', { x: labelX, dy: '1.2em' }, textElem).textContent = `driver (${G20.format(lbl.count)})`;
        } else if (lbl.user === 'Car unknown position') {
          G20.svg('tspan', { x: labelX, dy: '-0.35em' }, textElem).textContent = 'Car unknown';
          G20.svg('tspan', { x: labelX, dy: '1.2em' }, textElem).textContent = `position (${G20.format(lbl.count)})`;
        } else {
          G20.svg('tspan', { x: labelX, dy: '0.3em' }, textElem).textContent = `${lbl.user} (${G20.format(lbl.count)})`;
        }
      });
    }

    // X-axis Year Labels (clean step on mobile to avoid overlap)
    G20.YEARS.forEach((year, i) => {
      if (isMobile && i % 2 !== 0 && i !== G20.YEARS.length - 1) return;
      G20.svg('text', {
        x: x(year),
        y: height - (isMobile ? 8 : 12),
        'text-anchor': 'middle',
        'font-weight': 600,
        'font-size': isMobile ? '11px' : '13px',
        fill: '#475569'
      }, svg).textContent = isMobile ? `'${String(year).slice(2)}` : year;
    });

    // Clickable Legend with Group Filter Tabs
    const legendContainer = document.querySelector('#q1Legend');
    if (legendContainer) {
      legendContainer.innerHTML = '';

      // Filter Tabs Wrapper
      const tabsWrap = document.createElement('div');
      tabsWrap.className = 'q1-filter-tabs';

      const filterConfigs = [
        { id: 'top5', label: '⭐ Top 5 Categories (High Volume)' },
        { id: 'lowest5', label: '🔍 Lowest 5 Categories (Zoomed)' }
      ];

      filterConfigs.forEach(cfg => {
        const tabBtn = document.createElement('button');
        tabBtn.type = 'button';
        tabBtn.className = `tab-btn ${activeFilter === cfg.id ? 'active' : ''}`;
        tabBtn.setAttribute('aria-pressed', activeFilter === cfg.id ? 'true' : 'false');
        tabBtn.textContent = cfg.label;
        tabBtn.addEventListener('click', () => {
          activeFilter = cfg.id;
          if (selectElem) selectElem.value = '__all__';
          window.renderMultiLineChart(data);
        });
        tabsWrap.appendChild(tabBtn);
      });
      legendContainer.appendChild(tabsWrap);

      // Road User Pills for active group
      const pillsWrap = document.createElement('div');
      pillsWrap.className = 'q1-pills-wrap';

      // "All in group" pill
      const allPill = document.createElement('button');
      allPill.type = 'button';
      allPill.className = 'pill-btn';
      allPill.setAttribute('aria-pressed', selected === '__all__' ? 'true' : 'false');
      allPill.innerHTML = `<span class="swatch" style="background:#475569"></span><span>All ${activeFilter === 'top5' ? 'Top 5' : 'Lowest 5'}</span>`;
      allPill.addEventListener('click', () => {
        if (selectElem) {
          selectElem.value = '__all__';
          selectElem.dispatchEvent(new Event('input'));
        }
      });
      pillsWrap.appendChild(allPill);

      displayedUsers.forEach(user => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'pill-btn';
        const isPillActive = selected === user;
        pill.setAttribute('aria-pressed', isPillActive ? 'true' : 'false');
        const uColor = getColor(user);
        pill.innerHTML = `<span class="swatch" style="background:${uColor}"></span><span>${G20.escape(user)}</span>`;

        pill.addEventListener('click', () => {
          if (selectElem) {
            selectElem.value = isPillActive ? '__all__' : user;
            selectElem.dispatchEvent(new Event('input'));
          }
        });
        pillsWrap.appendChild(pill);
      });

      legendContainer.appendChild(pillsWrap);
    }

    // Dynamic Insight Text Describing Change Over Time
    const insightElem = document.querySelector('#q1Insight');
    if (insightElem) {
      if (selected === '__all__') {
        const groupRows2011 = data.filter(r => +r['Calendar year'] === 2011 && displayedUsers.includes(r['Road user']));
        const groupRows2021 = data.filter(r => +r['Calendar year'] === 2021 && displayedUsers.includes(r['Road user']));
        const total2011 = groupRows2011.reduce((sum, r) => sum + G20.number(r['Sum(Hospitalisations)']), 0);
        const total2021 = groupRows2021.reduce((sum, r) => sum + G20.number(r['Sum(Hospitalisations)']), 0);
        const growth = total2011 ? ((total2021 - total2011) / total2011 * 100).toFixed(1) : 0;

        const groupName = activeFilter === 'top5' ? 'the top 5 road-user categories' : 'the lowest 5 road-user categories';

        insightElem.innerHTML =
          `Between 2011 and 2021, hospitalisations across <strong>${groupName}</strong> rose by ` +
          `<strong>${growth}%</strong> (from ${G20.format(total2011)} to ${G20.format(total2021)}). ` +
          `A nationwide drop in <strong>2020</strong> coincided with COVID-19 pandemic mobility restrictions, ` +
          `with series baselines also reflecting hospital counting revisions in Victoria (2012) and NSW (June 2017).`;
      } else {
        const userRows = data.filter(row => row['Road user'] === selected);
        const val2011 = G20.number(userRows.find(row => +row['Calendar year'] === 2011)?.['Sum(Hospitalisations)']);
        const val2021 = G20.number(userRows.find(row => +row['Calendar year'] === 2021)?.['Sum(Hospitalisations)']);
        const val2020 = G20.number(userRows.find(row => +row['Calendar year'] === 2020)?.['Sum(Hospitalisations)']);

        const userChange = val2011 ? ((val2021 - val2011) / val2011 * 100) : 0;
        const changeDirection = userChange >= 0 ? 'increased' : 'decreased';

        insightElem.innerHTML =
          `Between 2011 and 2021, <strong>${G20.escape(selected)}</strong> hospitalisations ${changeDirection} by ` +
          `<strong>${Math.abs(userChange).toFixed(1)}%</strong> (from ${G20.format(val2011)} in 2011 to ${G20.format(val2021)} in 2021). ` +
          `Hospitalisations recorded ${G20.format(val2020)} in 2020 during COVID-19 travel reductions, ` +
          `with broader trends also influenced by counting revisions in Victoria (2012) and NSW (2017).`;
      }
    }
  };
})();
