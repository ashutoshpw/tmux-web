#!/usr/bin/env node
// Build shared packages under packages/, then every extension under extensions/.
//   - `--force`: always rebuild (used by `npm run build`)
//   - default:   only build if `dist/` is missing (used by `predev`)
import { readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const force      = process.argv.includes('--force');
const root       = process.cwd();
const packagesDir = path.join(root, 'packages');
const extsDir    = path.join(root, 'extensions');

function buildPackageDir(dir, tag) {
  const hasDist = existsSync(path.join(dir, 'dist'));
  if (hasDist && !force) {
    console.log(`${tag} dist present — skipping (use \`npm run build:exts\` to rebuild)`);
    return;
  }
  if (!existsSync(path.join(dir, 'node_modules')) || force) {
    console.log(`${tag} installing deps…`);
    execFileSync('npm', ['install'], { cwd: dir, stdio: 'inherit' });
  }
  console.log(`${tag} building…`);
  execFileSync('npm', ['run', 'build'], { cwd: dir, stdio: 'inherit' });
}

if (existsSync(packagesDir)) {
  for (const name of readdirSync(packagesDir)) {
    const dir = path.join(packagesDir, name);
    if (!statSync(dir).isDirectory()) continue;
    if (!existsSync(path.join(dir, 'package.json'))) continue;
    buildPackageDir(dir, `[pkg:${name}]`);
  }
}

if (!existsSync(extsDir)) process.exit(0);

for (const name of readdirSync(extsDir)) {
  const dir = path.join(extsDir, name);
  if (!statSync(dir).isDirectory()) continue;
  if (!existsSync(path.join(dir, 'package.json'))) continue;
  buildPackageDir(dir, `[ext:${name}]`);
}
