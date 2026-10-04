/**
 * Pure policy and validation. Classic script on purpose: the identical code runs
 * in isolated content worlds, the module service worker, and Node's test runner.
 * No Chrome APIs, DOM, I/O, or clock access in this module.
 */
(() => {
  'use strict';
  const DEFAULTS = Object.freeze({
    schemaVersion: 1, enabled: true, protectPinned: true,
    mode: 'strict', foreground: true, placement: 'nearby', destination: 'current-window',
    branchHashes: false, protectGetForms: false, recovery: false,
    rules: []
  });
  const MODES = ['strict', 'same-origin', 'home'];
  const MAX_URL = 16384;
  function webUrl(input) {
    if (typeof input !== 'string' || input.length > MAX_URL) return null;
    try {
      const u = new URL(input);
      return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u : null;
    } catch { return null; }
  }
  function supported(input) {
    const u = webUrl(input);
    return !!u && u.hostname !== 'chromewebstore.google.com' &&
      !(u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore'));
  }
  function fragmentOnly(a, b) {
    const x = webUrl(a), y = webUrl(b);
    return !!x && !!y && x.origin === y.origin && x.pathname === y.pathname &&
      x.search === y.search && (x.hash !== y.hash || b.includes('#'));
  }
  function normalizeOrigin(input) {
    const u = webUrl(input);
    if (!u) throw new Error('Enter a full http:// or https:// address, without a username or password.');
    return u.origin;
  }
  function validateSettings(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Settings must be an object.');
    if (input.schemaVersion !== undefined && input.schemaVersion !== 1) throw new Error('This settings file uses an unsupported version.');
    const out = {...DEFAULTS, rules: []};
    for (const key of ['enabled', 'protectPinned', 'foreground', 'branchHashes', 'protectGetForms', 'recovery']) {
      if (input[key] !== undefined) {
        if (typeof input[key] !== 'boolean') throw new Error(`Invalid setting: ${key}`);
        out[key] = input[key];
      }
    }
    if (input.mode !== undefined) {
      if (!MODES.includes(input.mode)) throw new Error('Unknown protection mode.');
      out.mode = input.mode;
    }
    if (input.destination !== undefined) {
      if (!['current-window','new-window','browsing-window'].includes(input.destination)) throw new Error('Unknown link destination.');
      out.destination = input.destination;
    }
    if (input.placement !== undefined) {
      if (!['nearby', 'end'].includes(input.placement)) throw new Error('Unknown tab placement.');
      out.placement = input.placement;
    }
    if (input.rules !== undefined) {
      if (!Array.isArray(input.rules) || input.rules.length > 200) throw new Error('Use at most 200 site rules.');
      const seen = new Set();
      out.rules = input.rules.map(rule => {
        if (!rule || typeof rule !== 'object') throw new Error('Invalid site rule.');
        const origin = normalizeOrigin(rule.origin);
        if (seen.has(origin)) throw new Error(`Duplicate rule: ${origin}`);
        seen.add(origin);
        if (!['off', ...MODES].includes(rule.mode)) throw new Error('Invalid site rule mode.');
        return {origin, mode: rule.mode};
      });
    }
    return out;
  }
  function makeSnapshot(settings, tab, record = {}, now = 0) {
    const url = tab.url || '';
    const origin = webUrl(url)?.origin || '';
    const rule = settings.rules.find(r => r.origin === origin);
    let reason = 'unprotected';
    let active = false;
    if (!supported(url)) reason = 'unsupported';
    else if (!settings.enabled) reason = 'disabled';
    else if (rule?.mode === 'off') reason = 'site-off';
    else if ((record.pausedUntil || 0) > now) reason = 'paused';
    else if (record.override === false) reason = 'tab-off';
    else if (record.override === true) { reason = 'manual'; active = true; }
    else if (settings.protectPinned && tab.pinned) { reason = 'pinned'; active = true; }
    return {
      active, reason, mode: record.mode || (rule?.mode !== 'off' && rule?.mode) || settings.mode,
      sourceUrl: url, homeUrl: record.homeUrl || url, origin,
      foreground: record.foreground ?? settings.foreground, placement: settings.placement,
      destination: record.destination || settings.destination, workspaceId: record.workspaceId || null,
      branchHashes: settings.branchHashes, protectGetForms: settings.protectGetForms,
      pausedUntil: record.pausedUntil || 0,
      recovery: settings.recovery && active && !record.recoveryTripped,
      recoveryTripped: !!record.recoveryTripped
    };
  }
  /** Returns NATIVE or BRANCH. Native means do not cancel or replay the event. */
  function decide(snapshot, intent) {
    if (!snapshot?.active) return 'NATIVE';
    if (intent.modified || intent.download || intent.nativeTarget || intent.sameDocument === true) return 'NATIVE';
    if (intent.kind === 'form' && (!snapshot.protectGetForms || intent.method !== 'get')) return 'NATIVE';
    const destination = webUrl(intent.url);
    if (!destination) return 'NATIVE';
    const current = intent.currentUrl || snapshot.sourceUrl;
    if (!snapshot.branchHashes && fragmentOnly(current, destination.href)) return 'NATIVE';
    if (snapshot.mode === 'same-origin' && webUrl(snapshot.sourceUrl)?.origin === destination.origin) return 'NATIVE';
    if (snapshot.mode === 'home' && webUrl(snapshot.homeUrl)?.href === destination.href) return 'NATIVE';
    return 'BRANCH';
  }
  function insertionIndex(tabs, source, lastBranchId, placement) {
    if (placement === 'end') return tabs.length;
    const pinnedCount = tabs.filter(t => t.pinned).length;
    const last = tabs.find(t => t.id === lastBranchId && !t.pinned);
    return Math.min(tabs.length, Math.max(pinnedCount, source.index + 1, last ? last.index + 1 : 0));
  }
  function shouldRecover(details) {
    if (details.frameId !== 0) return false;
    const q = details.transitionQualifiers || [];
    if (q.includes('forward_back') || q.includes('server_redirect') || q.includes('client_redirect')) return false;
    return ['typed', 'auto_bookmark', 'generated', 'keyword', 'keyword_generated'].includes(details.transitionType);
  }
  globalThis.AnchorCore = Object.freeze({DEFAULTS, MODES, webUrl, supported, fragmentOnly,
    normalizeOrigin, validateSettings, makeSnapshot, decide, insertionIndex, shouldRecover});
})();
