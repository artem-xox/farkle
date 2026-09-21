import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite';

const resolvePackage = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

// The document CSP in index.html is written for what we actually ship. Dev is
// served differently and trips two directives that the build never does:
//   - CSS arrives as JS that injects a <style> tag rather than as a stylesheet,
//     so `style-src 'self'` blocks every rule and the app renders unstyled.
//   - Vite polls for a server restart from a blob: worker, which falls back to
//     `script-src 'self'` and never reconnects.
// Relax exactly those two for `vite dev`; the built index.html stays strict.
const devCsp = (): Plugin => ({
  name: 'farkle-dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) =>
    html.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'; worker-src 'self' blob:"),
});

// Two deployments serve this same build from two origins — farkle-prod on
// farkle.iamxox.space and farkle-dev on its ondigitalocean.app hostname — and
// three tags have to name the origin absolutely: og:url, og:image (relative
// image URLs are not resolved by most scrapers) and canonical. So the origin
// arrives as a build-time env var, set per app in .do/app.{dev,prod}.yaml, and
// is substituted into %SITE_URL% placeholders here. The placeholder is not
// Vite's own `%VITE_*%` mechanism: this runs `enforce: 'pre'` and does the
// replacement itself, so the var needs no VITE_ prefix and a missing value is
// a build failure rather than a literal `%SITE_URL%` shipped inside a meta tag.
//
// robots.txt is generated rather than checked in for the same reason. Prod
// alone sets SITE_INDEXABLE; everywhere else emits a blanket disallow, so the
// dev hostname doesn't compete with the real domain in search results. The
// canonical tag is the other half of that: App Platform cannot issue redirects,
// so prod stays reachable at *both* farkle.iamxox.space and its
// ondigitalocean.app hostname no matter what, and the tag is the only way to
// say which of the two is the real one.
//
// Both defaults are chosen so that forgetting to set anything fails safe. An
// unset SITE_URL yields the production origin, because a canonical pointing at
// prod is what every other origin should be saying anyway — whereas a build
// that hard-errored would break `npm run play`, the `dice:*` scripts and CI's
// build check, all of which build the web app without caring about meta tags.
// An unset SITE_INDEXABLE disallows crawling, so a new deployment can only ever
// fail closed into invisibility rather than open into duplicate content.
const PRODUCTION_ORIGIN = 'https://farkle.iamxox.space';

/*
 * Jev plays over TypeSafe's API, which needs a bearer token — and this app
 * ships as static files with no server of its own (DESIGN.md §3), so there is
 * nowhere on the public site to keep one. Putting it in a `VITE_`-prefixed
 * variable would inline it into the bundle for anyone to read.
 *
 * So the dev server proxies instead. `TYPESAFE_API_KEY` is read here, in the
 * Vite node process, and attached to requests as they leave for the API; the
 * browser only ever calls `/jev/...` on its own origin. Three things follow,
 * all of them wanted:
 *
 *   - no key reaches the bundle, in dev or anywhere else;
 *   - no CORS question, because nothing is cross-origin from the page's side;
 *   - the strict `connect-src 'self'` CSP in index.html needs no exception,
 *     and a production build has no `/jev` route at all — so Jev cannot work
 *     on the deployed site even by accident. That is the intended limit until
 *     there is a real back end to hold a key (PLAN.md M8).
 *
 * `__JEV_ENABLED__` is the only thing the client learns from this: a boolean
 * saying whether the proxy is there. The UI offers Jev as an opponent when it
 * is true and hides it otherwise.
 */
const JEV_PROXY_PREFIX = '/jev';
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const jevProxy = (mode: string): Record<string, ProxyOptions> | undefined => {
  // `loadEnv` with an empty prefix reads unprefixed variables too, and reads
  // them *here* rather than into `import.meta.env` — only `VITE_`-prefixed
  // ones ever reach the client. Pointed at the repository root so one
  // gitignored `.env` (see .env.template) serves this and the CLI alike,
  // rather than a second copy under apps/web.
  const key = loadEnv(mode, REPO_ROOT, '')['TYPESAFE_API_KEY'] ?? process.env.TYPESAFE_API_KEY;
  if (key === undefined || key === '') {
    return undefined;
  }
  return {
    [JEV_PROXY_PREFIX]: {
      target: 'https://api.typesafe.ai',
      changeOrigin: true,
      headers: { Authorization: `Bearer ${key}` },
      rewrite: (path: string) => path.replace(new RegExp(`^${JEV_PROXY_PREFIX}`), ''),
    },
  };
};

const siteEnv = (): Plugin => {
  const siteUrl = (process.env.SITE_URL || PRODUCTION_ORIGIN).replace(/\/+$/, '');
  return {
    name: 'farkle-site-env',
    enforce: 'pre',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
    generateBundle() {
      const indexable = process.env.SITE_INDEXABLE === 'true';
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: indexable ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n',
      });
    },
  };
};

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), siteEnv(), devCsp()],
  // Only ever true for `vite dev` with a key present — `vite build` never
  // reads the proxy, so the opponent cannot appear in a deployed bundle.
  define: {
    __JEV_ENABLED__: JSON.stringify(command === 'serve' && jevProxy(mode) !== undefined),
  },
  server: { proxy: jevProxy(mode) },
  resolve: {
    alias: {
      // Resolve straight to source rather than each package's `dist/`, so
      // the web app never needs a prior `tsc` build of the engine or bots to
      // run in dev, and picks up source edits instantly. Vite/esbuild
      // compiles these on the fly, same as apps/web's own .ts/.tsx files.
      '@farkle/engine': resolvePackage('../../packages/engine/src/index.ts'),
      '@farkle/bots': resolvePackage('../../packages/bots/src/index.ts'),
      '@farkle/jev': resolvePackage('../../packages/jev/src/index.ts'),
    },
  },
}));
