import {validateLibrary} from '../shared/workspace-model.js';
import {ready as stateReady, recordFor, persist, publish} from './state.js';
export let library = {schemaVersion:1,items:[]};
export let runtime = {runs:{}, reserved:{}, browsing:{}, branches:{}, moves:{}, operations:{}, candidates:{}};
let writeLane=Promise.resolve();
const lanes=new Map();
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=8640000000000000;
const tabId=value=>Number.isSafeInteger(value)&&value>=0;
const tabKey=key=>typeof key==='string'&&/^(0|[1-9]\d*)$/.test(key)&&tabId(Number(key));
const safeKey=key=>typeof key==='string'&&key.length>0&&key.length<=160&&!['__proto__','constructor','prototype'].includes(key);
function setOwn(target,key,value){Object.defineProperty(target,key,{value,writable:true,enumerable:true,configurable:true});}
function cleanRun(raw,workspace){
  if(!object(raw))return null;
  const run={anchors:{}};
  const anchorIds=new Set(workspace.anchors.map(anchor=>anchor.id));
  if(object(raw.anchors))for(const [anchorId,id]of Object.entries(raw.anchors))if(anchorIds.has(anchorId)&&tabId(id))setOwn(run.anchors,anchorId,id);
  const maxPause=Date.now()+5*60_000+30_000;
  run.pausedUntil=finite(raw.pausedUntil)?Math.min(raw.pausedUntil,maxPause):0;
  const geometry=value=>object(value)&&['left','top','width','height'].every(k=>typeof value[k]==='number'&&Number.isFinite(value[k]));
  if(object(raw.lastLayout)&&finite(raw.lastLayout.at)&&Array.isArray(raw.lastLayout.bounds)&&raw.lastLayout.bounds.length<=20&&Array.isArray(raw.lastLayout.warnings)&&raw.lastLayout.warnings.length<=20){
    const bounds=raw.lastLayout.bounds.filter(b=>object(b)&&tabId(b.windowId)&&geometry(b.requested)&&geometry(b.actual)).map(b=>({windowId:b.windowId,requested:Object.fromEntries(['left','top','width','height'].map(k=>[k,b.requested[k]])),actual:Object.fromEntries(['left','top','width','height'].map(k=>[k,b.actual[k]]))})).slice(0,20);
    const warnings=raw.lastLayout.warnings.filter(v=>typeof v==='string').map(v=>v.slice(0,240)).slice(0,20);
    run.lastLayout={at:raw.lastLayout.at,bounds,warnings};
  }
  if(typeof raw.notice==='string')run.notice=raw.notice.slice(0,300);
  return run;
}
function cleanOperation(raw){
  if(!object(raw)||raw.status!=='pending'||!finite(raw.at)||typeof raw.label!=='string')return null;
  return {status:'pending',at:raw.at,label:raw.label.slice(0,120)};
}
function cleanMove(raw){
  if(!object(raw)||!finite(raw.expiresAt)||typeof raw.operationId!=='string'||raw.operationId.length<1||raw.operationId.length>100||!object(raw.expected))return null;
  let expected;
  if(raw.expected.kind==='window'&&tabId(raw.expected.windowId))expected={kind:'window',windowId:raw.expected.windowId};
  else if(raw.expected.kind==='new-window'&&tabId(raw.expected.fromWindowId)&&Array.isArray(raw.expected.existingWindowIds)&&raw.expected.existingWindowIds.length<=1000&&raw.expected.existingWindowIds.every(tabId))expected={kind:'new-window',fromWindowId:raw.expected.fromWindowId,existingWindowIds:[...new Set(raw.expected.existingWindowIds)]};
  else return null;
  return {operationId:raw.operationId,expiresAt:raw.expiresAt,expected};
}
function runtimeShape(saved,validWorkspaces){
  const next={runs:{},reserved:{},browsing:{},branches:{},moves:{},operations:{},candidates:{}};
  if(!object(saved))return next;
  if(object(saved.runs))for(const [id,raw]of Object.entries(saved.runs)){
    const workspace=validWorkspaces.get(id),run=workspace&&cleanRun(raw,workspace);
    if(run)setOwn(next.runs,id,run);
  }
  if(object(saved.browsing))for(const [key,id]of Object.entries(saved.browsing))if((key==='default'||validWorkspaces.has(key))&&tabId(id))setOwn(next.browsing,key,id);
  if(object(saved.branches))for(const [id,raw]of Object.entries(saved.branches))if(tabKey(id)&&object(raw)&&tabId(raw.sourceId)&&finite(raw.at))setOwn(next.branches,id,{sourceId:raw.sourceId,at:raw.at});
  if(object(saved.moves))for(const [id,raw]of Object.entries(saved.moves)){const move=cleanMove(raw);if(tabKey(id)&&move&&move.expiresAt>Date.now())setOwn(next.moves,id,move);}
  if(object(saved.operations))for(const [key,raw]of Object.entries(saved.operations)){const op=cleanOperation(raw);if(safeKey(key)&&op)setOwn(next.operations,key,op);}
  if(object(saved.candidates))for(const [id,raw]of Object.entries(saved.candidates))if(tabKey(id)&&object(raw)&&tabId(raw.windowId)&&validWorkspaces.has(raw.workspaceId)&&finite(raw.at))setOwn(next.candidates,id,{windowId:raw.windowId,workspaceId:raw.workspaceId,at:raw.at});
  return next;
}
function restoreBinding(record){
  const previous=object(record.beforeWorkspace)?record.beforeWorkspace:{};
  for(const key of ['workspaceId','anchorId','beforeWorkspace','override','mode','homeUrl','destination','foreground','pausedUntil'])delete record[key];
  Object.assign(record,previous);
  return record;
}
async function reconcile(savedRuntime,validWorkspaces){
  await stateReady;
  const tabs=await chrome.tabs.query({});
  let windows=[];
  if(chrome.windows?.getAll)try{windows=await chrome.windows.getAll({populate:true,windowTypes:['normal']});}catch{/* Tab membership remains usable if window enumeration is temporarily unavailable. */}
  const knownWindows=new Set(windows.filter(w=>!w.incognito&&w.type==='normal').map(w=>w.id));
  const liveById=new Map(tabs.map(tab=>[tab.id,tab]));
  if(!knownWindows.size)for(const tab of tabs)if(!tab.incognito&&Number.isInteger(tab.windowId))knownWindows.add(tab.windowId);
  const next=runtimeShape(savedRuntime,validWorkspaces),boundTabs=new Set(),occupiedAnchors=new Set();
  for(const [id,move]of Object.entries(next.moves)){
    const tab=liveById.get(Number(id));if(!tab){delete next.moves[id];continue;}
    const expected=move.expected;
    if(expected.kind==='window'){
      if(tab.windowId!==expected.windowId)delete next.moves[id];
    }else if(tab.windowId===expected.fromWindowId||expected.existingWindowIds.includes(tab.windowId))delete next.moves[id];
    else move.expected={kind:'window',windowId:tab.windowId};
  }
  // The per-tab session record is the binding authority. Rebuild the run map from
  // it so a worker restart cannot keep a closed tab or lose a completed adoption.
  for(const run of Object.values(next.runs))run.anchors={};
  const claimsByWindow=new Map();
  for(const tab of tabs){
    if(tab.incognito||!knownWindows.has(tab.windowId))continue;
    const record=recordFor(tab),workspace=validWorkspaces.get(record.workspaceId),anchor=workspace?.anchors.find(a=>a.id===record.anchorId);
    if(!workspace||!anchor)continue;
    const claims=claimsByWindow.get(tab.windowId)||new Map();claims.set(workspace.id,workspace.reserved);claimsByWindow.set(tab.windowId,claims);
  }
  const conflictingWindows=new Map();
  for(const [windowId,claims]of claimsByWindow)if(claims.size>1&&[...claims.values()].some(Boolean))conflictingWindows.set(windowId,[...claims.keys()]);
  for(const tab of tabs){
    const record=recordFor(tab),workspace=validWorkspaces.get(record.workspaceId),anchor=workspace?.anchors.find(a=>a.id===record.anchorId);
    if(record.workspaceId==null&&record.anchorId==null)continue;
    const identity=workspace&&anchor?`${workspace.id}\u0000${anchor.id}`:null;
    const conflicts=conflictingWindows.get(tab.windowId);
    if(conflicts){
      restoreBinding(record);await persist(tab.id,record);await publish(tab,record);
      for(const workspaceId of conflicts){const run=next.runs[workspaceId]||={anchors:{},pausedUntil:0};run.notice='Pages from different workspaces shared a window after restart, so their bindings were released. Open and arrange each workspace to restore ownership.';}
      continue;
    }
    if(!identity||tab.incognito||!knownWindows.has(tab.windowId)||occupiedAnchors.has(identity)||boundTabs.has(tab.id)){
      restoreBinding(record);await persist(tab.id,record);await publish(tab,record);continue;
    }
    occupiedAnchors.add(identity);boundTabs.add(tab.id);
    const run=next.runs[workspace.id]||={anchors:{},pausedUntil:0};
    run.anchors[anchor.id]=tab.id;
  }
  // Reserved membership follows current live anchor tabs and their real windows.
  for(const [workspaceId,run]of Object.entries(next.runs)){
    const workspace=validWorkspaces.get(workspaceId);if(!workspace?.reserved)continue;
    for(const id of Object.values(run.anchors)){
      const tab=liveById.get(id);if(!tab||tab.incognito||!knownWindows.has(tab.windowId))continue;
      const res=next.reserved[tab.windowId]||={workspaceId,members:[],foreground:workspace.foreground};
      if(res.workspaceId===workspaceId&&!res.members.includes(id))res.members.push(id);
    }
  }
  for(const [key,id]of Object.entries(next.browsing))if(!knownWindows.has(id)||next.reserved[id])delete next.browsing[key];
  for(const [id,candidate]of Object.entries(next.candidates)){
    const tab=liveById.get(Number(id)),res=tab&&next.reserved[tab.windowId];
    if(!tab||tab.incognito||tab.windowId!==candidate.windowId||res?.workspaceId!==candidate.workspaceId||res.members.includes(tab.id))delete next.candidates[id];
  }
  for(const [id,branch]of Object.entries(next.branches))if(!liveById.has(Number(id))||!liveById.has(branch.sourceId))delete next.branches[id];
  return next;
}
export function serial(key, task) {
  const next=(lanes.get(key)||Promise.resolve()).catch(()=>{}).then(task);
  lanes.set(key,next);next.finally(()=>{if(lanes.get(key)===next)lanes.delete(key);}).catch(()=>{});return next;
}
export const workspaceReady=(async()=>{
  const [local,session]=await Promise.all([chrome.storage.local.get('workspaces'),chrome.storage.session.get('workspaceRuntime')]);
  try {if(local.workspaces)library=validateLibrary(local.workspaces);}catch{/* Invalid persisted data is not executed. */}
  const validWorkspaces=new Map(library.items.map(item=>[item.id,item]));
  runtime=await reconcile(session.workspaceRuntime,validWorkspaces);
  await chrome.storage.session.set({workspaceRuntime:runtime});
})();
export function updateRuntime(mutator) {
  const task=writeLane.catch(()=>{}).then(async()=>{
    await workspaceReady;const next=structuredClone(runtime);mutator(next);
    await chrome.storage.session.set({workspaceRuntime:next});runtime=next;return runtime;
  });writeLane=task;return task;
}
export function saveWorkspace(value) {
  return serial('definitions',async()=>{
    await workspaceReady;
    const items=library.items.filter(w=>w.id!==value.id);items.push(value);
    const next=validateLibrary({schemaVersion:1,items});await chrome.storage.local.set({workspaces:next});library=next;
    return library.items.find(w=>w.id===value.id);
  });
}
export function replaceLibrary(value) {
  return serial('definitions',async()=>{await workspaceReady;const next=validateLibrary(value);await chrome.storage.local.set({workspaces:next});library=next;return library;});
}
export async function markMove(tabId,expected) {
  const operationId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
  const entry={operationId,expected:structuredClone(expected),expiresAt:Date.now()+15000};
  await updateRuntime(r=>{r.moves[tabId]=entry;for(const [id,move]of Object.entries(r.moves))if(!move||move.expiresAt<Date.now())delete r.moves[id];});
  return operationId;
}
export async function clearMove(tabId,operationId){await updateRuntime(r=>{if(r.moves[tabId]?.operationId===operationId)delete r.moves[tabId];});}
export async function setMoveExpected(tabId,operationId,expected){await updateRuntime(r=>{const move=r.moves[tabId];if(move?.operationId===operationId)move.expected=structuredClone(expected);});}
export function isMoving(tabId){return (runtime.moves[tabId]?.expiresAt||0)>Date.now();}
export async function beginOperation(key, label) {
  if(runtime.operations[key]?.status==='pending')throw new Error('A previous browser operation was interrupted. Check your windows, then acknowledge it in Workspaces before retrying.');
  await updateRuntime(r=>{r.operations[key]={status:'pending',at:Date.now(),label};});
}
export async function endOperation(key) {await updateRuntime(r=>{delete r.operations[key];});}
export async function recordBranch(tabId, sourceId) {
  await updateRuntime(r=>{
    r.branches[tabId]={sourceId,at:Date.now()};
    const entries=Object.entries(r.branches).sort((a,b)=>b[1].at-a[1].at);
    r.branches=Object.fromEntries(entries.slice(0,400));
  });
}

function moveMatches(move,windowId){
  const expected=move.expected;
  return expected.kind==='window'?expected.windowId===windowId:expected.kind==='new-window'&&windowId!==expected.fromWindowId&&!expected.existingWindowIds.includes(windowId);
}
// Consume only the attachment to the destination requested by the outstanding move.
export async function consumeMove(tabId,windowId){
  let owned=false;await updateRuntime(r=>{
    const move=r.moves[tabId];
    if(move&&move.expiresAt>Date.now()&&moveMatches(move,windowId)){owned=true;delete r.moves[tabId];}
    else if(move&&move.expiresAt<=Date.now())delete r.moves[tabId];
  });return owned;
}
