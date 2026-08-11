import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

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

export default defineConfig({
  plugins: [react(), siteEnv(), devCsp()],
  resolve: {
    alias: {
      // Resolve straight to source rather than each package's `dist/`, so
      // the web app never needs a prior `tsc` build of the engine or bots to
      // run in dev, and picks up source edits instantly. Vite/esbuild
      // compiles these on the fly, same as apps/web's own .ts/.tsx files.
      '@farkle/engine': resolvePackage('../../packages/engine/src/index.ts'),
      '@farkle/bots': resolvePackage('../../packages/bots/src/index.ts'),
    },
  },
});
