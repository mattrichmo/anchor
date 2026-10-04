import '../shared/core.js';
import {persist} from './state.js';
import {routeLink} from './router.js';
const C = globalThis.AnchorCore;
/**
 * Reserve before tabs.create; do not retry an uncertain creation after worker
 * interruption. At-most-once attempt, not a false exactly-once guarantee.
 */
export async function openBranch(tab, record, url, snapshot, intentId) {
  if (!C.webUrl(url)) throw new Error('This link cannot be opened by Anchor.');
  const now = Date.now();
  record.intents ||= {};
  const old = record.intents[intentId];
  if (old) return old.status === 'done' ? {status: 'opened', tabId: old.tabId} :
    {status: 'uncertain', error: 'This click was already attempted. Check your tabs before trying again.'};
  // Keep only a bounded journal of recent gesture IDs; never deduplicate by URL.
  record.intents = Object.fromEntries(Object.entries(record.intents)
    .filter(([,v]) => now - v.at < 120000).slice(-79));
  record.intents[intentId] = {status: 'pending', at: now};
  await persist(tab.id, record);
  try {
    const created = await routeLink(tab,record,url,snapshot);
    record.lastBranchId = created.id;
    record.intents[intentId] = {status: 'done', at: now, tabId: created.id};
    await persist(tab.id, record);
    return {status: 'opened', tabId: created.id};
  } catch {
    // This might be a failed acknowledgement after creation; never blindly retry.
    return {status: 'uncertain', error: 'Anchor could not confirm the destination. Your protected page was not deliberately navigated. Check your windows and Workspaces for an interrupted operation before trying again.'};
  }
}
