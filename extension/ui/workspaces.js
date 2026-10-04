import {$,request,showError,busy,downloadJson,clearError} from './common.js';
let state=null,draft=null,adoptIds={},dirty=false,browsingDirty=false;
const names={collection:'One window',columns:'Side by side',rows:'Stacked',grid:'2 × 2 grid',focus:'Focus + context'};
const modes={strict:'All eligible links branch','same-origin':'Same origin stays here',home:'Only home URL stays here'};
const uid=()=>crypto.randomUUID();
function status(text){$('status').textContent=text;$('status').hidden=!text;}
function element(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
function option(value,text){const e=element('option',null,text);e.value=String(value);return e;}
function area(){return {left:Math.round(screen.availLeft??0),top:Math.round(screen.availTop??0),width:Math.round(screen.availWidth),height:Math.round(screen.availHeight)};}
function changed(){dirty=true;$('save-note').textContent='Unsaved changes. Save or open to apply.';}
function ensureLeave(){return !dirty||confirm('Discard the unsaved changes to this workspace?');}
function choose(w){draft=structuredClone(w);adoptIds={};dirty=false;browsingDirty=false;renderEditor();renderSidebar();status('');}
function newDraft(){
  draft={id:uid(),name:'',layout:'grid',destination:'browsing-window',foreground:false,reserved:true,displayId:'auto',gap:12,anchors:[]};
  adoptIds={};dirty=false;browsingDirty=false;renderEditor();renderSidebar();status('');$('workspace-name').focus();
}
function renderSidebar(){
  const nav=$('workspace-list');nav.replaceChildren();$('workspace-count').textContent=`${state.library.items.length} / 20`;
  $('new-workspace').disabled=state.library.items.length>=20;
  if(!state.library.items.length)nav.append(element('p','helper','Save a small set of pages you want to keep in place.'));
  for(const w of state.library.items){
    const b=element('button');b.type='button';b.setAttribute('aria-current',String(w.id===draft?.id));
    const n=Object.keys(state.runtime.runs[w.id]?.anchors||{}).length;
    b.append(element('strong',null,w.name),element('small',null,`${w.anchors.length} page${w.anchors.length===1?'':'s'} · ${n?'Open':names[w.layout]}`));
    b.addEventListener('click',()=>{if(ensureLeave())choose(w);});nav.append(b);
  }
  const pending=$('pending');pending.replaceChildren();const ops=Object.entries(state.runtime.operations||{});pending.hidden=!ops.length;
  if(ops.length){pending.append(element('strong',null,'A browser operation was interrupted.'),element('p',null,'Check your open windows first. Acknowledge only after checking; the next open may create a missing page. Anchor does not blindly repeat an uncertain creation.'));
    for(const [key,op]of ops){const row=element('div','pending-row');row.append(element('span',null,op.label||'Browser operation'));const ack=element('button','button','I checked — allow retry');ack.type='button';ack.addEventListener('click',()=>busy(ack,async()=>{if(!confirm('Have you checked open windows for a page that may already have been created? Allowing a retry can create another copy.'))return;state=await request({type:'UI_ACK_OPERATION',key});renderSidebar();}));row.append(ack);pending.append(row);}
  }
}
function windowOptions(preserve=true){
  const previous=preserve&&browsingDirty?$('browsing-window').value:null;
  const select=$('browsing-window');select.replaceChildren(option('','Create a window when needed'));
  for(const w of state.windows.filter(w=>!w.reserved)){
    const title=w.tabs[0]?.title||'Browser window';select.append(option(w.id,`Window ${w.id} · ${title.slice(0,50)}`));
  }
  const current=previous!==null?previous:state.runtime.browsing[draft.id];if(current!==undefined&&current!==null)select.value=String(current);
  if(select.selectedIndex<0)select.value='';
  const tabs=$('open-tab');tabs.replaceChildren(option('','Choose an open page…'));
  const used=new Set(Object.values(adoptIds));
  for(const w of state.windows)for(const t of w.tabs){
    if(!t.url||used.has(t.id)||t.workspaceId&&t.workspaceId!==draft.id)continue;
    tabs.append(option(t.id,`${t.title.slice(0,55)} · ${new URL(t.url).host}`));
  }
  const displays=$('display');displays.replaceChildren(option('auto','Current display'));
  for(const d of state.displays)displays.append(option(d.id,`${d.name||'Display'}${d.isPrimary?' · Primary':''} (${d.workArea.width} × ${d.workArea.height})`));
  if(draft.displayId!=='auto'&&!state.displays.some(d=>d.id===draft.displayId))displays.append(option(draft.displayId,'Saved display (not currently detected)'));
  displays.value=draft.displayId;
}
function renderEditor(){
  if(!draft)return;
  $('workspace-name').value=draft.name;$('workspace-destination').value=draft.destination;
  $('workspace-foreground').value=String(draft.foreground);$('workspace-reserved').checked=draft.reserved;
  if(![...$('gap').options].some(o=>Number(o.value)===draft.gap))$('gap').append(option(draft.gap,`${draft.gap} px`));
  $('gap').value=String(draft.gap);$('save-note').textContent='Saved locally. Nothing is uploaded.';
  windowOptions(false);renderAnchors();renderLayout();renderLive();
  $('delete-workspace').hidden=!state.library.items.some(w=>w.id===draft.id);
}
function renderAnchors(){
  const root=$('anchor-editors');root.replaceChildren();
  if(!draft.anchors.length)root.append(element('div','empty-pages','Start with an open dashboard, or add a home URL below. You can keep up to four pages in one workspace.'));
  draft.anchors.forEach((a,index)=>{
    const card=element('article','anchor-editor'),head=element('div','anchor-editor-head');
    head.append(element('span','anchor-number',String(index+1).padStart(2,'0')));
    const label=element('input');label.type='text';label.value=a.label;label.maxLength=100;label.placeholder='Page label';label.required=true;label.setAttribute('aria-label',`Page ${index+1} label`);
    label.addEventListener('input',()=>{a.label=label.value;changed();renderPreview();});head.append(label);
    if(index>0){const up=element('button','move-anchor','↑');up.type='button';up.title='Move page earlier in the layout';up.setAttribute('aria-label',`Move page ${index+1} earlier`);up.addEventListener('click',()=>{[draft.anchors[index-1],draft.anchors[index]]=[draft.anchors[index],draft.anchors[index-1]];changed();renderAnchors();renderPreview();});head.append(up);}
    const remove=element('button','remove-anchor','×');remove.type='button';remove.setAttribute('aria-label',`Remove page ${index+1}`);remove.addEventListener('click',()=>{draft.anchors=draft.anchors.filter(x=>x.id!==a.id);delete adoptIds[a.id];changed();renderAnchors();renderPreview();windowOptions();});head.append(remove);card.append(head);
    const url=element('input','url-input');url.type='url';url.required=true;url.maxLength=16384;url.value=a.url;url.placeholder='https://dashboard.example.com/';url.setAttribute('aria-label',`Page ${index+1} home URL`);
    url.addEventListener('input',()=>{a.url=url.value;delete adoptIds[a.id];changed();renderPreview();card.querySelector('.adopt-note')?.remove();});card.append(url);
    const bottom=element('div','anchor-editor-bottom'),modeId=`mode-${a.id}`,labelMode=element('label',null,'Protection');labelMode.htmlFor=modeId;const mode=element('select');mode.id=modeId;
    for(const [value,text]of Object.entries(modes))mode.append(option(value,text));mode.value=a.mode;
    mode.addEventListener('change',()=>{a.mode=mode.value;changed();});bottom.append(labelMode,mode);card.append(bottom);
    if(adoptIds[a.id])card.append(element('p','adopt-note','Uses the selected live tab. It moves without reloading.'));
    root.append(card);
  });
  $('page-count').textContent=`${draft.anchors.length} / 4 pages`;
  $('add-open-tab').disabled=draft.anchors.length>=4;$('add-url').disabled=draft.anchors.length>=4;
}
function renderLayout(){
  for(const b of document.querySelectorAll('[data-layout]'))b.setAttribute('aria-pressed',String(b.dataset.layout===draft.layout));
  renderPreview();
}
function renderPreview(){
  const root=$('preview-panels');root.replaceChildren();root.className=`preview-panels ${draft.layout}`;
  root.style.setProperty('--count',Math.max(1,draft.anchors.length));root.style.setProperty('--side-count',Math.max(1,draft.anchors.length-1));
  const pages=draft.anchors.length?draft.anchors:[{label:'Your first dashboard',url:''}];
  const panels=draft.layout==='collection'?[{label:pages.map(p=>p.label||'Untitled').join(' · '),url:'',collection:true}]:pages;
  panels.forEach((a,i)=>{
    const panel=element('div','preview-panel'),chrome=element('div','preview-chrome',`●  ●  ●   ${a.collection?'One Chrome window · multiple protected tabs':`Chrome window ${i+1}`}`),body=element('div','preview-panel-body');
    let host='Add a home URL';try{host=new URL(a.url).host;}catch{}
    body.append(element('strong',null,a.label||'Untitled page'),element('small',null,a.collection?'Switch tabs here; opened links leave this window.':host));panel.append(chrome,body);root.append(panel);
  });
  document.querySelector('.preview-destination strong').textContent=draft.destination==='new-window'?'A new window for each link':'Browsing window';
}
function renderLive(){
  const run=state.runtime.runs[draft.id],count=Object.keys(run?.anchors||{}).length;
  $('live-controls').hidden=!count;$('live-status').textContent=count?`${count} page${count===1?'':'s'} open`:'Not open';$('live-status').classList.toggle('off',!count);
  $('arrange-workspace').disabled=!count;
  $('pause-workspace').textContent=(run?.pausedUntil||0)>Date.now()?'Resume workspace':'Pause 5 minutes';
  const live=$('live-pages');live.replaceChildren();
  for(const a of draft.anchors){
    if(!run?.anchors?.[a.id])continue;
    const row=element('div','live-page');row.append(element('span',null,a.label));const focus=element('button','quiet-button','Go to page ↗');focus.addEventListener('click',()=>busy(focus,()=>request({type:'UI_FOCUS_ANCHOR',workspaceId:draft.id,anchorId:a.id})));row.append(focus);live.append(row);
  }
  if(run?.notice)live.append(element('p','helper',run.notice));
  if(run?.lastLayout?.warnings?.length)live.append(element('p','helper',run.lastLayout.warnings.join(' ')));
}
async function refresh(){state=await request({type:'UI_WORKSPACE_STATE'});renderSidebar();if(!draft){const first=state.library.items[0];if(first)choose(first);else newDraft();}else renderLive();}
function collect(){
  draft.name=$('workspace-name').value.trim();draft.destination=$('workspace-destination').value;draft.foreground=$('workspace-foreground').value==='true';
  draft.reserved=$('workspace-reserved').checked;draft.displayId=$('display').value;draft.gap=Number($('gap').value);
  if(!$('workspace-form').reportValidity())throw new Error('Complete the highlighted fields before saving.');
  if(!draft.anchors.length)throw new Error('Add at least one page to the workspace.');return draft;
}
async function save(){
  collect();const selected=$('browsing-window').value;
  state=await request({type:'UI_SAVE_WORKSPACE',workspace:draft});
  if(browsingDirty)state=await request({type:'UI_SET_BROWSING_WINDOW',workspaceId:draft.id,windowId:selected?Number(selected):null});
  browsingDirty=false;
  draft=structuredClone(state.library.items.find(w=>w.id===draft.id));dirty=false;renderSidebar();renderEditor();$('save-note').textContent='Saved locally.';
}
async function open(arrangeOnly=false){
  await save();
  const next=await request({type:'UI_OPEN_WORKSPACE',workspaceId:draft.id,adoptIds,area:area(),arrangeOnly});
  state=next;adoptIds={};renderSidebar();renderEditor();
  status(next.outcome.warnings.length?next.outcome.warnings.join(' '):arrangeOnly?'Open pages arranged. Nothing was reloaded.':'Workspace open. Existing pages were reused; exploration has its own destination.');
}
$('workspace-form').addEventListener('submit',e=>{e.preventDefault();void busy($('save-workspace'),async()=>{await save();status('Workspace saved. Open & arrange to apply it to browser windows.');});});
$('open-workspace').addEventListener('click',e=>busy(e.currentTarget,()=>open(false)));
$('arrange-workspace').addEventListener('click',e=>busy(e.currentTarget,()=>open(true)));
$('new-workspace').addEventListener('click',()=>{if(ensureLeave())newDraft();});
$('refresh').addEventListener('click',e=>busy(e.currentTarget,async()=>{await refresh();windowOptions();status('Open windows and workspace status refreshed.');}));
$('add-open-tab').addEventListener('click',()=>{
  clearError();try{
    if(draft.anchors.length>=4)throw new Error('A workspace supports up to four pages.');
    const id=Number($('open-tab').value),tab=state.windows.flatMap(w=>w.tabs).find(t=>t.id===id);
    if(!tab)throw new Error('Choose an open page first.');
    const a={id:uid(),label:tab.title.slice(0,100),url:tab.url,mode:'strict'};draft.anchors.push(a);adoptIds[a.id]=tab.id;
    changed();renderAnchors();renderPreview();windowOptions();
  }catch(e){showError(e);}
});
$('add-url').addEventListener('click',()=>{if(draft.anchors.length>=4)return;draft.anchors.push({id:uid(),label:'',url:'',mode:'strict'});changed();renderAnchors();renderPreview();$('anchor-editors').lastElementChild?.querySelector('input')?.focus();});
for(const b of document.querySelectorAll('[data-layout]'))b.addEventListener('click',()=>{draft.layout=b.dataset.layout;changed();renderLayout();});
for(const id of ['workspace-name','workspace-destination','workspace-foreground','workspace-reserved','browsing-window','display','gap'])$(id).addEventListener(id==='workspace-name'?'input':'change',()=>{changed();if(id==='browsing-window')browsingDirty=true;
  if(id==='display')draft.displayId=$(id).value;
  if(id==='gap')draft.gap=Number($(id).value);
  if(id==='workspace-foreground')draft.foreground=$(id).value==='true';
  if(id==='workspace-reserved')draft.reserved=$(id).checked;
  if(id==='workspace-name')draft.name=$(id).value;
  if(id==='workspace-destination'){draft.destination=$(id).value;renderPreview();}});
$('detect-displays').addEventListener('click',e=>{
  // The permission request is made immediately inside a real user gesture, not in a delayed worker task.
  const button=e.currentTarget;
  const permission=chrome.permissions.request({permissions:['system.display']});
  void busy(button,async()=>{if(!await permission)throw new Error('Display permission was not granted. You can still arrange on the current display.');state=await request({type:'UI_WORKSPACE_STATE'});windowOptions();status(state.displays.length?'Choose a display in Display & spacing.':'No display metadata was returned. Current display remains available.');});
});
$('pause-workspace').addEventListener('click',e=>busy(e.currentTarget,async()=>{const resume=(state.runtime.runs[draft.id]?.pausedUntil||0)>Date.now();state=await request({type:'UI_PAUSE_WORKSPACE',workspaceId:draft.id,resume});renderLive();status(resume?'Workspace protection resumed.':'Paused for five minutes. Sign-in and maintenance can stay in place.');}));
$('release-workspace').addEventListener('click',e=>busy(e.currentTarget,async()=>{if(!confirm('Release this workspace? Pages stay open; earlier tab protection choices are restored.'))return;state=await request({type:'UI_RELEASE_WORKSPACE',workspaceId:draft.id});renderSidebar();renderLive();status('Workspace released. No pages were closed or reloaded.');}));
$('delete-workspace').addEventListener('click',e=>busy(e.currentTarget,async()=>{if(!confirm('Delete this saved workspace and release its live pages? No tabs or windows will be closed.'))return;state=await request({type:'UI_DELETE_WORKSPACE',workspaceId:draft.id});newDraft();renderSidebar();status('Saved workspace deleted. Existing pages remain open.');}));
$('export-workspaces').addEventListener('click',()=>{downloadJson('anchor-workspaces.json',{product:'Anchor',...state.library});status('Workspace definitions exported. Home URLs may contain private paths; review before sharing.');});
$('import-label').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('import-workspaces').click();}});
$('import-workspaces').addEventListener('change',()=>busy(null,async()=>{
  const file=$('import-workspaces').files[0];if(!file)return;
  try{if(file.size>1024*1024)throw new Error('Workspace imports must be smaller than 1 MB.');const data=JSON.parse(await file.text());
    if(!confirm('Replace saved workspaces with this file? Existing workspace pages will be released, not closed. Imported pages will NOT open automatically.'))return;
    state=await request({type:'UI_IMPORT_WORKSPACES',library:data});draft=null;adoptIds={};dirty=false;browsingDirty=false;renderSidebar();if(state.library.items[0])choose(state.library.items[0]);else newDraft();status('Workspace definitions imported. Open one when you are ready.');
  }finally{$('import-workspaces').value='';}
}));
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
refresh().catch(showError);
