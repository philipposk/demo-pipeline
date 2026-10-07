import {FocusMap} from '../vertical';

// Phone cut: camera keys per scene id, in 1920x1080 stage pixels ({x, y, z}), each optionally landing on a spoken word (`at`).
// The first key is the scene's opening framing. Keys whose word is not in a script's line are skipped.
export const VFOCUS: FocusMap = {
  hook: [{x: 960, y: 570, z: 0.8}],
  add: [{x: 960, y: 540, z: 0.86}, {x: 960, y: 580, z: 0.88, at: 'lands'}],
  done: [{x: 960, y: 540, z: 0.9}, {x: 960, y: 540, z: 0.88, at: 'acme', exact: true}],
};

// Scenes whose narration is already big on-screen text (no word captions), and scenes that show the logo large (no header).
export const NO_CAPTIONS: string[] = [];
export const NO_HEADER = ['hook', 'done'];
