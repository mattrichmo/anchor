import test from 'node:test';
import assert from 'node:assert/strict';
const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn)},removeListener(fn){this.listeners=this.listeners.filter(f=>f!==fn)}});
const clone=value=>structuredClone(value);
const stores={local:{},session:{}};
function storage(name){return {
 setAccessLevel:async()=>{},
 get:async keys=>keys==null?clone(stores[name]):Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in stores[name]).map(k=>[k,clone(stores[name][k])])),
 set:async value=>Object.assign(stores[name],clone(value)),
 remove:async keys=>{for(const key of(Array.isArray(keys)?keys:[keys]))delete stores[name][key]}
}}
const origin='https://dashboard.example.com';
let openTabs=[{id:1,url:origin+'/',title:'Dashboard',pinned:true,index:0,windowId:1,active:true}];
let created=[],createFailure=false,nextId=10,frameDocument='doc-1',frameLifecycle='active';
const id='abcdefghijklmnopabcdefghijklmnop';
globalThis.chrome={
 runtime:{id,getURL:path=>`chrome-extension://${id}/${path}`,getManifest:()=>({version:'1.0.0'}),onMessage:event(),onInstalled:event(),onStartup:event()},
 storage:{local:storage('local'),session:storage('session')},
 tabs:{
 query:async query=>clone(openTabs.filter(t=>query.windowId===undefined||t.windowId===query.windowId)),
 get:async tabId=>{const t=openTabs.find(t=>t.id===tabId);if(!t)throw new Error('No tab');return clone(t)},
 create:async props=>{if(createFailure)throw new Error('Chrome creation failure');const t={...props,id:nextId++,title:'Branch'};created.push(t);openTabs.push(t);return clone(t)},
 update:async(tabId,props)=>{const t=openTabs.find(t=>t.id===tabId);Object.assign(t,props);return clone(t)},
 sendMessage:async()=>({ok:true}),onUpdated:event(),onActivated:event(),onRemoved:event(),onReplaced:event()
 },
 action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},
 alarms:{create:async()=>{},clear:async()=>true,onAlarm:event()},
 contextMenus:{removeAll:async()=>{},create:()=>{},onClicked:event()},
 commands:{onCommand:event()},scripting:{executeScript:async()=>[]},
 webNavigation:{getFrame:async()=>({documentId:frameDocument,documentLifecycle:frameLifecycle}),onBeforeNavigate:event(),onCommitted:event(),onHistoryStateUpdated:event(),onReferenceFragmentUpdated:event()}
};
await import('../../src/background/service-worker.js');
const state=await import('../../src/background/state.js');await state.ready;
const listener=chrome.runtime.onMessage.listeners[0];
const uiSender={id,url:chrome.runtime.getURL('ui/options.html')};
const contentSender=()=>({id,tab:clone(openTabs[0]),url:origin+'/',documentId:'doc-1',frameId:0});
function send(message,sender=uiSender){return new Promise((resolve,reject)=>{const claimed=listener(message,sender,resolve);if(!claimed)resolve({ignored:true})})}
async function reset(){
 openTabs=[{id:1,url:origin+'/',title:'Dashboard',pinned:true,index:0,windowId:1,active:true}];created=[];createFailure=false;frameDocument='doc-1';frameLifecycle='active';
 await send({type:'UI_RESET'});
}
const intent=(suffix='a')=>({type:'ANCHOR_OPEN_LINK',kind:'link',url:origin+'/detail',intentId:'gesture-id-0000000'+suffix});
test('worker: verified live pinned tab opens one branch',async()=>{await reset();const result=await send(intent(),contentSender());assert.equal(result.status,'opened');assert.equal(created.length,1);assert.equal(created[0].pinned,false);});
test('worker: source tab is browser-derived, not content-supplied tabId',async()=>{await reset();const result=await send({...intent(),tabId:9000},contentSender());assert.equal(result.status,'opened');assert.equal(created[0].windowId,1);});
test('worker: stale claimed pin state does not override live Chrome tab',async()=>{await reset();const sender=contentSender();openTabs[0].pinned=false;const result=await send(intent(),sender);assert.equal(result.status,'native');assert.equal(created.length,0);});
test('worker: duplicate gesture message does not repeat tabs.create',async()=>{await reset();await send(intent(),contentSender());await send(intent(),contentSender());assert.equal(created.length,1);});
test('worker: two separate gestures to same URL are not merged',async()=>{await reset();await send(intent('a'),contentSender());await send(intent('b'),contentSender());assert.equal(created.length,2);});
test('worker: concurrent duplicate messages serialize per tab',async()=>{await reset();const sender=contentSender();const results=await Promise.all([send(intent(),sender),send(intent(),sender),send(intent(),sender)]);assert(results.every(r=>r.status==='opened'));assert.equal(created.length,1);});
test('worker: uncertain creation is not automatically retried',async()=>{await reset();createFailure=true;const first=await send(intent(),contentSender());assert.equal(first.status,'uncertain');createFailure=false;const retry=await send(intent(),contentSender());assert.equal(retry.status,'uncertain');assert.equal(created.length,0);});
test('worker: later deliberate retry with a new gesture is permitted',async()=>{await reset();createFailure=true;await send(intent('a'),contentSender());createFailure=false;const r=await send(intent('b'),contentSender());assert.equal(r.status,'opened');});
test('worker: replaced document cannot open a tab',async()=>{await reset();frameDocument='doc-2';const r=await send(intent(),contentSender());assert.equal(r.status,'stale');assert.equal(created.length,0);});
test('worker: cached/prerendered document cannot open a tab',async()=>{await reset();frameLifecycle='cached';const r=await send(intent(),contentSender());assert.equal(r.status,'stale');assert.equal(created.length,0);});
test('worker: missing document identity rejected',async()=>{await reset();const sender=contentSender();delete sender.documentId;const r=await send(intent(),sender);assert.equal(r.ok,false);assert.equal(created.length,0);});
test('worker: wrong extension identity rejected',async()=>{await reset();const r=await send(intent(),{...contentSender(),id:'other'});assert.equal(r.ok,false);});
test('worker: arbitrary page cannot invoke privileged UI action',async()=>{await reset();const r=await send({type:'UI_SETTINGS',patch:{enabled:false}},contentSender());assert.equal(r.ignored,true);assert.equal(state.settings.enabled,true);});
test('worker: extension pages outside ui/ cannot write settings',async()=>{await reset();const r=await send({type:'UI_SETTINGS',patch:{enabled:false}},{id,url:chrome.runtime.getURL('untrusted.html')});assert.equal(r.ignored,true);});
test('worker: malformed gesture identifiers rejected',async()=>{await reset();const r=await send({...intent(),intentId:'../x'},contentSender());assert.equal(r.ok,false);assert.equal(created.length,0);});
test('worker: unsafe destination cannot open extension privileged URL',async()=>{await reset();const r=await send({...intent(),url:'javascript:alert(1)'},contentSender());assert.equal(r.status,'native');assert.equal(created.length,0);});
test('worker: POST form request never branches',async()=>{await reset();await send({type:'UI_SETTINGS',patch:{protectGetForms:true}});const r=await send({...intent(),kind:'form',method:'post'},contentSender());assert.equal(r.status,'native');assert.equal(created.length,0);});
test('worker: setting import validates future schema',async()=>{await reset();const r=await send({type:'UI_IMPORT',settings:{schemaVersion:2}});assert.equal(r.ok,false);assert.equal(state.settings.schemaVersion,1);});
test('worker: UI manual protection activates an unpinned tab',async()=>{await reset();openTabs[0].pinned=false;const r=await send({type:'UI_TAB',tabId:1,action:'protect'});assert.equal(r.snapshot.active,true);assert.equal(r.snapshot.reason,'manual');});
test('worker: UI pause and resume publish correct states',async()=>{await reset();const p=await send({type:'UI_TAB',tabId:1,action:'pause'});assert.equal(p.snapshot.reason,'paused');const r=await send({type:'UI_TAB',tabId:1,action:'resume'});assert.equal(r.snapshot.active,true);});
test('worker: home mode captures live current URL',async()=>{await reset();const r=await send({type:'UI_TAB',tabId:1,action:'mode',mode:'home'});assert.equal(r.snapshot.homeUrl,origin+'/');assert.equal(r.snapshot.mode,'home');});
test('worker: created tab has no explicit opener capability',async()=>{await reset();await send(intent(),contentSender());assert(!Object.hasOwn(created[0],'openerTabId'));});
test('worker: local settings persist without a sync store',async()=>{await reset();await send({type:'UI_SETTINGS',patch:{foreground:false}});assert.equal(stores.local.settings.foreground,false);assert.equal(chrome.storage.sync,undefined);});
test('worker: serialized settings writes preserve independent fields',async()=>{await reset();await Promise.all([send({type:'UI_SETTINGS',patch:{foreground:false}}),send({type:'UI_SETTINGS',patch:{mode:'home'}})]);assert.equal(state.settings.foreground,false);assert.equal(state.settings.mode,'home');});
test('worker: reset removes manual override and origin exceptions',async()=>{await reset();await send({type:'UI_TAB',tabId:1,action:'unprotect'});await send({type:'UI_SETTINGS',patch:{rules:[{origin,mode:'off'}]}});const r=await send({type:'UI_RESET',tabId:1});assert.equal(r.snapshot.active,true);assert.equal(r.settings.rules.length,0);});
test('worker: gesture journal is bounded under repeated clicks',async()=>{await reset();for(let i=0;i<90;i++)await send(intent(String(i)),contentSender());assert(Object.keys(stores.session['tab:1'].intents).length<=80);});
