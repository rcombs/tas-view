const TwitchBot = require('twitch-bot');

const Bot = new TwitchBot(require('./twitch-config.json'));

const inputInterval = 1000 * 5;

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

var userInputs = {};

var config;

function cleanupInput(chatter) {
  var msg = chatter.message.toLowerCase();
  var split = msg.substring(1).replace(/ +/g, ' ').split(' ');
  var cmd = split[0]
  if (cmd == 'press' || cmd == 'hold') {
    var button = split[1];
    if (!config.console.buttons.hasOwnProperty(split[1]))
      return false;

    if (config.console.buttons.hasOwnProperty(config.console.buttons[button]))
      button = config.console.buttons[button];

    var count = parseInt(split[2], 10);
    if (isNaN(split[2]))
      count = (cmd == 'hold') ? 0 : 1;

    var max = (cmd == 'hold') ? config.argv.maxHold : config.argv.maxRepeat;
    if (max && count > max)
      return;

    if (count < 0)
      return;

    return [cmd, button, count];
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
    if (!config.console.sticks || !config.console.sticks.hasOwnProperty(stick))
      return false;
    if (!stickDirs.hasOwnProperty(dir))
      return false;
    return [cmd, stick, stickDirs[dir]];
  } else if (cmd == 'run') {
    if (!chatter.badges || !chatter.badges.broadcaster)
      return false;

    return split;
  } else if (cmd == 'reset') {
    return [cmd];
  } else {
    return false;
  }
}

var inputTimer;

var mode = 'democracy';

Bot.on('message', chatter => {
  if (!config || !config.console)
    return;
  if(chatter.message.startsWith('!')) {
    var cmd = cleanupInput(chatter);
    if (cmd) {
      if (cmd[0] == 'run') {
        runCommand(cmd.slice(1));
        return;
      }

      userInputs[chatter.id] = cmd.join('-');
      if (!inputTimer)
        inputTimer = setTimeout(chooseInput, inputInterval);
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
  runCommand(cmd.split('-'));
  userInputs = {};
  inputTimer = false;
}

function power(on) {
  config.sp.write('PM:O:' + config.argv.powerPin + '\nDW:' + (on ? 1 : 0) + ':' + config.argv.powerPin + '\n');
}

var resetsNeeded = 5;
var resetCount = 0;

function runCommand(cmd) {
  config.log('L', 'RUNNING: !' + cmd.join(' '));
  Bot.say('Running: !' + cmd.join(' '));
  config.sp.write('HL:' + (cmd[0] == 'hold' && (!cmd[2] || cmd[2] == '0') ? 1 : 0) + '\n');
  if (cmd[0] == 'reset') {
    if (++resetCount == resetsNeeded || cmd[1] == 'now') {
      Bot.say(`Resetting...`);
      power(false);
      setTimeout(function() {power(true)}, 1000);
      return;
    } else {
      Bot.say(`Reset count: ${resetCount}/${resetsNeeded}`);
    }
  } else {
    resetCount = 0;
  }
  if (cmd[0] == 'hold' || cmd[0] == 'press') {
    var data = config.console.buttons[cmd[1]];
    var count = parseInt(cmd[2], 10);
    if (isNaN(count))
      count = (cmd[0] == 'hold') ? 0 : 1;
    if (cmd[0] == 'hold') {
      data = data.repeat(config.argv.repeatRate);
    } else {
      data = data.repeat(config.argv.repeatFrames);
      if (count > 1)
        data += '00'.repeat(config.console.frameSize * config.argv.repeatRate);
    }
    for (var i = 0; i < (count || 1); i++)
      config.sp.write('IN:' + data + '\n');
  } else if (cmd[0] == 'stick') {
    config.sp.write('IN:' + config.console.sticks[cmd[1]][cmd[2]] + '\n');
  } else if (cmd[0] == 'write') {
    config.sp.write(cmd[1] + '\n');
  }
}

module.exports = {
  setConfig: function(c) {
    config = c;
  }
}
