var Promise = require('bluebird');
var Gpio = require('onoff').Gpio;
var rest = require('restler-promise')(Promise);
var clone = require('lodash.clone');
var nodeCleanup = require('node-cleanup');
var logging = require("logger-winston");
var HttpsProxyAgent = require('https-proxy-agent');
var exec = require('child_process').exec;

var defaultConfig = require('./default-config');
var nconf = require('nconf');
nconf.file('config.json');
nconf.defaults(defaultConfig);
var config = nconf.get();
logging.init(config);
var logger = logging.getLogger("gpio-input-handler");
var shutdownButton = new Gpio(config.shutdownButton, 'in', 'both');
var activityLed = new Gpio(config.leds.activity, 'out');
var readyLed = new Gpio(config.leds.ready, 'out');
var activityTimerId = null;
var lastSeenGpio = 0;
var lastSeenValue = -1;
var debounceTimerId = null;
var inputs = [];
lastRequest = Promise.resolve();
var agent = config.proxy ? new HttpsProxyAgent(config.proxy) : undefined;

//
// helper functions
//

function updateLastSeen(gpio, value) {
  if (config.debounce) {
    lastSeenGpio = gpio;
    lastSeenValue = value;
    if (debounceTimerId != null) {
      clearTimeout(debounceTimerId);
      debounceTimerId = null;
    }
    debounceTimerId = setTimeout(function () {
      lastSeenGpio = 0;
      lastSeenValue = -1;
    }, config.debounceTimeout)
  }
}


function checkLastSeen(gpio, value) {
  if (config.debounce) {
    return gpio !== lastSeenGpio || (value !== lastSeenValue && value !== undefined)
  }
  else {
    return true
  }
}

/**
 * Let the activity flash for 50 milliseconds to indicate
 * some activity observed on a GPIO port.
 */
function activityLedFlash() {
  if (activityTimerId != null) {
    clearTimeout(activityTimerId);
    activityTimerId = null;
  }
  activityLed.write(1, function (err) {
    if (err) {
      throw err;
    }
    activityTimerId = setTimeout(function () {
      activityLed.write(0, function (err) {
        if (err) {
          throw err;
        }
      });
    }, 50)
  });
}

/**
 * Execute REST operations of the associated IOT service to report an activity observed on
 * a given GPIO input port
 * @param data - the configuration data associated with the GPIO input
 */
function notifyIotService(data) {
  lastRequest = lastRequest.reflect().then(function () {
    logger.info("Invoking IOT Service");
    return new Promise(function (resolve) {
      rest.get(config.restBaseUrl + 'orders', {
        timeout: 5000,
        agent: agent,
        headers: {accept: 'text/html'}
      })
        .then(function (result) {
          if (String(result.data).length === 0) {
            logger.warn("no active order in response from IOT service - continuing anyway");
          }
          else {
            logger.info("active order id:", result.data);
          }
          var queryData = clone(data.additionalData);
          queryData.orderid = result.data;
          return rest.post(config.restBaseUrl + 'tracks', {
            timeout: 5000,
            agent: agent,
            query: queryData,
            headers: {accept: 'application/json'}
          })
            .then(function (result) {
              logger.info("tracking data sent:", result.response.req.path);
              resolve()
            })
        })
        .catch(function (errorResult) {
          logger.info(errorResult.error ? errorResult.error : errorResult);
          // at this point we simply resolve the promise out of laziness as we don't
          // want to handle the rejection on the caller side. The promise is simply
          // used to synchronize multiple invocations of notifyIotService()
          resolve()
        })
    })
  })
}

/**
 * If the shutdown button is pressed for at least 5 seconds a system shutdown is initiated
 * on button release
 */
function handleShutdownButton() {
  var lastPressed = 0;

  shutdownButton.watch(function (err, value) {
    if (err) {
      throw err;
    }
    if (value) {
      lastPressed = Date.now();
    }
    else {
      if (Date.now() - lastPressed >= 5000) {
        logger.info("shutdown button pressed for at least 5 secs - initiating shutdown");
        exec('sudo shutdown now', function(error, stdout, stderr){ callback(stdout); });
      }
    }
  })
}

/**
 * Monitor configured GPIO inputs.
 */
function handleInputs() {
  config.inputs.forEach(function (input) {
    var gpio = new Gpio(input.gpio, 'in', 'both');
    gpio.__config = input;

    gpio.watch(function (err, value) {
      if (err) {
        throw err;
      }
      var data = gpio.__config;

      switch (data.notifyState) {
        case 'HIGH':
          if (value && checkLastSeen(data.gpio)) {
            logger.info(
              `GPIO ${data.gpio} ${JSON.stringify(data.additionalData || {})} changed to HIGH`);
            activityLedFlash();
            notifyIotService(data)
          }
          break;
        case 'LOW':
          if (!value && checkLastSeen(data.gpio)) {
            logger.info(
              `GPIO ${data.gpio} ${JSON.stringify(data.additionalData || {})} changed to LOW`);
            activityLedFlash();
            notifyIotService(data)
          }
          break;
        default:
          if (checkLastSeen(data.gpio, value)) {
            logger.info(
              `GPIO ${data.gpio} ${JSON.stringify(data.additionalData || {})} changed to ${value ? "HIGH" : "LOW"}`);
            activityLedFlash();
            notifyIotService(data)
          }
          break;
      }
      updateLastSeen(data.gpio, value);
    });
    inputs.push(gpio);
  });
}

/**
 * Cleanup handler called on process termination
 */
function cleanup() {
  if (activityTimerId != null) {
    clearTimeout(activityTimerId);
    activityTimerId = null;
  }
  if (debounceTimerId != null) {
    clearTimeout(debounceTimerId);
    debounceTimerId = null;
  }
  inputs.forEach(function (input) {
    input.unexport();
  });
  shutdownButton.unexport();

  readyLed.writeSync(0);
  activityLed.writeSync(0);

  readyLed.unexport();
  activityLed.unexport();
}


//
// main
//

logger.info("Started");
readyLed.writeSync(1);
handleInputs();
handleShutdownButton();
nodeCleanup(cleanup);