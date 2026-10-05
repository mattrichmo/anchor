import {$,request,showError,busy} from './common.js';
let tabId, state;
const descriptions={strict:'Eligible links open at your chosen destination, leaving this page in place.',
  'same-origin':'Same protocol, host and port stay here. Other destinations branch.',
  home:'Only the exact saved home URL stays here. Other links branch.'};
function render(next) {
  state=next;
  const s=next.snapshot, t=next.tab;
  $('auto').checked=next.settings.protectPinned;
  $('destination').value=next.snapshot?.destination||next.settings.destination||'current-window';
  $('destination').disabled=!!next.workspaceId;
  $('destination-help').textContent=next.workspaceId?'Workspace-managed. Change routing in Workspaces.':$('destination').value==='current-window'?'A new tab opens here; existing tabs are not replaced.':$('destination').value==='new-window'?'Each eligible link gets its own normal Chrome window.':next.browsingWindowId?'Your chosen browsing window will be reused.':'A browsing window is created on the first routed link.';
  $('return-source').hidden=!next.sourceTabId;
  for(const b of document.querySelectorAll('[data-foreground]')) {b.setAttribute('aria-pressed',String((next.snapshot?.foreground??next.settings.foreground)===(b.dataset.foreground==='true')));b.disabled=!!next.workspaceId;}
  const missing=!s||!t;
  for(const node of document.querySelectorAll('[data-mode],[data-foreground],#destination,#toggle,#pause,#automatic,#solo,#copy,#use-browsing,#set-home,#rearm-recovery'))node.disabled=missing;
  $('recovery-notice').hidden=missing||!next.settings.recovery||!s.recoveryTripped;
  if(missing){$('connection').hidden=true;$('home-row').hidden=true;$('status-title').textContent='Choose a webpage';$('domain').textContent='Open an http:// or https:// page to get started.';$('badge').textContent='Unavailable';return;}
  let host;try{host=new URL(t.url).host||t.url;}catch{host=t.url;}
  $('domain').textContent=host;$('domain').title=t.url;
  const unavailable=s.reason==='unsupported';
  $('destination').disabled=unavailable||!!next.workspaceId;
  for(const b of document.querySelectorAll('[data-foreground]'))b.disabled=unavailable||!!next.workspaceId;
  $('set-home').disabled=unavailable;
  $('rearm-recovery').disabled=unavailable||!s.active;
  const effective=s.active&&next.connected;
  const titles={unsupported:'Not available here',disabled:'Anchor is switched off','site-off':'Excluded by site rule',paused:'Taking a short break','tab-off':'Protection is off',unprotected:'Make this your anchor'};
  $('status-title').textContent=s.active?(next.connected?'Link protection is on':'Page needs a connection'):titles[s.reason]||'Ready when you are';
  $('badge').textContent=effective?(t.pinned?'Pinned':'Manual'):s.reason==='paused'?'Paused':'Not active';
  $('badge').classList.toggle('off',!effective);
  const mode=s.mode;
  for(const b of document.querySelectorAll('[data-mode]')){b.setAttribute('aria-pressed',String(b.dataset.mode===mode));b.disabled=unavailable;}
  $('mode-help').textContent=descriptions[mode];
  $('home-row').hidden=mode!=='home';$('home-url').textContent=s.homeUrl;$('home-url').title=s.homeUrl;
  $('toggle').textContent=s.active?'Turn off for this tab':'Protect this tab';
  $('toggle').disabled=unavailable||['disabled','site-off'].includes(s.reason);
  $('pause').textContent=s.reason==='paused'?'Resume now':'Pause 5 min';
  $('pause').disabled=unavailable||(!s.active&&s.reason!=='paused');
  $('automatic').disabled=unavailable||!!next.workspaceId;
  $('solo').disabled=unavailable||!!next.workspaceId;
  $('copy').disabled=unavailable;
  $('use-browsing').disabled=unavailable||!!next.workspaceId;
  $('connection').hidden=!(s.active&&!next.connected);
  $('connection-text').textContent='Allow site access in Chrome, then reconnect. A page refresh may be needed.';
  $('foot-note').textContent=s.recoveryTripped?'Navigation recovery is paused after one attempt. Check this page before enabling it again.':
    s.reason==='site-off'?'Remove this site’s exclusion in Settings to protect it.':
    s.reason==='disabled'?'Switch Anchor on in Settings to resume protection.':
    s.reason==='paused'?'Protection resumes automatically after five minutes.':
    'Link protection, not a lock on the address bar.';
}
async function change(message){render(await request({...message,tabId}));}
$('workspaces').addEventListener('click',e=>busy(e.currentTarget,()=>request({type:'UI_OPEN_WORKSPACES'})));
$('solo').addEventListener('click',e=>busy(e.currentTarget,()=>change({type:'UI_SOLO'})));
$('copy').addEventListener('click',e=>busy(e.currentTarget,async()=>{const r=await request({type:'UI_WORKING_COPY',tabId});if(r.status!=='opened')throw new Error(r.error||'Check your windows before retrying.');}));
$('return-source').addEventListener('click',e=>busy(e.currentTarget,()=>request({type:'UI_RETURN_SOURCE',tabId})));
$('use-browsing').addEventListener('click',e=>busy(e.currentTarget,()=>change({type:'UI_SET_BROWSING_WINDOW',windowId:state.tab.windowId})));
$('destination').addEventListener('change',e=>busy(null,()=>change({type:'UI_TAB',action:'destination',destination:e.target.value})));
$('settings').addEventListener('click',()=>chrome.runtime.openOptionsPage());
$('toggle').addEventListener('click',e=>busy(e.currentTarget,()=>change({type:'UI_TAB',action:state.snapshot.active?'unprotect':'protect'})));
$('pause').addEventListener('click',e=>busy(e.currentTarget,()=>change({type:'UI_TAB',action:state.snapshot.reason==='paused'?'resume':'pause'})));
$('automatic').addEventListener('click',e=>busy(e.currentTarget,()=>change({type:'UI_TAB',action:'automatic'})));
$('rearm-recovery').addEventListener('click',e=>busy(e.currentTarget,()=>change({type:'UI_TAB',action:'rearm-recovery'})));
$('set-home').addEventListener('click',e=>busy(e.currentTarget,()=>change({type:'UI_TAB',action:'home'})));
$('reconnect').addEventListener('click',e=>busy(e.currentTarget,()=>change({type:'UI_RECONNECT'})));
$('auto').addEventListener('change',e=>busy(null,()=>change({type:'UI_SETTINGS',patch:{protectPinned:e.target.checked}})));
for(const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click',()=>busy(button,()=>change({type:'UI_TAB',action:'mode',mode:button.dataset.mode})));
for(const button of document.querySelectorAll('[data-foreground]')) button.addEventListener('click',()=>busy(button,()=>change({type:'UI_TAB',action:'foreground',foreground:button.dataset.foreground==='true'})));
(async()=>{
  const query=new URLSearchParams(location.search).get('tab');
  if(query&&/^\d+$/.test(query))tabId=Number(query);
  else tabId=(await chrome.tabs.query({active:true,currentWindow:true}))[0]?.id;
  await change({type:'UI_STATE'});
})().catch(showError);
