#!/usr/bin/env node
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const assetsDir = join(root, 'dist', 'assets');

await rm(assetsDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });

const result = await Bun.build({
	entrypoints: [join(root, 'src', 'browser', 'terminal-client.ts')],
	outdir: assetsDir,
	target: 'browser',
	format: 'esm',
	splitting: false,
	minify: false,
	sourcemap: 'none',
	naming: {
		entry: '[dir]/[name].js',
		chunk: '[name]-[hash].js',
		asset: '[name].[ext]',
	},
});

if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}

await copyFile(
	join(root, 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css'),
	join(assetsDir, 'xterm.css'),
);
