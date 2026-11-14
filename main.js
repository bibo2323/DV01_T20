window.addEventListener('load', async () => {
  const { G20 } = window;

  try {
    const data = await G20.loadData();

    // Populate chart controls with values from the loaded data.
    const lineUsers = [...new Set(data.line.map(row => row['Road user']))];
    const mapUsers = [...new Set(data.map.map(row => row['road user']))];
    const scatterUsers = [...new Set(data.scatter.map(row => row['Road user']))];

    G20.options('#q1Select', ['__all__', ...lineUsers]);
    document.querySelector('#q1Select').options[0].textContent = 'All road users';
    G20.options('#q2Select', mapUsers);
    G20.options('#q4Select', scatterUsers);
    G20.options('#q4Sex', ['All', 'Male', 'Female']);

    // Display the total number of hospitalisations in 2021.
    document.querySelector('#heroTotal').textContent = G20.format(
      data.line.filter(row => +row['Calendar year'] === 2021)
        .reduce((total, row) => total + G20.number(row['Sum(Hospitalisations)']), 0)
    );

    // Redraw every chart using the current control values.
    function render() {
      window.renderMultiLineChart(data.line);
      window.renderChoroplethMap(data.map);
      window.renderStackedBarChart(data.remoteness);
      window.renderScatterPlot(data.scatter);
      window.renderStackedAreaChart(data.age);
    }

    const controlIds = [
      'q1Select',
      'q2Select',
      'q2Year',
      'q3Year',
      'q4View',
      'q4Select',
      'q4Year',
      'q4Sex',
      'q5Year'
    ];

    controlIds.forEach(id => {
      document.getElementById(id).addEventListener('input', render);
    });

    render();
    window.addEventListener('resize', render);
  } catch (error) {
    // Show a useful message when the data cannot be loaded.
    document.querySelector('.explore').insertAdjacentHTML(
      'afterbegin',
      '<p class="insight">The chart files could not be loaded. Please run the site through a local web server.</p>'
    );
    console.error(error);
  }
});
