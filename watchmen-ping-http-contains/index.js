var request = require('request');
var Sync = require('syncho');
var redis = require('redis');
var db = redis.createClient(1216, "127.0.0.1");
var redis_res = [];

function PingService(options) {
    if (options && options.dependencies && options.dependencies.request) {
        request = options.dependencies.request;
    }
}

exports = module.exports = PingService;

PingService.prototype.ping = function (service, callback) {
    var payload = service.pingServiceOptions['http-contains'].payload.value;
    var headersValue = service.pingServiceOptions['http-contains'].headers.value;
    var contains = service.pingServiceOptions['http-contains'].contains.value;
    var notContains = null;
    var expectedStatusCode = 200;
    var redis_value;

    if (headersValue == null || !headersValue) {
        headersValue = '{"content-type": "application/json"}';
    }
    Sync(function () {
        try {
            console.log('headers is ', headersValue);
            var headerRes = headersValue.match(/\$\{.*?\}/gi);
            console.log('Headers Regx Matcher :: ', headerRes);
            if (headerRes != null) {
                console.log('match found');
                headerRes.forEach(replaceHeader);

                function replaceHeader(item, index, arr) {
                    console.log('replace header');
                    console.log("Inside Replace Header", item.match("{(.*)}")[1])
                    var redisValue = db.get.sync(db, item.match("{(.*)}")[1])
                    console.log("Redis Value ... ", redisValue)
                    if (redisValue != null) {
                        console.log("Error Fetching ID ", item.match("{(.*)}")[1]);
                    }
                    redis_value = redisValue;
                    headersValue = headersValue.replace(item, redisValue);
                    console.log("New Header", headersValue);
                }
            }

            var payloadRes = payload.match(/\$\{.*?\}/gi);
            if (payloadRes != null) {
                console.log('payload match found');
                payloadRes.forEach(replacePayload);

                function replacePayload(item, index, arr) {
                    console.log("Inside Replace Payload", item.match("{(.*)}")[1])
                    var redisValue = db.get.sync(db, item.match("{(.*)}")[1])
                    console.log("Redis Value ... ", redisValue)
                    if (redisValue != null) {
                        console.log("Error Fetching ", item.match("{(.*)}")[1]);
                    }
                    payload = payload.replace(item, redisValue);
                    console.log("New Payload :: ", payload);
                }
            }
        } catch (e) {
            console.error("sasasasasasasasa", e);
        }
        makeHttpCall()
    });
    
    function makeHttpCall() {
        var serviceOptions = (service.pingServiceOptions && service.pingServiceOptions['http-contains']) || {};
        if (serviceOptions.statusCode && serviceOptions.statusCode.value) {
            expectedStatusCode = parseInt(serviceOptions.statusCode.value, 10);
        }

        if (!service.pingServiceOptions || !service.pingServiceOptions['http-contains'] ||
            !service.pingServiceOptions['http-contains'].contains) {
            return callback('http-contains plugin configuration is missing');
        }

        function prepareOptions() {
            if (service.serviceType == 'GET') {
                console.log('prepare header is ' + headersValue);
                return {
                    url: service.url,
                    timeout: service.timeout,
                    headers: JSON.parse(headersValue),
                    method: service.serviceType,
                    poll: false
                };
            } else if (headersValue.indexOf('form-urlencoded') != -1) {
                console.log('inside form url');
                var redis_data;
                var arr = [];
                arr['STAGE01'] = 20768
                arr['STAGE02'] = 59886
                arr['STAGE03'] = 7599
                Sync(function () {
                    redis_res[service.restrictedToEnv] = db.get.sync(db, service.restrictedToEnv + '_data')
                })
                console.log('redis data value is' + redis_res[service.restrictedToEnv]);
                //console.log('de id is',arr[service.restrictedToEnv]);
                //console.log('payload is ',JSON.parse(payload));
                return {
                    url: service.url,
                    timeout: service.timeout,
                    headers: JSON.parse(headersValue),
                    method: service.serviceType,
                    poll: false,
                    form: {
                        'id': arr[service.restrictedToEnv],
                        'otp': redis_res[service.restrictedToEnv],
                        'lat_long': '25.6700,25.6700'
                    }
                };
            }
            else {
                return {
                    url: service.url,
                    timeout: service.timeout,
                    body: payload,
                    headers: JSON.parse(headersValue),
                    method: service.serviceType,
                    poll: false
                };
            }
        }


        if (service.pingServiceOptions['http-contains'].notContains) {
            notContains = service.pingServiceOptions['http-contains'].notContains.value;
        }

        var startTime = +new Date();

        request(prepareOptions(), function (error, response, body) {
            console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$")
            console.log("request Method :::: " + prepareOptions().method);
            console.log("Request Header :::: " + JSON.stringify(prepareOptions().headers));
            //console.log("Header is :::: " + headersValue);
            console.log("request Body :::: " + prepareOptions().body);
            console.log("service name is ::: " + service.name);
            //if(headersValue.indexOf('Basic') != -1) {
            //console.log('response is ::: '+ JSON.stringify(response));
            // }
            console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$")
            var elapsedTime = +new Date() - startTime;
            if (error) {
                return callback(error, body, response, elapsedTime);
            }

            if (response && (response.statusCode == expectedStatusCode || headersValue.indexOf('form-urlencoded') != -1)) {
                Sync(function () {
                    var ans = db.sismember.sync(db, 'dependency', service.name.substring(9));
                    if (ans == 1) {
                        results = db.smembers.sync(db, service.name.substring(9));
                        console.log('results is' + results);
                        var json = response.body;
                        var jsonobject = JSON.parse(json);
                        for (var i in results) {
                            var path = '', i, end = '', obj;
                            path = results[i];
                            console.log('adding key-value pair to redis ' + path, jsonobject);

                            if (headersValue.indexOf('form-urlencoded') != -1)
                                if (jsonobject['data'] != null) {
                                    db.set.sync(db, service.restrictedToEnv + '_data.Authorization', jsonobject['data']['Authorization'])
                                }
                                else if (jsonobject[path] != null && jsonobject[path] != 0)
                                    db.set.sync(db, service.restrictedToEnv + '_' + path, jsonobject[path]);

                        }
                    }
                })
            }

            if (response && response.statusCode != expectedStatusCode) {
                //	 console.log("respose============",response);
                var errMsg = 'Invalid status code. Found: ' + response.statusCode +
                    '. Expected: ' + expectedStatusCode;
                return callback(errMsg, body, response, +new Date() - startTime);
            }

            if (contains && body.indexOf(contains) === -1) {
                return callback(contains + ' not found', body, response, elapsedTime);
            }

            if (notContains && body.indexOf(notContains) > -1) {
                return callback(notContains + ' found', body, response, elapsedTime);
            }

            callback(null, body, response, elapsedTime);
        });
    }
}

PingService.prototype.getDefaultOptions = function () {
    return {
        'payload': {
            descr: 'payload',
            placeholder: '',
            required: false
        },

        'headers': {
            descr: 'Headers in json format',
            placeholder: '{"Accept":"application/json", "Content-Type":"application/json"}',
            required: false
        },

        'contains': {
            descr: 'response body must contain',
            placeholder: '',
            required: false
        },

        'notContains': {
            descr: 'response body must NOT contain',
            placeholder: '',
            required: false
        },

        'statusCode': {
            descr: 'Expected status code (defaults to 200)',
            required: true
        }

    };
}
