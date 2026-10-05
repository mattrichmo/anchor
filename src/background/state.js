import '../shared/core.js';
const C = globalThis.AnchorCore;
export let settings = C.validateSettings(C.DEFAULTS);
const records = new Map();
const lanes = new Map();
let settingsLane = Promise.resolve();
/** Serialize operations per tab, not across all browsing. */
export function withTab(id, work) {
  const previous = lanes.get(id) || Promise.resolve();
  const current = previous.catch(() => {}).then(work);
  lanes.set(id, current);
  current.finally(() => { if (lanes.get(id) === current) lanes.delete(id); }).catch(() => {});
  return current;
}
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const identity = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) &&
  !Object.hasOwn(Object.prototype,value) && !['prototype','default'].includes(value);
const tabIdentity = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => Number.isFinite(value) && value >= 0 && value <= 8640000000000000;
function savedPolicy(value) {
  const out = {};
  if (!plain(value)) return out;
  for (const key of ['override','foreground']) if (typeof value[key] === 'boolean') out[key] = value[key];
  if (C.MODES.includes(value.mode)) out.mode = value.mode;
  if (['current-window','new-window','browsing-window'].includes(value.destination)) out.destination = value.destination;
  if (C.webUrl(value.homeUrl)) out.homeUrl = value.homeUrl;
  if (timestamp(value.pausedUntil)) out.pausedUntil = value.pausedUntil > Date.now() && value.pausedUntil <= Date.now()+6*60*1000 ? value.pausedUntil : 0;
  return out;
}
/** Restore only known policy/state fields. Cached readiness never survives a worker start. */
function restoreRecord(value, tab) {
  const out = {homeUrl:tab.url || '', currentUrl:tab.url || '', wasPinned:!!tab.pinned, intents:{}};
  if (!plain(value)) return out;
  Object.assign(out,savedPolicy(value));
  for (const key of ['currentUrl','beforeUrl']) if (C.webUrl(value[key])) out[key] = value[key];
  for (const key of ['wasPinned','recoveryTripped']) if (typeof value[key] === 'boolean') out[key] = value[key];
  if (tabIdentity(value.lastBranchId)) out.lastBranchId = value.lastBranchId;
  // Guard scripts can retain their last revision while the worker sleeps. Advance
  // from the valid saved revision rather than sending a stale revision of 1.
  if (Number.isSafeInteger(value.revision) && value.revision > 0 && value.revision < Number.MAX_SAFE_INTEGER) out.revision = value.revision;
  if (identity(value.workspaceId) && identity(value.anchorId)) {
    out.workspaceId=value.workspaceId;out.anchorId=value.anchorId;
    out.beforeWorkspace=savedPolicy(value.beforeWorkspace);
  } else if (value.workspaceId !== undefined || value.anchorId !== undefined) {
    // A malformed membership must not leave a workspace's override masquerading
    // as a manual user choice after the membership has been discarded.
    for (const key of ['override','mode','homeUrl','destination','foreground','pausedUntil']) delete out[key];
    Object.assign(out,savedPolicy(value.beforeWorkspace));
    out.homeUrl ||= tab.url || '';
  }
  if (plain(value.guards)) {
    const entries=Object.entries(value.guards).filter(([key,guard]) => /^(0|[1-9]\d*)$/.test(key) &&
      Number.isSafeInteger(Number(key)) && plain(guard) && typeof guard.documentId==='string' &&
      guard.documentId.length>0 && guard.documentId.length<=200 && typeof guard.guardId==='string' &&
      guard.guardId.length>0 && guard.guardId.length<=100).slice(-100);
    out.guards=Object.fromEntries(entries.map(([key,guard])=>[key,{documentId:guard.documentId,guardId:guard.guardId}]));
  }
  if (plain(value.intents)) {
    const entries=Object.entries(value.intents).filter(([key,item]) =>
      key.length <= 240 && plain(item) && ['pending','done'].includes(item.status) && timestamp(item.at) &&
      (item.status === 'pending' || tabIdentity(item.tabId))).slice(-80);
    out.intents=Object.fromEntries(entries.map(([key,item])=>[key,{status:item.status,at:item.at,...(item.status==='done'?{tabId:item.tabId}:{})}]));
  }
  return out;
}
export const ready = (async () => {
  await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
  const [local, session] = await Promise.all([chrome.storage.local.get('settings'), chrome.storage.session.get(null)]);
  try { settings = C.validateSettings(local.settings || C.DEFAULTS); }
  catch { settings = C.validateSettings(C.DEFAULTS); }
  const live = new Map((await chrome.tabs.query({})).map(t => [t.id,t]));
  const stale = [], restored = {};
  for (const [key, value] of Object.entries(session)) {
    if (key.startsWith('tab:')) {
      const id = Number(key.slice(4));
      if (tabIdentity(id) && key === `tab:${id}` && live.has(id)) {
        const record=restoreRecord(value,live.get(id));records.set(id,record);restored[key]=record;
      } else stale.push(key);
    }
  }
  if (stale.length) await chrome.storage.session.remove(stale);
  if (Object.keys(restored).length) await chrome.storage.session.set(restored);
})();
export function recordFor(tab) {
  let record = records.get(tab.id);
  if (!record) {
    record = {homeUrl: tab.url || '', currentUrl: tab.url || '', wasPinned: !!tab.pinned, intents: {}};
    records.set(tab.id, record);
  }
  return record;
}
export async function persist(id, record) {
  records.set(id, record);
  await chrome.storage.session.set({[`tab:${id}`]: record});
}
export async function forget(id) {
  records.delete(id);
  await chrome.storage.session.remove(`tab:${id}`);
}
export async function saveSettings(patch, replace = false) {
  const job = settingsLane.catch(() => {}).then(async () => {
    const next = C.validateSettings(replace ? patch : {...settings, ...patch});
    await chrome.storage.local.set({settings: next});
    settings = next;
    return next;
  });
  settingsLane = job;
  return job;
}
/** Revision changes only when effective policy changes. Same-document replies can arrive out of order. */
export function snapshotFor(tab, record=recordFor(tab)) {
  const policy=C.makeSnapshot(settings,tab,record,Date.now());
  const key=JSON.stringify(policy);
  if(record.policyKey!==key){record.policyKey=key;record.revision=(record.revision||0)+1;}
  return {...policy,revision:record.revision||1};
}
async function badge(tab,snapshot,health) {
  const active=snapshot.active;
  const text=active?(health?.status==='ready'?'ON':'!'):snapshot.reason==='paused'?'II':'';
  const title=active?(health?.status==='ready'?'Anchor — eligible links protected':'Anchor — page connection needed'):'Anchor — protection controls';
  await Promise.allSettled([
    chrome.action.setBadgeText({tabId:tab.id,text}),
    chrome.action.setBadgeBackgroundColor({tabId:tab.id,color:active&&health?.status!=='ready'?'#93652A':'#1E5846'}),
    chrome.action.setTitle({tabId:tab.id,title})
  ]);
}
export async function acknowledge(tab,record,sender,message) {
  const snapshot=snapshotFor(tab,record),known=record.guards?.[sender.frameId||0];
  if(sender.frameId===0&&known?.documentId===sender.documentId&&known?.guardId===message.guardId&&message.revision===snapshot.revision){
    record.health={status:snapshot.active?'ready':'inactive',documentId:sender.documentId,revision:snapshot.revision,at:Date.now()};
    await persist(tab.id,record);await badge(tab,snapshot,record.health);
  }
}
async function sendSnapshot(tabId,documentId,snapshot) {
  let reply=await chrome.tabs.sendMessage(tabId,{type:'ANCHOR_STATE',snapshot:{...snapshot,documentId}},{documentId});
  // A live guard can outlast a lost/corrupt session record. Reset only with the
  // exact guard identity and revision it just returned; a late retry cannot
  // reset a different guard or a policy that advanced meanwhile.
  if(reply?.ok===false&&reply.version===chrome.runtime.getManifest().version&&
      typeof reply.guardId==='string'&&Number.isInteger(reply.revision)&&reply.revision>snapshot.revision){
    reply=await chrome.tabs.sendMessage(tabId,{type:'ANCHOR_STATE',snapshot:{...snapshot,documentId},
      guardId:reply.guardId,resetFromRevision:reply.revision},{documentId});
  }
  return reply;
}
const healthLanes=new Map();
export function publish(tab,record=recordFor(tab)) {
  const work=(healthLanes.get(tab.id)||Promise.resolve()).catch(()=>{}).then(async()=>{
    const snapshot=snapshotFor(tab,record);
    let frame=null;try{frame=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});}catch{}
    const documentId=frame?.documentLifecycle==='active'?frame.documentId:null;
    record.health={status:snapshot.active?'connecting':'inactive',revision:snapshot.revision,documentId,at:Date.now()};
    await persist(tab.id,record);await badge(tab,snapshot,record.health);
    let confirmed=false;
    if(documentId&&C.supported(tab.url))try{
      const reply=await sendSnapshot(tab.id,documentId,snapshot);
      confirmed=reply?.ok===true&&reply?.revision===snapshot.revision&&reply?.version===chrome.runtime.getManifest().version&&typeof reply.guardId==='string';
      if(confirmed){record.guards||={};record.guards[0]={documentId,guardId:reply.guardId};}
    }catch{}
    if(record.revision===snapshot.revision){
      record.health={status:snapshot.active?(confirmed?'ready':'unavailable'):'inactive',revision:snapshot.revision,documentId,at:Date.now()};
      await persist(tab.id,record);await badge(tab,snapshot,record.health);
    }
    // Registered subframes receive a document-targeted update; their response can never certify the main frame.
    await Promise.allSettled(Object.entries(record.guards||{}).filter(([fid])=>fid!=='0').map(([,guard])=>
      sendSnapshot(tab.id,guard.documentId,snapshot)));
    return snapshot;
  });
  healthLanes.set(tab.id,work);work.finally(()=>{if(healthLanes.get(tab.id)===work)healthLanes.delete(tab.id);}).catch(()=>{});
  return work;
}
export async function publishAll() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(tab => withTab(tab.id,()=>publish(tab))));
}
