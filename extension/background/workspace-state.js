import {validateLibrary} from '../shared/workspace-model.js';
export let library = {schemaVersion:1,items:[]};
export let runtime = {runs:{}, reserved:{}, browsing:{}, branches:{}, moves:{}, operations:{}, candidates:{}};
let writeLane=Promise.resolve();
const lanes=new Map();
export function serial(key, task) {
  const next=(lanes.get(key)||Promise.resolve()).catch(()=>{}).then(task);
  lanes.set(key,next);next.finally(()=>{if(lanes.get(key)===next)lanes.delete(key);}).catch(()=>{});return next;
}
export const workspaceReady=(async()=>{
  const [local,session]=await Promise.all([chrome.storage.local.get('workspaces'),chrome.storage.session.get('workspaceRuntime')]);
  try {if(local.workspaces)library=validateLibrary(local.workspaces);}catch{/* Invalid persisted data is not executed. */}
  const saved=session.workspaceRuntime;
  if(saved&&typeof saved==='object')for(const key of Object.keys(runtime))if(saved[key]&&typeof saved[key]==='object'&&!Array.isArray(saved[key]))runtime[key]=saved[key];
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
export async function markMove(tabId) {await updateRuntime(r=>{r.moves[tabId]=Date.now()+15000;for(const [id,at]of Object.entries(r.moves))if(at<Date.now())delete r.moves[id];});}
export function isMoving(tabId){return (runtime.moves[tabId]||0)>Date.now();}
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

// Consume exactly one extension-generated attachment. A later user drag is not swallowed by the TTL.
export async function consumeMove(tabId){
  let owned=false;await updateRuntime(r=>{owned=(r.moves[tabId]||0)>Date.now();delete r.moves[tabId];});return owned;
}
