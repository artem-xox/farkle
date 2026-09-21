import { describe, expect, it } from 'vitest';

import {
  JevAuthError,
  JevClient,
  JevProtocolError,
  JevRateLimitError,
  JevRequestError,
  JevTransportError,
  type FetchLike,
  type SystemOneRequest,
} from '@farkle/jev';

const REQUEST: SystemOneRequest = {
  state: 'a match in progress',
  model: 'jev-latest',
  questions: { press: { type: 'noul', instructions: 'throwing again is better' } },
};

const OK_BODY = {
  model: 'jev-1.13.0',
  answers: { press: { type: 'noul', noul: 0.8 } },
  usage: { input_tokens: 400, output_tokens: 3 },
};

interface Recorder {
  readonly calls: { url: string; init: RequestInit }[];
  readonly waits: number[];
}

/** A `fetch` that replays a scripted list of responses, and remembers what it was asked. */
function scripted(responses: (Response | Error)[]): { fetch: FetchLike; recorder: Recorder } {
  const recorder: Recorder = { calls: [], waits: [] };
  let index = 0;
  const fetch: FetchLike = async (url, init) => {
    recorder.calls.push({ url, init });
    const next = responses[Math.min(index++, responses.length - 1)]!;
    if (next instanceof Error) {
      throw next;
    }
    return next;
  };
  return { fetch, recorder };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers });

function clientFor(responses: (Response | Error)[], overrides = {}) {
  const { fetch, recorder } = scripted(responses);
  const client = new JevClient({
    apiKey: 'sk-test-secret',
    fetch,
    backoffMs: 1,
    sleep: async (ms) => {
      recorder.waits.push(ms);
    },
    ...overrides,
  });
  return { client, recorder };
}

describe('JevClient', () => {
  it('posts to /v1/systemone with the bearer token and returns the parsed answer', async () => {
    const { client, recorder } = clientFor([json(OK_BODY)]);
    const response = await client.systemOne(REQUEST);

    expect(response.answers['press']).toEqual({ type: 'noul', noul: 0.8 });
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]!.url).toBe('https://api.typesafe.ai/v1/systemone');
    const headers = recorder.calls[0]!.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-test-secret');
    expect(JSON.parse(String(recorder.calls[0]!.init.body))).toEqual(REQUEST);
  });

  it('sends no Authorization header when it has no key — the browser proxies instead', async () => {
    const { client, recorder } = clientFor([json(OK_BODY)], { apiKey: undefined });
    await client.systemOne(REQUEST);
    expect(recorder.calls[0]!.init.headers).not.toHaveProperty('Authorization');
  });

  it('retries a 429 with doubling backoff and succeeds when the server recovers', async () => {
    const { client, recorder } = clientFor([json({}, 429), json({}, 429), json(OK_BODY)]);
    await expect(client.systemOne(REQUEST)).resolves.toMatchObject({ model: 'jev-1.13.0' });
    expect(recorder.calls).toHaveLength(3);
    expect(recorder.waits).toEqual([1, 2]);
  });

  it('retries a 529, which is how TypeSafe reports being overloaded', async () => {
    const { client, recorder } = clientFor([json({}, 529), json(OK_BODY)]);
    await expect(client.systemOne(REQUEST)).resolves.toBeDefined();
    expect(recorder.calls).toHaveLength(2);
  });

  it('honours Retry-After over its own backoff', async () => {
    const { client, recorder } = clientFor([json({}, 429, { 'Retry-After': '2' }), json(OK_BODY)]);
    await client.systemOne(REQUEST);
    expect(recorder.waits).toContain(2000);
  });

  it('gives up on a rate limit that never clears, saying how many attempts it made', async () => {
    const { client, recorder } = clientFor([json({}, 429)], { retries: 2 });
    await expect(client.systemOne(REQUEST)).rejects.toThrow(JevRateLimitError);
    expect(recorder.calls).toHaveLength(3);
  });

  it('never retries a 401 — no amount of waiting fixes a bad key', async () => {
    const { client, recorder } = clientFor([json({ error: 'unauthorized' }, 401)]);
    await expect(client.systemOne(REQUEST)).rejects.toThrow(JevAuthError);
    expect(recorder.calls).toHaveLength(1);
  });

  it('never retries a 422 — a malformed question stays malformed', async () => {
    const { client, recorder } = clientFor([json({ error: 'bad question' }, 422)]);
    await expect(client.systemOne(REQUEST)).rejects.toThrow(JevRequestError);
    expect(recorder.calls).toHaveLength(1);
  });

  it('retries a dropped connection and reports it as transport, not as rate limiting', async () => {
    const { client, recorder } = clientFor([new TypeError('fetch failed')], { retries: 1 });
    await expect(client.systemOne(REQUEST)).rejects.toThrow(JevTransportError);
    expect(recorder.calls).toHaveLength(2);
  });

  it('rejects a body that is not a System One result rather than handing back nonsense', async () => {
    const { client } = clientFor([json({ nope: true })]);
    await expect(client.systemOne(REQUEST)).rejects.toThrow(JevProtocolError);
  });

  it('turns an unparseable 200 into a protocol error, not a raw SyntaxError', async () => {
    const { client } = clientFor([new Response('<html>gateway</html>', { status: 200 })]);
    await expect(client.systemOne(REQUEST)).rejects.toThrow(JevProtocolError);
  });

  it('keeps the API key out of every error it throws', async () => {
    // A transcript or a stack trace from a losing match is exactly what gets
    // pasted into an issue.
    for (const response of [json({ error: 'nope' }, 401), json({ error: 'nope' }, 422), json({}, 429)]) {
      const { client } = clientFor([response], { retries: 0 });
      const error = await client.systemOne(REQUEST).catch((thrown: unknown) => thrown);
      expect(String(error)).not.toContain('sk-test-secret');
    }
  });

  it('reports every call to onExchange, failures included', async () => {
    const seen: { ok: boolean }[] = [];
    const { client } = clientFor([json(OK_BODY)], {
      onExchange: (exchange: { response?: unknown }) => seen.push({ ok: exchange.response !== undefined }),
    });
    await client.systemOne(REQUEST);

    const { client: failing } = clientFor([json({}, 422)], {
      onExchange: (exchange: { response?: unknown }) => seen.push({ ok: exchange.response !== undefined }),
    });
    await failing.systemOne(REQUEST).catch(() => undefined);

    expect(seen).toEqual([{ ok: true }, { ok: false }]);
  });

  it('aborts an attempt that outlives the timeout, and reports it as one', async () => {
    const slow: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const client = new JevClient({
      apiKey: 'sk-test-secret',
      fetch: slow,
      timeoutMs: 5,
      retries: 0,
      sleep: async () => undefined,
    });

    const error = await client.systemOne(REQUEST).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(JevTransportError);
    expect(String(error)).toContain('timed out');
  });
});
