import '../shared/core.js';
import {settings,recordFor,persist,publish,withTab} from './state.js';
import {validateWorkspace,validateArea,layoutCells,relocatable} from '../shared/workspace-model.js';
import {library,runtime,workspaceReady,updateRuntime,saveWorkspace,replaceLibrary,serial,beginOperation,endOperation,markMove,isMoving,consumeMove} from './workspace-state.js';
import {selectBrowsingWindow,normalWindow,relocateTab,focusTab} from './router.js';
const C=globalThis.AnchorCore;
const uid=()=>crypto.randomUUID();
const getWorkspace=id=>{const w=library.items.find(w=>w.id===id);if(!w)throw new Error('This workspace was removed.');return w;};
export async function displayInfo(){
  if(!chrome.permissions || !(await chrome.permissions.contains({permissions:['system.display']})))return [];
  try{return (await chrome.system.display.getInfo()).filter(d=>d.isEnabled!==false).map(d=>({id:d.id,name:d.name,isPrimary:d.isPrimary,workArea:d.workArea}));}
  catch{return [];}
}
async function resolveArea(w,fallback){
  const displays=await displayInfo();
  if(displays.length){
    const requested=displays.find(d=>d.id===w.displayId), primary=displays.find(d=>d.isPrimary)||displays[0];
    const chosen=requested||(w.displayId==='auto'?displays.find(d=>fallback&&fallback.left>=d.workArea.left&&fallback.left<d.workArea.left+d.workArea.width&&fallback.top>=d.workArea.top&&fallback.top<d.workArea.top+d.workArea.height):null)||primary;
    return {area:validateArea(chosen.workArea),warning:w.displayId!=='auto'&&!requested?'Saved display is unavailable; used the primary display.':null};
  }
  return {area:validateArea(fallback),warning:w.displayId==='auto'?null:'Display access is unavailable; used the current display.'};
}
function savedRecord(record){return Object.fromEntries(['override','mode','homeUrl','destination','foreground','pausedUntil'].filter(k=>Object.hasOwn(record,k)).map(k=>[k,record[k]]));}
async function adopt(w,a,tab){
  if(tab.incognito||!C.supported(tab.url))throw new Error('Only supported normal webpages can become anchors.');
  await withTab(tab.id,async()=>{
    const rec=recordFor(tab);
    if(rec.workspaceId&&rec.workspaceId!==w.id)throw new Error('This page already belongs to another workspace. Release it there first.');
    if(!rec.workspaceId)rec.beforeWorkspace=savedRecord(rec);
    Object.assign(rec,{workspaceId:w.id,anchorId:a.id,override:true,mode:a.mode,homeUrl:a.url,destination:w.destination,foreground:w.foreground,pausedUntil:0});
    await persist(tab.id,rec);await publish(tab,rec);
  });
  await updateRuntime(r=>{const run=r.runs[w.id]||={anchors:{}};run.anchors[a.id]=tab.id;});
}
export async function releaseTab(tabId){
  try{await withTab(tabId,async()=>{
    const tab=await chrome.tabs.get(tabId),rec=recordFor(tab),wid=rec.workspaceId;
    if(!wid)return;
    const old=rec.beforeWorkspace||{};
    for(const k of ['workspaceId','anchorId','beforeWorkspace','override','mode','homeUrl','destination','foreground','pausedUntil'])delete rec[k];
    Object.assign(rec,old);await persist(tabId,rec);await publish(tab,rec);
  });}catch{/* Closed tab; membership still needs removal. */}
  await updateRuntime(r=>{
    for(const run of Object.values(r.runs))for(const [id,t]of Object.entries(run.anchors||{}))if(t===tabId)delete run.anchors[id];
    for(const [id,res]of Object.entries(r.reserved)){res.members=res.members.filter(t=>t!==tabId);if(!res.members.length)delete r.reserved[id];}
  });
}
export async function releaseWorkspace(id){
  const run=runtime.runs[id];
  for(const tabId of Object.values(run?.anchors||{}))await releaseTab(tabId);
  await updateRuntime(r=>{delete r.runs[id];for(const [wid,res]of Object.entries(r.reserved))if(res.workspaceId===id)delete r.reserved[wid];});
  // Deliberately do not close, merge, navigate, unpin, or reopen any tabs/windows.
}
async function registerWindows(w,tabs){
  await updateRuntime(r=>{
    for(const [id,res]of Object.entries(r.reserved))if(res.workspaceId===w.id)delete r.reserved[id];
    if(w.reserved)for(const tab of tabs){const res=r.reserved[tab.windowId]||={workspaceId:w.id,members:[],foreground:w.foreground};res.members.push(tab.id);}
  });
}
async function moveToNewWindow(tab,w,key){
  await markMove(tab.id);await beginOperation(key,'Moving a dashboard to its own window');
  const win=await chrome.windows.create({tabId:tab.id,type:'normal',focused:false,incognito:false});
  if(!Number.isInteger(win?.id))throw new Error('Chrome did not confirm the dashboard window.');
  await endOperation(key);return chrome.tabs.get(tab.id);
}
/** Explicit open only. Closed anchors are never resurrected by listeners or a timer. */
export async function openWorkspace(id,{adoptIds={},area,arrangeOnly=false,browsingWindowId}={}){
  await workspaceReady;
  return serial(`workspace:${id}`,async()=>{
    const w=getWorkspace(id),resolved=await resolveArea(w,area),cells=layoutCells(w.layout,w.anchors.length,resolved.area,w.gap);
    // Geometry validation happens before creating or moving any browser objects.
    if(Number.isInteger(browsingWindowId))await selectBrowsingWindow(id,browsingWindowId);
    const requested=w.anchors.map(a=>runtime.runs[id]?.anchors?.[a.id]??adoptIds[a.id]).filter(Number.isInteger);
    if(new Set(requested).size!==requested.length)throw new Error('Choose a distinct browser tab for each anchor.');
    const oldRun=runtime.runs[id];
    if(arrangeOnly&&Object.keys(oldRun?.anchors||{}).length<w.anchors.length)throw new Error('Some dashboard pages are closed. Use Open workspace to reopen saved pages.');
    const tabs=[];
    for(const a of w.anchors){
      let tab;
      const bound=runtime.runs[id]?.anchors?.[a.id];
      if(Number.isInteger(bound))try{tab=await chrome.tabs.get(bound);}catch{}
      if(!tab&&Number.isInteger(adoptIds[a.id])){
        tab=await chrome.tabs.get(adoptIds[a.id]);
        if(C.webUrl(tab.url)?.href!==a.url)throw new Error('A selected page changed before it could be added. Select it again.');
      }
      if(!tab){
        if(arrangeOnly)throw new Error('A dashboard was closed. Use Open workspace to reopen it.');
        const key=`anchor:${id}:${a.id}`;await beginOperation(key,'Opening a saved dashboard');
        const win=await chrome.windows.create({url:a.url,type:'normal',focused:false,incognito:false});
        tab=win?.tabs?.[0]||(Number.isInteger(win?.id)?(await chrome.tabs.query({windowId:win.id}))[0]:null);
        if(!tab?.id)throw new Error('Chrome did not confirm the dashboard tab. Check windows before retrying.');
        // URL can still be pending at this point; the chosen home is the intended initial URL.
        tab={...tab,url:tab.url&&C.supported(tab.url)?tab.url:a.url};
        await adopt(w,a,tab);await endOperation(key);
      }else await adopt(w,a,tab);
      tabs.push(tab);
    }
    // A definition edit can remove an anchor; release that binding without closing it.
    const currentIds=new Set(w.anchors.map(a=>a.id));
    for(const [anchorId,tabId]of Object.entries(runtime.runs[id]?.anchors||{}))if(!currentIds.has(anchorId))await releaseTab(tabId);
    const arranged=[];
    if(w.layout==='collection'){
      let first=await chrome.tabs.get(tabs[0].id);
      const occupants=await chrome.tabs.query({windowId:first.windowId});
      const allowed=new Set(tabs.map(t=>t.id));
      if(occupants.some(t=>!allowed.has(t.id)))first=await moveToNewWindow(first,w,`move:${id}:${first.id}`);
      arranged.push(first);
      for(const tab of tabs.slice(1)){
        const fresh=await chrome.tabs.get(tab.id);
        if(fresh.windowId!==first.windowId){await markMove(tab.id);await chrome.tabs.move(tab.id,{windowId:first.windowId,index:-1});}
        arranged.push(await chrome.tabs.get(tab.id));
      }
    }else{
      for(const tab of tabs){
        let fresh=await chrome.tabs.get(tab.id);
        const occupants=await chrome.tabs.query({windowId:fresh.windowId});
        if(occupants.length!==1)fresh=await moveToNewWindow(fresh,w,`move:${id}:${fresh.id}`);
        arranged.push(fresh);
      }
    }
    await registerWindows(w,arranged);
    const unique=[...new Set(arranged.map(t=>t.windowId))],bounds=[],warnings=resolved.warning?[resolved.warning]:[];
    for(let i=0;i<unique.length;i++){
      const wid=unique[i],cell=cells[i]||cells[0];
      try{
        // State and bounds are separate calls; fullscreen/maximized cannot carry bounds.
        await chrome.windows.update(wid,{state:'normal'});
        await chrome.windows.update(wid,cell);
        const actual=await chrome.windows.get(wid);bounds.push({windowId:wid,requested:cell,actual:Object.fromEntries(['left','top','width','height'].map(k=>[k,actual[k]]))});
        if(Object.keys(cell).some(k=>Math.abs((actual[k]??cell[k])-cell[k])>16))warnings.push('Your window manager adjusted the requested window sizes or positions.');
      }catch{warnings.push('A window could not be arranged. Its page remains open; retry Arrange when it is available.');}
    }
    await updateRuntime(r=>{const run=r.runs[id]||={anchors:{}};run.lastLayout={at:Date.now(),bounds,warnings:[...new Set(warnings)]};run.pausedUntil=0;});
    // Protect any supported native-created branches that arrived during registration.
    for(const wid of unique)for(const t of await chrome.tabs.query({windowId:wid}))if(!arranged.some(a=>a.id===t.id))await observeNewTab(t);
    if(arranged[0])try{await focusTab(arranged[0].id);}catch{}
    return {workspaceId:id,warnings:[...new Set(warnings)]};
  });
}
export async function makeSolo(tabId){
  const tab=await chrome.tabs.get(tabId);
  if(!C.supported(tab.url)||tab.incognito)throw new Error('Open a normal webpage first.');
  if(recordFor(tab).workspaceId)throw new Error('This page already belongs to a workspace. Manage it in Workspaces.');
  if(library.items.length>=20)throw new Error('The workspace limit is 20. Remove a saved workspace first.');
  const w=validateWorkspace({id:uid(),name:(tab.title||'My dashboard').slice(0,80),layout:'collection',destination:'browsing-window',foreground:false,reserved:true,gap:12,displayId:'auto',anchors:[{id:uid(),label:(tab.title||'Dashboard').slice(0,100),url:tab.url,mode:recordFor(tab).mode||settings.mode}]});
  await saveWorkspace(w);
  const win=await chrome.windows.get(tab.windowId),others=await chrome.tabs.query({windowId:tab.windowId});
  if(others.length>1&&await normalWindow(win.id))await selectBrowsingWindow(w.id,win.id);
  // Do not resize the user's current screen for this one-click flow; detach only.
  await serial(`workspace:${w.id}`,async()=>{
    await adopt(w,w.anchors[0],tab);
    const solo=others.length===1?tab:await moveToNewWindow(tab,w,`move:${w.id}:${tab.id}`);
    await registerWindows(w,[solo]);await focusTab(tab.id);
  });
  return {workspaceId:w.id};
}
export async function pauseWorkspace(id,resume=false){
  const run=runtime.runs[id];if(!run)throw new Error('This workspace is not open.');
  const until=resume?0:Date.now()+300000;
  await updateRuntime(r=>{if(r.runs[id])r.runs[id].pausedUntil=until;});
  for(const tid of Object.values(run.anchors||{}))try{await withTab(tid,async()=>{
    const tab=await chrome.tabs.get(tid),rec=recordFor(tab);rec.pausedUntil=until;await persist(tid,rec);
    if(until)await chrome.alarms.create(`resume:${tid}`,{when:until});else await chrome.alarms.clear(`resume:${tid}`);
    await publish(tab,rec);
  });}catch{}
}
export async function observeNewTab(candidate){
  await workspaceReady;
  const res=runtime.reserved[candidate.windowId];
  if(!res||res.members.includes(candidate.id)||isMoving(candidate.id)||!settings.enabled||(runtime.runs[res.workspaceId]?.pausedUntil||0)>Date.now())return;
  // Only browser-created tabs are candidates. Explicitly dragged-in tabs are left alone.
  await updateRuntime(r=>{r.candidates[candidate.id]={windowId:candidate.windowId,workspaceId:res.workspaceId,at:Date.now()};});
  await processCandidate(candidate.id);
}
export async function processCandidate(id){
  const pending=runtime.candidates[id];if(!pending)return;
  return serial(`relocate:${id}`,async()=>{
    const info=runtime.candidates[id];if(!info)return;
    let tab;try{tab=await chrome.tabs.get(id);}catch{await updateRuntime(r=>{delete r.candidates[id];});return;}
    const res=runtime.reserved[tab.windowId];
    if(!res||res.workspaceId!==info.workspaceId||res.members.includes(id)||!settings.enabled||(runtime.runs[res.workspaceId]?.pausedUntil||0)>Date.now()){
      await updateRuntime(r=>{delete r.candidates[id];});return;
    }
    const url=tab.pendingUrl||tab.url||'';
    if(!url||url==='about:blank')return; // Wait for a knowable destination; no guessing about auth popups.
    if(!relocatable(url)){
      await updateRuntime(r=>{delete r.candidates[id];const run=r.runs[res.workspaceId];if(run)run.notice='A browser-owned or sign-in tab was left in this window. Pause or release the workspace when maintaining a dashboard.';});return;
    }
    // Reserve once; a failed/uncertain move is not automatically retried by onUpdated.
    await updateRuntime(r=>{delete r.candidates[id];});
    const sourceId=tab.openerTabId&&res.members.includes(tab.openerTabId)?tab.openerTabId:res.members[0];
    try{
      const destination=library.items.find(w=>w.id===res.workspaceId)?.destination||'browsing-window';
      await relocateTab(tab,res.workspaceId,res.foreground&&!!tab.active,sourceId,destination);
      if(!res.foreground&&tab.active&&sourceId)try{await focusTab(sourceId);}catch{}
    }catch{await updateRuntime(r=>{const run=r.runs[res.workspaceId];if(run)run.notice='An extra tab could not be moved safely. It was left open. Check the browsing destination or release this workspace.';});}
  });
}
export async function onAttached(id,info){
  if(await consumeMove(id))return;
  const old=Object.values(runtime.reserved).find(res=>res.members.includes(id));
  if(old){
    const destination=runtime.reserved[info.newWindowId];
    if(!destination||destination.workspaceId!==old.workspaceId)await releaseTab(id);
    else await updateRuntime(r=>{
      for(const [wid,res] of Object.entries(r.reserved))if(Number(wid)!==info.newWindowId){res.members=res.members.filter(t=>t!==id);if(!res.members.length)delete r.reserved[wid];}
      if(!r.reserved[info.newWindowId].members.includes(id))r.reserved[info.newWindowId].members.push(id);
    });
  }
  // Never bounce a tab a person deliberately dragged into a dashboard window.
}
export async function onClosed(id){
  await updateRuntime(r=>{
    delete r.candidates[id];delete r.moves[id];delete r.branches[id];
    for(const run of Object.values(r.runs))for(const [aid,tid]of Object.entries(run.anchors||{}))if(tid===id)delete run.anchors[aid];
    for(const [wid,res]of Object.entries(r.reserved)){res.members=res.members.filter(t=>t!==id);if(!res.members.length)delete r.reserved[wid];}
  });
}
export async function onWindowClosed(id){await updateRuntime(r=>{delete r.reserved[id];for(const [key,wid]of Object.entries(r.browsing))if(wid===id)delete r.browsing[key];});}
export async function workspaceState(){
  await workspaceReady;
  const windows=await chrome.windows.getAll({populate:true,windowTypes:['normal']});
  const available=windows.filter(w=>!w.incognito).map(w=>({id:w.id,reserved:!!runtime.reserved[w.id],focused:w.focused,
    tabs:(w.tabs||[]).map(t=>({id:t.id,url:C.supported(t.url)?t.url:'',title:C.supported(t.url)?(t.title||new URL(t.url).hostname):'Browser page',pinned:!!t.pinned,windowId:w.id,workspaceId:recordFor(t).workspaceId||null})).filter(t=>t.url)}));
  return {library,runtime,windows:available,displays:await displayInfo()};
}
export async function deleteWorkspace(id){await releaseWorkspace(id);await replaceLibrary({schemaVersion:1,items:library.items.filter(w=>w.id!==id)});await updateRuntime(r=>{delete r.browsing[id];});}
export async function resetWorkspaces(){for(const id of Object.keys(runtime.runs))await releaseWorkspace(id);await replaceLibrary({schemaVersion:1,items:[]});await updateRuntime(r=>{for(const k of Object.keys(r))r[k]={};});}
export async function openManager(){return serial('workspace-manager',async()=>{
  const url=chrome.runtime.getURL('ui/workspaces.html');
  const tabs=await chrome.tabs.query({});const existing=tabs.find(t=>t.url===url);
  if(existing){await focusTab(existing.id);return;}
  await chrome.windows.create({url,type:'normal',focused:true,incognito:false});
});}

