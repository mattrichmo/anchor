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
export const ready = (async () => {
  await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
  const [local, session] = await Promise.all([chrome.storage.local.get('settings'), chrome.storage.session.get(null)]);
  try { settings = C.validateSettings(local.settings || C.DEFAULTS); }
  catch { settings = C.validateSettings(C.DEFAULTS); }
  const live = new Set((await chrome.tabs.query({})).map(t => t.id));
  const stale = [];
  for (const [key, value] of Object.entries(session)) {
    if (key.startsWith('tab:')) {
      const id = Number(key.slice(4));
      if (live.has(id)) records.set(id, value); else stale.push(key);
    }
  }
  if (stale.length) await chrome.storage.session.remove(stale);
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
      const reply=await chrome.tabs.sendMessage(tab.id,{type:'ANCHOR_STATE',snapshot:{...snapshot,documentId}},{documentId});
      confirmed=reply?.ok===true&&reply?.revision===snapshot.revision&&reply?.version===chrome.runtime.getManifest().version&&typeof reply.guardId==='string';
      if(confirmed){record.guards||={};record.guards[0]={documentId,guardId:reply.guardId};}
    }catch{}
    if(record.revision===snapshot.revision){
      record.health={status:snapshot.active?(confirmed?'ready':'unavailable'):'inactive',revision:snapshot.revision,documentId,at:Date.now()};
      await persist(tab.id,record);await badge(tab,snapshot,record.health);
    }
    // Registered subframes receive a document-targeted update; their response can never certify the main frame.
    await Promise.allSettled(Object.entries(record.guards||{}).filter(([fid])=>fid!=='0').map(([,guard])=>
      chrome.tabs.sendMessage(tab.id,{type:'ANCHOR_STATE',snapshot:{...snapshot,documentId:guard.documentId}},{documentId:guard.documentId})));
    return snapshot;
  });
  healthLanes.set(tab.id,work);work.finally(()=>{if(healthLanes.get(tab.id)===work)healthLanes.delete(tab.id);}).catch(()=>{});
  return work;
}
export async function publishAll() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(tab => withTab(tab.id,()=>publish(tab))));
}
