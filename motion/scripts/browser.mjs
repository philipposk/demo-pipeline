// Finds a Chrome Headless Shell that Playwright already downloaded, so Remotion does not fetch its own.
// REMOTION_BROWSER=<path> overrides. Returns undefined when nothing is found; Remotion then downloads its own browser.
import {existsSync, readdirSync} from 'node:fs';
import {homedir, platform, arch} from 'node:os';
import {join} from 'node:path';

export const findBrowser = () => {
  if (process.env.REMOTION_BROWSER) return process.env.REMOTION_BROWSER;
  const os = platform();
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH
    || (os === 'darwin' ? join(homedir(), 'Library/Caches/ms-playwright')
      : os === 'win32' ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'), 'ms-playwright')
        : join(homedir(), '.cache/ms-playwright'));
  if (!existsSync(cache)) return undefined;
  const sub = os === 'darwin' ? (arch() === 'arm64' ? 'chrome-headless-shell-mac-arm64' : 'chrome-headless-shell-mac-x64')
    : os === 'win32' ? 'chrome-headless-shell-win64' : 'chrome-headless-shell-linux64';
  const bin = os === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
  return readdirSync(cache)
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .sort()
    .map((d) => join(cache, d, sub, bin))
    .filter((p) => existsSync(p))
    .pop();
};
