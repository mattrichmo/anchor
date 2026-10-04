import {$,request,showError,busy,downloadJson} from './common.js';
let state, savedTimer;
const bools=['enabled','protectPinned','branchHashes','protectGetForms','recovery'];
const labels={off:'Protection off',strict:'All links branch','same-origin':'Keep same-origin links here',home:'Keep only the saved home URL here'};
function saved(text='Saved locally'){$('saved').textContent=text;clearTimeout(savedTimer);savedTimer=setTimeout(()=>$('saved').textContent='',2200);}
function render(next){
 state=next;$('version').textContent=next.version;
 for(const key of bools)$(key).checked=next.settings[key];
 for(const key of ['mode','foreground','placement','destination'])$(key).value=String(next.settings[key]);
 const list=$('rule-list');list.replaceChildren();
 if(!next.settings.rules.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='No exceptions. One less thing to think about.';list.append(empty);}
 for(const rule of next.settings.rules){
   const row=document.createElement('div');row.className='rule-item';
   const info=document.createElement('div');info.className='detail';
   const origin=document.createElement('code');origin.textContent=rule.origin;
   const behavior=document.createElement('span');behavior.textContent=labels[rule.mode];
   info.append(origin,behavior);
   const remove=document.createElement('button');remove.className='button';remove.textContent='Remove';remove.setAttribute('aria-label',`Remove rule for ${rule.origin}`);
   remove.onclick=()=>busy(remove,()=>change({rules:state.settings.rules.filter(r=>r.origin!==rule.origin)}));
   row.append(info,remove);list.append(row);
 }
}
async function change(patch){render(await request({type:'UI_SETTINGS',patch}));saved();}
for(const key of bools)$(key).addEventListener('change',()=>busy(null,()=>change({[key]:$(key).checked})));
for(const key of ['mode','placement','destination'])$(key).addEventListener('change',()=>busy(null,()=>change({[key]:$(key).value})));
$('foreground').addEventListener('change',()=>busy(null,()=>change({foreground:$('foreground').value==='true'})));
$('rule-form').addEventListener('submit',event=>{
 event.preventDefault();void busy(null,async()=>{
  const url=new URL($('rule-origin').value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Use an http:// or https:// address without a username or password.');
  const rules=state.settings.rules.filter(r=>r.origin!==url.origin);rules.push({origin:url.origin,mode:$('rule-mode').value});
  await change({rules});$('rule-origin').value='';
 });
});
$('export').addEventListener('click',()=>downloadJson('anchor-settings.json',{product:'Anchor',...state.settings}));
$('import-label').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('import-file').click();}});
$('import-file').addEventListener('change',()=>busy(null,async()=>{
 const file=$('import-file').files[0];if(!file)return;
 try{
  if(file.size>128*1024)throw new Error('Settings files must be smaller than 128 KB.');
  const data=JSON.parse(await file.text());
  if(!confirm('Replace Anchor settings and site rules with this file?'))return;
  render(await request({type:'UI_IMPORT',settings:data}));saved('Settings imported');
 }finally{$('import-file').value='';}
}));
$('reset').addEventListener('click',()=>busy(null,async()=>{
 if(!confirm('Reset all Anchor preferences, saved workspaces, site rules, manual protection and pauses? Open tabs and windows will not be closed.'))return;
 render(await request({type:'UI_RESET'}));saved('Anchor reset');
}));
request({type:'UI_STATE'}).then(render).catch(showError);
