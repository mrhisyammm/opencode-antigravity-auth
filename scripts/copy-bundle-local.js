// Copy dist/bundle.js dan package.json ke semua folder cache & node_modules lokal
// Jalankan dari root repo: node scripts/copy-bundle-local.js

const fs = require('fs');
const path = require('path');
const os = require('os');

const home = process.env.USERPROFILE || os.homedir();

const targets = [
  path.join(home, '.cache/opencode/packages/opencode-antigravity-auth@latest'),
  path.join(home, '.cache/opencode/packages/@mrhisyammm/opencode-antigravity-auth'),
  path.join(home, '.cache/opencode/packages/@mrhisyammm/opencode-antigravity-auth@latest'),
  path.join(home, '.cache/opencode/packages/@mrhisyammm/opencode-antigravity-auth@latest/node_modules/@mrhisyammm/opencode-antigravity-auth'),
  path.join(home, '.cache/opencode/packages/opencode-antigravity-auth@latest/node_modules/opencode-antigravity-auth'),
  path.join(home, '.config/opencode/node_modules/opencode-antigravity-auth'),
];

let copiedCount = 0;

for (const targetDir of targets) {
  if (fs.existsSync(targetDir)) {
    const distDir = path.join(targetDir, 'dist');
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
    try {
      fs.copyFileSync('dist/bundle.js', path.join(distDir, 'bundle.js'));
      fs.copyFileSync('package.json', path.join(targetDir, 'package.json'));
      console.log(`  OK  → ${targetDir}`);
      copiedCount++;
    } catch (e) {
      console.error(`  ERR → ${targetDir}: ${e.message}`);
    }
  }
}

console.log(`\nDone. Copied to ${copiedCount} location(s). Restart OpenCode Desktop.`);
