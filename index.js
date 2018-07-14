#! /usr/bin/env node

var SerialPort = require('serialport'),
    fs = require('fs'),
    express = require('express'),
    http = require('http'),
    socketio = require('socket.io'),
    Readline = require('@serialport/parser-readline'),
    yargs = require('yargs'),
    path = require('path');

const EventEmitter = require('events');
class BotEmitter extends EventEmitter {}
const bot = new BotEmitter();
var twitch;

var dstPath;

var startupString = '';

const consoles = {
  n64: {
    frameSize: 4,
    buttons: {
      a: '80000000',
      b: '40000000',
      z: '20000000',
      start: '10000000',
      s: 'start',
      right: '01000000',
      left:  '02000000',
      down:  '04000000',
      up:    '08000000',
      dr: 'right',
      dl: 'left',
      dd: 'down',
      du: 'up',
      r: '00100000',
      l: '00200000',
      cright: '00010000',
      cleft:  '00020000',
      cdown:  '00040000',
      cup:    '00080000',
      cr: 'cright',
      cl: 'cleft',
      cd: 'cdown',
      cu: 'cup',
    },
    sticks: {
      '': {
        up: '0000007F'
        down: '00000080'
        left: '00008000'
        right: '00007F00'
      }
    }
  }
};

const argv = yargs.option('serial', {
  alias: 's',
  default: '/dev/cu.usbmodem4403591'
}).option('baudRate', {
  alias: 'b',
  default: 115200
}).option('port', {
  alias: 'p',
  default: 3939
}).option('console', {
  alias: 'c',
  default: 'n64'
}).command('upload <srcFile> [dstPath]', 'send a file', (yargs) => {
  yargs.positional('srcFile', {
    describe: 'file to upload',
  }).positional('dstPath', {
    describe: 'path to upload to on device (defaults to /[source name])'
  });
}, (argv) => {
  if (argv.dstPath)
    dstPath = argv.dstPath;
  else
    dstPath = '/' + path.basename(argv.srcFile);
}).command(['list [path]', 'ls'], 'list contents of directory', (yargs) => {
  yargs.positional('path', {
    describe: 'directory to list',
    default: '/'
  });
}, (argv) => {
  startupString += 'L:' + argv.path + '\n';
}).command('twitch', 'run twitch bot', (yargs) => {
  twitch = require('./twitch.js');
}).command(['run [files..]', '*'], 'run one or more TAS files', (yargs) => {
  yargs.positional('files', {
    describe: 'TAS files to run',
    default: ['120-2012.m64']
  }).option('loop', {
    alias: 'l',
    default: false,
    boolean: true
  }).option('random', {
    alias: 'r',
    default: false,
    boolean: true
  }).option('next-timeout', {
    alias: 'n',
    default: 6 * 60 * 1000,
  }).option('crash-timeout', {
    alias: 'c',
    default: 60 * 1000,
  });
}, (argv) => {
}).argv;

var app = express();
var server = http.Server(app);
var io = socketio(server);
server.listen(argv.port);
const {performance} = require('perf_hooks');

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

var sp = new SerialPort(argv.serial, {
  baudRate: argv.baudRate,
});

if (twitch) {
  twitch.setConsole(consoles[argv.console]);
  twitch.setPort(sp);
}

var parser = sp.pipe(new Readline({delimeter: '\n'}));

function shuffle (array) {
  var i = 0
    , j = 0
    , temp = null

  for (i = array.length - 1; i > 0; i -= 1) {
    j = Math.floor(Math.random() * (i + 1))
    temp = array[i]
    array[i] = array[j]
    array[j] = temp
  }
}

var srcArray;
var ranClear = false;
var logLines = [];

function log(level, line) {
  var obj = {level: level, line: line};
  logLines.push(obj);
  if (logLines.length >= 100)
    logLines.shift();
  io.to('inputs').emit('log', obj);
  console.log(level + ':' + line);
}

var currentFile;
var rerun = false;

function chooseFile() {
  if (!srcArray || (!srcArray.length && argv.loop)) {
    srcArray = argv.files.slice();
    if (argv.random) {
      shuffle(srcArray);
      log('log', 'Randomized file list');
    }
  }
  if (!ranClear && srcArray.length) {
    ranClear = true;
    return "clear.m64";
  } else {
    ranClear = false;
    if (!rerun)
      currentFile = srcArray.shift();
    rerun = false;
    return currentFile;
  }
}

function openFile(file) {
  console.log('Opening TAS file');
  sp.write('M:' + file + '\n');
}

var powerPin = 23;

function loadNext() {
  sp.write('PM:O:' + powerPin + '\nDW:0:' + powerPin + '\n');
  var next = chooseFile();
  if (!next) {
    console.log('Finished running all files');
    process.exit(0);
  }
  setTimeout(function () {
    openFile(next);
  }, 1000);
}

var startTime;
var running = false;

var file;

function readChunk() {
  var fileBuffer = Buffer.alloc(100);
  var bytesRead = fs.read(file, fileBuffer, 0, 100, null, function (err, bytesRead, buffer) {
    if (err) {
      console.log(err);
      throw err;
    }
    if (bytesRead) {
      sp.write('AP:' + buffer.toString('hex', 0, bytesRead) + '\n');
    } else {
      console.log('Finished writing');
      sp.write('CL:\n');
    }
  });
}

