#!/usr/bin/env node

export {};

const args = process.argv.slice(2);
if (args[0] === 'service') {
  const { runServiceCli } = await import('./lib/service-cli.js');
  process.exitCode = await runServiceCli(args.slice(1));
} else if (args[0] === '-V' || args[0] === '--version' || args[0] === '-v') {
  const { printVersion } = await import('./lib/cli.js');
  printVersion();
} else if (args[0] === '-h' || args[0] === '--help' || args[0] === 'help') {
  const { printUsage } = await import('./lib/cli.js');
  printUsage();
} else {
  await import('./index.js');
}
