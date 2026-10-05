"""Verify the shipped local-UI CSP in Chromium with an about:blank fixture.
This verifies browser CSP enforcement, not unpacked-extension startup or privileges.
No external request should be emitted by these cases.
"""
from pathlib import Path
import json,os,sys,tempfile
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
policy=json.loads((ROOT/'public/manifest.json').read_text())['content_security_policy']['extension_pages']
with tempfile.TemporaryDirectory(prefix='anchor-csp-') as profile,sync_playwright() as pw:
    executable=os.getenv('CHROME_BIN') or '/usr/lib/chromium/chromium'
    opts=dict(headless=True,args=['--no-sandbox','--disable-gpu'],timeout=20000)
    if Path(executable).exists():opts['executable_path']=executable
    browser=pw.chromium.launch(**opts)
    page=browser.new_page()
    violations=[];requests=[]
    page.on('request',lambda request:requests.append(request.url))
    page.set_content('<meta http-equiv="Content-Security-Policy" content="'+policy+'"><div id="message">Local interface</div>')
    page.evaluate('''() => {window.violations=[];document.addEventListener('securitypolicyviolation',e=>window.violations.push(e.effectiveDirective));}''')
    result=page.evaluate('''async () => {try{await fetch('https://anchor-csp-check.invalid/');return 'unexpected';}catch{return 'blocked';}}''')
    page.wait_for_function("window.violations.includes('connect-src')")
    assert result=='blocked' and requests==[],(result,requests)
    print('PASS shipped CSP blocks network connection before a request is emitted')
    page.evaluate('''() => {const style=document.createElement('style');style.textContent='#message{color:rgb(23,55,44)}';document.head.append(style);const image=new Image();image.id='icon';image.src='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';document.body.append(image);}''')
    page.wait_for_function("document.querySelector('#icon').complete && document.querySelector('#icon').naturalWidth===1")
    assert page.locator('#message').evaluate("el=>getComputedStyle(el).color")=='rgb(23, 55, 44)'
    print('PASS shipped CSP preserves required inline styles and local data images')
    page.evaluate('''() => {const form=document.createElement('form');form.action='https://anchor-csp-check.invalid/submit';document.body.append(form);form.submit();}''')
    page.wait_for_function("window.violations.includes('form-action')")
    assert page.url=='about:blank' and requests==[],(page.url,requests)
    print('PASS shipped CSP blocks unexpected native form submission')
    with page.expect_download() as download_event:
        page.evaluate("""() => {const url=URL.createObjectURL(new Blob(['{\"schemaVersion\":1}'],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='anchor-csp-export.json';document.body.append(link);link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}""")
    download=download_event.value
    assert download.suggested_filename=='anchor-csp-export.json' and download.failure() is None
    assert Path(download.path()).read_text()=='{"schemaVersion":1}'
    print('PASS shipped CSP preserves local Blob export downloads')
    browser.close()
print('4 passed; 0 failed')
