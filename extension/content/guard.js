/** Isolated-world link interception. No main-world API patching or page messages. */
(() => {
  'use strict';
  const version = chrome.runtime.getManifest().version;
  const old = globalThis.__anchorGuard;
  if (old?.id === chrome.runtime.id && old.version === version && old.alive()) { old.refresh(); return; }
  old?.dispose?.();
  const C = globalThis.AnchorCore;
  const abort = new AbortController();
  const replaying = new WeakSet();
  let snapshot = null, refreshing = null, lastRefresh = 0, documentId = null;
  const guardId = gestureId();
  let toastHost = null;
  function alive() { try { return !!chrome.runtime.id; } catch { return false; } }
  function acceptSnapshot(next) {
    if(!next || !Number.isInteger(next.revision) || next.revision<1) return false;
    if(documentId && next.documentId && documentId!==next.documentId) return false;
    if(snapshot && next.revision<snapshot.revision) return false;
    if(next.documentId)documentId=next.documentId;
    snapshot=next;return true;
  }
  async function refresh() {
    if (refreshing || !alive()) return refreshing;
    refreshing = chrome.runtime.sendMessage({type:'ANCHOR_HELLO',guardId})
      .then(result => { if (result?.ok && acceptSnapshot(result.snapshot)) void chrome.runtime.sendMessage({type:'ANCHOR_ACK',guardId,revision:snapshot.revision}).catch(()=>{}); })
      .catch(() => {})
      .finally(() => {refreshing = null;lastRefresh = Date.now();});
    return refreshing;
  }
  function notice(text) {
    toastHost?.remove();
    toastHost = document.createElement('div');
    const root = toastHost.attachShadow({mode:'closed'});
    const style = document.createElement('style');
    style.textContent = `:host{all:initial;position:fixed;bottom:22px;right:22px;z-index:2147483647} .box{font:14px/1.5 system-ui,sans-serif;max-width:350px;background:#162c26;color:#f3f6ef;padding:18px 20px;border:1px solid #b5e8bd;border-radius:16px;box-shadow:0 10px 40px #0004}strong{display:block;margin-bottom:5px;color:#c9f2b7}button{margin-top:12px;border:1px solid #91a79b;border-radius:7px;background:transparent;color:inherit;padding:5px 10px;cursor:pointer}`;
    const box = document.createElement('div');box.className='box';box.setAttribute('role','alert');
    const title = document.createElement('strong');title.textContent='Anchor';
    const message = document.createElement('div');message.textContent=text;
    const close = document.createElement('button');close.textContent='Dismiss';close.onclick=()=>toastHost?.remove();
    box.append(title,message,close);root.append(style,box);(document.documentElement || document).append(toastHost);
    setTimeout(()=>toastHost?.remove(),18000);
  }
  function findLink(event) {
    return event.composedPath().find(n => n instanceof Element && n.matches('a[href],area[href]'));
  }
  function targetIsNative(node) {
    const target = (node.getAttribute('target') || document.querySelector('base[target]')?.getAttribute('target') || '').toLowerCase();
    // Same-frame iframe links and named browsing contexts remain native; top escapes can branch.
    if (window !== window.top) return !['_top'].includes(target);
    return !!target && !['_self','_top','_parent'].includes(target);
  }
  function cancel(event) { event.preventDefault();event.stopImmediatePropagation(); }
  function replay(node, submitter) {
    if (!node.isConnected) {notice('The link changed while Chrome checked this tab. Click it again.');return;}
    replaying.add(node);
    try {
      if (node instanceof HTMLFormElement) node.requestSubmit(submitter?.isConnected ? submitter : undefined);
      else node.click();
    } finally { replaying.delete(node); }
  }
  function gestureId() {
    // randomUUID is secure-context-only; ordinary HTTP dashboards also work.
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join('');
  }
  async function send(intent,node,submitter) {
    const timer = setTimeout(()=>notice('Chrome has not confirmed this click yet. Check your tabs before clicking again.'),6000);
    try {
      const result = await chrome.runtime.sendMessage({type:'ANCHOR_OPEN_LINK',guardId,intentId:gestureId(),...intent});
      if (result?.snapshot) acceptSnapshot(result.snapshot);
      if (result?.status === 'native') replay(node,submitter);
      else if (!result?.ok || result.status !== 'opened') notice(result?.error || 'Could not open this link. Pause protection or try again.');
    } catch {
      // Fail closed for an intercepted click; never silently destroy an anchor.
      notice('Anchor was updated or lost its connection. Refresh this page to reconnect. Your click was not replayed.');
    } finally {clearTimeout(timer);}
  }
  function click(event) {
    if (!alive()) {
      if(snapshot?.active && event.isTrusted && event.cancelable && event.button===0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey){
        const link=findLink(event);
        if(link&&!link.hasAttribute('download')&&!targetIsNative(link)){let url;try{url=new URL(link.getAttribute('href'),document.baseURI).href;}catch{}
          if(url&&C.decide(snapshot,{kind:'link',url,currentUrl:location.href})==='BRANCH'){cancel(event);notice('Anchor was reloaded. Refresh this page before following links, or disable the extension to leave protection.');}
        }
      }
      return;
    }
    if (!event.isTrusted || !event.cancelable || event.defaultPrevented || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const node = findLink(event);
    if (!node || replaying.has(node) || node.hasAttribute('download') || targetIsNative(node) ||
      node.isContentEditable || node.closest('[contenteditable="true"]')) return;
    const raw = node.getAttribute('href')?.trim();
    if (raw === undefined || raw === null) return;
    let url;try{url=new URL(raw,document.baseURI).href;}catch{return;}
    if (!C.webUrl(url)) return;
    const intent = {url,kind:'link',currentUrl:location.href};
    // Unknown initial state is resolved in the worker. Known unprotected clicks
    // stay genuinely native: no stopPropagation, target mutation or synthetic replay.
    if (snapshot && C.decide(snapshot,intent) !== 'BRANCH') return;
    if (!snapshot && C.fragmentOnly(location.href,url)) return;
    cancel(event);void send(intent,node);
  }
  function submit(event) {
    if (!alive() || !snapshot?.active || !snapshot.protectGetForms || !event.isTrusted || event.defaultPrevented || !event.cancelable) return;
    const form = event.target, button = event.submitter;
    if (!(form instanceof HTMLFormElement) || replaying.has(form)) return;
    const method = (button?.getAttribute('formmethod') || form.getAttribute('method') || 'get').toLowerCase();
    if (method !== 'get' || form.querySelector('input[type=password],input[type=file]')) return;
    const target = (button?.getAttribute('formtarget') || form.getAttribute('target') || '').toLowerCase();
    if (target && !['_self','_top'].includes(target)) return;
    if (window !== window.top && target !== '_top') return;
    if (button?.getAttribute('type')?.toLowerCase() === 'image') return;
    const raw = button?.getAttribute('formaction') || form.getAttribute('action') || location.href;
    let url;try{url=new URL(raw,document.baseURI);}catch{return;}
    if (!C.webUrl(url.href)) return;
    const fields = new FormData(form,button);
    const params = new URLSearchParams();
    for (const [key,value] of fields) {if(typeof value!=='string')return;params.append(key,value);}
    url.search = params.toString(); // Native GET replaces, rather than appends, action query.
    const intent = {url:url.href,kind:'form',method:'get',currentUrl:location.href};
    if (C.decide(snapshot,intent) !== 'BRANCH') return;
    cancel(event);void send(intent,form,button);
  }
  function receive(message,_sender,respond) {
    if (_sender?.id && _sender.id!==chrome.runtime.id) return false;
    if (message?.type==='ANCHOR_STATE') {const ok=acceptSnapshot(message.snapshot);respond({ok,version,guardId,revision:snapshot?.revision});}
    if (message?.type==='ANCHOR_PING') respond({ok:true,version,guardId,revision:snapshot?.revision});
  }
  function dispose() {
    abort.abort();toastHost?.remove();
    try {chrome.runtime.onMessage.removeListener(receive);}catch{}
  }
  // Window capture at document_start precedes typical SPA document/router handlers.
  window.addEventListener('click',click,{capture:true,signal:abort.signal});
  window.addEventListener('submit',submit,{capture:true,signal:abort.signal});
  window.addEventListener('pageshow',refresh,{signal:abort.signal});
  window.addEventListener('focus',refresh,{signal:abort.signal});
  window.addEventListener('pointerdown',()=>{if(Date.now()-lastRefresh>250)void refresh();},{capture:true,signal:abort.signal});
  window.addEventListener('keydown',event=>{if(event.key==='Enter')void refresh();},{capture:true,signal:abort.signal});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();},{signal:abort.signal});
  chrome.runtime.onMessage.addListener(receive);
  globalThis.__anchorGuard={id:chrome.runtime.id,version,alive,refresh,dispose};
  void refresh();
})();
