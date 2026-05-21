import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export function requireTty(): void {
  if (!input.isTTY) {
    console.error(
      'tmux-web setup requires an interactive terminal.\n' +
      'Use flags instead, e.g. tmux-web setup --yes',
    );
    process.exit(1);
  }
}

export async function promptYesNo(
  question: string,
  defaultYes: boolean,
): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question(`${question} [${hint}]: `)).trim().toLowerCase();
    if (!answer) return defaultYes;
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

export async function promptSecret(label: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(`${label}: `)).trim();
  } finally {
    rl.close();
  }
}
