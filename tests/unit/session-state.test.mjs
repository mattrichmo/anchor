import test from 'node:test';
import assert from 'node:assert/strict';
const clone=value=>structuredClone(value);
const tabs=Array.from({length:4},(_,i)=>({id:i+1,url:`https://dashboard.example/${i+1}`,pinned:false}));
const session={
 'tab:1':{override:true,mode:'strict',homeUrl:'https://dashboard.example/home',currentUrl:'https://dashboard.example/old',pausedUntil:0,revision:19,health:{status:'ready'},guards:{0:{documentId:'old',guardId:'old'}},intents:{pending:{status:'pending',at:1},done:{status:'done',at:2,tabId:8},bad:{status:'done',at:'bad',tabId:8}}},
 'tab:2':{override:'false',mode:'future',destination:'javascript:bad',currentUrl:'javascript:bad',pausedUntil:8640000000000000,revision:'19',intents:[]},
 'tab:3':null,
 'tab:4':{workspaceId:'__proto__',anchorId:'a',override:true,mode:'home',beforeWorkspace:{override:false,mode:'same-origin',homeUrl:'https://dashboard.example/prior'}},
 'tab:999':{override:true},'tab:01':{override:true},workspaceRuntime:{runs:{}}
};
let access;
globalThis.chrome={
 storage:{local:{setAccessLevel:async value=>{access=value.accessLevel;},get:async()=>({})},session:{get:async()=>clone(session),set:async value=>Object.assign(session,clone(value)),remove:async keys=>{for(const k of keys)delete session[k];}}},
 tabs:{query:async()=>clone(tabs)}
};
const S=await import('../../src/background/state.js');await S.ready;
test('restoration preserves user policy and pending creation journals without saved readiness',()=>{
 const r=S.recordFor(tabs[0]);assert.equal(r.override,true);assert.equal(r.homeUrl,'https://dashboard.example/home');assert.equal(r.health,undefined);assert.deepEqual(r.guards,{0:{documentId:'old',guardId:'old'}});assert.equal(r.intents.pending.status,'pending');assert.equal(r.intents.done.tabId,8);assert.equal(r.intents.bad,undefined);assert.equal(access,'TRUSTED_CONTEXTS');
});
test('restoration advances the saved revision so existing guards can accept new snapshots',()=>{assert.equal(S.snapshotFor(tabs[0]).revision,20);});
test('malformed policy fields are discarded and invalid record shapes remain usable',()=>{
 const r=S.recordFor(tabs[1]);assert.equal(r.override,undefined);assert.equal(r.mode,undefined);assert.equal(r.destination,undefined);assert.equal(r.currentUrl,tabs[1].url);assert.equal(r.pausedUntil,0);assert.deepEqual(r.intents,{});assert.equal(S.recordFor(tabs[2]).currentUrl,tabs[2].url);
});
test('malformed workspace ownership restores prior protection instead of keeping workspace overrides',()=>{const r=S.recordFor(tabs[3]);assert.equal(r.workspaceId,undefined);assert.equal(r.override,false);assert.equal(r.mode,'same-origin');assert.equal(r.homeUrl,'https://dashboard.example/prior');});
test('closed tabs and noncanonical storage identities are removed while unrelated stores survive',()=>{assert(!('tab:999'in session));assert(!('tab:01'in session));assert.deepEqual(session.workspaceRuntime,{runs:{}});assert.equal(session['tab:2'].override,undefined);});
test('publish restores a live guard after lost revision using an identity-bound reset',async()=>{
 const messages=[];
 chrome.runtime={getManifest:()=>({version:'2.0.0'})};
 chrome.action={setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}};
 chrome.webNavigation={getFrame:async()=>({documentId:'live',documentLifecycle:'active'})};
 chrome.tabs.sendMessage=async(id,message,target)=>{
  messages.push({id,message:clone(message),target});
  if(messages.length===1)return {ok:false,version:'2.0.0',guardId:'live-guard',revision:99};
  return {ok:true,version:'2.0.0',guardId:'live-guard',revision:message.snapshot.revision};
 };
 const record=S.recordFor(tabs[2]);record.override=true;
 await S.publish(tabs[2],record);
 assert.equal(messages.length,2);assert.equal(messages[1].message.resetFromRevision,99);
 assert.equal(messages[1].message.guardId,'live-guard');assert.equal(messages[1].target.documentId,'live');
 assert.equal(record.health.status,'ready');
});
