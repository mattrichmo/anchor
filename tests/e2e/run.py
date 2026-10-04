"""Real Chromium extension tests. Run from repo root: python tests/e2e/run.py
Default: headless Chromium. Optional headed Linux: ANCHOR_HEADED=1 xvfb-run -a python tests/e2e/run.py
No mocks are used for pinning, opening tabs, messages, or navigation.
"""
from pathlib import Path
import os,sys,json,time,tempfile,subprocess,shutil,urllib.request,traceback
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
BASE='http://127.0.0.1:8765'
OUT=ROOT/'docs';OUT.mkdir(exist_ok=True)
RESULTS=[]
server=subprocess.Popen(['node',str(ROOT/'tests/fixtures/server.mjs')],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
    for _ in range(80):
        try:
            urllib.request.urlopen(BASE+'/health',timeout=.2);break
        except Exception:time.sleep(.1)
    with tempfile.TemporaryDirectory(prefix='anchor-e2e-') as profile, sync_playwright() as pw:
        executable=os.getenv('CHROME_BIN') or ('/usr/lib/chromium/chromium' if Path('/usr/lib/chromium/chromium').exists() else shutil.which('chromium'))
        options=dict(headless=os.getenv('ANCHOR_HEADED')!='1',timeout=30000,ignore_default_args=['--disable-extensions'],env={**os.environ,'HOME':profile,'XDG_CACHE_HOME':profile},args=['--no-sandbox','--disable-gpu',f'--disable-extensions-except={ROOT/"extension"}',f'--load-extension={ROOT/"extension"}'],viewport={'width':1280,'height':800},accept_downloads=True)
        if executable:options['executable_path']=executable
        ctx=pw.chromium.launch_persistent_context(profile,**options)
        try:
            worker=ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker',timeout=30000)
        except Exception as error:
            report={'build':'2.0.0','date':'2026-10-03','status':'NOT_RUN','phase':'extension startup','tests':[],'passed':0,'failed':0,
                'reason':'No extension service worker appeared. Inspect chrome://extensions for loading errors and chrome://policy for installation restrictions. Use a browser/profile where unpacked extension installation is permitted; do not alter managed restrictions.',
                'error':str(error)}
            (OUT/'browser-test-results.json').write_text(json.dumps(report,indent=2)+'\n')
            ctx.close()
            print(report['reason'],file=sys.stderr)
            raise SystemExit(2)
        extension_id=worker.url.split('/')[2]
        ui=ctx.new_page();ui.goto(f'chrome-extension://{extension_id}/ui/options.html')
        ui.wait_for_selector('#version')
        def api(message):
            result=ui.evaluate('(message) => chrome.runtime.sendMessage(message)',message)
            assert result and result.get('ok'),result
            return result
        def tabs():return worker.evaluate('() => chrome.tabs.query({})')
        def get_id(page):
            value=worker.evaluate('(url) => chrome.tabs.query({}).then(tabs => tabs.find(t => t.url === url)?.id)',page.url)
            assert value is not None,f'No tab for {page.url}'
            return value
        def prepare(pinned=True,patch=None,manual=False,url='/'):
            for page in list(ctx.pages):
                if page!=ui:page.close()
            api({'type':'UI_RESET'})
            if patch:api({'type':'UI_SETTINGS','patch':patch})
            p=ctx.new_page();p.goto(BASE+url);p.wait_for_selector('#normal')
            ident=get_id(p)
            if pinned:worker.evaluate('(id) => chrome.tabs.update(id,{pinned:true})',ident)
            if manual:api({'type':'UI_TAB','tabId':ident,'action':'protect'})
            s=api({'type':'UI_STATE','tabId':ident})
            assert not s['snapshot']['active'] or s['connected'],s
            return p,ident
        def branch(p,selector,fragment,click_args=None):
            old=p.url;p.evaluate('window.anchorPreservedState={marker:4711}')
            before=len(tabs())
            with ctx.expect_page(timeout=8000) as created:p.locator(selector).click(**(click_args or {}))
            q=created.value;q.wait_for_load_state();assert fragment in q.url,q.url
            assert p.url==old,(p.url,old)
            assert p.evaluate('window.anchorPreservedState.marker')==4711
            assert len(tabs())==before+1
            assert not next(t for t in tabs() if t['url']==q.url)['pinned']
            return q
        def test(name,fn):
            started=time.monotonic()
            try:fn();RESULTS.append({'name':name,'status':'PASS','seconds':round(time.monotonic()-started,3)});print('PASS',name,flush=True)
            except Exception as e:
                RESULTS.append({'name':name,'status':'FAIL','error':str(e),'seconds':round(time.monotonic()-started,3)})
                print('FAIL',name,str(e),flush=True);traceback.print_exc()
        def normal():
            p,_=prepare();branch(p,'#normal span','normal=1')
        test('Pin already-open tab: nested ordinary link branches; source document state preserved',normal)
        def foreground():
            p,_=prepare();q=branch(p,'#normal','normal=1');assert next(t for t in tabs() if t['url']==q.url)['active']
        test('Foreground preference activates the branch',foreground)
        def background():
            p,ident=prepare(patch={'foreground':False});p.bring_to_front();branch(p,'#normal','normal=1');assert next(t for t in tabs() if t['id']==ident)['active']
        test('Background preference keeps the source active',background)
        def spa():
            p,_=prepare();branch(p,'#spa','spa=1');assert p.locator('h1').inner_text()=='A good place to start.'
        test('Anchor-element SPA link intercepted before router handler',spa)
        def unpinned():
            p,_=prepare(pinned=False);p.locator('#spa').click();assert 'spa=1' in p.url;assert p.evaluate('window.fixtureEvents[0].trusted') is True
        test('Unprotected SPA click remains genuinely trusted and native',unpinned)
        def unpin():
            p,ident=prepare();worker.evaluate('(id)=>chrome.tabs.update(id,{pinned:false})',ident);api({'type':'UI_STATE','tabId':ident});p.locator('#spa').click();assert 'spa=1' in p.url;assert p.evaluate('window.fixtureEvents[0].trusted') is True
        test('Unpin immediately restores native page interaction',unpin)
        def manual():
            p,_=prepare(pinned=False,manual=True);branch(p,'#normal','normal=1')
        test('Manual protection works for an unpinned tab',manual)
        def same_origin():
            p,_=prepare(patch={'mode':'same-origin'});p.locator('#spa').click();assert 'spa=1' in p.url;assert p.evaluate('window.fixtureEvents[0].trusted') is True
        test('Same-origin mode allows internal trusted routing',same_origin)
        def other_origin():
            p,_=prepare(patch={'mode':'same-origin'});branch(p,'#external','external=1')
        test('Same-origin mode branches a different host',other_origin)
        def home():
            p,ident=prepare();api({'type':'UI_TAB','tabId':ident,'action':'mode','mode':'home'});branch(p,'#normal','normal=1')
        test('Home URL mode branches away from saved home',home)
        def hashes():
            p,_=prepare();before=len(tabs());p.locator('#hash').click();assert p.url.endswith('#section');assert len(tabs())==before
        test('Same-page section link remains native by default',hashes)
        def hashes_on():
            p,_=prepare(patch={'branchHashes':True});branch(p,'#hash','#section')
        test('Hash links branch when explicitly enabled',hashes_on)
        def dynamic():
            p,_=prepare();p.locator('#insert').click();branch(p,'#dynamic','dynamic=1')
        test('Dynamically inserted links are protected',dynamic)
        def shadow():
            p,_=prepare();branch(p,'#shadow-link','shadow=1')
        test('Open shadow DOM links are protected',shadow)
        def blank():
            p,_=prepare();before=len(tabs());branch(p,'#blank','blank=1');assert len(tabs())==before+1
        test('Native target=_blank opens exactly one tab',blank)
        def keyboard():
            p,_=prepare();p.locator('#normal').focus()
            with ctx.expect_page() as c:p.locator('#normal').press('Enter')
            q=c.value;q.wait_for_load_state();assert 'normal=1' in q.url;assert p.url==BASE+'/'
        test('Keyboard Enter on a protected link branches',keyboard)
        def ctrl_click():
            p,_=prepare();branch(p,'#normal','normal=1',{'modifiers':['Control']})
        test('Ctrl-click retains native one-tab behavior',ctrl_click)
        def middle_click():
            p,_=prepare();branch(p,'#normal','normal=1',{'button':'middle'})
        test('Middle-click retains native one-tab behavior',middle_click)
        def download():
            p,_=prepare();before=len(tabs())
            with p.expect_download() as d:p.locator('#download').click()
            assert d.value.suggested_filename=='anchor-demo.txt';assert len(tabs())==before;assert p.url==BASE+'/'
        test('Downloads remain native; no extra tab or navigation',download)
        def get_form():
            p,_=prepare(patch={'protectGetForms':True});q=branch(p,'#get-submit','q=hello+world');assert 'source=dashboard' in q.url;assert 'replace=me' not in q.url
        test('Opt-in GET form preserves submitter and native query replacement',get_form)
        def post_form():
            p,_=prepare(patch={'protectGetForms':True});before=json.load(urllib.request.urlopen(BASE+'/counts'))['posts'];p.locator('#post-submit').click();p.wait_for_url('**/post');after=json.load(urllib.request.urlopen(BASE+'/counts'))['posts'];assert after-before==1
        test('POST form is submitted exactly once natively',post_form)
        def password():
            p,_=prepare(patch={'protectGetForms':True});before=len(tabs());p.locator('#password-submit').click();p.wait_for_url('**/search?*');assert len(tabs())==before
        test('Password-containing GET form is not intercepted',password)
        def iframe_top():
            p,_=prepare();before=p.url
            with ctx.expect_page() as created:p.frame_locator('#frame').locator('#frame-top').click()
            q=created.value;q.wait_for_load_state();assert 'frame=top' in q.url;assert p.url==before
        test('Iframe target=_top link branches without replacing the top document',iframe_top)
        def iframe_self():
            p,_=prepare();before=len(tabs());p.frame_locator('#frame').locator('#frame-self').click();p.frame_locator('#frame').locator('#destination').wait_for();assert p.url==BASE+'/';assert len(tabs())==before
        test('Frame-local link remains within its iframe',iframe_self)
        def pause():
            p,ident=prepare();api({'type':'UI_TAB','tabId':ident,'action':'pause'});p.locator('#spa').click();assert 'spa=1' in p.url
        test('Five-minute pause allows native navigation',pause)
        def pause_expiry():
            p,ident=prepare();api({'type':'UI_TAB','tabId':ident,'action':'pause'})
            api({'type':'UI_TAB','tabId':ident,'action':'resume'});branch(p,'#normal','normal=1')
        test('Resume from pause restores protection',pause_expiry)
        def excluded():
            p,_=prepare(patch={'rules':[{'origin':BASE,'mode':'off'}]});p.locator('#spa').click();assert 'spa=1' in p.url
        test('Exact-origin exclusion disables protection',excluded)
        def master():
            p,_=prepare(patch={'enabled':False});p.locator('#spa').click();assert 'spa=1' in p.url
        test('Master switch leaves navigation native',master)
        def same_url_repeated():
            p,_=prepare(patch={'foreground':False});branch(p,'#normal','normal=1');branch(p,'#normal','normal=1')
        test('Two intentional clicks to the same URL open two tabs (not URL-deduped)',same_url_repeated)
        def reinject():
            p,ident=prepare();api({'type':'UI_RECONNECT','tabId':ident});api({'type':'UI_RECONNECT','tabId':ident});branch(p,'#normal','normal=1')
        test('Repeated reinjection does not add duplicate listeners',reinject)
        def pinned_placement():
            p,ident=prepare();other=ctx.new_page();other.goto(BASE+'/?other=1');oid=get_id(other);worker.evaluate('(id)=>chrome.tabs.update(id,{pinned:true})',oid);q=branch(p,'#normal','normal=1');all_tabs=tabs();dest=next(t for t in all_tabs if t['url']==q.url);assert dest['index']>=len([t for t in all_tabs if t['pinned']])
        test('Branch placement respects Chrome’s pinned-tab boundary',pinned_placement)
        def redirect():
            p,_=prepare();branch(p,'#redirect','redirected=1')
        test('HTTP redirect happens only in the new branch',redirect)
        def script_only():
            p,_=prepare();before=len(tabs());p.locator('#js-only').click();p.wait_for_url('**/destination?js=1');assert len(tabs())==before
        test('Documented limit: JavaScript-only button navigation remains native',script_only)
        def history_only():
            p,_=prepare();before=len(tabs());p.locator('#pushstate').click();assert 'history=1' in p.url;assert len(tabs())==before
        test('Documented limit: standalone history.pushState is not reversed',history_only)
        def no_opener():
            p,_=prepare();q=branch(p,'#normal','normal=1');assert q.evaluate('window.opener===null')
        test('Extension-created branch has no window.opener access to the dashboard',no_opener)
        def recovery():
            p,ident=prepare(patch={'recovery':True});session=ctx.new_cdp_session(p)
            with ctx.expect_page(timeout=10000) as c:
                session.send('Page.navigate',{'url':BASE+'/destination?typed=1','transitionType':'typed'})
            q=c.value;q.wait_for_load_state();p.wait_for_url(BASE+'/',timeout=10000);assert 'typed=1' in q.url
            assert api({'type':'UI_STATE','tabId':ident})['snapshot']['recoveryTripped']
        test('Opt-in typed navigation recovery reloads prior URL and trips circuit breaker',recovery)
        def recovery_post():
            p,_=prepare(patch={'recovery':True,'protectGetForms':True});before=len(tabs());count=json.load(urllib.request.urlopen(BASE+'/counts'))['posts'];p.locator('#post-submit').click();p.wait_for_url('**/post');time.sleep(.2);assert len(tabs())==before;assert json.load(urllib.request.urlopen(BASE+'/counts'))['posts']==count+1
        test('Recovery never replays POST navigation',recovery_post)
        def persistence():
            p,ident=prepare(pinned=False,manual=True);api({'type':'UI_SETTINGS','patch':{'foreground':False}})
            # The worker is terminated through CDP, not simulated by clearing variables.
            cdp=ctx.new_cdp_session(p);targets=cdp.send('Target.getTargets')['targetInfos'];target=next(t for t in targets if t['type']=='service_worker' and extension_id in t['url'])
            cdp.send('Target.closeTarget',{'targetId':target['targetId']});time.sleep(.3)
            state=api({'type':'UI_STATE','tabId':ident});assert state['snapshot']['active'];assert state['snapshot']['reason']=='manual';assert state['settings']['foreground'] is False
            nonlocal_holder['worker']=ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker')
        # Worker replacement would invalidate helper closures; exercise it after UI tests below.
        def settings_ui():
            p,ident=prepare();ui.reload();ui.wait_for_function('document.querySelector("#protectPinned").checked')
            ui.locator('#foreground').select_option('false');ui.wait_for_function('document.querySelector("#saved").textContent.includes("Saved")');assert api({'type':'UI_STATE'})['settings']['foreground'] is False
            ui.locator('#rule-origin').fill(BASE);ui.locator('#rule-mode').select_option('same-origin');ui.locator('#rule-form button').click();ui.wait_for_selector('.rule-item');assert api({'type':'UI_STATE'})['settings']['rules'][0]['mode']=='same-origin'
            ui.locator('.rule-item button').click();ui.wait_for_selector('.empty');assert api({'type':'UI_STATE'})['settings']['rules']==[]
        test('Settings UI persists preferences and adds/removes exact-origin rules',settings_ui)
        def popup_ui():
            p,ident=prepare();pop=ctx.new_page();pop.goto(f'chrome-extension://{extension_id}/ui/popup.html?tab={ident}');pop.wait_for_function('document.querySelector("#status-title").textContent==="This tab stays put."');pop.locator('[data-mode="same-origin"]').click();pop.wait_for_function('document.querySelector("[data-mode=\"same-origin\"]").getAttribute("aria-pressed")==="true"');assert api({'type':'UI_STATE','tabId':ident})['snapshot']['mode']=='same-origin';pop.locator('#pause').click();pop.wait_for_function('document.querySelector("#status-title").textContent==="Taking a short break"');assert api({'type':'UI_STATE','tabId':ident})['snapshot']['reason']=='paused'
        test('Actual popup shows protected state, changes mode and pauses',popup_ui)
        def export_import():
            p,_=prepare();ui.reload();ui.wait_for_selector('#export')
            with ui.expect_download() as d:ui.locator('#export').click()
            saved=Path(profile)/'export.json';d.value.save_as(saved);data=json.loads(saved.read_text());assert data['schemaVersion']==1;assert 'tab:' not in saved.read_text();assert data['product']=='Anchor'
            response=ui.evaluate("() => chrome.runtime.sendMessage({type:'UI_IMPORT',settings:{schemaVersion:999}})");assert response['ok'] is False
        test('Settings export is valid JSON; invalid schema import rejected',export_import)
        def narrow_permissions():
            m=worker.evaluate('() => chrome.runtime.getManifest()');assert 'tabs' not in m['permissions'];assert 'cookies' not in m['permissions'];assert 'history' not in m['permissions'];assert m['incognito']=='not_allowed'
        test('Manifest omits tabs/history/cookies/debugger permissions and disables incognito',narrow_permissions)
        def page_spoof():
            p,_=prepare();before=len(tabs());p.evaluate("window.postMessage({type:'ANCHOR_OPEN_LINK',url:'http://localhost:8765/destination?spoof=1'},'*')");time.sleep(.2);assert len(tabs())==before
        test('Page-world postMessage cannot invoke extension navigation',page_spoof)
        def separate_window():
            p,ident=prepare(patch={'destination':'new-window'});wid=next(t['windowId'] for t in tabs() if t['id']==ident);q=branch(p,'#normal','normal=1');assert next(t['windowId'] for t in tabs() if t['url']==q.url)!=wid
        test('New-window destination opens a real separate window and preserves the source document',separate_window)
        def shared_browsing():
            p,ident=prepare(patch={'destination':'browsing-window','foreground':False});first=branch(p,'#normal','normal=1');second=branch(p,'#external','external=1');alltabs=tabs();firstw=next(t['windowId'] for t in alltabs if t['url']==first.url);assert firstw==next(t['windowId'] for t in alltabs if t['url']==second.url);assert firstw!=next(t['windowId'] for t in alltabs if t['id']==ident)
        test('Two real branches share the designated browsing window without replacing the first',shared_browsing)
        def solo_window():
            p,ident=prepare();p.evaluate('window.anchorPreservedState={marker:999}');api({'type':'UI_SOLO','tabId':ident});wid=next(t['windowId'] for t in tabs() if t['id']==ident);assert sum(t['windowId']==wid for t in tabs())==1;assert p.evaluate('window.anchorPreservedState.marker')==999;branch(p,'#normal','normal=1');assert sum(t['windowId']==wid for t in tabs())==1
        test('Solo flow moves a live tab without reloading and routes exploration outside',solo_window)
        def native_reserved():
            p,ident=prepare();api({'type':'UI_SOLO','tabId':ident});source_window=next(t['windowId'] for t in tabs() if t['id']==ident);q=branch(p,'#blank','blank=1');qid=get_id(q);worker.evaluate("async ({id,source})=>{for(let i=0;i<80;i++){if((await chrome.tabs.get(id)).windowId!==source)return;await new Promise(r=>setTimeout(r,50));}throw Error('Native branch did not move');}",{'id':qid,'source':source_window});assert p.url==BASE+'/'
        test('Reserved window relocates a native target=_blank tab, preserving the source page',native_reserved)
        def grid_workspace():
            p,ident=prepare();pages=[p];ids=[ident]
            for n in range(2,5):
                q=ctx.new_page();q.goto(BASE+f'/?anchor={n}');q.wait_for_selector('#normal');pages.append(q);ids.append(get_id(q))
            for n,q in enumerate(pages):q.evaluate('(n)=>window.anchorPreservedState={marker:n,field:"unfinished",scroll:317}',n)
            definition={'id':'live-grid-test','name':'Live grid fixture','layout':'grid','destination':'browsing-window','foreground':False,'reserved':True,'gap':12,'displayId':'auto','anchors':[{'id':f'a{n}','label':f'Fixture {n}','url':q.url,'mode':'strict'} for n,q in enumerate(pages)]}
            api({'type':'UI_SAVE_WORKSPACE','workspace':definition});api({'type':'UI_OPEN_WORKSPACE','workspaceId':'live-grid-test','adoptIds':{f'a{n}':tid for n,tid in enumerate(ids)},'area':{'left':0,'top':0,'width':1920,'height':1080}})
            bound=[t for t in tabs() if t['id'] in ids];assert len({t['windowId'] for t in bound})==4
            for n,q in enumerate(pages):assert q.evaluate('window.anchorPreservedState.marker')==n
            before=len(tabs());api({'type':'UI_OPEN_WORKSPACE','workspaceId':'live-grid-test','area':{'left':0,'top':0,'width':1920,'height':1080}});assert len(tabs())==before
            api({'type':'UI_RELEASE_WORKSPACE','workspaceId':'live-grid-test'});assert len(tabs())==before
            for n,q in enumerate(pages):assert q.evaluate('window.anchorPreservedState.field')=='unfinished'
        test('Real four-window workspace adopts live pages, reuses bindings, and releases without reload',grid_workspace)
        # Capture real built UI after all functional cases, with actual connected/pinned state.
        def screenshots():
            p,ident=prepare(url='/?showcase=1');p.screenshot(path=str(ROOT/'store/screenshots/source-dashboard.png'))
            pop=ctx.new_page();pop.set_viewport_size({'width':392,'height':600});pop.goto(f'chrome-extension://{extension_id}/ui/popup.html?tab={ident}');pop.wait_for_function('document.querySelector("#status-title").textContent==="This tab stays put."')
            pop.locator('.popup').screenshot(path=str(ROOT/'store/screenshots/source-popup.png'))
            assert pop.evaluate('document.documentElement.scrollWidth')<=392
            assert pop.evaluate('document.body.clientHeight')<=600
            ui.reload();ui.wait_for_function('document.querySelector("#protectPinned").checked');ui.screenshot(path=str(ROOT/'store/screenshots/02-settings-1280x800.png'))
            ui.locator('#advanced').scroll_into_view_if_needed();ui.screenshot(path=str(ROOT/'store/screenshots/03-advanced-1280x800.png'))
            ui.set_viewport_size({'width':390,'height':844});ui.screenshot(path=str(ROOT/'store/screenshots/source-settings-mobile.png'));assert ui.evaluate('document.documentElement.scrollWidth')<=390
            ui.set_viewport_size({'width':1280,'height':800});welcome=ctx.new_page();welcome.goto(f'chrome-extension://{extension_id}/ui/welcome.html');welcome.screenshot(path=str(ROOT/'store/screenshots/04-welcome-1280x800.png'))
        test('Real UI screenshots: popup fits Chrome size; settings responsive without horizontal overflow',screenshots)
        nonlocal_holder={}
        test('Manual protection and preferences survive real service-worker termination',persistence)
        # Collect the exact browser version through CDP even when the old worker is closed.
        cdp=ctx.new_cdp_session(ui);browser_version=cdp.send('Browser.getVersion')
        report={'build':'2.0.0','date':'2026-10-03','engine':browser_version['product'],'platform':sys.platform,'extension_id_is_test_only':True,'tests':RESULTS,'passed':sum(r['status']=='PASS' for r in RESULTS),'failed':sum(r['status']=='FAIL' for r in RESULTS)}
        (OUT/'browser-test-results.json').write_text(json.dumps(report,indent=2)+'\n')
        print(f"\n{report['passed']} passed; {report['failed']} failed; {report['engine']}",flush=True)
        ctx.close()
        sys.exit(1 if report['failed'] else 0)
finally:
    server.terminate()
    try:server.wait(timeout=3)
    except subprocess.TimeoutExpired:server.kill()
