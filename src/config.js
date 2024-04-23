module.exports = {
  appname: 'myapp',// App Name. This will be used to prefix the rate limiter state name to be stored in the store. For example, 'myapp'.
  storeClient: {
    host: '127.0.0.1',// Host of the Redis server.
    port: 6379,// Port of the Redis server. Default is 6379.
  },
}