const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = '/home/skai/Bureau/labo-dev/serious-app';
const src = path.join(root, 'assets/images/rire.png');
const dst = path.join(root, 'assets/images/rire_small.jpg');

function sh(cmd) {
  return execFileSync('/usr/bin/env', ['bash', '-c', cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

try {
  sh('/usr/bin/convert ' + JSON.stringify(src) + ' -resize 1024 -quality 85 -define jpeg:fancy-upsampling ' + JSON.stringify(dst));
  console.log('convert ok');
} catch (e) {
  if (!fs.existsSync(dst)) {
    console.log('convert failed, trying alternative...');
    try {
      sh('/usr/bin/convert ' + JSON.stringify(src) + ' -resize 1024 -quality 85 ' + JSON.stringify(dst));
      console.log('convert ok (second attempt)');
    } catch (e2) {
      console.log('convert failed: ' + e2.message.slice(0, 300));
      try {
        sh('/usr/bin/pngquant --quality 65-85 --ext .jpg ' + JSON.stringify(src) + ' ' + JSON.stringify(dst));
        console.log('pngquant ok');
      } catch (e3) {
        console.log('pngquant failed: ' + e3.message.slice(0, 300));
      }
    }
  }
}

if (fs.existsSync(dst)) {
  console.log('wrote', dst, fs.statSync(dst).size + ' bytes');
} else {
  console.log('NO OUTPUT FILE');
}
