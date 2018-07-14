const TwitchBot = require('twitch-bot');

const Bot = new TwitchBot(require('./twitch-config.json'));

const inputInterval = 1000 * 10;

Bot.on('join', channel => {
  console.log(`Joined channel: ${channel}`);
});

Bot.on('error', err => {
  console.error(err);
});

var stickDirs = {
  u: 'up',
  d: 'down',
  l: 'left',
  r: 'right',
  up:    'up',
  down:  'down',
  left:  'left',
  right: 'right',
}

var cmds = ['press', 'hold', 'stick'];
var userInputs = {};

var console;
var port;

function cleanupInput(msg) {
  var split = msg.substring(1).replace(/ +/g, ' ').split(' ');
  if (cmd == 'press' || cmd == 'hold') {
    var button = split[1];
    if (!console.buttons.hasOwnProperty(split[1]))
      return false;

    if (console.buttons.hasOwnProperty(console.buttons[button]))
      button = console.buttons[button];

    return [cmd, button];
  } else if (cmd == 'stick') {
    var stick, dir;
    if (split.length == 2) {
      stick = '';
      dir = split[1];
    } else if (split.length == 3) {
      stick = split[1];
      dir = split[2];
    } else {
      return false;
    }
    if (!console.sticks || !console.sticks.hasOwnProperty(stick))
      return false;
    if (!stickDirs.hasOwnProperty(dir))
      return false;
    return [cmd, stickDirs[dir]];
  } else if (cmd == 'run') {
    if (!chatter.badgers.broadcaster)
      return false;

    return split;
  } else {
    return false;
  }
}

var inputTimer;

var mode = 'democracy';

Bot.on('message', chatter => {
  if (!console)
    return;
  var msg = chatter.message.toLowerCase();
  if(msg.startsWith('!')) {
    var cmd = cleanupInput(msg);
    if (cmd) {
      if (cmd[0] == 'run') {
        runCommand(cmd.slice(1));
        return;
      }

      userInputs[chatter.id] = cmd.join('-');
      if (!inputTimer)
        inputTimer = setTimeout(inputInterval, chooseInput);
    }
  }
});

function modeOfArray(array)
{
    if(array.length == 0)
        return null;
    var modeMap = {};
    var maxEl = array[0], maxCount = 1;
    for(var i = 0; i < array.length; i++)
    {
        var el = array[i];
        if(modeMap[el] == null)
            modeMap[el] = 1;
        else
            modeMap[el]++;
        if(modeMap[el] > maxCount)
        {
            maxEl = el;
            maxCount = modeMap[el];
        }
    }
    return maxEl;
}

function randomElement(list) {
  return list[Math.floor((Math.random()*list.length))];
}

function chooseInput() {
  var cmd;
  var votes = Object.values(userInputs);
  if (mode == 'democracy')
    cmd = modeOfArray(votes);
  else
    cmd = randomElement(votes);
  runCommand(cmd);
  userInputs = {};
  inputTimer = false;
}

function runCommand(cmd) {
  sp.write('HL:' + (cmd[0] == 'hold' ? 1 : 0) + '\n');
  if (cmd[0] == 'hold' || cmd[0] == 'press') {
    sp.write('IN:' + console.buttons[cmd[1]] + '\n');
  } else if (cmd[0] == 'stick') {
    sp.write('IN:' + console.sticks[cmd[1]] + '\n');
  } else if (cmd[0] == 'write') {
    sp.write(cmd[1] + '\n');
  }
}

module.exports = {
  setConsole: function(c) {
    console = c;
  }
  setPort: function(p) {
    port = p;
  }
}
