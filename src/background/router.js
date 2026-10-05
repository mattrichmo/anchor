import '../shared/core.js';
import {runtime, workspaceReady, updateRuntime, serial, beginOperation, endOperation, recordBranch, markMove, clearMove, setMoveExpected} from './workspace-state.js';
const C=globalThis.AnchorCore;
export function destinationKey(snapshot) {return snapshot.workspaceId||'default';}
export async function normalWindow(id, exclude) {
  if(!Number.isInteger(id)||id===exclude||runtime.reserved[id])return null;
  try {const w=await chrome.windows.get(id);return w.type==='normal'&&!w.incognito?w:null;}catch{return null;}
}
export async function selectBrowsingWindow(key,id) {
  await workspaceReady;
  if(!await normalWindow(id))throw new Error('Choose a normal, non-dashboard browser window.');
  await updateRuntime(r=>{r.browsing[key]=id;});
}
export async function focusTab(tabId) {
  const tab=await chrome.tabs.get(tabId),win=await chrome.windows.get(tab.windowId);
  if(win.state==='minimized')await chrome.windows.update(win.id,{state:'normal'});
  await chrome.tabs.update(tabId,{active:true});await chrome.windows.update(win.id,{focused:true});
}
async function createDestinationWindow(key,data) {
  const operation=`destination:${key}`;
  await beginOperation(operation,'Creating a browsing window');
  const win=await chrome.windows.create({...data,type:'normal',incognito:false});
  if(!Number.isInteger(win?.id))throw new Error('Chrome did not confirm the new window. Check open windows before retrying.');
  await updateRuntime(r=>{r.browsing[key]=win.id;});
  await endOperation(operation);
  return win;
}
/** No URL match/reuse; every link gets a new browsing context. Only the window is reused. */
export async function routeLink(tab,record,url,snapshot) {
  await workspaceReady;
  if(!C.webUrl(url))throw new Error('Unsupported destination.');
  let destination=snapshot.destination||'current-window';
  if(runtime.reserved[tab.windowId]&&destination==='current-window')destination='browsing-window';
  if(destination==='current-window') {
    const tabs=await chrome.tabs.query({windowId:tab.windowId});
    const index=C.insertionIndex(tabs,tab,record.lastBranchId,snapshot.placement);
    const created=await chrome.tabs.create({url,windowId:tab.windowId,index,active:snapshot.foreground,pinned:false});
    if(!Number.isInteger(created?.id))throw new Error('Chrome did not confirm the new tab.');
    await recordBranch(created.id,tab.id);return created;
  }
  if(destination==='new-window') {
    const win=await chrome.windows.create({url,type:'normal',focused:snapshot.foreground,incognito:false});
    const created=win?.tabs?.[0] || (Number.isInteger(win?.id)?(await chrome.tabs.query({windowId:win.id}))[0]:null);
    if(!created?.id)throw new Error('Chrome did not confirm the new window.');
    await recordBranch(created.id,tab.id);return created;
  }
  const key=destinationKey(snapshot);
  return serial(`destination:${key}`,async()=>{
    const win=await normalWindow(runtime.browsing[key],tab.windowId);
    let created;
    if(win) {
      created=await chrome.tabs.create({url,windowId:win.id,active:snapshot.foreground,pinned:false});
    }else{
      const w=await createDestinationWindow(key,{url,focused:snapshot.foreground});
      created=w.tabs?.[0]||(await chrome.tabs.query({windowId:w.id}))[0];
    }
    if(!Number.isInteger(created?.id))throw new Error('Chrome did not confirm the destination tab.');
    await recordBranch(created.id,tab.id);
    // A focus failure must not turn a confirmed creation into another creation.
    if(snapshot.foreground)try{await focusTab(created.id);}catch{/* Page is open; OS may deny focus. */}
    return created;
  });
}
/** Move the original browser tab; never replay its URL, POST body, or history. */
export async function relocateTab(tab,key,foreground=false,sourceId,destination='browsing-window') {
  return serial(`destination:${key}`,async()=>{
    if(tab.incognito)throw new Error('Private tabs are not supported.');
    if(destination==='new-window'){
      const existingWindowIds=(await chrome.windows.getAll({windowTypes:['normal']})).map(win=>win.id).filter(Number.isInteger);
      const expected={kind:'new-window',fromWindowId:tab.windowId,existingWindowIds},op=`native:${tab.id}`;
      await beginOperation(op,'Moving a native link to a new window');
      const moveId=await markMove(tab.id,expected);let current;
      try{
        const created=await chrome.windows.create({tabId:tab.id,type:'normal',incognito:false,focused:foreground});
        if(!Number.isInteger(created?.id))throw new Error('Chrome did not confirm the new window.');
        await setMoveExpected(tab.id,moveId,{kind:'window',windowId:created.id});
        current=await chrome.tabs.get(tab.id);await endOperation(op);
      }catch(error){
        try{current=await chrome.tabs.get(tab.id);}catch{}
        if(current&&current.windowId!==expected.fromWindowId&&!expected.existingWindowIds.includes(current.windowId)){
          await setMoveExpected(tab.id,moveId,{kind:'window',windowId:current.windowId});await endOperation(op);
        }else{
          if(current){await clearMove(tab.id,moveId);await endOperation(op);}
          throw error;
        }
      }
      if(sourceId)await recordBranch(tab.id,sourceId);
      return current;
    }
    const win=await normalWindow(runtime.browsing[key],tab.windowId);
    let moved;
    if(win){
      const moveId=await markMove(tab.id,{kind:'window',windowId:win.id});
      try{moved=await chrome.tabs.move(tab.id,{windowId:win.id,index:-1});if(Array.isArray(moved))moved=moved[0];}
      catch(error){try{moved=await chrome.tabs.get(tab.id);}catch{}if(moved?.windowId!==win.id){if(moved)await clearMove(tab.id,moveId);throw error;}}
      await setMoveExpected(tab.id,moveId,{kind:'window',windowId:win.id});
    }
    else{
      const existingWindowIds=(await chrome.windows.getAll({windowTypes:['normal']})).map(item=>item.id).filter(Number.isInteger);
      const expected={kind:'new-window',fromWindowId:tab.windowId,existingWindowIds},op=`destination:${key}`;
      await beginOperation(op,'Creating a browsing window');
      const moveId=await markMove(tab.id,expected);
      try{
        const created=await chrome.windows.create({tabId:tab.id,type:'normal',incognito:false,focused:foreground});
        if(!Number.isInteger(created?.id))throw new Error('Chrome did not confirm the new window. Check open windows before retrying.');
        await setMoveExpected(tab.id,moveId,{kind:'window',windowId:created.id});
        await updateRuntime(r=>{r.browsing[key]=created.id;});
        moved=created.tabs?.find(t=>t.id===tab.id)||await chrome.tabs.get(tab.id);
        await endOperation(op);
      }catch(error){
        try{moved=await chrome.tabs.get(tab.id);}catch{}
        if(moved&&moved.windowId!==expected.fromWindowId&&!expected.existingWindowIds.includes(moved.windowId)){
          await setMoveExpected(tab.id,moveId,{kind:'window',windowId:moved.windowId});
          await updateRuntime(r=>{r.browsing[key]=moved.windowId;});await endOperation(op);
        }else{
          if(moved){await clearMove(tab.id,moveId);await endOperation(op);}
          throw error;
        }
      }
    }
    if(sourceId)await recordBranch(tab.id,sourceId);
    if(foreground)try{await focusTab(tab.id);}catch{}
    return moved;
  });
}
