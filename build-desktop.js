import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_NAME = 'Milliy Partner';
const ELECTRON_DIST = path.join(__dirname, 'node_modules', 'electron', 'dist');
const OUT_DIR = path.join(__dirname, 'dist-electron', `${APP_NAME}-win32-x64`);
const RESOURCES_APP_DIR = path.join(OUT_DIR, 'resources', 'app');

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('--- Packaging Electron Desktop App ---');

if (!fs.existsSync(ELECTRON_DIST)) {
  console.error('ERROR: Electron runtime not found at', ELECTRON_DIST);
  console.error('Run this first: node node_modules/electron/install.js');
  process.exit(1);
}

if (!fs.existsSync(path.join(__dirname, 'dist', 'index.html'))) {
  console.error('ERROR: No production build found at ./dist — run "npm run build" first.');
  process.exit(1);
}

if (fs.existsSync(OUT_DIR)) {
  console.log('Removing previous build output...');
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
}

console.log('Copying Electron runtime...');
copyDirSync(ELECTRON_DIST, OUT_DIR);
fs.renameSync(path.join(OUT_DIR, 'electron.exe'), path.join(OUT_DIR, `${APP_NAME}.exe`));

console.log('Copying application resources...');
fs.mkdirSync(RESOURCES_APP_DIR, { recursive: true });
copyDirSync(path.join(__dirname, 'dist'), path.join(RESOURCES_APP_DIR, 'dist'));
fs.copyFileSync(path.join(__dirname, 'main.js'), path.join(RESOURCES_APP_DIR, 'main.js'));
fs.copyFileSync(path.join(__dirname, 'preload.js'), path.join(RESOURCES_APP_DIR, 'preload.js'));

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
const appPkg = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  type: 'module',
  main: 'main.js',
};
fs.writeFileSync(path.join(RESOURCES_APP_DIR, 'package.json'), JSON.stringify(appPkg, null, 2));

console.log('\n==================================================');
console.log('SUCCESS: Application packaged successfully!');
console.log('Executable:', path.join(OUT_DIR, `${APP_NAME}.exe`));
console.log('==================================================');
