import {Config} from '@remotion/cli/config';
import {findBrowser} from './scripts/browser.mjs';

// Reuse Playwright's Chrome Headless Shell when it is installed (set REMOTION_BROWSER to point at another one);
// otherwise Remotion downloads its own on the first render.
const browser = findBrowser();
if (browser) Config.setBrowserExecutable(browser);

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setConcurrency(4);
Config.setCodec('h264');
Config.setCrf(16);
Config.setPixelFormat('yuv420p');
Config.setOverwriteOutput(true);
