module.exports = {
  logging: {
    "default": {
      "console": {
        "level": "debug",
        "colorize": false,
        "timestamp": true
      }
    }
  },
  shutdownButton: 18,
  leds: {
    ready: 16,
    activity: 5
  },
  inputs: [
    {
      gpio: 24,
      notifyState: 'HIGH',
      additionalData: {
        bid: 1,
        waypointtype: "Start"
      }
    },
    {
      gpio: 23,
      notifyState: 'HIGH',
      additionalData: {
        bid: 2,
        waypointtype: "In Transit"
      }
    },
    {
      gpio: 27,
      notifyState: 'HIGH',
      additionalData: {
        bid: 3,
        waypointtype: "In Transit"
      }
    },
    {
      gpio: 22,
      notifyState: 'HIGH',
      additionalData: {
        bid: 4,
        waypointtype: "End"
      }
    }
  ],
  debounce: true,
  debounceTimeout: 5000,
  restBaseUrl: "https://virtserver.swaggerhub.com/mwittig/BeaconLogger/1.0.0/iot/",
  XXXproxy: "http://myproxy.local:3128"
};