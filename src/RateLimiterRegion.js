const {RateLimiterRedis} = require('rate-limiter-flexible');
const Redis = require('ioredis');
const {merge} = require('deep-fusion');

/**
 * Rate limiter in region.
 */
module.exports = class Limiter {
  /**
   * RateLimiterRedis instances. The key is the region and the value is the limiter instance.
   * @type {{[key: string]: RateLimiterRedis}}
   */
  #limiters = {};

  /**
   * Redis client instance.
   * @type {Redis}
   */
  #redis;

  /**
   * App Name. This will be used to prefix the rate limiter state name to be stored in the store.
   * @type {{appname: string, storeClient: {host: string, port: number}}}
   */
  #options;

  /**
   * @param {string} options.appname App Name. This will be used to prefix the rate limiter state name to be stored in the store. For example, 'myapp'.
   * @param {string} options.storeClient.host Host of the Redis server.
   * @param {number} options.storeClient.port Port of the Redis server. Default is 6379.
   * @throws {Error} Error if required options (appname, storeClient.host, storeClient.port, measure.path) are not set.
   */
  constructor(options = undefined) {
    // Initialize the options.
    this.#options = merge({
      appname: undefined,
      storeClient: {
        host: '127.0.0.1',
        port: 6379,
      },
    }, options);

    // Check the required options.
    if (!this.#options.appname)
      throw new Error('The appname option is required');
    else if (!this.#options.storeClient.host)
      throw new Error('The storeClient.host option is required');
    else if (!this.#options.storeClient.port)
      throw new Error('The storeClient.port option is required');

    // Create a new Redis instance.
    this.#redis = new Redis({
      host: this.#options.storeClient.host,
      port: this.#options.storeClient.port,
      // enableOfflineQueue: false,
      lazyConnect: true,
    });
  }

  /**
   * Add a per-region rate limiter.
   * @param {string} region Region. Must be unique.
   * @param {number} quota Maximum number of points can be consumed over duration. Limiter compares this number with number of consumed points by key to decide if an operation should be rejected or resolved.
   * @param {number} duration Number of seconds before consumed points are reset.
   * @throws {Error} Region duplicated.
   */
  async addRegion(region, quota, duration) {
    if (this.#limiters[region])
      // Error if region is duplicated.
      throw new Error(`Rate limiter for that region has already been created (region=${region})`);
    if (this.#redis.status === 'wait')
      // If not connected to the store, connect.
      await this.#redis.connect();

    // Create a rate limiter for the region.
    this.#limiters[region] = new RateLimiterRedis({
      storeClient: this.#redis,
      // It is required when you need to create two or more limiters with different options so keys don't interfere with different limiters.
      keyPrefix: this.#options.appname + ':rl',
      // Maximum number of points can be consumed over duration. Limiter compares this number with number of consumed points by key to decide if an operation should be rejected or resolved.
      points: quota,
      // Number of seconds before consumed points are reset.
      duration,
      // Do not block if consumed more than points.
      blockDuration: 0,
    });
  }

  /**
   * Consume allocation requests for the region with the least traffic.
   * @return {Promise<{requestable: boolean, region?: string}>}
   *          If a requestable region is found:
   *            - requestable: true
   *            - region: The region with the least traffic.
   *            - remaining: Number of requests possible within a period of time.
   *          If no requestable region was found:
   *            - requestable: false
   *            - region: The region with the least traffic waiting for the next request.
   *            - retryAfter: Time (in milliseconds) required before the next request is available.
   * @throws {Error} An unexpected error occurred during allocation request consumption.
   * @throws {Error} Region not registered.
   */
  async consume() {
    if (Object.keys(this.#limiters).length === 0)
      // Error if region is unregistered.
      throw new Error('Region is unregistered');

    // Get the region with the least traffic.
    const region = await this.#getLeastTrafficRegion();

    // Consumes the number of allocations in the region with the least traffic.
    return new Promise((resolve, reject) => {
      this.#limiters[region].consume(region)
        .then(async rateLimiterRes => {
          // Returns the result of a successful request.
          resolve({
            requestable: true,
            region,
            remaining: rateLimiterRes.remainingPoints,
          });
        })
        .catch(async err => {
          if (err instanceof Error)
            // Some Redis error.
            return void reject(err);

          // Returns the result of request failure.
          resolve({
            requestable: false,
            region,
            retryAfter: err.msBeforeNext,
          });
        });
    });
  }

  /**
   * Get the region with the least traffic.
   */
  async #getLeastTrafficRegion() {
    // Get traffic and time to next request for all regions.
    let traffics = [];
    for (let [region, limiter] of Object.entries(this.#limiters)) {
      let trafficRate = 0;
      let msBeforeNext = 0;
      const rateLimiterRes = await limiter.get(region);
      if (rateLimiterRes) {
        trafficRate = 1 - rateLimiterRes.remainingPoints / limiter.points;
        msBeforeNext = rateLimiterRes.msBeforeNext;
      }
      traffics.push({
        region,
        trafficRate,
        msBeforeNext,
      });
    }

    // Get the region of least traffic.
    const minTrafficRate = Math.min(...traffics.map(traffic => traffic.trafficRate));
    traffics = traffics.filter(traffic => traffic.trafficRate === minTrafficRate);
    if (traffics.length > 0) {
      // Narrow down the regions with multiple minimum traffic to the region with the smallest time to next request.
      const minMsBeforeNext = Math.min(...traffics.map(traffic => traffic.msBeforeNext));
      traffics = traffics.filter(traffic => traffic.msBeforeNext === minMsBeforeNext);
    }

    // Get one at random from the least traffic region.
    const traffic = traffics[Math.floor(Math.random() * traffics.length)];
    return traffic.region;
  }

  // /**
  //  * AGet store region data.
  //  */
  // async getStore() {
  //   return this.#redis.keys(`${this.#options.appname}*`)
  // }
}