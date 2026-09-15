#!/usr/bin/env node
// Verify the build outputs that ship in the npm package exist and are sane.
// Runs after `bun run build` in CI so a broken pipeline fails before publish,
// not at install time for users. Kept dependency-free so it can run anywhere.
import { stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');

async function assertNonEmpty(relPath) {
	const fullPath = join(root, relPath);
	const info = await stat(fullPath).catch(() => null);
	if (!info || !info.isFile()) {
		throw new Error(`Missing build output: ${relPath}`);
	}
	if (info.size === 0) {
		throw new Error(`Build output is empty: ${relPath}`);
	}
	return fullPath;
}

// `bin` entry (shebang must survive tsc, or `npx tmux-web` fails).
const binPath = await assertNonEmpty('dist/index.js');
const bin = await readFile(binPath, 'utf8');
if (!bin.startsWith('#!')) {
	throw new Error('dist/index.js is missing the #!/usr/bin/env node shebang');
}

// Browser client bundle and its stylesheet, emitted by scripts/build-client.mjs.
await assertNonEmpty('dist/assets/terminal-client.js');
await assertNonEmpty('dist/assets/xterm.css');

// postinstall helper declared in package.json "files".
await assertNonEmpty('scripts/fix-pty-perms.mjs');

console.log('dist verification passed:');
console.log('  - dist/index.js (bin, shebang present)');
console.log('  - dist/assets/terminal-client.js');
console.log('  - dist/assets/xterm.css');
console.log('  - scripts/fix-pty-perms.mjs');
