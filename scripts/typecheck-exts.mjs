#!/usr/bin/env node
// Typecheck every package/ and extension/ workspace with its own tsconfig,
// without emitting: `tsc --noEmit -p <dir>`. The root `typecheck` script only
// covers src/, so extension type errors would otherwise surface only during
// the full build. Installs a workspace's deps first when node_modules is
// missing (fresh CI checkouts), mirroring scripts/build-exts.mjs.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');
const root = process.cwd();

function workspacesWithTsconfig(parentDir) {
	const dir = path.join(root, parentDir);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => {
			const child = path.join(dir, name);
			return (
				statSync(child).isDirectory() &&
				existsSync(path.join(child, 'package.json')) &&
				existsSync(path.join(child, 'tsconfig.json'))
			);
		})
		.map((name) => path.join(parentDir, name));
}

const workspaces = [...workspacesWithTsconfig('packages'), ...workspacesWithTsconfig('extensions')];
if (workspaces.length === 0) process.exit(0);

let failed = 0;

for (const ws of workspaces) {
	const abs = path.join(root, ws);
	if (!existsSync(path.join(abs, 'node_modules'))) {
		console.log(`[${ws}] installing deps…`);
		execFileSync('bun', ['install'], { cwd: abs, stdio: 'inherit' });
	}
	console.log(`[${ws}] tsc --noEmit…`);
	try {
		execFileSync(process.execPath, [tsc, '--noEmit', '-p', abs], { stdio: 'inherit' });
	} catch {
		failed++;
	}
}

if (failed > 0) {
	console.error(`typecheck:exts failed for ${failed} workspace(s)`);
	process.exit(1);
}
console.log(`typecheck:exts passed for ${workspaces.length} workspace(s)`);
