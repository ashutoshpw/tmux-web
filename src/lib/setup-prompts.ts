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

export async function promptChoice(
  question: string,
  choices: string[],
  defaultChoice: string,
): Promise<string> {
  // Default is shown uppercase, e.g. "XTERM/ghostty".
  const hint = choices.map((c) => (c === defaultChoice ? c.toUpperCase() : c)).join('/');
  const rl = readline.createInterface({ input, output });
  try {
    for (;;) {
      const answer = (await rl.question(`${question} [${hint}]: `)).trim().toLowerCase();
      if (!answer) return defaultChoice;
      const match = choices.find((c) => c.toLowerCase() === answer);
      if (match) return match;
      output.write(`Please choose one of: ${choices.join(', ')}\n`);
    }
  } finally {
    rl.close();
  }
}
