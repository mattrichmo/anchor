import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/shared/core.js';
const C=globalThis.AnchorCore;
const url='https://app.example.com/dashboard';
const tab={id:1,index:0,windowId:1,url,pinned:true};
const defaults=()=>C.validateSettings(C.DEFAULTS);
const snap=(settings={},record={},overrides={})=>C.makeSnapshot({...defaults(),...settings},{...tab,...overrides},record,1000);
const link=(target,extra={})=>({url:target,kind:'link',currentUrl:url,...extra});
for(const target of ['https://example.com/','http://localhost:3000/test','https://example.com/path?q=x#part','https://127.0.0.1:4000/'])
 test(`web URL accepted: ${target}`,()=>assert(C.webUrl(target)));
for(const target of ['javascript:alert(1)','data:text/html,test','file:///test','chrome://settings','mailto:a@b.com','https://user:pass@example.com','https://user@example.com','not a URL',null,42,'https://example.com/'+ 'x'.repeat(16384)])
 test(`unsafe or invalid URL rejected: ${String(target).slice(0,45)}`,()=>assert.equal(C.webUrl(target),null));
for(const target of ['chrome://extensions','https://chromewebstore.google.com/detail/a','https://chrome.google.com/webstore/detail/b'])
 test(`restricted page unsupported: ${target}`,()=>assert.equal(C.supported(target),false));
test('ordinary http page supported',()=>assert.equal(C.supported(url),true));
test('pinned tab active by default',()=>assert.equal(snap().active,true));
test('unpinned tab stays native',()=>assert.equal(snap({}, {}, {pinned:false}).active,false));
test('manual protection works on an unpinned tab',()=>assert.equal(snap({}, {override:true},{pinned:false}).reason,'manual'));
test('manual off overrides automatic pin',()=>assert.equal(snap({}, {override:false}).reason,'tab-off'));
test('master off overrides manual',()=>assert.equal(snap({enabled:false},{override:true}).reason,'disabled'));
test('site off overrides manual',()=>assert.equal(snap({rules:[{origin:'https://app.example.com',mode:'off'}]},{override:true}).reason,'site-off'));
test('pause active before deadline',()=>assert.equal(snap({}, {pausedUntil:1001}).reason,'paused'));
test('pause expires at deadline',()=>assert.equal(snap({}, {pausedUntil:1000}).active,true));
test('pinned auto can be disabled',()=>assert.equal(snap({protectPinned:false}).active,false));
test('explicit manual still active when auto pin disabled',()=>assert.equal(snap({protectPinned:false},{override:true}).active,true));
test('unsupported tab never active',()=>assert.equal(snap({}, {override:true},{url:'chrome://settings'}).active,false));
test('tab mode beats site and default',()=>assert.equal(snap({rules:[{origin:'https://app.example.com',mode:'same-origin'}]},{mode:'home'}).mode,'home'));
test('site mode beats default',()=>assert.equal(snap({rules:[{origin:'https://app.example.com',mode:'same-origin'}]}).mode,'same-origin'));
test('site rule does not protect unpinned by itself',()=>assert.equal(snap({rules:[{origin:'https://app.example.com',mode:'strict'}]},{},{pinned:false}).active,false));
test('strict internal link branches',()=>assert.equal(C.decide(snap(),link('https://app.example.com/customer')),'BRANCH'));
test('strict external link branches',()=>assert.equal(C.decide(snap(),link('https://other.example/customer')),'BRANCH'));
test('identical URL reload branches in strict mode',()=>assert.equal(C.decide(snap(),link(url)),'BRANCH'));
for(const key of ['modified','download','nativeTarget','sameDocument'])
 test(`native semantics: ${key}`,()=>assert.equal(C.decide(snap(),link('https://other.example/',{[key]:true})),'NATIVE'));
test('inactive snapshot stays native',()=>assert.equal(C.decide({...snap(),active:false},link('https://other.example/')),'NATIVE'));
test('same origin allows same origin',()=>assert.equal(C.decide(snap({mode:'same-origin'}),link('https://app.example.com/customer')),'NATIVE'));
for(const target of ['http://app.example.com/customer','https://app.example.com:8443/customer','https://child.app.example.com/customer','https://other.example.com/customer'])
 test(`same origin branches different origin: ${target}`,()=>assert.equal(C.decide(snap({mode:'same-origin'}),link(target)),'BRANCH'));
