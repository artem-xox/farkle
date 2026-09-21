import type { SystemOneRequest, SystemOneResponse } from './types.js';

export const DEFAULT_BASE_URL = 'https://api.typesafe.ai';
export const DEFAULT_MODEL = 'jev-latest';

/** Base class for everything this client throws, so a caller can catch one thing. */
export class JevError extends Error {
  override readonly name: string = 'JevError';
}

/** 401 — a missing, malformed or revoked key. Never retried: waiting cannot fix it. */
export class JevAuthError extends JevError {
  override readonly name = 'JevAuthError';
}

/** 4xx other than 401/429 — a request this client built wrong. Never retried. */
export class JevRequestError extends JevError {
  override readonly name = 'JevRequestError';
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** 429 or 529, still failing after every retry. */
export class JevRateLimitError extends JevError {
  override readonly name = 'JevRateLimitError';
}

/** The request never produced an HTTP response: DNS, connection reset, timeout. */
export class JevTransportError extends JevError {
  override readonly name = 'JevTransportError';
}

/** The response was not the shape `SystemOneResponse` promises. */
export class JevProtocolError extends JevError {
  override readonly name = 'JevProtocolError';
}

/** One request and whatever came back — for a transcript, a log, or a test. */
export interface JevExchange {
  readonly request: SystemOneRequest;
  readonly response?: SystemOneResponse;
  readonly error?: string;
  /** Wall clock for the whole call including retries, in milliseconds. */
  readonly ms: number;
}

/** Just enough of `fetch` to be swapped for a fake in tests. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface JevClientOptions {
  /**
   * Bearer token. Omitted, the client sends no `Authorization` header at all
   * — which is right for the browser, where the key lives in a dev proxy and
   * never reaches the bundle (see apps/web/vite.config.ts).
   */
  readonly apiKey?: string;
  /** Default `https://api.typesafe.ai`; the web app points this at its own origin. */
  readonly baseUrl?: string;
  /** Per attempt, not for the whole call. Default 20 000 ms. */
  readonly timeoutMs?: number;
  /** Retries *after* the first attempt. Default 3. */
  readonly retries?: number;
  /** First backoff delay in ms, doubled per retry. Default 400. */
  readonly backoffMs?: number;
  readonly fetch?: FetchLike;
  /** Called once per completed call, success or failure. Must not throw. */
  readonly onExchange?: (exchange: JevExchange) => void;
  /** Injected so tests don't actually wait out a backoff. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 429 is the documented rate limit and 529 "service overloaded"; 5xx is a server that may yet recover. */
function isRetryable(status: number): boolean {
  return status === 429 || status === 529 || status >= 500;
}

/**
 * `Retry-After` is either a delay in seconds or an HTTP date. Honoured when
 * present and sane, so a server that knows when it will be ready beats our
 * own guess; capped so a hostile or confused value can't park the game for an
 * hour.
 */
function retryAfterMs(header: string | null): number | null {
  if (header === null) {
    return null;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return seconds >= 0 ? Math.min(seconds * 1000, 30_000) : null;
  }
  const date = Date.parse(header);
  if (Number.isNaN(date)) {
    return null;
  }
  return Math.min(Math.max(date - Date.now(), 0), 30_000);
}

function isSystemOneResponse(value: unknown): value is SystemOneResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['model'] === 'string' &&
    typeof candidate['answers'] === 'object' &&
    candidate['answers'] !== null
  );
}

/**
 * A client for `POST /v1/systemone`, the whole TypeSafe System One API
 * (https://docs.typesafe.ai/api).
 *
 * It deliberately knows nothing about Farkle — `questions.ts` builds the
 * questions, this sends them. The one opinion it holds is about failure: a
 * bot is in the middle of somebody's turn, so a retryable status is retried
 * with backoff, and anything else fails fast and loudly enough for the policy
 * above to fall back rather than stall.
 *
 * The API key is never interpolated into an error message or an exchange
 * record. A transcript of a losing match is exactly the kind of file that
 * gets pasted into an issue.
 */
export class JevClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly backoffMs: number;
  private readonly doFetch: FetchLike;
  private readonly onExchange: ((exchange: JevExchange) => void) | undefined;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: JevClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.retries = options.retries ?? 3;
    this.backoffMs = options.backoffMs ?? 400;
    this.doFetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.onExchange = options.onExchange;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async systemOne(request: SystemOneRequest): Promise<SystemOneResponse> {
    const started = Date.now();
    try {
      const response = await this.attempt(request);
      this.onExchange?.({ request, response, ms: Date.now() - started });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.onExchange?.({ request, error: message, ms: Date.now() - started });
      throw error;
    }
  }

  private async attempt(request: SystemOneRequest): Promise<SystemOneResponse> {
    const url = `${this.baseUrl}/v1/systemone`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey !== undefined) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    const body = JSON.stringify(request);

    let lastRetryable = '';

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) {
        await this.sleep(this.backoffMs * 2 ** (attempt - 1));
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await this.doFetch(url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });
      } catch (error) {
        // An abort is our own timeout firing; anything else is the network.
        const aborted = controller.signal.aborted;
        lastRetryable = aborted
          ? `timed out after ${this.timeoutMs}ms`
          : `request failed: ${error instanceof Error ? error.message : String(error)}`;
        continue;
      } finally {
        clearTimeout(timer);
      }

      if (response.ok) {
        // A 200 whose body will not parse is a protocol failure like any
        // other, not a raw SyntaxError escaping into a game loop.
        let parsed: unknown;
        try {
          parsed = await response.json();
        } catch {
          throw new JevProtocolError('TypeSafe returned 200 with a body that is not JSON');
        }
        if (!isSystemOneResponse(parsed)) {
          throw new JevProtocolError('response was not a System One result');
        }
        return parsed;
      }

      if (response.status === 401) {
        throw new JevAuthError(
          'TypeSafe rejected the API key (401) — check TYPESAFE_API_KEY',
        );
      }
      if (!isRetryable(response.status)) {
        throw new JevRequestError(
          `TypeSafe returned ${response.status}: ${await safeBody(response)}`,
          response.status,
        );
      }

      lastRetryable = `HTTP ${response.status}`;
      const wait = retryAfterMs(response.headers.get('Retry-After'));
      if (wait !== null && attempt < this.retries) {
        await this.sleep(wait);
      }
    }

    const attempts = this.retries + 1;
    if (lastRetryable.startsWith('HTTP')) {
      throw new JevRateLimitError(
        `TypeSafe unavailable after ${attempts} attempts (last: ${lastRetryable})`,
      );
    }
    throw new JevTransportError(
      `TypeSafe unreachable after ${attempts} attempts (last: ${lastRetryable})`,
    );
  }
}

/** An error body is a diagnostic, never a reason to fail harder than we already are. */
async function safeBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return '<no body>';
  }
}
