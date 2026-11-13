import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  Account,
  INITIAL_BALANCE_CENTS,
  MAX_BALANCE_CENTS,
  formatAmount,
  parseAmount,
} from './index.js';

const applicationPath = fileURLToPath(new URL('./index.js', import.meta.url));

function runApplication(input) {
  const result = spawnSync(process.execPath, [applicationPath], {
    encoding: 'utf8',
    input,
  });

  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('parses supported amounts without losing cents', () => {
  assert.equal(parseAmount('0'), 0);
  assert.equal(parseAmount('10.5'), 1_050);
  assert.equal(parseAmount('10.25'), 1_025);
  assert.equal(parseAmount('999999.99'), MAX_BALANCE_CENTS);
  assert.equal(parseAmount('1000000'), null);
});

test('rejects malformed, negative, and over-precision amounts', () => {
  for (const input of ['-1', 'abc', '1.234', '.50', '1.']) {
    assert.equal(parseAmount(input), null, `expected ${input} to be rejected`);
  }
});

test('formats cents as a fixed two-decimal amount', () => {
  assert.equal(formatAmount(0), '0.00');
  assert.equal(formatAmount(1_005), '10.05');
});

test('accounts credit and debit amounts while preserving the balance on failure', () => {
  const account = new Account();
  assert.equal(account.balanceCents, INITIAL_BALANCE_CENTS);

  assert.equal(account.credit(25_000), 125_000);
  assert.equal(account.debit(12_500), true);
  assert.equal(account.balanceCents, 112_500);

  assert.equal(account.debit(200_000), false);
  assert.equal(account.balanceCents, 112_500);
});

test('accounts reject invalid amounts and credits beyond the maximum balance', () => {
  const account = new Account(MAX_BALANCE_CENTS - 1);
  assert.throws(() => account.credit(2), RangeError);
  assert.equal(account.balanceCents, MAX_BALANCE_CENTS - 1);
  assert.throws(() => account.debit(-1), RangeError);
  assert.throws(() => new Account(MAX_BALANCE_CENTS + 1), RangeError);
});

test('displays the initial balance and exits on request', () => {
  const output = runApplication('1\n4\n');
  assert.match(output, /Current balance: 1000\.00/);
  assert.match(output, /Exiting the program\. Goodbye!/);
});

test('credits and debits amounts, including cents and the exact balance', () => {
  const output = runApplication(
    '2\n10.25\n3\n10.25\n3\n1000.00\n1\n4\n',
  );
  assert.match(output, /Amount credited\. New balance: 1010\.25/);
  assert.match(output, /Amount debited\. New balance: 1000\.00/);
  assert.match(output, /Amount debited\. New balance: 0\.00/);
  assert.match(output, /Current balance: 0\.00/);
});

test('rejects an overdraft without changing the balance', () => {
  const output = runApplication('3\n1000.01\n1\n4\n');
  assert.match(output, /Insufficient funds for this debit\./);
  assert.match(output, /Current balance: 1000\.00/);
});

test('preserves the balance across multiple operations in one run', () => {
  const output = runApplication('2\n100\n3\n25\n1\n4\n');
  assert.match(output, /Amount credited\. New balance: 1100\.00/);
  assert.match(output, /Amount debited\. New balance: 1075\.00/);
  assert.match(output, /Current balance: 1075\.00/);
});

test('accepts zero-value transactions and retries invalid amount input', () => {
  const output = runApplication('2\n0.00\n3\n0.00\n2\n-5\nabc\n1.234\n1\n4\n');
  assert.match(output, /Amount credited\. New balance: 1000\.00/);
  assert.match(output, /Amount debited\. New balance: 1000\.00/);
  assert.equal((output.match(/Invalid amount\./g) ?? []).length, 3);
  assert.match(output, /Amount credited\. New balance: 1001\.00/);
});

test('handles invalid menu choices and rejects a credit above the balance limit', () => {
  const invalidChoiceOutput = runApplication('5\n4\n');
  assert.match(invalidChoiceOutput, /Invalid choice, please select 1-4\./);

  const overflowOutput = runApplication('2\n999000.00\n1\n4\n');
  assert.match(overflowOutput, /Credit would exceed the maximum balance/);
  assert.match(overflowOutput, /Current balance: 1000\.00/);
});

test('starts a new process with the initial in-memory balance', () => {
  runApplication('2\n100\n4\n');
  const nextRunOutput = runApplication('1\n4\n');
  assert.match(nextRunOutput, /Current balance: 1000\.00/);
});
