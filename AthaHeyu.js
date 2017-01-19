
const feathers = require('feathers/client');
const socketio = require('feathers-socketio/client');
const hooks = require('feathers-hooks');
const io = require('socket.io-client');
const authentication = require('feathers-authentication/client');
const exec = require('child_process').execFile;


const SERVER = 'http://localhost:3030';
const EMAIL = 'test@example.com';
const PASSWORD = 'test12345';

const HEYU = '/usr/local/bin/heyu';
const X10_BRIGHTNESS = 22;


const socket = io(SERVER);
const app = feathers()
    .configure(hooks())
    .configure(socketio(socket))
    .configure(authentication());

const lightService = app.service('lights');

var lights = {};


Main();


function Main() {
    console.log("AthaHeyu - A client bridge between the Atha home automation service and Heyu.");
    Login();
}


function Login() {
    console.log("Logging into server.");
    app.authenticate({
        'type': 'local',
        'email': EMAIL,
        'password': PASSWORD
    }).then(LoginSuccess, LoginFailure);
}


function LoginSuccess() {
    console.log("Login successful");
    FindLights();
}


function LoginFailure(error) {
    console.log("Login failed");
    console.log(error);
    app.close();
}


function FindLights() {
    console.log("Retrieving current light status");

    lightService.find({
        query: {
            $limit: 100,
            $sort: {
                'address': 1
            }
        }
    }).then(OnLightsUpdate, OnError);
}


function OnLightsUpdate(data) {
    lights = {};

    data.data.forEach(function(light) {
        lights[light._id] = light;
    });

    lightService.on('updated', OnLightUpdated);
    console.log('AthaHeyu is listening...');
}


function OnLightUpdated(newLight) {
    var oldLight = lights[newLight._id];

    // If the status (on/off) didn't change...
    if(oldLight.status == newLight.status) {
        // If the light is currently on, and it's dimmable, then we need to adjust the brightness
        if((newLight.status) && (newLight.isDimmable)) {
            var oldLevel = Number(oldLight.level);
            var newLevel = Number(newLight.level);
            console.log('Old Level: ' + oldLevel + '; New Level: ' + newLevel);

            if(newLevel < oldLevel) {
                var dimLevel = CalcLightLevel(oldLevel) - CalcLightLevel(newLevel);
                Heyu('dim', newLight.address, dimLevel);
            }
            else {
                var brightLevel = CalcLightLevel(newLevel) - CalcLightLevel(oldLevel);
                Heyu('bright', newLight.address, brightLevel);
            }
        }
        else {
            // The Light is not on, so let's just preset the level
            if(newLight.isDimmable) {
                Heyu('preset', newLight.address, CalcLightLevel(newLight.level));
            }
        }
    }
    else if(newLight.status) {
        // The light is off and needs to turn on
        if((newLight.isDimmable) && (newLight.level < 100)) {
            Heyu('obdim', newLight.address, CalcLightLevel(100 - newLight.level));
        }
        else {
            Heyu('turn', newLight.address, newLight.status);
        }
    }
    else {
        // The light is on and needs to turn off
        Heyu('turn', newLight.address, newLight.status);
    }

    // Finally, replace our copy
    lights[newLight._id] = newLight;
}


function CalcLightLevel(percent) {
    return Math.floor(percent / 100 * X10_BRIGHTNESS);
}

function OnError(err) {
    console.log(err);
}


function Heyu(command, address, state) {
    var args = [];

    args.push(command);
    args.push(address);

    if(typeof(state) == 'boolean') {
        args.push(state ? 'on' : 'off');
    }
    else {
        args.push(state);
    }

    console.log(args);
    exec(HEYU, args, HeyuCallback);

    function HeyuCallback(error, stdout, stderr) {
        if(error) {
            console.error(`exec error: ${error}`);
        }

        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
    }
}

