// Privacy masking inside the recorded page, before any pixel reaches the video.
// Works in every mode (simple / zoom / short) and survives SPA navigation.
//
// Blurs:
//   - elements matching CSS `selectors`
//   - any element whose own text contains an email address or matches `patterns`
//   - inputs / textareas whose value matches
//
// It only ADDS a data attribute to existing elements — it never rewrites text
// nodes — so frameworks like React keep a consistent DOM. Once blurred, an
// element stays blurred (fail-safe) even if its text later changes.
//
// Project config:
//   mask: {
//     emails: true,                        // default true
//     patterns: ['\\b\\d{6}-\\d{4}\\b'],   // extra regex sources (case-insensitive)
//     selectors: ['[data-private]'],       // always blur these
//     blurPx: 8,
//   }
// CLI: --mask=off disables it (e.g. for an internal review cut).

const EMAIL = '[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}';
// Identity-provider user ids, e.g. "auth0|65f…", "google-oauth2|1098…".
const IDP_USER_ID = '\\b(?:auth0|google-oauth2|linkedin|windowslive|samlp|oauth2)\\|[A-Za-z0-9_-]{4,}';

/** Normalise project config → serialisable options for the page script (or null = off). */
export function resolveMask(cfgMask, flag) {
  if (!cfgMask || flag === 'off') return null;
  const patterns = [...(cfgMask.patterns || [])];
  if (cfgMask.emails !== false) patterns.push(EMAIL);
  if (cfgMask.userIds !== false) patterns.push(IDP_USER_ID);
  return {
    patterns,
    selectors: cfgMask.selectors || [],
    blurPx: cfgMask.blurPx ?? 8,
  };
}

/** Runs inside the page (Playwright addInitScript). Must be self-contained. */
export function maskInitScript(opts) {
  const ATTR = 'data-demo-mask';
  const blur = `filter:blur(${opts.blurPx}px)!important;`;
  const rules = [`[${ATTR}]{${blur}}`];
  if (opts.selectors.length) rules.push(`${opts.selectors.join(',')}{${blur}}`);
  const style = document.createElement('style');
  style.textContent = rules.join('\n');
  // Init scripts run before <html> exists, so mount as soon as there is a host.
  const mountStyle = () => {
    const host = document.head || document.documentElement;
    if (host && !style.isConnected) host.appendChild(style);
  };

  const res = opts.patterns.map((p) => new RegExp(p, 'i'));
  const hit = (s) => !!s && res.some((r) => r.test(s));
  const HIDDEN = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE|HEAD|META)$/;
  const mark = (el) => {
    if (el && el.nodeType === 1 && !HIDDEN.test(el.tagName) && !el.hasAttribute(ATTR) && !String(el.id).startsWith('__demo')) {
      el.setAttribute(ATTR, '');
    }
  };
  const checkText = (node) => { if (hit(node.nodeValue)) mark(node.parentElement); };
  const scan = (root) => {
    if (!root) return;
    if (root.nodeType === 3) { checkText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) checkText(n);
    if (root.querySelectorAll) root.querySelectorAll('input,textarea').forEach((el) => { if (hit(el.value)) mark(el); });
  };

  const obs = new MutationObserver((muts) => {
    mountStyle();
    for (const m of muts) {
      if (m.type === 'characterData') checkText(m.target);
      else m.addedNodes.forEach(scan);
    }
  });
  // Observe the document node itself (valid even before <html> exists) so text is
  // caught from the first parsed node, not only after DOMContentLoaded.
  obs.observe(document, { childList: true, subtree: true, characterData: true });
  mountStyle();
  if (document.readyState !== 'loading') scan(document.body);
  document.addEventListener('DOMContentLoaded', () => { mountStyle(); scan(document.body); });

  // Framework-controlled input values change without DOM mutations.
  const checkInput = (e) => { const t = e.target; if (t && 'value' in t && hit(t.value)) mark(t); };
  addEventListener('input', checkInput, true);
  addEventListener('change', checkInput, true);
  setInterval(() => document.querySelectorAll('input,textarea').forEach((el) => { if (hit(el.value)) mark(el); }), 300);
}