test('home allows exact saved URL',()=>assert.equal(C.decide(snap({mode:'home'},{homeUrl:url}),link(url)),'NATIVE'));
test('home branches changed route',()=>assert.equal(C.decide(snap({mode:'home'},{homeUrl:url}),link(url+'/customer')),'BRANCH'));
test('home branches changed search',()=>assert.equal(C.decide(snap({mode:'home'},{homeUrl:url}),link(url+'?page=2')),'BRANCH'));
test('hash links native by default',()=>assert.equal(C.decide(snap(),link(url+'#section')),'NATIVE'));
test('hash removal native by default',()=>assert.equal(C.decide(snap(),link(url,{currentUrl:url+'#section'})),'NATIVE'));
test('hash branching opt in',()=>assert.equal(C.decide(snap({branchHashes:true}),link(url+'#section')),'BRANCH'));
test('different page same hash is not a section link',()=>assert.equal(C.decide(snap(),link('https://app.example.com/other#section')),'BRANCH'));
test('GET forms native by default',()=>assert.equal(C.decide(snap(),link(url+'?q=a',{kind:'form',method:'get'})),'NATIVE'));
test('GET forms branch when enabled',()=>assert.equal(C.decide(snap({protectGetForms:true}),link(url+'?q=a',{kind:'form',method:'get'})),'BRANCH'));
for(const method of ['post','dialog','POST','put',undefined])
 test(`non-GET method stays native: ${method}`,()=>assert.equal(C.decide(snap({protectGetForms:true}),link(url,{kind:'form',method})),'NATIVE'));
test('invalid settings throw',()=>assert.throws(()=>C.validateSettings('x')));
test('invalid boolean rejected',()=>assert.throws(()=>C.validateSettings({enabled:'yes'})));
test('unknown mode rejected',()=>assert.throws(()=>C.validateSettings({mode:'everything'})));
test('future schema rejected',()=>assert.throws(()=>C.validateSettings({schemaVersion:2})));
test('normalizes origin and strips paths',()=>assert.equal(C.validateSettings({rules:[{origin:url,mode:'off'}]}).rules[0].origin,'https://app.example.com'));
test('duplicate normalized rules rejected',()=>assert.throws(()=>C.validateSettings({rules:[{origin:url,mode:'off'},{origin:url+'/a',mode:'off'}]})));
test('wildcard rule rejected',()=>assert.throws(()=>C.validateSettings({rules:[{origin:'*.example.com',mode:'off'}]})));
test('invalid rule mode rejected',()=>assert.throws(()=>C.validateSettings({rules:[{origin:url,mode:'unknown'}]})));
test('rule count bounded',()=>assert.throws(()=>C.validateSettings({rules:Array(201).fill({origin:url,mode:'off'})})));
test('unknown imported fields dropped',()=>assert.equal(C.validateSettings({injected:'bad'}).injected,undefined));
test('settings copies do not mutate defaults',()=>{const a=defaults();a.rules.push({origin:url,mode:'off'});assert.equal(defaults().rules.length,0);});
const tabs=[{id:1,index:0,pinned:true},{id:2,index:1,pinned:true},{id:3,index:2,pinned:true},{id:4,index:3,pinned:false},{id:5,index:4,pinned:false}];
test('branch respects pinned block boundary',()=>assert.equal(C.insertionIndex(tabs,tabs[0],null,'nearby'),3));
test('branch follows prior branch',()=>assert.equal(C.insertionIndex(tabs,tabs[0],4,'nearby'),4));
test('branch placement end',()=>assert.equal(C.insertionIndex(tabs,tabs[0],null,'end'),5));
test('unpinned manual source placement',()=>assert.equal(C.insertionIndex(tabs,tabs[4],null,'nearby'),5));
test('closed prior branch ignored',()=>assert.equal(C.insertionIndex(tabs,tabs[0],999,'nearby'),3));
for(const type of ['typed','auto_bookmark','generated','keyword','keyword_generated','link','start_page'])
 test(`recovery candidate: ${type}`,()=>assert.equal(C.shouldRecover({frameId:0,transitionType:type}),true));
for(const type of ['form_submit','reload','auto_subframe'])
 test(`recovery excludes: ${type}`,()=>assert.equal(C.shouldRecover({frameId:0,transitionType:type}),false));
for(const qualifier of ['forward_back','server_redirect','client_redirect'])
 test(`recovery excludes qualifier ${qualifier}`,()=>assert.equal(C.shouldRecover({frameId:0,transitionType:'typed',transitionQualifiers:[qualifier]}),false));
test('recovery excludes iframes',()=>assert.equal(C.shouldRecover({frameId:2,transitionType:'typed'}),false));
test('recovery disabled by default',()=>assert.equal(snap().recovery,false));
test('recovery opt in',()=>assert.equal(snap({recovery:true}).recovery,true));
test('circuit breaker disarms recovery',()=>assert.equal(snap({recovery:true},{recoveryTripped:true}).recovery,false));