sp.on('open', function () {
  console.log('SP opened');
  if (startupString)
    sp.write(startupString);
  if (dstPath) {
    console.log('Creating file');
    sp.write('CR:' + dstPath + '\n');
  } else if (argv.files) {
    loadNext();
  }
});

function parseDat(dat) {
  var arr = dat.split(' ');
  var obj = {
    nb: parseInt(arr[0], 10)
  };
  arr = arr.slice(1).map(function (x) {return parseInt(x, 16)});

  obj.cr = !!(arr[1] & 0x01);
  obj.cl = !!(arr[1] & 0x02);
  obj.cd = !!(arr[1] & 0x04);
  obj.cu = !!(arr[1] & 0x08);
  obj.r  = !!(arr[1] & 0x10);
  obj.l  = !!(arr[1] & 0x20);

  obj.dr = !!(arr[0] & 0x01);
  obj.dl = !!(arr[0] & 0x02);
  obj.dd = !!(arr[0] & 0x04);
  obj.du = !!(arr[0] & 0x08);

  obj.s  = !!(arr[0] & 0x10);
  obj.z  = !!(arr[0] & 0x20);
  obj.b  = !!(arr[0] & 0x40);
  obj.a  = !!(arr[0] & 0x80);

  obj.x = arr[2];
  obj.y = arr[3];

  return obj;
}

var splits;
var m64;
var numFrames;

io.on('connection', function (socket) {
  socket.join('inputs');
  console.log('socket connected');
  if (splits)
    socket.emit('splits', splits);
  if (m64)
    socket.emit('m64', m64);
  if (numFrames)
    socket.emit('numFrames', numFrames);
  if (startTime)
    socket.emit('paired', performance.now() - startTime);
  for (var i = 0; i < logLines.length; i++)
    socket.emit('log', logLines[i]);
});

parser.on('data', function(data) {
  data = data.replace('\r', '').split(':');
  var command = data[0];
  var payload = data.slice(1).join(':');
  if (data.length == 1) {
    payload = command;
    command = '?';
  }
  bot.emit('data', command, payload);
  bot.emit(command, payload);
});

var crashTimeout, desyncTimeout;
var lastInputTime = 0;

bot.on('F', (data) => {
  io.to('inputs').emit('input', parseDat(data));
  if (crashTimeout)
    clearTimeout(crashTimeout);
  lastInputTime = performance.now();
  if (dstPath)
    return;
  crashTimeout = setTimeout(function () {
    console.log('Assuming crash; loading next');
    loadNext();
    if (desyncTimeout)
      clearTimeout(desyncTimeout);
  }, argv.crashTimeout);
}).on('M', (data) => {
  console.log('M:' + data);
  if (data.startsWith('/'))
    data = data.substr(1);
  io.to('inputs').emit('m64', data);
  m64 = data;
  try {
    splits = require('./' + data + '.json');
    console.log('Loaded splits');
  } catch (e) {
    splits = undefined;
  }
  io.to('inputs').emit('splits', splits);
}).on('N', (data) => {
  console.log('N:' + data);
  numFrames = parseInt(data, 10);
  io.to('inputs').emit('numFrames', numFrames);
  if (desyncTimeout)
    clearTimeout(desyncTimeout);
  setTimeout(() => {
    sp.write('PM:O:' + powerPin + '\nDW:1:' + powerPin + '\n');
    running = true;
  }, 1000);
}).on('C', (data) => {
  console.log('Complete');
  io.to('inputs').emit('complete', data);
  setTimeout(loadNext, ranClear ? 0 : argv.nextTimeout);
  if (crashTimeout)
    clearTimeout(crashTimeout);
  if (desyncTimeout)
    clearTimeout(desyncTimeout);
  startTime = undefined;
}).on('P', (data) => {
  log('log', 'Paired');
  startTime = performance.now();
  io.to('inputs').emit('paired', 0);
  if (desyncTimeout)
    clearTimeout(desyncTimeout);
}).on('A', (name) => {
  if (name[0] != '.')
    console.log('Available file: ' + name);
}).on('CR', (data) => {
  if (data == 'OK') {
    fs.open(argv.srcFile, 'r', function (err, fd) {
      if (err)
        throw err;
      console.log('File opened for reading');
      file = fd;
      readChunk();
    });
  } else {
    console.log("Error opening file on device");
    process.exit(1);
  }
}).on('AP', (data) => {
    if (data == 'OK')
      readChunk();
    else
      console.log("Error appending to file on device");
}).on('CL', (data) => {
  if (data == 'OK') {
    console.log('Finished uploading file.');
    process.exit(0);
  } else {
    console.log("Error closing file on device");
    process.exit(1);
  }
}).on('D', (data) => {
  if (running && 0) {
    desyncTimeout = setTimeout(() => {
      log('error', 'Desync detected; resetting run...');
      if (lastInputTime >= performance.now() - 1000) {
        rerun = true;
        loadNext();
      }
    }, 5000);
  }
}).on('L', (data) => {
  log('log', data);
}).on('W', (data) => {
  log('warn', data);
}).on('E', (data) => {
  log('error', data);
}).on('?', (data) => {
  log('log', data);
});
