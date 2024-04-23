# multi-region-rate-limiter-example

This is sample code for a process that load balances traffic for APIs in multiple regions.

## Required
- Redis >= 2.6.12 (Manage rate limiter status on Redis)  
    Installing Redis on Amazon Linux 2023 OS.   
    ```sh
    sudo dnf install -y redis6
    sudo systemctl start redis6
    sudo systemctl enable redis6
    ```

## Directory structure
```sh
.
|-- measure/                    Result of running the test (`node src/index.js`).
|   `-- measurements.csv        Measurements.
|-- docs/                       
|   `-- index.html              Chart of traffic dispersion measurement results.
|-- src/
|   |-- config.js               App name, Redis information to store rate limiter status, etc.
|   |-- RateLimiterRegion.js    Rate limiter in region.
|   |-- sleep.js                Wait for specified milliseconds.
|   `-- index.js                Testing a Region's Rate Limits.
|-- package-lock.json
`-- package.json
```

## Getting Started
1. Require a rate limiter class.
    ```js
    const RateLimiterRegion = require('./RateLimiterRegion');
    ```
1. Create a rate limiter instance.
    ```js
    const limiter = new RateLimiterRegion({
        appname: 'myapp',
        storeClient: {
            host: '127.0.0.1',
            port: 6379,
        },
    });
    ```

    The options that can be specified in the rate limiter constructor are as follows:
    |Option|Type|Description|
    |--|--|--|
    |appname|string|App Name. This will be used to prefix the rate limiter state name to be stored in the store. For example, 'myapp'.|
    |storeClient.host|string|Host of the Redis server.|
    |storeClient.port|number|Port of the Redis server. Default is 6379.|
1. Define endpoint information for each region.
    ```js
    const endpoints = [
        {region: 'us-west1', quota: 100, duration: 60},
        {region: 'us-west2', quota: 100, duration: 60},
        {region: 'us-west3', quota: 50, duration: 60},
    ];
    ```

    Element of endpoint information:
    |Element|Type|Description|
    |--|--|--|
    |region|string|Unique Region.|
    |quota|number|Requests per duration(s) limit.|
    |duration|number|Request limit duration(seconds).|
1. Register the regions where you want to distribute traffic to the limiters.
   ```js
    for (let endpoint of endpoints)
        limiter.addRegion(endpoint.region, endpoint.quota, endpoint.duration);
   ```
1. Get the region with the lowest traffic rate by rate limiter.
    ```js
    const res = await limiter.consume();
    ```
1. Determine the result of `limiter.consume()`.
    - `limiter.consume()` returns the following result, where there is a traffic available region.

        |||
        |--|--|
        |requestable|`true`|
        |region|The region with the least traffic.|
        |remaining|Number of requests possible within a period of time.|

    - If no available region is found, it returns the following result.

        |||
        |--|--|
        |requestable|`false`|
        |region|The region with the least traffic waiting for the next request.|
        |retryAfter|Time (in milliseconds) required before the next request is available.|

    ```js
    if (res.requestable)
        // Trafficable regions found.
        await fetch(`https://${res.region}.com/api`);
    else
        // Wait until traffic is available.
        // Or you may return a 429 HTTP status.
        await new Promise(resolve => setTimeout(resolve, res.retryAfter));
    ```

## Redis CLI
Check all keys.
```sh
redis6-cli keys \*
```

Delete all keys.
```sh
redis6-cli flushdb
```

## Run a test
This is code to check if traffic to the three regions (us-west1, us-west2, and us-west3) is distributed.  
When the run is complete, the traffic counts are written to docs/*.csv by region and timestamp.
```sh
redis6-cli flushdb && node src/index.js
```

## Reference
- [node-rate-limiter-flexible Options](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#blockduration)