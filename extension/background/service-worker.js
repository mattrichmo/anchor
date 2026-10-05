import '../shared/core.js';
import {settings, ready as stateReady, recordFor, persist, forget, withTab, saveSettings, publish, publishAll, snapshotFor, acknowledge} from './state.js';
import {openBranch} from './branches.js';
import {library,runtime,workspaceReady,saveWorkspace,replaceLibrary,updateRuntime,endOperation,serial} from './workspace-state.js';
import {workspaceState,openWorkspace,makeSolo,releaseWorkspace,releaseTab,pauseWorkspace,deleteWorkspace,resetWorkspaces,openManager,observeNewTab,processCandidate,onAttached,onClosed,onWindowClosed} from './workspaces.js';
import {validateWorkspace,validateLibrary,DESTINATIONS} from '../shared/workspace-model.js';
import {selectBrowsingWindow,focusTab} from './router.js';
const ready=Promise.all([stateReady,workspaceReady]);
const C = globalThis.AnchorCore;
const CONTENT_FILES = ['shared/core.js', 'content/guard.js'];
const quiet = task => Promise.resolve(task).catch(() => {});
function trustedUI(sender) {
  const root = chrome.runtime.getURL('ui/');
  return sender.id === chrome.runtime.id && typeof sender.url === 'string' && sender.url.startsWith(root);
}
function assertTabId(id) {
  if (!Number.isInteger(id) || id < 0) throw new Error('Choose a browser tab first.');
}
async function uiState(id) {
  const result = {settings, version: chrome.runtime.getManifest().version};
  if (!Number.isInteger(id)) return result;
  try {
    const tab = await chrome.tabs.get(id);
    const record = recordFor(tab);
    const snapshot = await publish(tab, record);
    const connected = record.health?.status==='ready';
    return {...result, tab: {id: tab.id, windowId:tab.windowId, url: tab.url || '', title: tab.title || 'Current tab', pinned: tab.pinned},
      snapshot, connected, health:record.health, workspaceId:record.workspaceId||null,
      browsingWindowId:runtime.browsing[record.workspaceId||'default']||null,
      sourceTabId:runtime.branches[id]?.sourceId||null,
      override: record.override ?? null, tabMode: record.mode || ''};
  } catch { return {...result, error:'This tab is no longer available.'}; }
}
async function handleContent(message, sender) {
  if (sender.id !== chrome.runtime.id || !Number.isInteger(sender.tab?.id) || !sender.documentId) throw new Error('Untrusted content message.');
  const id = sender.tab.id;
  return withTab(id, async () => {
    const tab = await chrome.tabs.get(id); // Live pinned state, never message.tabId.
    const record = recordFor(tab);
    const snapshot = {...snapshotFor(tab,record),documentId:sender.documentId};
    if (message.type === 'ANCHOR_HELLO') {
      const frame=await chrome.webNavigation.getFrame({tabId:id,frameId:sender.frameId||0});
      if(!frame||frame.documentId!==sender.documentId||frame.documentLifecycle!=='active')throw new Error('This document is not active.');
      if(typeof message.guardId!=='string'||message.guardId.length>100)throw new Error('Missing guard identity.');
      record.guards||={};record.guards[sender.frameId||0]={documentId:sender.documentId,guardId:message.guardId};
      // Bound the frame registry for pages with many short-lived embedded frames.
      const entries=Object.entries(record.guards);if(entries.length>100)record.guards=Object.fromEntries(entries.slice(-100));
      await persist(id,record);return {snapshot};
    }
    if(message.type==='ANCHOR_ACK'){
      const frame=await chrome.webNavigation.getFrame({tabId:id,frameId:sender.frameId||0});
      if(frame?.documentId===sender.documentId&&frame.documentLifecycle==='active')await acknowledge(tab,record,sender,message);
      return {snapshot};
    }
    if (message.type !== 'ANCHOR_OPEN_LINK') throw new Error('Unknown content request.');
    // Reject messages from a document that has navigated or been replaced.
    const frame = await chrome.webNavigation.getFrame({tabId:id, frameId:sender.frameId || 0});
    if (!frame || frame.documentId !== sender.documentId || frame.documentLifecycle !== 'active')
      return {status:'stale', error:'The source page changed. Click the link again.'};
    if (typeof message.intentId !== 'string' || !/^[a-zA-Z0-9_-]{12,100}$/.test(message.intentId)) throw new Error('Invalid click identifier.');
    if (!['link','form'].includes(message.kind)) throw new Error('Invalid navigation kind.');
    const url = C.webUrl(message.url)?.href;
    if (!url) return {status:'native', snapshot};
    const intent = {url, currentUrl: sender.url, kind:message.kind, method:message.method};
    if (C.decide(snapshot, intent) !== 'BRANCH') return {status:'native', snapshot};
    const result = await openBranch(tab, record, url, snapshot, `${sender.documentId}:${message.intentId}`);
    return {...result, snapshot};
  });
}
const concurrentReads=new Set(['UI_STATE','UI_WORKSPACE_STATE','UI_RETURN_SOURCE','UI_FOCUS_ANCHOR']);
function dispatchUI(message){return concurrentReads.has(message.type)?handleUI(message):serial('ui-control',()=>handleUI(message));}
async function handleUI(message) {
  if (message.type === 'UI_STATE') return uiState(message.tabId);
  if(message.type==='UI_WORKSPACE_STATE')return workspaceState();
  if(message.type==='UI_OPEN_WORKSPACES'){await openManager();return {};}
  if(message.type==='UI_SAVE_WORKSPACE'){
    const workspace=validateWorkspace(message.workspace);await saveWorkspace(workspace);return workspaceState();
  }
  if(message.type==='UI_OPEN_WORKSPACE'){
    const outcome=await openWorkspace(message.workspaceId,{adoptIds:message.adoptIds||{},area:message.area,arrangeOnly:!!message.arrangeOnly,browsingWindowId:message.browsingWindowId});
    return {...await workspaceState(),outcome};
  }
  if(message.type==='UI_SOLO'){assertTabId(message.tabId);const outcome=await makeSolo(message.tabId);return {...await uiState(message.tabId),outcome};}
  if(message.type==='UI_RELEASE_WORKSPACE'){await releaseWorkspace(message.workspaceId);return workspaceState();}
  if(message.type==='UI_DELETE_WORKSPACE'){await deleteWorkspace(message.workspaceId);return workspaceState();}
  if(message.type==='UI_PAUSE_WORKSPACE'){await pauseWorkspace(message.workspaceId,!!message.resume);return workspaceState();}
  if(message.type==='UI_IMPORT_WORKSPACES'){
    const validated=validateLibrary(message.library);
    for(const id of Object.keys(runtime.runs))await releaseWorkspace(id);
    await replaceLibrary(validated);return workspaceState();
  }
  if(message.type==='UI_SET_BROWSING_WINDOW'){
    const key=message.workspaceId||'default';
    if(key!=='default'&&!library.items.some(w=>w.id===key))throw new Error('Unknown workspace.');
    if(message.windowId===null)await updateRuntime(r=>{delete r.browsing[key];});
    else await selectBrowsingWindow(key,message.windowId);
    return message.tabId!==undefined?uiState(message.tabId):workspaceState();
  }
  if(message.type==='UI_ACK_OPERATION'){
    if(typeof message.key!=='string'||!Object.hasOwn(runtime.operations,message.key))throw new Error('This operation is no longer pending.');
    await endOperation(message.key);return workspaceState();
  }
  if(message.type==='UI_RETURN_SOURCE'){
    assertTabId(message.tabId);const source=runtime.branches[message.tabId]?.sourceId;
    if(!source)throw new Error('No live source is recorded for this tab.');
    try{await focusTab(source);}catch{throw new Error('The original anchor was closed. Anchor will not reopen it automatically.');}return {};
  }
  if(message.type==='UI_FOCUS_ANCHOR'){
    const run=runtime.runs[message.workspaceId],tabId=run?.anchors?.[message.anchorId];
    if(!Number.isInteger(tabId))throw new Error('This anchor is not open.');await focusTab(tabId);return {};
  }
  if(message.type==='UI_WORKING_COPY'){
    assertTabId(message.tabId);
    return withTab(message.tabId,async()=>{
      const tab=await chrome.tabs.get(message.tabId),record=recordFor(tab);
      return openBranch(tab,record,tab.url,{...snapshotFor(tab,record),foreground:true},`copy:${crypto.randomUUID()}`);
    });
  }
  if (message.type === 'UI_SETTINGS') {
    await saveSettings(message.patch || {});
    await publishAll();
    return uiState(message.tabId);
  }
  if (message.type === 'UI_IMPORT') {
    await saveSettings(message.settings, true);
    await publishAll();
    return uiState(message.tabId);
  }
  if (message.type === 'UI_RESET') {
    await resetWorkspaces();
    await saveSettings(C.DEFAULTS, true);
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) await withTab(tab.id, async () => {
      await forget(tab.id);
      await chrome.alarms.clear(`resume:${tab.id}`);
    });
    await publishAll();
    return uiState(message.tabId);
  }
  if (message.type === 'UI_RECONNECT') {
    assertTabId(message.tabId);
    await chrome.scripting.executeScript({target:{tabId:message.tabId,allFrames:true}, files:CONTENT_FILES});
    return uiState(message.tabId);
  }
  if (message.type === 'UI_TAB') {
    assertTabId(message.tabId);
    await withTab(message.tabId, async () => {
      const tab = await chrome.tabs.get(message.tabId);
      const record = recordFor(tab);
      switch (message.action) {
        case 'protect': record.override = true; record.pausedUntil = 0; record.homeUrl = tab.url; break;
        case 'unprotect': record.override = false; record.pausedUntil = 0; break;
        case 'automatic':
          if(record.workspaceId)throw new Error('Release the workspace first to restore automatic protection.');
          delete record.override; delete record.mode; delete record.destination; delete record.foreground; record.pausedUntil = 0; break;
        case 'pause':
          record.pausedUntil = Date.now() + 5 * 60 * 1000;
          await chrome.alarms.create(`resume:${tab.id}`, {when:record.pausedUntil}); break;
        case 'resume': record.pausedUntil = 0; await chrome.alarms.clear(`resume:${tab.id}`); break;
        case 'destination':
          if(!DESTINATIONS.includes(message.destination))throw new Error('Unknown destination.');
          if(record.workspaceId)throw new Error('Change this destination in Workspaces.');
          record.destination=message.destination;break;
        case 'foreground':
          if(typeof message.foreground!=='boolean')throw new Error('Invalid focus preference.');
          if(record.workspaceId)throw new Error('Change workspace focus in Workspaces.');
          record.foreground=message.foreground;break;
        case 'rearm-recovery': record.recoveryTripped = false; break;
        case 'home': record.homeUrl = tab.url; record.recoveryTripped = false; break;
        case 'mode':
          if (!C.MODES.includes(message.mode)) throw new Error('Unknown mode.');
          record.mode = message.mode;
          if (message.mode === 'home') record.homeUrl = tab.url; break;
        default: throw new Error('Unknown tab action.');
      }
      await persist(tab.id, record);
      await publish(tab, record);
    });
    return uiState(message.tabId);
  }
  throw new Error('Unknown extension request.');
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  const content = ['ANCHOR_HELLO','ANCHOR_ACK','ANCHOR_OPEN_LINK'].includes(message.type);
  if (!content && (!message.type.startsWith('UI_') || !trustedUI(sender))) return false;
  ready.then(() => content ? handleContent(message,sender) : dispatchUI(message))
    .then(value => sendResponse({ok:true,...value}))
    .catch(error => sendResponse({ok:false,error:error.message || 'Anchor could not complete that request.'}));
  return true;
});
async function initializeMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({id:'anchor-workspaces',title:'Anchor: open Workspaces',contexts:['action']});
  chrome.contextMenus.create({id:'anchor-solo',title:'Anchor: make this a dashboard window',contexts:['page','action']});
  chrome.contextMenus.create({id:'anchor-return',title:'Anchor: return to source',contexts:['page','action']});
  chrome.contextMenus.create({id:'anchor-toggle', title:'Anchor: toggle protection for this tab', contexts:['page','action']});
  chrome.contextMenus.create({id:'anchor-open-here', title:'Anchor: open link here (pause 5 minutes)', contexts:['link'], targetUrlPatterns:['http://*/*','https://*/*']});
}
async function injectExisting() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.filter(tab => C.supported(tab.url) && !tab.discarded).map(tab =>
    chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:CONTENT_FILES})));
  await publishAll();
}
chrome.runtime.onInstalled.addListener(details => quiet((async () => {
  await ready;
  await initializeMenus();
  await injectExisting();
  if (details.reason === 'install') await chrome.tabs.create({url:chrome.runtime.getURL('ui/welcome.html')});
})()));
chrome.runtime.onStartup.addListener(() => quiet(ready.then(injectExisting)));
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  quiet(ready.then(()=>processCandidate(id)));
  quiet(ready.then(() => withTab(id, async () => {
  const record = recordFor(tab);
  if (change.pinned !== undefined) {
    if (change.pinned && !record.wasPinned && !record.workspaceId) record.homeUrl = tab.url || record.currentUrl;
    record.wasPinned = change.pinned;
    await persist(id, record);
  }
  // Do not overwrite currentUrl on tabs.onUpdated: webNavigation owns transitions.
  if (change.pinned !== undefined || change.status === 'complete' || change.url) await publish(tab,record);
})));
});
chrome.tabs.onActivated.addListener(({tabId}) => quiet(ready.then(async () => publish(await chrome.tabs.get(tabId)))));
chrome.tabs.onRemoved.addListener(id => quiet(ready.then(() => withTab(id, async () => {
  await forget(id); await onClosed(id); await chrome.alarms.clear(`resume:${id}`);
}))));
chrome.tabs.onReplaced.addListener((added,removed) => quiet(ready.then(async () => {
  // Tab IDs are session identities, not persistent identities. Do not guess a transfer.
  await forget(removed); await onClosed(removed); await publish(await chrome.tabs.get(added));
})));
chrome.alarms.onAlarm.addListener(alarm => {
  if (!alarm.name.startsWith('resume:')) return;
  const id = Number(alarm.name.slice(7));
  quiet(ready.then(() => withTab(id, async () => {
    const tab = await chrome.tabs.get(id), record = recordFor(tab);
    if ((record.pausedUntil || 0) <= Date.now()) {
      record.pausedUntil = 0; await persist(id, record); await publish(tab, record);
    }
  })));
});
async function shortcutToggle(tabId) {
  const tab = await chrome.tabs.get(tabId), record = recordFor(tab);
  const snapshot = C.makeSnapshot(settings,tab,record,Date.now());
  return dispatchUI({type:'UI_TAB', tabId, action: snapshot.active ? 'unprotect' : 'protect'});
}
chrome.commands.onCommand.addListener(command => quiet(ready.then(async () => {
  const [tab] = await chrome.tabs.query({active:true,lastFocusedWindow:true});
  if (!tab?.id) return;
  if(command==='open-workspaces')await openManager();
  if(command==='return-to-source')await dispatchUI({type:'UI_RETURN_SOURCE',tabId:tab.id});
  if (command === 'toggle-protection') await shortcutToggle(tab.id);
  if (command === 'pause-protection') {
    const record = recordFor(tab);
    await dispatchUI({type:'UI_TAB',tabId:tab.id,action:record.pausedUntil > Date.now() ? 'resume' : 'pause'});
  }
})));
chrome.contextMenus.onClicked.addListener((info,tab) => quiet(ready.then(async () => {
  if (!tab?.id) return;
  if(info.menuItemId==='anchor-workspaces')await openManager();
  if(info.menuItemId==='anchor-solo')await dispatchUI({type:'UI_SOLO',tabId:tab.id});
  if(info.menuItemId==='anchor-return')await dispatchUI({type:'UI_RETURN_SOURCE',tabId:tab.id});
  if (info.menuItemId === 'anchor-toggle') await shortcutToggle(tab.id);
  if (info.menuItemId === 'anchor-open-here' && C.webUrl(info.linkUrl)) {
    await dispatchUI({type:'UI_TAB',tabId:tab.id,action:'pause'});
    // Explicit navigation request from the user's Chrome context menu.
    await chrome.tabs.update(tab.id,{url:info.linkUrl});
  }
})));
// Snapshot prior URL before commit, including when the service worker just woke.
chrome.webNavigation.onBeforeNavigate.addListener(details => {
  if (details.frameId !== 0) return;
  quiet(ready.then(() => withTab(details.tabId, async () => {
    const tab = await chrome.tabs.get(details.tabId), record = recordFor(tab);
    if (!record.currentUrl) record.currentUrl = tab.url || '';
    record.beforeUrl = record.currentUrl;
    await persist(tab.id,record);
  })));
});
// Browser navigation continues while our storage/window operations await.
// Never recover a document that has already been superseded, including a
// second pending navigation that has not committed yet.
async function recoveryDocument(details) {
  const tab = await chrome.tabs.get(details.tabId);
  const frame = await chrome.webNavigation.getFrame({tabId:details.tabId,frameId:0});
  if (!details.documentId || frame?.documentId !== details.documentId ||
      frame.documentLifecycle !== 'active' || tab.url !== details.url ||
      (tab.pendingUrl && tab.pendingUrl !== details.url)) return null;
  return tab;
}
chrome.webNavigation.onCommitted.addListener(details => {
  if (details.frameId !== 0) return;
  quiet(ready.then(() => withTab(details.tabId, async () => {
    const tab = await chrome.tabs.get(details.tabId), record = recordFor(tab);
    const liveDocument = await recoveryDocument(details);
    if (!liveDocument) return;
    const oldUrl = record.beforeUrl || record.currentUrl;
    const snapshot = C.makeSnapshot(settings,{...tab,url:oldUrl},record,Date.now());
    const mayRecover = snapshot.recovery && C.shouldRecover(details) && C.supported(oldUrl) &&
      C.webUrl(details.url) && oldUrl !== details.url &&
      C.decide(snapshot,{url:details.url,kind:'link',currentUrl:oldUrl}) === 'BRANCH';
    record.currentUrl = details.url; delete record.beforeUrl;
    if (mayRecover) {
      // One recovery per tab until manually re-armed. No redirect/SPA/POST replay.
      record.recoveryTripped = true;
      await persist(tab.id,record);
      const outcome = await openBranch(tab,record,details.url,snapshot,`recovery:${details.documentId}`);
      if (outcome.status === 'opened' && await recoveryDocument(details))
        await chrome.tabs.update(tab.id,{url:oldUrl});
    }
    await persist(tab.id,record);
    await publish(tab,record);
  })));
});
function observeSameDocument(details) {
  if (details.frameId !== 0) return;
  quiet(ready.then(() => withTab(details.tabId,async () => {
    const tab = await chrome.tabs.get(details.tabId), record = recordFor(tab);
    const frame = await chrome.webNavigation.getFrame({tabId:details.tabId,frameId:0});
    if (frame?.documentId !== details.documentId || frame.documentLifecycle !== 'active' || tab.url !== details.url) return;
    record.currentUrl = details.url;
    delete record.beforeUrl;
    await persist(tab.id,record); await publish(tab,record);
  })));
}
// Observation only. Reversing history cannot restore a framework's in-memory state.
chrome.webNavigation.onHistoryStateUpdated.addListener(observeSameDocument);
chrome.webNavigation.onReferenceFragmentUpdated.addListener(observeSameDocument);

chrome.tabs.onCreated?.addListener(tab=>quiet(ready.then(()=>observeNewTab(tab))));
chrome.tabs.onAttached?.addListener((id,info)=>quiet(ready.then(()=>onAttached(id,info))));
chrome.windows?.onRemoved?.addListener(id=>quiet(ready.then(()=>onWindowClosed(id))));
