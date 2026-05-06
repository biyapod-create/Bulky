const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rendererDir = path.join(root, 'renderer');
const skipDirs = new Set(['.git', 'node_modules', 'dist', 'extracted_asar', 'dist-release-6.0.4']);
const syntaxRoots = ['main.js', 'preload.js', 'ipc', 'services', 'database', path.join('renderer', 'src')];

function collectJsFiles(targetPath, files = []) {
  const fullPath = path.join(root, targetPath);
  if (!fs.existsSync(fullPath)) return files;

  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    if (fullPath.endsWith('.js')) files.push(fullPath);
    return files;
  }

  for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      collectJsFiles(path.join(targetPath, entry.name), files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(path.join(fullPath, entry.name));
    }
  }
  return files;
}

function run(command, args, cwd, label) {
  const invocation = process.platform === 'win32' && /\.cmd$/i.test(command)
    ? { command: 'cmd.exe', args: ['/c', command, ...args] }
    : { command, args };
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    stdio: 'inherit',
    shell: false
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }
}

function main() {
  const jsFiles = syntaxRoots.flatMap((entry) => collectJsFiles(entry));
  for (const file of jsFiles) {
    run('node', ['--check', file], root, `Syntax check for ${path.relative(root, file)}`);
  }

  const rendererEslint = path.join(rendererDir, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');
  const rootEslint = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');
  const eslintCmd = fs.existsSync(rendererEslint) ? rendererEslint : rootEslint;
  run(eslintCmd, ['./src', '--ext', '.js'], rendererDir, 'Renderer ESLint');
}

main();
