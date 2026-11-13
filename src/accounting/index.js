import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

export const INITIAL_BALANCE_CENTS = 100_000;
export const MAX_BALANCE_CENTS = 99_999_999;

const AMOUNT_FORMAT_MESSAGE =
  'Invalid amount. Enter a value from 0.00 to 999999.99 with up to two decimal places.';

export function parseAmount(input) {
  const value = input.trim();
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(value);

  if (!match) {
    return null;
  }

  const whole = Number(match[1]);
  const fractional = Number((match[2] ?? '').padEnd(2, '0'));
  const amountCents = whole * 100 + fractional;

  return amountCents <= MAX_BALANCE_CENTS ? amountCents : null;
}

export function formatAmount(amountCents) {
  const whole = Math.floor(amountCents / 100);
  const fractional = amountCents % 100;
  return `${whole}.${fractional.toString().padStart(2, '0')}`;
}

export class Account {
  #balanceCents;

  constructor(initialBalanceCents = INITIAL_BALANCE_CENTS) {
    if (
      !Number.isSafeInteger(initialBalanceCents) ||
      initialBalanceCents < 0 ||
      initialBalanceCents > MAX_BALANCE_CENTS
    ) {
      throw new RangeError('Initial balance is outside the supported range.');
    }

    this.#balanceCents = initialBalanceCents;
  }

  get balanceCents() {
    return this.#balanceCents;
  }

  credit(amountCents) {
    this.#validateAmount(amountCents);

    const updatedBalance = this.#balanceCents + amountCents;
    if (updatedBalance > MAX_BALANCE_CENTS) {
      throw new RangeError(
        `Credit would exceed the maximum balance of ${formatAmount(MAX_BALANCE_CENTS)}.`,
      );
    }

    this.#balanceCents = updatedBalance;
    return this.#balanceCents;
  }

  debit(amountCents) {
    this.#validateAmount(amountCents);

    if (amountCents > this.#balanceCents) {
      return false;
    }

    this.#balanceCents -= amountCents;
    return true;
  }

  #validateAmount(amountCents) {
    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents < 0 ||
      amountCents > MAX_BALANCE_CENTS
    ) {
      throw new RangeError('Amount is outside the supported range.');
    }
  }
}

async function readAnswer(answers, output, prompt) {
  output.write(prompt);
  const { value, done } = await answers.next();
  return done ? null : value;
}

async function promptForAmount(answers, output, prompt) {
  while (true) {
    const input = await readAnswer(answers, output, prompt);
    if (input === null) {
      return null;
    }

    const amountCents = parseAmount(input);

    if (amountCents !== null) {
      return amountCents;
    }

    output.write(`${AMOUNT_FORMAT_MESSAGE}\n`);
  }
}

export async function runApplication(input = stdin, output = stdout) {
  const readline = createInterface({ input, output });
  const answers = readline[Symbol.asyncIterator]();
  const account = new Account();
  let running = true;

  try {
    while (running) {
      output.write(
        '--------------------------------\n' +
          'Account Management System\n' +
          '1. View Balance\n' +
          '2. Credit Account\n' +
          '3. Debit Account\n' +
          '4. Exit\n' +
          '--------------------------------\n',
      );

      const choice = await readAnswer(answers, output, 'Enter your choice (1-4): ');
      if (choice === null) {
        running = false;
        break;
      }

      switch (choice.trim()) {
        case '1':
          output.write(`Current balance: ${formatAmount(account.balanceCents)}\n`);
          break;
        case '2': {
          const amountCents = await promptForAmount(
            answers,
            output,
            'Enter credit amount: ',
          );
          if (amountCents === null) {
            running = false;
            break;
          }

          try {
            account.credit(amountCents);
            output.write(
              `Amount credited. New balance: ${formatAmount(account.balanceCents)}\n`,
            );
          } catch (error) {
            if (!(error instanceof RangeError)) {
              throw error;
            }
            output.write(`${error.message}\n`);
          }
          break;
        }
        case '3': {
          const amountCents = await promptForAmount(
            answers,
            output,
            'Enter debit amount: ',
          );
          if (amountCents === null) {
            running = false;
            break;
          }

          if (account.debit(amountCents)) {
            output.write(
              `Amount debited. New balance: ${formatAmount(account.balanceCents)}\n`,
            );
          } else {
            output.write('Insufficient funds for this debit.\n');
          }
          break;
        }
        case '4':
          running = false;
          break;
        default:
          output.write('Invalid choice, please select 1-4.\n');
      }
    }

    output.write('Exiting the program. Goodbye!\n');
  } finally {
    readline.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runApplication().catch((error) => {
    console.error('Unable to run the accounting application:', error);
    process.exitCode = 1;
  });
}
