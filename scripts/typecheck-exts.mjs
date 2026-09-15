#!/usr/bin/env node
// Typecheck every package/ and extension/ workspace against its own tsconfig.
// The root `typecheck` script only covers src/, so extension type errors would
// otherwise surface only during the full build.
//
// packages/* are BUILT (their build script emits dist/ + declaration files):
// extensions import them via file: deps and resolve their types from dist/,
// which does not exist on a fresh checkout. extensions/* are then checked
// with `tsc --noEmit`. Installs a workspace's deps first when node_modules
// is missing, mirroring scripts/build-exts.mjs.
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
		.map((name) => `${parentDir}/${name}`);
}

function ensureDeps(ws) {
	const abs = path.join(root, ws);
	if (!existsSync(path.join(abs, 'node_modules'))) {
		console.log(`[${ws}] installing deps…`);
		execFileSync('bun', ['install'], { cwd: abs, stdio: 'inherit' });
	}
	return abs;
}

const packages = workspacesWithTsconfig('packages');
const extensions = workspacesWithTsconfig('extensions');
if (packages.length + extensions.length === 0) process.exit(0);

let failed = 0;

// Packages build first: tsc typechecks as it emits, and extensions need the
// emitted declarations to resolve the file: dependency types.
for (const ws of packages) {
	const abs = ensureDeps(ws);
	console.log(`[${ws}] building (tsc, emits dist + d.ts)…`);
	try {
		execFileSync('bun', ['run', 'build'], { cwd: abs, stdio: 'inherit' });
	} catch {
		failed++;
	}
}

for (const ws of extensions) {
	const abs = ensureDeps(ws);
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
console.log(`typecheck:exts passed for ${packages.length + extensions.length} workspace(s)`);
