import { createInterface, type Interface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

/**
 * A promise-returning line prompt.
 *
 * Deliberately does not use `readline.question()` in a call-await-call loop.
 * That pattern registers a fresh one-shot 'line' listener only after the
 * previous answer resolves — fine when a human is typing, since keystrokes are
 * paced, but wrong the moment several lines arrive in the same chunk (a
 * multi-line paste, or piped/redirected input): the extra lines are parsed and
 * emitted as 'line' events before the next `question()` call has registered its
 * listener, and are silently dropped. Keeping one permanent 'line' listener and
 * a queue makes every line reach its `ask()` call regardless of pacing.
 *
 * Also avoids `readline/promises`, which arrived in Node 17 — this toolchain
 * still targets Node 16.
 */
export class Prompt {
  private readonly rl: Interface;
  private closed = false;
  private readonly buffered: string[] = [];
  private readonly waiting: ((line: string | null) => void)[] = [];

  constructor(
    input: Readable = process.stdin,
    private readonly output: Writable = process.stdout,
  ) {
    this.rl = createInterface({ input, output });
    this.rl.on('line', (line) => {
      const waiter = this.waiting.shift();
      if (waiter) {
        waiter(line);
      } else {
        this.buffered.push(line);
      }
    });
    this.rl.on('close', () => {
      this.closed = true;
      while (this.waiting.length > 0) {
        this.waiting.shift()!(null);
      }
    });
  }

  /** Resolves to null once the input stream closes (Ctrl-D or EOF). */
  ask(question: string): Promise<string | null> {
    this.output.write(question);
    const queued = this.buffered.shift();
    if (queued !== undefined) {
      return Promise.resolve(queued);
    }
    if (this.closed) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  close(): void {
    this.rl.close();
  }
}
