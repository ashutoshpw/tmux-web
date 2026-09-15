import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		// Extension code imports the @tmux-web/* packages, which only resolve
		// through the extensions' own node_modules — absent when `bun run test`
		// runs before `build:exts` in CI. Alias them to source instead.
		alias: {
			'@tmux-web/ext-sdk': new URL('./packages/ext-sdk/src/index.ts', import.meta.url).pathname,
			'@tmux-web/ext-gh-workflow': new URL(
				'./packages/ext-gh-workflow/src/index.ts',
				import.meta.url,
			).pathname,
		},
	},
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts', 'packages/**/tests/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reportsDirectory: 'coverage',
			// Text table lands in the CI step summary; lcov goes to the uploaded artifact.
			reporter: ['text', 'lcov'],
		},
	},
});
