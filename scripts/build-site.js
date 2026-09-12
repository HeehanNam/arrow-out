'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'dist');
fs.mkdirSync(destination, { recursive: true });
for (const file of ['index.html', 'style.css', 'game.js', 'engine.js', 'campaign.json', '.nojekyll']) {
  fs.copyFileSync(path.join(root, file), path.join(destination, file));
}
