"""Render/test the actual UI and DOM guard with explicit Chrome-API fixtures.
This does NOT install an extension and is NOT live-extension E2E evidence.
It uses about:blank document content; no blocked URL or browser policy is bypassed.
"""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import re,json,os,tempfile,base64,sys,time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'store/screenshots';OUT.mkdir(parents=True,exist_ok=True)
core=(ROOT/'src/shared/core.js').read_text()
common=re.sub(r'^export ','',(ROOT/'src/ui/common.js').read_text(),flags=re.M)
mark='data:image/svg+xml;base64,'+base64.b64encode((ROOT/'public/icons/mark.svg').read_bytes()).decode()
mock=r'''
const f=window.__fixture={settings:AnchorCore.validateSettings(AnchorCore.DEFAULTS),record:{},tab:{id:1,index:0,windowId:1,pinned:true,url:'https://dashboard.example.com/',title:'Project dashboard'},opened:[],native:[],messages:[],listeners:[],fail:false,optionsOpened:false};
let revision=0,fingerprint='';
const snapshot=()=>{const value=AnchorCore.makeSnapshot(f.settings,f.tab,f.record,Date.now()),fp=JSON.stringify(value);if(fp!==fingerprint){revision++;fingerprint=fp;}return {...value,revision,documentId:'fixture-document'};};
const uiState=()=>({ok:true,settings:f.settings,version:'2.0.0',tab:f.tab,snapshot:snapshot(),connected:f.connected!==false,health:{status:f.connected===false?'unavailable':'ready'},workspaceId:f.workspaceId||null,browsingWindowId:f.browsingWindowId||null,sourceTabId:f.sourceTabId||null});
function broadcast(){f.listeners.forEach(fn=>fn({type:'ANCHOR_STATE',snapshot:snapshot()},{},()=>{}));}
window.chrome={runtime:{id:'fixture-id',getManifest:()=>({version:'2.0.0'}),getURL:p=>'chrome-extension://fixture-id/'+p,onMessage:{addListener:fn=>f.listeners.push(fn),removeListener:fn=>f.listeners=f.listeners.filter(v=>v!==fn)},openOptionsPage:()=>{f.optionsOpened=true},sendMessage:async m=>{
 f.messages.push(m);
 if(m.type==='ANCHOR_ACK')return {ok:true};
 if(m.type==='ANCHOR_HELLO')return {ok:true,snapshot:snapshot()};
 if(m.type==='ANCHOR_OPEN_LINK'){
  if(f.fail)throw new Error('Simulated disconnected worker');
  const target=m.target||'';
  const reachesTop=target==='_top'||(target==='_parent'&&(window===window.top||window.parent===window.top))||((target===''||target==='_self')&&window===window.top);
  const currentUrl=reachesTop?f.tab.url:(m.currentUrl||f.tab.url);
  if(AnchorCore.decide(snapshot(),{url:m.url,currentUrl,kind:m.kind,method:m.method})!=='BRANCH')return {ok:true,status:'native',snapshot:snapshot()};
  f.opened.push(m);return {ok:true,status:'opened',snapshot:snapshot()};
 }
 if(m.type==='UI_SETTINGS'){f.settings=AnchorCore.validateSettings({...f.settings,...m.patch});broadcast();}
 if(m.type==='UI_IMPORT'){
   try{f.settings=AnchorCore.validateSettings(m.settings);}catch(e){return {ok:false,error:e.message};}
 }
 if(m.type==='UI_RESET'){f.settings=AnchorCore.validateSettings(AnchorCore.DEFAULTS);f.record={};broadcast();}
 if(m.type==='UI_TAB'){
  const a=m.action;
  if(a==='protect'){f.record.override=true;f.record.pausedUntil=0;f.record.homeUrl=f.tab.url;}
  if(a==='unprotect'){f.record.override=false;f.record.pausedUntil=0;}
  if(a==='automatic'){f.record={};}
  if(a==='pause')f.record.pausedUntil=Date.now()+300000;
  if(a==='resume')f.record.pausedUntil=0;
  if(a==='mode'){f.record.mode=m.mode;if(m.mode==='home')f.record.homeUrl=f.tab.url;}
  if(a==='home'){f.record.homeUrl=f.tab.url;f.record.recoveryTripped=false;}
  if(a==='rearm-recovery')f.record.recoveryTripped=false;
  if(a==='destination')f.record.destination=m.destination;
  if(a==='foreground')f.record.foreground=m.foreground;
  broadcast();
 }
 return uiState();
}},tabs:{query:async()=>[f.tab]}};
'''
def shell(name):
    html=(ROOT/'public/ui'/f'{name}.html').read_text()
    html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
    html=re.sub(r'<link\b[^>]*>','',html)
    html=html.replace('../icons/mark.svg',mark)
    css=(ROOT/'public/ui/shared.css').read_text()+'\n'+(ROOT/'public/ui'/('popup.css' if name=='popup' else 'options.css')).read_text()
    return html.replace('</head>','<style>'+css+'</style></head>')
