// Scene selection + ordering. Lets a render include all features, a preset
// subset, or an explicit hand-picked, reordered list.
//
// Each scene may declare metadata (all optional):
//   id        stable key referenced by CLI (default: `s<index>`)
//   title     human label (default: first 6 words of narration)
//   tags      string[]   (e.g. ['core'])
//   priority  0-100      (default 50) — drives 'highlights'
//   order     sort key   (default index*10)
//
// Presets (cfg.presets can override): 'full' | 'highlights' | 'basic'.

/** Attach defaults + original index to each scene. */
function normalize(scenes) {
  return scenes.map((s, i) => ({
    ...s,
    _i: i,
    id: s.id || `s${i}`,
    title: s.title || s.narration.split(/\s+/).slice(0, 6).join(' '),
    tags: s.tags || [],
    priority: s.priority ?? 50,
    order: s.order ?? i * 10,
  }));
}

/** Evenly-spaced pick of n items from an array (keeps first + last). */
function spread(arr, n) {
  if (n >= arr.length) return arr.slice();
  if (n <= 1) return [arr[0]];
  const out = [];
  for (let k = 0; k < n; k++) {
    out.push(arr[Math.round((k * (arr.length - 1)) / (n - 1))]);
  }
  return [...new Map(out.map((s) => [s.id, s])).values()];
}

/** Resolve a preset name → subset of normalized scenes (catalog order). */
function applyPreset(all, preset, cfgPresets) {
  // Project-defined preset wins.
  const def = cfgPresets?.[preset];
  if (def) {
    if (def.include === '*') return all.slice();
    if (Array.isArray(def.scenes)) return all.filter((s) => def.scenes.includes(s.id));
    if (typeof def.minPriority === 'number') return all.filter((s) => s.priority >= def.minPriority);
    if (Array.isArray(def.tags)) return all.filter((s) => s.tags.some((t) => def.tags.includes(t)));
  }
  switch (preset) {
    case 'full':
      return all.slice();
    case 'highlights': {
      const byPrio = all.filter((s) => s.priority >= 70);
      if (byPrio.length) return byPrio;
      return spread(all, Math.max(2, Math.ceil(all.length / 2))); // fallback spread
    }
    case 'basic': {
      const core = all.filter((s) => s.tags.includes('core') || s.priority >= 90);
      if (core.length) return core;
      return spread(all, Math.min(3, all.length)); // first / middle / last
    }
    default:
      return all.slice();
  }
}

/**
 * @param {Array} scenes  raw cfg.scenes
 * @param {object} flags  { preset, scenes:csv, exclude:csv, order:csv }
 * @param {object} cfg    project config (for cfg.presets)
 * @returns {{ selected:Array, summary:string }}
 */
export function resolveScenes(scenes, flags, cfg = {}) {
  const all = normalize(scenes);
  const byId = new Map(all.map((s) => [s.id, s]));

  // 1. Base selection from preset.
  let sel = applyPreset(all, flags.preset || 'full', cfg.presets);

  // 2. Explicit --scenes overrides the set entirely.
  if (flags.scenes) {
    const ids = String(flags.scenes).split(',').map((x) => x.trim()).filter(Boolean);
    sel = ids.map((id) => byId.get(id)).filter(Boolean);
  }

  // 3. --exclude drops ids.
  if (flags.exclude) {
    const ex = new Set(String(flags.exclude).split(',').map((x) => x.trim()));
    sel = sel.filter((s) => !ex.has(s.id));
  }

  // 4. Ordering: --order first (explicit), then remaining by `order` field.
  if (flags.order) {
    const want = String(flags.order).split(',').map((x) => x.trim()).filter(Boolean);
    const head = want.map((id) => byId.get(id)).filter((s) => s && sel.includes(s));
    const headIds = new Set(head.map((s) => s.id));
    const tail = sel.filter((s) => !headIds.has(s.id)).sort((a, b) => a.order - b.order);
    sel = [...head, ...tail];
  } else {
    sel = sel.slice().sort((a, b) => a.order - b.order);
  }

  const summary = sel
    .map((s, i) => `  ${i + 1}. ${s.id.padEnd(16)} p${s.priority}  ${s.title}`)
    .join('\n');
  return { selected: sel, summary };
}
