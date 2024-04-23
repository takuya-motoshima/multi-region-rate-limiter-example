const fs = require('fs');
const path = require('path');
const moment = require('moment');
const RateLimiterRegion = require('./RateLimiterRegion');
const sleep = require('./sleep');
const config = require('./config');

(async () => {
  // Region Information. Each element is as follows
  // - region: Unique Region.
  // - quota: Requests per duration(s) limit.
  // - duration: Request limit duration(seconds).
  const endpoints = [
    {region: 'us-west1', quota: 100, duration: 60},
    {region: 'us-west2', quota: 100, duration: 60},
    {region: 'us-west3', quota: 50, duration: 60},
  ];

  // Create a rate limiter instance.
  const limiter = new RateLimiterRegion({
    appname: config.appname,
    storeClient: {
      host: config.storeClient.host,
      port: config.storeClient.port,
    },
  });

  // Register a rate limiter for the region.
  for (let endpoint of endpoints)
    limiter.addRegion(endpoint.region, endpoint.quota, endpoint.duration);

  // Output processing time.
  console.time('Request Time');

  // Trials per minute. Calculated by total quota * coefficient.
  const coefficient = 2.5;
  const trialsPerMinute = Math.floor(endpoints.reduce((a, b) => a + b.quota, 0) * coefficient);

  // Trial minutes.
  const trialMinutes = 3;

  // Trial Total.
  const trials = trialsPerMinute * trialMinutes;

  // Loop Count.
  let loops = 0;

  // Request success count.
  let requested = 0;

  // Count the number of requests by region and timestamp.
  const measure = endpoints.reduce((data, endpoint) => {
    data[endpoint.region] = {};
    return data;
  }, {});

  // Requests per second.
  const requestsPerSecond = Math.floor(trialsPerMinute / 60);

  while(requested < trials) {
    // Consume allocation requests for the region with the least traffic.
    const res = await limiter.consume();
    if (res.requestable) {
      // Add measurement data.
      const now = moment();
      const timestamp = now.format(`YYYY-MM-DD HH:mm:${Math.floor(moment().seconds()/10) + '0'}`);
      // const timestamp = now.format('YYYY-MM-DD HH:mm:ss');
      if (!measure[res.region][timestamp])
        measure[res.region][timestamp] = 0;
      ++measure[res.region][timestamp];

      // The request was successful.
      console.log(`Call ${res.region} Region API (${++requested} requests out of ${trials})`);
    } else {
      // Wait until traffic is available.
      console.warn('Wait for next traffic');
      await sleep(res.retryAfter);
    }

    // Increment the loop count.
    ++loops;

    // Sleep in 5 increments.
    if ((loops % requestsPerSecond) === 0)
      await sleep(1000);
  }
  console.timeEnd('Request Time');

  // Write measurement.
  fs.writeFileSync(
    path.join(__dirname, `../docs/data.json`),
    JSON.stringify(measure, null, '  '),
    {encoding: 'utf8'}
  );
  process.exit(0);
})();