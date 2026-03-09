const { execSync } = require('child_process');
const path = require('path');
const pkg = require('../package.json');

const name = pkg.productName || pkg.name || 'app';
const version = pkg.version || '0.0.0';
// zip filename should match package name + version; no extra "-dir" suffix
const zipName = `${name}-${version}.zip`;
const distDir = path.join(__dirname, '..', 'dist');
const srcDir = path.join(distDir, 'win-unpacked');
const destPath = path.join(distDir, zipName);

console.log(`zipping directory ${srcDir} -> ${destPath}`);

try {
  if (process.platform === 'win32') {
    // Use PowerShell compress-archive (built-in since Windows 8 / Server 2012)
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${destPath}' -Force"`,
      { stdio: 'inherit' },
    );
  } else {
    // Fallback for other platforms: require `zip` to be installed
    execSync(`zip -r '${destPath}' '${srcDir}'`, { stdio: 'inherit' });
  }
  console.log('zip creation complete');
} catch (err) {
  console.error('failed to create zip', err);
  process.exit(1);
}