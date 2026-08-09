import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { Prompt } from '../src/prompt.js';

function harness() {
  const input = new PassThrough();
  const output = new PassThrough();
  let written = '';
  output.on('data', (chunk) => {
    written += chunk.toString();
  });
  return { input, prompt: new Prompt(input, output), writtenSoFar: () => written };
}

describe('Prompt', () => {
  it('answers a single question', async () => {
    const { input, prompt } = harness();
    const answer = prompt.ask('name? ');
    input.write('Alice\n');
    expect(await answer).toBe('Alice');
    prompt.close();
  });

  it(
    'delivers every line to its own ask() call when several arrive in one chunk — ' +
      'the bug this class exists to avoid: a naive question()-then-await loop drops ' +
      'lines that arrive before the next question() is registered',
    async () => {
      const { input, prompt } = harness();
      input.write('one\ntwo\nthree\n');

      expect(await prompt.ask('a? ')).toBe('one');
      expect(await prompt.ask('b? ')).toBe('two');
      expect(await prompt.ask('c? ')).toBe('three');
      prompt.close();
    },
  );

  it('queues lines that arrive before anyone asks for them', async () => {
    const { input, prompt } = harness();
    input.write('early\n');
    // Give the 'line' event a tick to fire before the first ask().
    await new Promise((resolve) => setImmediate(resolve));

    expect(await prompt.ask('a? ')).toBe('early');
    prompt.close();
  });

  it('resolves pending and future asks to null once the stream closes', async () => {
    const { input, prompt } = harness();
    const pending = prompt.ask('a? ');
    input.end();
    expect(await pending).toBeNull();
    expect(await prompt.ask('b? ')).toBeNull();
  });

  it('writes the question text before waiting for an answer', async () => {
    const { input, prompt, writtenSoFar } = harness();
    const answer = prompt.ask('pick one: ');
    expect(writtenSoFar()).toBe('pick one: ');
    input.write('x\n');
    await answer;
    prompt.close();
  });
});
