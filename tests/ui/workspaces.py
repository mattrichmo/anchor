"""Actual workspace UI in Chromium with explicitly mocked Chrome APIs.
No extension installation, network navigation, or policy changes occur here.
"""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import ast,re,json,os,tempfile,base64,sys
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'store/screenshots'
# Reuse the documented API fixture, without executing the other runner.
tree=ast.parse((ROOT/'tests/ui/run.py').read_text())
base_mock=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='mock' for t in n.targets))
core=(ROOT/'src/shared/core.js').read_text()
model=re.sub(r'^import .*?;\n','',(ROOT/'src/shared/workspace-model.js').read_text(),flags=re.M)
model=re.sub(r'^export ','',model,flags=re.M)
common=re.sub(r'^export ','',(ROOT/'src/ui/common.js').read_text(),flags=re.M)
source=re.sub(r'^import .*?;\n','',(ROOT/'src/ui/workspaces.js').read_text(),flags=re.M)
mark='data:image/svg+xml;base64,'+base64.b64encode((ROOT/'public/icons/mark.svg').read_bytes()).decode()
html=(ROOT/'public/ui/workspaces.html').read_text();html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S);html=re.sub(r'<link\b[^>]*>','',html);html=html.replace('../icons/mark.svg',mark)
css='\n'.join((ROOT/'public/ui'/f).read_text() for f in ['shared.css','workspaces.css'])
html=html.replace('</head>','<style>'+css+'</style></head>')
extra=r'''
if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('')});
window.__fixture.library={schemaVersion:1,items:[]};
window.__fixture.runtime={runs:{},reserved:{},browsing:{},operations:{},branches:{},moves:{},candidates:{}};
window.__fixture.windows=[{id:1,reserved:false,focused:true,tabs:[
{id:1,url:'https://deploy.example.com/overview',title:'Deployment overview',windowId:1},
{id:2,url:'https://errors.example.com/overview',title:'Error monitoring',windowId:1},
{id:3,url:'https://issues.example.com/queue',title:'Triage queue',windowId:1},
{id:4,url:'https://preview.example.com/',title:'Application preview',windowId:1}
]},{id:2,reserved:false,focused:false,tabs:[{id:5,url:'https://browse.example.com/',title:'My browsing window',windowId:2}]}];
window.__fixture.displays=[];
window.__fixture.replies=[];
window.__fixture.holds={};window.__fixture.pending={};
window.__holdNext=type=>{let release;const promise=new Promise(resolve=>release=resolve);__fixture.holds[type]={promise,release};};
window.__releaseHeld=type=>{const held=__fixture.pending[type];if(held){delete __fixture.pending[type];held.release();}};
window.__workspaceState=()=>({ok:true,library:structuredClone(__fixture.library),runtime:structuredClone(__fixture.runtime),windows:structuredClone(__fixture.windows),displays:structuredClone(__fixture.displays)});
const baseSend=chrome.runtime.sendMessage;
chrome.runtime.sendMessage=async m=>{
 const f=__fixture;m=structuredClone(m);if(!['UI_STATE','UI_TAB'].includes(m.type))f.messages.push(structuredClone(m));
 const held=f.holds[m.type];if(held){delete f.holds[m.type];f.pending[m.type]=held;await held.promise;delete f.pending[m.type];}
 try{
 if(m.type==='UI_WORKSPACE_STATE')return __workspaceState();
 if(m.type==='UI_SAVE_WORKSPACE'){const w=AnchorWorkspace.validateWorkspace(m.workspace);f.library.items=f.library.items.filter(v=>v.id!==w.id);f.library.items.push(w);return __workspaceState();}
 if(m.type==='UI_SET_BROWSING_WINDOW'){if(m.windowId===null)delete f.runtime.browsing[m.workspaceId];else f.runtime.browsing[m.workspaceId]=m.windowId;return __workspaceState();}
 if(m.type==='UI_OPEN_WORKSPACE'){
  const w=f.library.items.find(w=>w.id===m.workspaceId);if(!w)throw new Error('Unknown workspace');
  f.runtime.runs[w.id]={anchors:Object.fromEntries(w.anchors.map((a,i)=>[a.id,m.adoptIds[a.id]||100+i])),pausedUntil:0,lastLayout:{warnings:[]}};
  return {...__workspaceState(),outcome:{workspaceId:w.id,warnings:[]}};
 }
 if(m.type==='UI_PAUSE_WORKSPACE'){f.runtime.runs[m.workspaceId].pausedUntil=m.resume?0:Date.now()+300000;return __workspaceState();}
 if(m.type==='UI_RELEASE_WORKSPACE'){delete f.runtime.runs[m.workspaceId];return __workspaceState();}
 if(m.type==='UI_DELETE_WORKSPACE'){delete f.runtime.runs[m.workspaceId];f.library.items=f.library.items.filter(w=>w.id!==m.workspaceId);return __workspaceState();}
 if(m.type==='UI_IMPORT_WORKSPACES'){f.library=AnchorWorkspace.validateLibrary(m.library);f.runtime.runs={};return __workspaceState();}
 if(m.type==='UI_ACK_OPERATION'){delete f.runtime.operations[m.key];return __workspaceState();}
 if(m.type==='UI_FOCUS_ANCHOR')return {ok:true};
 return baseSend(m);
 }catch(e){return {ok:false,error:e.message};}
};
chrome.permissions={request:async()=>{__fixture.displays=[{id:'external-display',name:'Studio display',isPrimary:true,workArea:{left:0,top:0,width:2560,height:1440}}];return true;}};
'''
results=[];errors=[]
with tempfile.TemporaryDirectory(prefix='anchor-workspace-ui-') as home,sync_playwright() as pw:
    opts=dict(headless=True,args=['--no-sandbox','--disable-gpu'],env={**os.environ,'HOME':home,'XDG_CACHE_HOME':home},timeout=20000)
    exe=os.getenv('CHROME_BIN') or '/usr/lib/chromium/chromium'
    if Path(exe).exists():opts['executable_path']=exe
    browser=pw.chromium.launch(**opts);ctx=browser.new_context(viewport={'width':1280,'height':800});ctx.set_default_timeout(5000)
    def page():
        p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.set_content(html)
        p.add_script_tag(content=core);p.add_script_tag(content='(()=>{'+model+';window.AnchorWorkspace={validateWorkspace,validateLibrary};})()')
        p.add_script_tag(content=base_mock);p.add_script_tag(content=extra)
        p.add_script_tag(content='(()=>{'+common+'\n'+source+'})()');p.locator('#workspace-name').wait_for();p.wait_for_timeout(60);return p
    def test(name,fn):
        try:fn();results.append({'name':name,'status':'PASS'});print('PASS',name,flush=True)
        except Exception as e:results.append({'name':name,'status':'FAIL','error':str(e)});print('FAIL',name,repr(e),flush=True);import traceback;traceback.print_exc()
    def add(p,n=4):
        p.locator('#workspace-name').fill('Operations desk')
        for i in range(1,n+1):p.locator('#open-tab').select_option(str(i));p.locator('#add-open-tab').click()
    def save(p):p.locator('#save-workspace').click();p.wait_for_function('__fixture.library.items.length===1')
    def two_workspaces(p):
        p.locator('#workspace-name').fill('Alpha desk');p.locator('#open-tab').select_option('1');p.locator('#add-open-tab').click();p.get_by_label('Page 1 label',exact=True).fill('Alpha page');save(p)
        alpha=p.evaluate('__fixture.library.items[0].id')
        p.locator('#new-workspace').click();p.locator('#workspace-name').fill('Beta desk');p.locator('#open-tab').select_option('2');p.locator('#add-open-tab').click();p.get_by_label('Page 1 label',exact=True).fill('Beta page');p.locator('#save-workspace').click();p.wait_for_function('__fixture.library.items.length===2')
        p.locator('#workspace-list button').nth(0).click();p.get_by_role('button',name='Remove page 1',exact=True).click()
        p.locator('#open-tab').select_option('1');p.locator('#add-open-tab').click();p.get_by_label('Page 1 label',exact=True).fill('A live page');p.locator('#browsing-window').select_option('2')
        return alpha
    def empty():
        p=page();assert p.locator('h1').inner_text()=='Your workspace, held.';assert p.locator('#page-count').inner_text()=='0 / 4 pages';assert p.locator('#arrange-workspace').is_disabled();p.close()
    test('Workspace empty state renders with clear limits and no auto-open',empty)
    def choose_pages():
        p=page();add(p);assert p.locator('.anchor-editor').count()==4;assert p.locator('#add-open-tab').is_disabled();assert p.locator('.adopt-note').count()==4;assert p.locator('.preview-panel').count()==4;p.close()
    test('Four existing pages can be selected for move-without-reload adoption',choose_pages)
    def new_workspace_note():
        p=page();assert p.locator('#save-note').inner_text()=='New workspace. Add pages, then save or open it.'
        add(p,1);save(p);assert p.locator('#save-note').inner_text()=='Saved locally.';p.close()
    test('New workspace only reports saved after it has been saved',new_workspace_note)
    def edit_save_again():
        p=page();add(p,1);save(p);p.get_by_label('Page 1 label',exact=True).fill('Changed after save');save(p);assert p.evaluate('__fixture.library.items[0].anchors[0].label')=='Changed after save';p.close()
    test('Edits made after saving remain bound to the live draft and persist on a second save',edit_save_again)
    def reorder():
        p=page();add(p);p.get_by_role('button',name='Move page 2 earlier',exact=True).click();assert p.get_by_label('Page 1 label',exact=True).input_value()=='Error monitoring';p.get_by_role('button',name='Remove page 4',exact=True).click();assert p.locator('.anchor-editor').count()==3;assert p.locator('#add-open-tab').is_enabled();p.close()
    test('Page reorder/removal updates layout order and available page choices',reorder)
    def url_edit():
        p=page();add(p,1);p.get_by_label('Page 1 home URL',exact=True).fill('https://changed.example.com/');assert p.locator('.adopt-note').count()==0;p.locator('#open-workspace').click();p.wait_for_function('__fixture.messages.some(m=>m.type==="UI_OPEN_WORKSPACE")');m=p.evaluate('__fixture.messages.findLast(m=>m.type==="UI_OPEN_WORKSPACE")');assert m['adoptIds']=={};p.close()
    test('Changing a selected home URL drops the stale live-tab adoption binding',url_edit)
    def layout():
        p=page();add(p)
        for value in ['collection','columns','rows','grid','focus']:
            p.locator('[data-layout="'+value+'"]').click();assert p.locator('[data-layout="'+value+'"]').get_attribute('aria-pressed')=='true';assert p.locator('.preview-panel').count()==(1 if value=='collection' else 4)
        p.close()
    test('All five layout controls update the explicitly labelled arrangement preview',layout)
    def routing():
        p=page();add(p,1);p.locator('#browsing-window').select_option('2');p.locator('#open-tab').select_option('2');p.locator('#add-open-tab').click();assert p.locator('#browsing-window').input_value()=='2';p.locator('#workspace-destination').select_option('new-window');p.locator('#workspace-foreground').select_option('true');save(p);w=p.evaluate('__fixture.library.items[0]');assert w['destination']=='new-window' and w['foreground'];assert p.evaluate('Object.values(__fixture.runtime.browsing)[0]')==2;p.close()
    test('Destination selection survives editing and routing/focus are independent preferences',routing)
    def open_pages():
        p=page();add(p);p.locator('#open-workspace').click();p.wait_for_function('document.getElementById("live-status").textContent==="4 pages open"');assert p.locator('#live-status').text_content()=='4 pages open';assert p.locator('#live-pages .live-page').count()==4;m=p.evaluate('__fixture.messages.findLast(m=>m.type==="UI_OPEN_WORKSPACE")');assert sorted(m['adoptIds'].values())==[1,2,3,4];assert not m['arrangeOnly'];p.locator('#arrange-workspace').click();p.wait_for_function('__fixture.messages.findLast(m=>m.type==="UI_OPEN_WORKSPACE").arrangeOnly===true');p.close()
    test('Open and arrange-only requests carry stable identities and distinct reopen intent',open_pages)
    def delayed_open_identity():
        p=page();alpha=two_workspaces(p);p.evaluate("__fixture.messages.splice(0);__holdNext('UI_SAVE_WORKSPACE')")
        p.locator('#open-workspace').click();p.wait_for_function('__fixture.pending.UI_SAVE_WORKSPACE!==undefined')
        assert p.locator('.workspace-shell').evaluate('(el)=>el.inert')
        save_message=p.evaluate('__fixture.messages.find(m=>m.type==="UI_SAVE_WORKSPACE")')
        assert save_message['workspace']['id']==alpha and save_message['workspace']['anchors'][0]['label']=='A live page'
        p.evaluate('''()=>{
          const fire=(selector,type='click')=>document.querySelector(selector).dispatchEvent(new Event(type,{bubbles:true,cancelable:true}));
          fire('#workspace-list button:nth-child(2)');fire('#new-workspace');
          const label=document.querySelector('[aria-label="Page 1 label"]');label.value='Edit during save';label.dispatchEvent(new Event('input',{bubbles:true}));
          fire('#refresh');fire('#delete-workspace');fire('#open-workspace');
        }''')
        assert p.locator('#workspace-name').input_value()=='Alpha desk'
        assert p.locator('#workspace-list button').nth(0).get_attribute('aria-current')=='true'
        assert p.evaluate("__fixture.messages.filter(m=>m.type!=='UI_SAVE_WORKSPACE').length")==0
        p.evaluate("__releaseHeld('UI_SAVE_WORKSPACE')")
        p.wait_for_function('__fixture.messages.some(m=>m.type==="UI_OPEN_WORKSPACE")')
        p.wait_for_function("document.getElementById('status').textContent.startsWith('Workspace open.')")
        messages=p.evaluate('__fixture.messages')
        opened=next(m for m in messages if m['type']=='UI_OPEN_WORKSPACE')
        routed=next(m for m in messages if m['type']=='UI_SET_BROWSING_WINDOW')
        assert opened['workspaceId']==alpha and list(opened['adoptIds'].values())==[1]
        assert routed['workspaceId']==alpha and routed['windowId']==2
        assert p.locator('#workspace-name').input_value()=='Alpha desk'
        assert p.get_by_label('Page 1 label',exact=True).input_value()=='A live page'
        assert p.evaluate('(id)=>__fixture.library.items.find(w=>w.id===id).anchors[0].label',alpha)=='A live page'
        p.close()
    test('Delayed Open stays with its captured workspace, live tabs, and browsing destination',delayed_open_identity)
    def delayed_save_competing_actions():
        p=page();add(p,1);save(p);p.evaluate("__fixture.messages.splice(0);__holdNext('UI_SAVE_WORKSPACE')")
        p.locator('#save-workspace').click();p.wait_for_function('__fixture.pending.UI_SAVE_WORKSPACE!==undefined')
        assert p.locator('.workspace-shell').evaluate('(el)=>el.inert')
        p.on('dialog',lambda d:d.accept())
        p.evaluate('''()=>{
          const fire=(selector,type='click')=>document.querySelector(selector).dispatchEvent(new Event(type,{bubbles:true,cancelable:true}));
          fire('#refresh');fire('#delete-workspace');fire('#open-workspace');
          document.querySelector('#workspace-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
        }''')
        p.locator('#import-workspaces').set_input_files({'name':'replacement.json','mimeType':'application/json','buffer':b'{"schemaVersion":1,"items":[]}'})
        assert p.evaluate('__fixture.messages.length')==1
        assert p.evaluate('__fixture.messages[0].type')=='UI_SAVE_WORKSPACE'
        p.evaluate("__releaseHeld('UI_SAVE_WORKSPACE')")
        p.wait_for_function("document.getElementById('save-note').textContent==='Saved locally.'")
        assert p.evaluate('__fixture.messages.map(m=>m.type)')==['UI_SAVE_WORKSPACE']
        assert p.locator('#workspace-list button').count()==1
        p.close()
    test('Delayed Save serializes refresh, import, delete, open, and repeat-save actions',delayed_save_competing_actions)
    def pause_release():
        p=page();add(p,1);p.locator('#open-workspace').click();p.locator('#live-controls').wait_for(state='visible');p.locator('#pause-workspace').click();assert p.locator('#pause-workspace').inner_text()=='Resume workspace';p.locator('#pause-workspace').click();p.on('dialog',lambda d:d.accept());p.locator('#release-workspace').click();assert p.locator('#live-controls').is_hidden();assert p.evaluate('__fixture.library.items.length')==1;p.close()
    test('Pause/resume and explicit release preserve the saved definition',pause_release)
    def import_invalid():
        p=page();p.on('dialog',lambda d:d.accept());p.locator('#import-workspaces').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"schemaVersion":9,"items":[]}'});p.locator('#error').wait_for(state='visible');assert p.evaluate('__fixture.library.items.length')==0;p.close()
    test('Invalid workspace imports show a validation error without adding definitions',import_invalid)
    def invalid_identity():
        p=page();add(p,1);save(p);w=p.evaluate('__fixture.library.items[0]');w['id']='__proto__';p.on('dialog',lambda d:d.accept());p.locator('#import-workspaces').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps({'schemaVersion':1,'items':[w]}).encode()});p.locator('#error').wait_for(state='visible');assert p.evaluate('__fixture.library.items[0].id')!='__proto__';p.close()
    test('Prototype-like workspace identities are rejected by the actual import schema',invalid_identity)
    def display():
        p=page();p.locator('.display-settings summary').click();p.locator('#detect-displays').click();p.wait_for_function('__fixture.displays.length===1');p.locator('#display').select_option('external-display');assert p.locator('#display').input_value()=='external-display';p.close()
    test('Optional display access is requested from the user gesture and populates monitor choices',display)
    def pending():
        p=page();p.evaluate("__fixture.runtime.operations['destination:test']={label:'Creating a browsing window',status:'pending',at:Date.now()}");p.locator('#refresh').click();p.locator('#pending').wait_for(state='visible');p.on('dialog',lambda d:d.accept());p.get_by_role('button',name='I checked — allow retry',exact=True).click();p.wait_for_function('Object.keys(__fixture.runtime.operations).length===0');p.close()
    test('Interrupted operations require explicit acknowledgement before retry',pending)
    def no_injection():
        p=page();add(p,1);payload='<img src=x onerror=alert(1)>';p.get_by_label('Page 1 label',exact=True).fill(payload);assert p.locator('.preview-panel strong').inner_text()==payload;assert p.locator('.preview-panel img').count()==0;p.close()
    test('Untrusted page labels render as text, not executable markup',no_injection)
    def destination_safety():
        p=page();add(p,1);save(p);p.evaluate("__fixture.runtime.browsing[__fixture.library.items[0].id]=2");p.get_by_label('Page 1 label',exact=True).fill('A renamed page');save(p);assert p.evaluate('Object.values(__fixture.runtime.browsing)[0]')==2;assert p.evaluate('__fixture.messages.filter(m=>m.type==="UI_SET_BROWSING_WINDOW").length')==0;p.close()
    test('Saving unrelated page edits does not clear a browsing window created since the editor opened',destination_safety)
    def screenshots():
        p=page();add(p);save(p);p.evaluate('window.scrollTo(0,0)');p.screenshot(path=str(OUT/'05-workspaces-1280x800.png'))
        p.locator('.workspace-preview').scroll_into_view_if_needed();p.screenshot(path=str(OUT/'06-layout-1280x800.png'))
        p.set_viewport_size({'width':1440,'height':1000});p.evaluate('window.scrollTo(0,0)');p.screenshot(path=str(OUT/'source-workspaces-full.png'),full_page=True)
        for width in [390,768,1280]:
            p.set_viewport_size({'width':width,'height':844});assert p.evaluate('document.documentElement.scrollWidth')<=width
        p.set_viewport_size({'width':390,'height':844});p.evaluate('window.scrollTo(0,0)');p.screenshot(path=str(OUT/'source-workspaces-mobile.png'));p.close()
    test('Workspace UI renders at 390/768/1280px without horizontal overflow; capture labelled demo screens',screenshots)
    test('No uncaught JavaScript errors occurred in the rendered workspace UI',lambda:(_ for _ in ()).throw(AssertionError(errors)) if errors else None)
    version=browser.version;browser.close()
report={'version':'2.0.0','date':datetime.now(ZoneInfo('America/Regina')).date().isoformat(),'browser':'Chromium '+version,'method':'Real workspace UI and validation scripts, explicit mocked Chrome API fixtures on about:blank. No installed-extension behavior or OS window movement is proven.','tests':results,'passed':sum(x['status']=='PASS' for x in results),'failed':sum(x['status']=='FAIL' for x in results)}
(ROOT/'docs/workspace-ui-test-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(f"{report['passed']} passed; {report['failed']} failed")
sys.exit(1 if report['failed'] else 0)