results=[]
with tempfile.TemporaryDirectory(prefix='anchor-render-') as home, sync_playwright() as pw:
    executable=os.getenv('CHROME_BIN') or '/usr/lib/chromium/chromium'
    opts=dict(headless=True,args=['--no-sandbox','--disable-gpu'],env={**os.environ,'HOME':home,'XDG_CACHE_HOME':home},timeout=20000)
    if Path(executable).exists():opts['executable_path']=executable
    b=pw.chromium.launch(**opts)
    context=b.new_context(viewport={'width':1280,'height':800})
    context.set_default_timeout(5000)
    def ui(name,patch=None):
        p=context.new_page();p.set_content(shell(name))
        p.add_script_tag(content=core);p.add_script_tag(content=mock)
        if patch:p.evaluate('(patch)=>Object.assign(__fixture.settings,patch)',patch)
        if name in ['popup','options']:
            source=re.sub(r'^import .*?;\n','',(ROOT/'src/ui'/f'{name}.js').read_text(),flags=re.M)
            p.add_script_tag(content='(()=>{'+common+'\n'+source+'})()')
            p.wait_for_timeout(80)
        return p
    def test(name,fn):
        try:fn();results.append({'name':name,'status':'PASS'});print('PASS',name,flush=True)
        except Exception as e:results.append({'name':name,'status':'FAIL','error':str(e)});print('FAIL',name,str(e),flush=True)
    def popup_default():
        p=ui('popup');p.set_viewport_size({'width':392,'height':600});assert p.locator('#status-title').inner_text()=='Link protection is on';assert p.evaluate('document.body.clientHeight')<=600;assert p.evaluate('document.documentElement.scrollWidth')<=392;p.locator('.popup').screenshot(path=str(OUT/'source-popup.png'));p.close()
    test('Rendered popup fits a 392x600 viewport with accessible scrolling',popup_default)
    def popup_controls():
        p=ui('popup');p.locator('[data-mode="same-origin"]').click();assert p.evaluate('__fixture.record.mode')=='same-origin';p.locator('[data-foreground="false"]').click();assert p.evaluate('__fixture.record.foreground') is False;p.locator('#pause').click();assert p.locator('#status-title').inner_text()=='Taking a short break';p.locator('#pause').click();assert p.locator('#status-title').inner_text()=='Link protection is on';p.close()
    test('Popup mode, opening preference, pause and resume wire to runtime requests',popup_controls)
    def popup_manual():
        p=ui('popup');p.locator('#toggle').click();assert p.evaluate('__fixture.record.override') is False;p.locator('#toggle').click();assert p.evaluate('__fixture.record.override') is True;p.locator('#automatic').click();assert p.evaluate('__fixture.record.override===undefined');p.locator('#settings').click();assert p.evaluate('__fixture.optionsOpened');p.close()
    test('Popup protection override/reset and settings button are functional',popup_manual)
    def popup_home():
        p=ui('popup');p.locator('[data-mode="home"]').click();assert p.locator('#home-row').is_visible();assert p.locator('#home-url').inner_text()=='https://dashboard.example.com/';p.locator('#set-home').click();assert p.evaluate('__fixture.record.homeUrl')=='https://dashboard.example.com/';p.close()
    test('Home URL control captures and displays current fixture URL',popup_home)
    def recovery_control():
        p=ui('popup',patch={'recovery':True});p.evaluate("__fixture.record.recoveryTripped=true;__fixture.record.homeUrl='https://dashboard.example.com/saved';")
        p.locator('[data-mode="strict"]').click();assert p.locator('#recovery-notice').is_visible();p.locator('#rearm-recovery').click()
        assert p.locator('#recovery-notice').is_hidden();assert p.evaluate('__fixture.record.homeUrl')=='https://dashboard.example.com/saved';p.close()
    test('Recovery can be re-enabled in strict mode without changing the saved home',recovery_control)
    def busy_state():
        p=ui('popup');p.evaluate("() => {const original=chrome.runtime.sendMessage;chrome.runtime.sendMessage=async m=>{if(m.type==='UI_TAB'){__fixture.tab.url='chrome://settings/';}return original(m)};}")
        p.locator('[data-mode="strict"]').click();assert p.locator('[data-mode="strict"]').get_attribute('aria-busy') is None
        assert p.locator('[data-mode="strict"]').is_disabled();p.close()
    test('Completed requests preserve controls disabled by the latest page state',busy_state)
    def closed_tab():
        p=ui('popup');p.evaluate("() => {chrome.runtime.sendMessage=async()=>({ok:true,settings:__fixture.settings,version:'2.0.0',error:'This tab is no longer available.'});}")
        p.locator('[data-mode="strict"]').click();assert p.locator('#status-title').inner_text()=='Choose a webpage'
        for selector in ['#solo','#copy','#destination','#use-browsing','[data-mode="strict"]']:
            assert p.locator(selector).is_disabled()
        p.close()
    test('Popup disables tab actions when the source tab has closed',closed_tab)
    def settings():
        p=ui('options');p.locator('#foreground').select_option('false');assert p.evaluate('__fixture.settings.foreground') is False;p.locator('#branchHashes').check();assert p.evaluate('__fixture.settings.branchHashes') is True;p.locator('#rule-origin').fill('https://app.example.com/private');p.locator('#rule-mode').select_option('same-origin');p.locator('#rule-form button').click();assert p.locator('.rule-item code').inner_text()=='https://app.example.com';p.locator('.rule-item button').click();assert p.locator('.empty').is_visible();p.close()
    test('Settings controls and normalized-origin add/remove are functional',settings)
    def rule_replace():
        p=ui('options');p.locator('#rule-origin').fill('https://app.example.com/');p.locator('#rule-form button').click();p.locator('#rule-origin').fill('https://app.example.com/another');p.locator('#rule-mode').select_option('strict');p.locator('#rule-form button').click();assert p.locator('.rule-item').count()==1;assert p.evaluate('__fixture.settings.rules[0].mode')=='strict';p.close()
    test('Saving an existing rule replaces it rather than duplicating it',rule_replace)
    def import_good():
        p=ui('options');p.on('dialog',lambda d:d.accept());p.locator('#import-file').set_input_files({'name':'settings.json','mimeType':'application/json','buffer':json.dumps({'schemaVersion':1,'foreground':False}).encode()});p.wait_for_function('__fixture.settings.foreground===false');p.close()
    test('Settings JSON import uses validation and updates preferences',import_good)
    def import_bad():
        p=ui('options');p.on('dialog',lambda d:d.accept());p.locator('#import-file').set_input_files({'name':'settings.json','mimeType':'application/json','buffer':b'{"schemaVersion":99}'});p.locator('#error').wait_for(state='visible');assert 'unsupported' in p.locator('#error').inner_text();p.close()
    test('Invalid import shows actionable error',import_bad)
    def reset():
        p=ui('options');p.locator('#enabled').uncheck();assert p.evaluate('__fixture.settings.enabled') is False;p.on('dialog',lambda d:d.accept());p.locator('#reset').click();p.wait_for_function('__fixture.settings.enabled===true');p.close()
    test('Reset confirmation restores defaults',reset)
    def settings_screens():
        p=ui('options');p.screenshot(path=str(OUT/'02-settings-1280x800.png'));p.locator('#advanced').scroll_into_view_if_needed();p.screenshot(path=str(OUT/'03-advanced-1280x800.png'));p.set_viewport_size({'width':390,'height':844});p.evaluate('window.scrollTo(0,0)');assert p.evaluate('document.documentElement.scrollWidth')<=390;p.screenshot(path=str(OUT/'source-settings-mobile.png'));p.close()
    test('Responsive settings renders without horizontal overflow at 390px',settings_screens)
    def docs_screens():
        p=ui('welcome');p.screenshot(path=str(OUT/'04-welcome-1280x800.png'));assert p.locator('h1').inner_text().startswith('Keep your place.');p.close()
        for name in ['help','privacy']:
            q=ui(name);assert q.locator('h1').is_visible();assert q.locator('a[href="mailto:hello@mattrichmond.ca"]').count()>0;q.close()
    test('Onboarding, help and privacy screens render with support contact',docs_screens)
    # Exercise the actual DOM guard with Chrome APIs explicitly mocked.
    def guard(patch=None,tab=None,extra=''):
        p=context.new_page()
        p.set_content('''<!doctype html><html lang="en"><head><base href="https://dashboard.example.com/"></head><body>
<a id="normal" href="https://dashboard.example.com/details"><span id="nested">Details</span></a>
<a id="external" href="https://other.example.com/details">Other origin</a>
<a id="blank" href="https://other.example.com/" target="_blank">New tab</a>
<a id="top-target" href="#section" target="_top">Top fragment</a>
<a id="parent-target" href="https://other.example.com/parent" target="_parent">Parent page</a>
<a id="download" href="https://dashboard.example.com/file" download>Download</a>
<a id="mail" href="mailto:hello@example.com">Email</a>
<a id="js" href="javascript:void(0)">Action</a><div id="shadow"></div>
<form id="get" action="https://dashboard.example.com/search?old=x" method="get"><input name="q" value="hello world"><button id="get-submit" name="from" value="dashboard">Search</button></form>
<form id="parent-get" action="https://other.example.com/parent-search" method="get" target="_parent"><input name="q" value="parent"><button id="parent-get-submit">Search parent</button></form>
<form id="post" action="https://dashboard.example.com/submit" method="post"><button id="post-submit">Send</button></form>
<form id="parent-post" action="https://dashboard.example.com/submit" method="post" target="_parent"><button id="parent-post-submit">Send parent</button></form>
<form id="password" action="https://dashboard.example.com/search" method="get"><input name="p" type="password" value="fixture"><button id="pass-submit">Sign in</button></form>
'''+extra+'</body></html>')
        p.add_script_tag(content=core);p.add_script_tag(content=mock)
        if patch:p.evaluate('(patch)=>Object.assign(__fixture.settings,patch)',patch)
        if tab:p.evaluate('(tab)=>Object.assign(__fixture.tab,tab)',tab)
        p.add_script_tag(content=(ROOT/'src/content/guard.js').read_text())
        p.add_script_tag(content='''for(const type of ['click','auxclick','submit'])document.addEventListener(type,e=>{if(type==='submit'||e.composedPath().some(n=>n.tagName==='A')){__fixture.native.push({type,trusted:e.isTrusted,tag:e.target.tagName});e.preventDefault()}});''')
        p.wait_for_timeout(40)
        return p
    def count(p):return p.evaluate('__fixture.opened.length')
    def routed_frame_guard(top_url,frame_url,frame_html,frame_documents=None,target_url=None,patch=None,unknown=False):
        p=context.new_page();frame_documents=frame_documents or {};target_url=target_url or frame_url
        top_html=f'<!doctype html><html><body><iframe src="{frame_url}"></iframe></body></html>'
        def serve(route):
            body=top_html if route.request.frame==p.main_frame else frame_documents.get(route.request.url,frame_html)
            route.fulfill(status=200,content_type='text/html',body=body)
        p.route('**/*',serve);p.goto(top_url);p.wait_for_timeout(80)
        frame=next(f for f in p.frames if f.parent_frame is not None and f.url==target_url)
        frame.add_script_tag(content=core);frame.add_script_tag(content=mock)
        frame.evaluate('(url)=>{__fixture.tab.url=url}',top_url)
        if patch:frame.evaluate('(patch)=>Object.assign(__fixture.settings,patch)',patch)
        if unknown:frame.evaluate("() => {const send=chrome.runtime.sendMessage;chrome.runtime.sendMessage=m=>m.type==='ANCHOR_HELLO'?new Promise(()=>{}):send(m)}")
        frame.add_script_tag(content=(ROOT/'src/content/guard.js').read_text())
        frame.add_script_tag(content='''for(const type of ['click','auxclick','submit'])document.addEventListener(type,e=>{if(type==='submit'||e.composedPath().some(n=>n.tagName==='A')){__fixture.native.push({type,trusted:e.isTrusted,tag:e.target.tagName});e.preventDefault()}});''')
        if not unknown:frame.wait_for_timeout(40)
        return p,frame
    def routed_guard_page(url,html,patch=None):
        p=context.new_page()
        p.route('**/*',lambda route:route.fulfill(status=200,content_type='text/html',body=html))
        p.goto(url);p.add_script_tag(content=core);p.add_script_tag(content=mock)
        p.evaluate('(url)=>{__fixture.tab.url=url}',url)
        if patch:p.evaluate('(patch)=>Object.assign(__fixture.settings,patch)',patch)
        p.add_script_tag(content=(ROOT/'src/content/guard.js').read_text())
        p.add_script_tag(content='''for(const type of ['click','auxclick','submit'])document.addEventListener(type,e=>{if(type==='submit'||e.composedPath().some(n=>n.tagName==='A')){__fixture.native.push({type,trusted:e.isTrusted,tag:e.target.tagName});e.preventDefault()}});''')
        p.wait_for_timeout(40);return p
    def simple_guard():
        p=guard();p.locator('#nested').click();p.wait_for_function('__fixture.opened.length===1');assert p.evaluate('__fixture.native.length')==0;p.close()
    test('DOM guard intercepts trusted nested link before page handlers',simple_guard)
    def keyboard():
        p=guard();p.locator('#normal').focus();p.locator('#normal').press('Enter');p.wait_for_function('__fixture.opened.length===1');p.close()
    test('DOM guard captures Enter-generated trusted link activation',keyboard)
    def native_guard():
        p=guard(tab={'pinned':False});p.locator('#normal').click();assert count(p)==0;assert p.evaluate('__fixture.native[0].trusted') is True;p.close()
    test('Known-unprotected DOM link stays trusted, unmodified and native',native_guard)
    for label,args in [('Ctrl',{'modifiers':['Control']}),('Shift',{'modifiers':['Shift']}),('Alt',{'modifiers':['Alt']}),('Meta',{'modifiers':['Meta']}),('Middle',{'button':'middle'})]:
        def modified(args=args):
            p=guard();p.locator('#normal').click(**args);assert count(p)==0;p.close()
        test(f'{label} DOM gesture is not intercepted',modified)
    for link in ['blank','download','mail','js']:
        def excluded(link=link):
            p=guard();p.locator('#'+link).click();assert count(p)==0;p.close()
        test(f'DOM native exclusion: {link}',excluded)
    def top_document_parent_link():
        p=guard();p.locator('#parent-target').click();p.wait_for_function('__fixture.opened.length===1')
        assert p.evaluate('__fixture.opened[0].target')=='_parent';p.close()
    test('DOM top-document _parent link is handled as a top target',top_document_parent_link)
    def top_document_parent_form():
        p=guard(patch={'protectGetForms':True});p.locator('#parent-get-submit').click();p.wait_for_function('__fixture.opened.length===1')
        assert p.evaluate('__fixture.opened[0].kind')=='form';assert p.evaluate('__fixture.opened[0].target')=='_parent';p.close()
    test('DOM top-document _parent GET form is protected',top_document_parent_form)
    def top_document_parent_post():
        p=guard(patch={'protectGetForms':True});p.locator('#parent-post-submit').click();assert count(p)==0
        assert p.evaluate('__fixture.native.filter(x=>x.type==="submit").length')==1;p.close()
    test('DOM top-document _parent POST form remains native',top_document_parent_post)
    def iframe_top_fragment():
        top='https://dashboard.example.com/dashboard';frame='https://frame.example.com/frame'
        p,f=routed_frame_guard(top,frame,'<!doctype html><a id="fragment" target="_top" href="#section">Section</a>')
        p.frame_locator('iframe').locator('#fragment').click();f.wait_for_function('__fixture.opened.length===1')
        message=f.evaluate('__fixture.opened[0]');assert message['url']==frame+'#section';assert message['target']=='_top';assert message['currentUrl']==top;p.close()
    test('Cross-origin iframe _top fragment resolves against frame but is checked against top URL',iframe_top_fragment)
    def iframe_top_fragment_unknown():
        top='https://dashboard.example.com/dashboard';frame='https://frame.example.com/frame'
        p,f=routed_frame_guard(top,frame,'<!doctype html><a id="fragment" target="_top" href="#section">Section</a>',unknown=True)
        p.frame_locator('iframe').locator('#fragment').click();f.wait_for_function('__fixture.opened.length===1')
        message=f.evaluate('__fixture.opened[0]');assert message['url']==frame+'#section';assert message['target']=='_top';p.close()
    test('Cross-origin iframe _top fragment is checked before the first snapshot arrives',iframe_top_fragment_unknown)
    def iframe_unprotected_stays_native():
        top='https://dashboard.example.com/dashboard';frame='https://frame.example.com/frame'
        p,f=routed_frame_guard(top,frame,'<!doctype html><a id="link" target="_top" href="https://other.example.com/page">Other</a>')
        f.evaluate('__fixture.tab.pinned=false;broadcast()');p.frame_locator('iframe').locator('#link').click()
        assert f.evaluate('__fixture.opened.length')==0;assert f.evaluate('__fixture.native[0].trusted') is True;p.close()
    test('Known-unprotected iframe top target stays a trusted native click',iframe_unprotected_stays_native)
    def iframe_matching_fragment():
        url='https://dashboard.example.com/frame'
        p,f=routed_frame_guard(url,url,'<!doctype html><a id="fragment" target="_top" href="#section">Section</a>')
        p.frame_locator('iframe').locator('#fragment').click();assert f.evaluate('__fixture.opened.length')==0
        assert not f.evaluate('__fixture.messages.some(m=>m.type==="ANCHOR_OPEN_LINK")')
        assert f.evaluate('__fixture.native[0].trusted') is True;p.close()
    test('Readable matching top document keeps an iframe _top fragment natively trusted',iframe_matching_fragment)
    def iframe_parent_targets():
        top='https://dashboard.example.com/dashboard';frame='https://frame.example.com/frame'
        html='''<!doctype html><a id="parent-link" target="_parent" href="https://other.example.com/parent">Parent</a>
<form action="https://other.example.com/search" method="get" target="_parent"><input name="q" value="parent"><button id="parent-get">Search</button></form>
<form action="https://dashboard.example.com/post" method="post" target="_parent"><button id="parent-post">Send</button></form>'''
        p,f=routed_frame_guard(top,frame,html);p.frame_locator('iframe').locator('#parent-link').click();f.wait_for_function('__fixture.opened.length===1')
        assert f.evaluate('__fixture.opened[0].target')=='_parent';p.close()
        p,f=routed_frame_guard(top,frame,html,patch={'protectGetForms':True});p.frame_locator('iframe').locator('#parent-get').click();f.wait_for_function('__fixture.opened.length===1')
        assert f.evaluate('__fixture.opened[0].kind')=='form';assert f.evaluate('__fixture.opened[0].target')=='_parent';p.close()
        p,f=routed_frame_guard(top,frame,html,patch={'protectGetForms':True});p.frame_locator('iframe').locator('#parent-post').click()
        assert f.evaluate('__fixture.opened.length')==0;assert f.evaluate('__fixture.native.filter(x=>x.type==="submit").length')==1;p.close()
    test('Direct-child iframe _parent link and GET form reach top; POST remains native',iframe_parent_targets)
    def nested_parent_stays_local():
        top='https://dashboard.example.com/dashboard';frame='https://frame.example.com/frame';nested='https://nested.example.com/nested'
        outer='<!doctype html><iframe src="'+nested+'"></iframe>'
        inner='<!doctype html><a id="parent" target="_parent" href="#section">Parent fragment</a>'
        p,f=routed_frame_guard(top,frame,outer,frame_documents={nested:inner},target_url=nested)
        p.frame_locator('iframe').frame_locator('iframe').locator('#parent').click()
        assert f.evaluate('__fixture.opened.length')==0;assert f.evaluate('__fixture.native.length')==1;p.close()
    test('Nested iframe _parent navigation stays in its immediate parent context',nested_parent_stays_local)
    def same_origin():
        p=guard(patch={'mode':'same-origin'});p.locator('#normal').click();assert count(p)==0;assert p.evaluate('__fixture.native[0].trusted');p.locator('#external').click();p.wait_for_function('__fixture.opened.length===1');p.close()
    test('DOM same-origin policy distinguishes internal and external links',same_origin)
    def shadow():
        p=guard();p.evaluate("{const s=document.querySelector('#shadow').attachShadow({mode:'open'});const a=document.createElement('a');a.id='inside';a.href='https://dashboard.example.com/detail';a.textContent='Inside shadow';s.append(a)}");p.locator('#inside').click();p.wait_for_function('__fixture.opened.length===1');p.close()
    test('DOM composedPath finds open-shadow links',shadow)
    def dynamic():
        p=guard();p.evaluate("{const a=document.createElement('a');a.id='later';a.href='https://dashboard.example.com/new';a.textContent='Later';document.body.append(a)}");p.locator('#later').click();p.wait_for_function('__fixture.opened.length===1');p.close()
    test('DOM delegation protects links inserted after initialization',dynamic)
    def form_get():
        p=guard(patch={'protectGetForms':True});p.locator('#get-submit').click();p.wait_for_function('__fixture.opened.length===1');dest=p.evaluate('__fixture.opened[0].url');assert 'q=hello+world' in dest;assert 'from=dashboard' in dest;assert 'old=x' not in dest;p.close()
    test('DOM GET-form serialization preserves submitter and replaces action query',form_get)
    def form_override_semantics():
        url='https://dashboard.example.com/form'
        html='''<!doctype html><form method="post" action="/parent"><input name="q" value="empty"><button id="empty" name="submit" value="yes" formmethod="" formaction="">Empty overrides</button></form>
<form method="post" action="/parent"><input name="q" value="invalid"><button id="invalid" formmethod="invalid" formaction="/override">Invalid method</button></form>
<form method="get" action="/no-button"><input id="no-button" name="q" value="plain"></form>'''
        p=routed_guard_page(url,html,patch={'protectGetForms':True})
        p.locator('#empty').click();p.wait_for_function('__fixture.opened.length===1')
        empty=p.evaluate('__fixture.opened[0].url');assert empty.startswith(url+'?');assert 'parent' not in empty
        p.locator('#invalid').click();p.wait_for_function('__fixture.opened.length===2')
        invalid=p.evaluate('__fixture.opened[1].url');assert '/override?' in invalid
        p.locator('#no-button').press('Enter');p.wait_for_function('__fixture.opened.length===3')
        no_submitter=p.evaluate('__fixture.opened[2].url');assert '/no-button?' in no_submitter;p.close()
    test('DOM form submit uses empty and invalid native overrides plus no-submitter GET',form_override_semantics)
    def form_post():
        p=guard(patch={'protectGetForms':True});p.locator('#post-submit').click();assert count(p)==0;assert p.evaluate('__fixture.native.filter(x=>x.type==="submit").length')==1;p.close()
    test('DOM POST submission is not intercepted or replayed',form_post)
    def form_password():
        p=guard(patch={'protectGetForms':True});p.locator('#pass-submit').click();assert count(p)==0;p.close()
    test('DOM password-containing GET form is left native',form_password)
    def external_password():
        p=guard(patch={'protectGetForms':True},extra='<input form="get" name="secret" type="password" value="fixture">')
        p.locator('#get-submit').click();assert count(p)==0;assert p.evaluate('__fixture.native.filter(x=>x.type==="submit").length')==1;p.close()
    test('DOM externally associated password field keeps GET form native',external_password)
    def base_target():
        p=guard(patch={'protectGetForms':True},extra='<base target="_blank">')
        p.locator('#get-submit').click();assert count(p)==0;assert p.evaluate('__fixture.native.filter(x=>x.type==="submit").length')==1;p.close()
    test('DOM GET form honors inherited base target',base_target)
    def reconnect():
        p=guard();p.add_script_tag(content=(ROOT/'src/content/guard.js').read_text());p.add_script_tag(content=(ROOT/'src/content/guard.js').read_text());p.locator('#normal').click();p.wait_for_function('__fixture.opened.length===1');assert p.evaluate('__fixture.listeners.length')==1;p.close()
    test('DOM reinjection is idempotent; one gesture makes one request',reconnect)
    def synthetic():
        p=guard();p.evaluate('document.querySelector("#normal").click()');assert count(p)==0;p.close()
    test('Untrusted synthetic page clicks cannot trigger the guard',synthetic)
    def pin_broadcast():
        p=guard(tab={'pinned':False});p.evaluate('__fixture.tab.pinned=true;broadcast()');p.locator('#normal').click();p.wait_for_function('__fixture.opened.length===1');p.close()
    test('DOM snapshot broadcast activates a newly pinned tab without reinjection',pin_broadcast)
    def disconnected():
        p=guard();p.evaluate('__fixture.fail=true');p.locator('#normal').click();p.wait_for_timeout(100);assert count(p)==0;assert p.evaluate('__fixture.native.length')==0;assert p.evaluate('document.documentElement.lastElementChild.tagName')=='DIV';p.close()
    test('Disconnected runtime keeps protected click cancelled, rather than replaying it',disconnected)
    def stale_snapshot():
        p=guard();p.evaluate("__fixture.listeners.forEach(fn=>fn({type:'ANCHOR_STATE',snapshot:{...snapshot(),active:false,revision:0}},{id:chrome.runtime.id},()=>{}))");p.locator('#normal').click();p.wait_for_function('__fixture.opened.length===1');p.close()
    test('DOM guard rejects out-of-order protection snapshot',stale_snapshot)
    def wrong_document():
        p=guard();p.evaluate("__fixture.listeners.forEach(fn=>fn({type:'ANCHOR_STATE',snapshot:{...snapshot(),active:false,revision:99,documentId:'other-document'}},{id:chrome.runtime.id},()=>{}))");p.locator('#normal').click();p.wait_for_function('__fixture.opened.length===1');p.close()
    test('DOM guard rejects a snapshot for another document',wrong_document)
    def revision_reset_handshake():
        p=guard();p.evaluate("__fixture.settings.mode='same-origin';broadcast()")
        result=p.evaluate('''() => {
          const current=snapshot(), lower={...current,active:false,revision:current.revision-1};
          const deliver=message=>{let reply;__fixture.listeners.forEach(fn=>fn(message,{},value=>reply=value));return reply;};
          const wrongGuard=deliver({type:'ANCHOR_STATE',snapshot:lower,guardId:'wrong-guard',resetFromRevision:current.revision});
          const wrongRevision=deliver({type:'ANCHOR_STATE',snapshot:lower,guardId:wrongGuard.guardId,resetFromRevision:current.revision-1});
          const wrongDocument=deliver({type:'ANCHOR_STATE',snapshot:{...lower,documentId:'other-document'},guardId:wrongGuard.guardId,resetFromRevision:current.revision});
          const accepted=deliver({type:'ANCHOR_STATE',snapshot:lower,guardId:wrongGuard.guardId,resetFromRevision:current.revision});
          return {current:current.revision,wrongGuard,wrongRevision,wrongDocument,accepted};
        }''')
        assert result['current']>1;assert result['wrongGuard']['ok'] is False;assert result['wrongRevision']['ok'] is False
        assert result['wrongDocument']['ok'] is False;assert result['accepted']['ok'] is True
        assert result['accepted']['revision']==result['current']-1;p.close()
    test('DOM guard accepts a lower revision only for its exact same-document reset handshake',revision_reset_handshake)
    def destination_control():
        p=ui('popup');p.locator('#destination').select_option('new-window');assert p.evaluate('__fixture.record.destination')=='new-window';p.locator('#destination').select_option('browsing-window');assert p.evaluate('__fixture.record.destination')=='browsing-window';p.close()
    test('Popup routes destination preferences through tab-scoped messages',destination_control)
    def focus_control():
        p=ui('popup');p.locator('[data-foreground="false"]').click();assert p.evaluate('__fixture.record.foreground') is False;assert p.evaluate('__fixture.settings.foreground') is True;p.close()
    test('Per-tab focus preference does not mutate the global default',focus_control)
    def settings_destination():
        p=ui('options');p.locator('#destination').select_option('browsing-window');assert p.evaluate('__fixture.settings.destination')=='browsing-window';p.close()
    test('Default destination is editable in Settings',settings_destination)
    # Raw local dashboard render is illustrative data, never a real account screenshot.
    p=context.new_page();html=(ROOT/'tests/fixtures/index.html').read_text();html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S);html=re.sub(r'<link\b[^>]*>','',html);html=re.sub(r'<iframe.*?</iframe>','',html,flags=re.S);html=html.replace('<body>','<body class="hide-tests">');html=html.replace('</head>','<style>'+(ROOT/'tests/fixtures/fixture.css').read_text()+'</style></head>');p.set_content(html);p.screenshot(path=str(OUT/'source-dashboard.png'));p.close()
    version=b.version
    b.close()
report={'version':'2.0.0','date':datetime.now(ZoneInfo('America/Regina')).date().isoformat(),'browser':'Chromium '+version,'method':'Actual shipped DOM/UI scripts with mocked Chrome APIs. General UI fixtures use about:blank; iframe and form navigation cases use synthetic HTTP origins served entirely through local Playwright routes. NOT installed-extension E2E. No policy changes or external requests.', 'tests':results,'passed':sum(r['status']=='PASS' for r in results),'failed':sum(r['status']=='FAIL' for r in results)}
(ROOT/'docs/ui-dom-test-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(f"\n{report['passed']} passed; {report['failed']} failed",flush=True)
sys.exit(1 if report['failed'] else 0)
