// Post-build: fix CJS output for dual export
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'dist', 'cjs');

// 1. Strip .js from require() paths
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/require\("\.\/([^"]+)\.js"\)/g, 'require("./$1")');
  fs.writeFileSync(filePath, content);
}

// 2. Write package.json to mark as CJS
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"commonjs"}\n');

console.log('CJS fix applied to', dir);
