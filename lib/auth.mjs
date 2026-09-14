// Session reuse for apps behind a login — without the pipeline ever touching a
// password. A one-time `login` command opens a real (headed) browser, the human
// logs in themselves, and we save Playwright's storageState (cookies +
// localStorage) to a git-ignored file. Renders then start already logged in.
//
//   node pipeline.mjs login <project>     # once (and again when the session expires)
//   node pipeline.mjs <project> ...       # reuses .auth/<project>.json
//
// Project config:
//   auth: {
//     loginUrl:     'https://app.example.com/',       // where the login window opens
//     successUrl:   /\/dashboard\//,                   // URL that means "logged in"
//     loggedOutUrl: /\/u\/login|\/authorize/,          // URL that means "session expired"
//     readySelector:'[data-app-ready]',                // element that means "app loaded"
//     tokenKey:     /^@@auth0spajs@@/,                 // optional sanity check on saved localStorage keys
//     storageState: '.auth/<project>.json',            // optional override
//   }
//
// The saved file holds live session tokens: it is chmod 600, git-ignored, and
// never printed. After each render the (possibly refreshed) session is written
// back, so apps that rotate refresh tokens keep working run after run.

import { chromium } from 'playwright';
import { existsSync, mkdirSync, chmodSync, readFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

export function statePathFor(cfg, slug, rootDir) {
  const p = cfg.auth?.storageState || path.join('.auth', `${slug}.json`);
  return path.isAbsolute(p) ? p : path.join(rootDir, p);
}

/** A render needs the saved session unless every selected scene is tagged 'public'. */
export function needsAuth(cfg, selected) {
  if (!cfg.auth) return false;
  return selected.some((s) => !(s.tags || []).includes('public'));
}

function lockDown(file) {
  try { chmodSync(file, 0o600); } catch {}
}

/** Summarise a saved state without revealing any values. */
function describeState(file, tokenKey) {
  const st = JSON.parse(readFileSync(file, 'utf8'));
  const keys = (st.origins || []).flatMap((o) => (o.localStorage || []).map((kv) => kv.name));
  const hasToken = tokenKey ? keys.some((k) => tokenKey.test(k)) : null;
  return { cookies: (st.cookies || []).length, origins: (st.origins || []).length, hasToken };
}

function waitForEnter(prompt) {
  if (!process.stdin.isTTY) return new Promise(() => {}); // non-interactive: rely on URL detection
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, () => { rl.close(); resolve('enter'); }));
}

/**
 * Open a headed browser on the login page and wait for the human to finish.
 * Saves storageState to `statePath`. Never reads, fills or stores credentials.
 */
export async function login(cfg, statePath) {
  const auth = cfg.auth || {};
  const loginUrl = auth.loginUrl || cfg.url;
  mkdirSync(path.dirname(statePath), { recursive: true });

  // Real Chrome when installed (Google/LinkedIn sign-in often refuses Playwright's
  // bundled Chromium as "not secure"), else bundled Chromium. Hide the
  // automation banner for the same reason.
  const launchOpts = {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled'],
  };
  let browser;
  try {
    browser = await chromium.launch({ ...launchOpts, channel: 'chrome' });
  } catch {
    browser = await chromium.launch(launchOpts);
  }
  const { viewport: _ignored, ...ctxOpts } = cfg.contextOptions || {};
  const context = await browser.newContext({ viewport: null, ...ctxOpts });
  const page = await context.newPage();
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

  console.log(`
  A browser window is open on ${loginUrl}
  1. Log in yourself (this tool never sees or stores your password).
     Use the DEMO fund account, not a customer's.
  2. Dismiss any one-off popups (onboarding, surveys) — that choice is saved too.
  3. ${auth.successUrl ? `It saves automatically once the URL matches ${auth.successUrl}, or press Enter here.` : 'Press Enter here when you see the logged-in app.'}
`);

  const closed = new Promise((resolve) => browser.once('disconnected', () => resolve('closed')));
  const reached = auth.successUrl
    ? page.waitForURL(auth.successUrl, { timeout: 0 }).then(() => 'url').catch(() => new Promise(() => {}))
    : new Promise(() => {});
  const how = await Promise.race([reached, waitForEnter('  Press Enter to save the session… '), closed]);

  if (how === 'closed') {
    console.error('Browser closed before the session was saved. Nothing written.');
    process.exit(1);
  }
  // Let the SPA finish its redirect callback and persist tokens.
  await page.waitForTimeout(how === 'url' ? 3000 : 1000);
  await context.storageState({ path: statePath });
  lockDown(statePath);
  await browser.close();

  const d = describeState(statePath, auth.tokenKey);
  console.log(`  Saved session → ${path.relative(process.cwd(), statePath)}  (${d.cookies} cookies, ${d.origins} origins)`);
  if (d.hasToken === false) {
    console.warn('  Warning: no login token found in the saved state. Did the login finish? Re-run login if renders bounce to the login page.');
  }
  process.exit(0);
}

/**
 * Used as record()'s beforeScenes hook: fail fast with a clear message when the
 * saved session has expired, instead of recording a video of the login page.
 */
export async function assertLoggedIn(page, auth, loginCmd) {
  const deadline = Date.now() + (auth.readyTimeoutMs ?? 30000);
  const expired = () => new Error(`Saved session is no longer valid (landed on ${new URL(page.url()).host}). Run: ${loginCmd}`);
  while (Date.now() < deadline) {
    if (auth.loggedOutUrl && auth.loggedOutUrl.test(page.url())) throw expired();
    if (auth.readySelector) {
      if (await page.locator(auth.readySelector).first().isVisible().catch(() => false)) return;
    } else if (auth.successUrl && auth.successUrl.test(page.url())) {
      return;
    }
    await page.waitForTimeout(250);
  }
  if (auth.loggedOutUrl && auth.loggedOutUrl.test(page.url())) throw expired();
  throw new Error(`App did not finish loading within ${(auth.readyTimeoutMs ?? 30000) / 1000}s (waiting for ${auth.readySelector || auth.successUrl}). If it shows a login page, run: ${loginCmd}`);
}

export function stateExists(statePath) {
  return existsSync(statePath);
}

export { lockDown };
