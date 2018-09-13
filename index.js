var ws = require('ws');
var Botkit = require('botkit');
var config = require('./config.json');
if (!config.CLIENT_ID || !config.CLIENT_SECRET || !config.PORT || !config.VERIFICATION_TOKEN) {
    console.log('Error: Specify CLIENT_ID, CLIENT_SECRET, VERIFICATION_TOKEN and PORT in environment');
    process.exit(1);
}
var configBot = {};
if (config.MONGOLAB_URI) {
    var BotkitStorage = require('botkit-storage-mongo');
    configBot = {
        storage: BotkitStorage({ mongoUri: process.env.MONGOLAB_URI }),
    };
}
var controller = Botkit.slackbot(configBot).configureSlackApp({
    clientId: config.CLIENT_ID,
    clientSecret: config.CLIENT_SECRET,
    verificationToken: config.VERIFICATION_TOKEN,
    scopes: ['commands'],
});
controller.setupWebserver(config.PORT, function (err, webserver) {
    controller.createWebhookEndpoints(controller.webserver);
    controller.createOauthEndpoints(controller.webserver, function (err, req, res) {
        if (err) {
            res.status(500).send('ERROR: ' + err);
        }
        else {
            res.send('Success!');
        }
    });
});
var bot = controller.spawn({
    incoming_webhook: {
        url: config.URL
    }
});
var ws = new ws("wss://api.dassetx.com/WSGateway/");

ws.onopen = function () {
    getInstruments();
    var instruments = [];
    function getInstruments(){
        var frame = {
            "m": 0,
            "i": 0,
            "n": "GetInstruments",
            "o": ""
        };
        var payload = {
            "OMSId": 1,
        };
        frame.o = JSON.stringify(payload);
        ws.send(JSON.stringify(frame));
    }
};
ws.onmessage = function (evt) {
    var frame = JSON.parse(evt.data);
    if(frame.n == 'GetInstruments'){
        instruments = JSON.parse(frame.o);
        subscribeTrades();
        function subscribeTrades(){
            for(i = 0; i < instruments.length+1; i++){
                var frame = {
                    "m": 0,
                    "i": 0,
                    "n": "SubscribeTrades",
                    "o": ""
                };
                var payload = {
                    "OMSId": 1,
                    "InstrumentId": i,
                    "IncludeLastCount": 1
                };
                frame.o = JSON.stringify(payload);
                ws.send(JSON.stringify(frame));
            }
        }
    }
    if(frame.n == 'TradeDataUpdateEvent'){
        if(frame.o != undefined){
            if(JSON.parse(frame.o)[0] != undefined){
                var data = JSON.parse(frame.o)[0];
                var trade_number = data[0];
                var inst_id = data[1];
                var inst_details = (instruments[inst_id - 1] )
                var quantity = data[2];
                var price = data[3];
                if(data[8] == 0){
                    var direction = 'BOUGHT';
                }else{
                    var direction = 'SOLD';
                }
                if(inst_details.Product2Symbol == 'NZD'){
                    var string = "#" + trade_number + " - " + inst_details.Symbol + '\n' +
                    quantity + " " + inst_details.Product1Symbol + " " + direction + " @ $" + price.toFixed(2);
                }else{
                var string = "#" + trade_number + " - " + inst_details.Symbol + '\n' +
                quantity + " " + inst_details.Product1Symbol + " " + direction + " @ " + price  + " " + inst_details.Product2Symbol;
                }
                bot.sendWebhook({
                    text: string
                    ,
                    channel: '#trades',
                },function(err,res) {
                    if (err) {
                    // ...
                    }
                });
            }
        }
    }
}