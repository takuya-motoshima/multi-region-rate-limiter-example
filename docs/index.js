(async () => {
  // Fetch chart data.
  const raw = await (await fetch('data.json?' + (+new Date()))).json();

  // Convert data for chart.
  // const colors = ['#006ae6', '#e42855', '#c59a00'];
  const datasets = Object
    .keys(raw)
    .reduce((datasets, region, currentIndex) => {
      console.log('currentIndex=', currentIndex);
      datasets.push({
        label: region,
        // borderColor: ['#006ae6', '#e42855', '#c59a00'][currentIndex] ?? undefined,
        // backgroundColor: ['#006ae6', '#e42855', '#c59a00'][currentIndex] ?? undefined,
        data: Object
          .keys(raw[region])
          .reduce((data, timestamp) => {
            data.push({x: timestamp, y: raw[region][timestamp]});
            return data;
          }, []),
      });
      return datasets;
    }, []);

  // Sort by region.
  datasets.sort((a, b) => a.label.localeCompare(b.label));

  // Set default values for options.
  Chart.overrides.line.borderWidth = 1;
  Chart.overrides.line.tension = .4;
  // Chart.overrides.line.pointRadius = 0;
  // Chart.overrides.line.spanGaps = true;

  // Draw a chart.
  const ctx = document.getElementById('chart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: 'Rate limiter results per region'
        },
        // customCanvasBackgroundColor: {
        //   color: '#27293d',
        // },
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'second',
            displayFormats: {
              second: 'mm:ss'
            },
          },
          display: true,
          title: {
            display: true,
            text: 'Requested time',
          },
          // ticks: {
          //   callback: (...args) => {
          //     console.log(args);
          //     return moment(args[0]).format('mm:ss');
          //   },
          // },
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Number of requests',
          },
          // suggestedMin: 0,
          // suggestedMax: 100,
        }
      },
    },
    plugins: [
      // Note: changes to the plugin code is not reflected to the chart, because the plugin is loaded at chart construction time and editor changes only trigger an chart.update().
      {
        id: 'customCanvasBackgroundColor',
        beforeDraw: (chart, args, options) => {
          const {ctx} = chart;
          ctx.save();
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = options.color || '#ffffff';
          ctx.fillRect(0, 0, chart.width, chart.height);
          ctx.restore();
        }
      },
    ],
  });
})();