import packager from 'electron-packager';

// Force the Electron download mirror to bypass GitHub timeouts
process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';

async function bundle() {
  console.log('--- Starting Electron Desktop Packaging ---');
  console.log('Electron Mirror set to:', process.env.ELECTRON_MIRROR);
  
  try {
    const appPaths = await packager({
      dir: '.',
      name: 'Milliy Partner',
      platform: 'win32',
      arch: 'x64',
      out: 'dist-electron',
      overwrite: true,
      prune: false, // We ignore node_modules anyway, so no pruning needed
      ignore: [
        /^\/src/,
        /^\/tsconfig/,
        /^\/vite\.config/,
        /^\/eslint/,
        /^\/postcss/,
        /^\/tailwind/,
        /^\/vercel/,
        /^\/dist-electron/,
        /^\/node_modules/
      ]
    });
    console.log('\n==================================================');
    console.log('SUCCESS: Application packaged successfully!');
    console.log('Output location:', appPaths[0]);
    console.log('==================================================');
  } catch (err) {
    console.error('ERROR: Packaging failed!');
    console.error(err);
    process.exit(1);
  }
}

bundle();
