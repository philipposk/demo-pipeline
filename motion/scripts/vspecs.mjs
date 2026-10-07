// Frames to check per scene of a timeline: early, middle, late (cards skipped). Prints stills.mjs specs.
import {readFileSync} from 'node:fs';
const tl = JSON.parse(readFileSync(`src/timelines/${process.argv[2]}.json`, 'utf8'));
const out = [];
for (const s of tl.scenes) {
  if (s.id === 'intro' || s.id === 'outro') continue;
  const end = s.length - tl.xf - 4;
  out.push(`${s.id}@16`, `${s.id}@${Math.round(end / 2)}`, `${s.id}@${end}`);
}
console.log(out.join(' '));
