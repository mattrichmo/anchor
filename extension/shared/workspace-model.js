/** Pure workspace schema and layout math. No Chrome APIs or side effects. */
import './core.js';
const C = globalThis.AnchorCore;
export const LAYOUTS = Object.freeze(['collection','columns','rows','grid','focus']);
export const DESTINATIONS = Object.freeze(['current-window','new-window','browsing-window']);
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
const validId=value=>typeof value==='string'&&ID.test(value)&&!Object.hasOwn(Object.prototype,value)&&!['prototype','default'].includes(value);
function text(value, name, max = 80) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name} must contain 1–${max} characters.`);
  return value.trim();
}
export function validateWorkspace(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid workspace.');
  if (!validId(input.id)) throw new Error('Invalid workspace identity.');
  if (!LAYOUTS.includes(input.layout)) throw new Error('Choose a supported workspace layout.');
  if (!['browsing-window','new-window'].includes(input.destination)) throw new Error('Workspace links must open outside dashboard windows.');
  if (typeof input.foreground !== 'boolean' || typeof input.reserved !== 'boolean') throw new Error('Invalid workspace preferences.');
  if (!Array.isArray(input.anchors) || input.anchors.length < 1 || input.anchors.length > 4) throw new Error('Choose one to four pages per workspace.');
  const ids = new Set();
  const anchors = input.anchors.map(a => {
    if (!a || !validId(a.id) || ids.has(a.id)) throw new Error('Anchor identities must be unique.');
    ids.add(a.id);
    const url = C.webUrl(a.url);
    if (!url || !C.supported(url.href)) throw new Error('Use supported http:// or https:// home URLs without embedded credentials.');
    if (!C.MODES.includes(a.mode)) throw new Error('Unknown anchor mode.');
    return {id:a.id, label:text(a.label,'Page label',100), url:url.href, mode:a.mode};
  });
  const gap = input.gap ?? 12;
  if (!Number.isInteger(gap) || gap < 0 || gap > 32) throw new Error('Window spacing must be 0–32 pixels.');
  const displayId = input.displayId || 'auto';
  if (typeof displayId !== 'string' || displayId.length > 200) throw new Error('Invalid display.');
  return {id:input.id, name:text(input.name,'Workspace name'), layout:input.layout, destination:input.destination,
    foreground:input.foreground, reserved:input.reserved, displayId, gap, anchors};
}
export function validateLibrary(input) {
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.items) || input.items.length > 20) throw new Error('Use an Anchor workspace file (version 1), with at most 20 workspaces.');
  const items = input.items.map(validateWorkspace), ids = new Set();
  for (const item of items) {if(ids.has(item.id)) throw new Error('Duplicate workspace identity.'); ids.add(item.id);}
  return {schemaVersion:1,items};
}
export function validateArea(a) {
  if (!a || !['left','top','width','height'].every(k => Number.isFinite(a[k]))) throw new Error('Display work area is unavailable. Reopen Workspaces on your preferred display.');
  const area=Object.fromEntries(['left','top','width','height'].map(k=>[k,Math.round(a[k])]));
  if (Math.abs(area.left)>100000 || Math.abs(area.top)>100000 || area.width<480 || area.height<320 || area.width>40000 || area.height>40000) throw new Error('This display work area is not supported.');
  return area;
}
/** Uses CSS/display coordinates, not devicePixelRatio. Never silently shrinks below usable windows. */
export function layoutCells(layout, count, inputArea, gap = 12) {
  if(!LAYOUTS.includes(layout)||!Number.isInteger(count)||count<1||count>4)throw new Error('Invalid layout.');
  if(!Number.isInteger(gap)||gap<0||gap>32)throw new Error('Invalid spacing.');
  const a=validateArea(inputArea);
  if(layout==='collection'||count===1)return [a];
  let cells=[];
  if(layout==='focus') {
    const mainW=Math.floor((a.width-gap)*0.6), sideW=a.width-gap-mainW;
    cells.push({left:a.left,top:a.top,width:mainW,height:a.height});
    for(let i=0;i<count-1;i++) {
      const top=a.top+Math.round(i*(a.height+gap)/(count-1));
      const end=a.top+Math.round((i+1)*(a.height+gap)/(count-1))-gap;
      cells.push({left:a.left+mainW+gap,top,width:sideW,height:end-top});
    }
  } else {
    const cols=layout==='columns'?count:layout==='rows'?1:2;
    const rows=Math.ceil(count/cols);
    for(let i=0;i<count;i++) {
      const x=i%cols,y=Math.floor(i/cols);
      const left=a.left+Math.round(x*(a.width+gap)/cols),top=a.top+Math.round(y*(a.height+gap)/rows);
      const right=a.left+Math.round((x+1)*(a.width+gap)/cols)-gap,bottom=a.top+Math.round((y+1)*(a.height+gap)/rows)-gap;
      cells.push({left,top,width:right-left,height:bottom-top});
    }
  }
  if(cells.some(c=>c.width<480||c.height<320))throw new Error('This layout is too small on the selected display. Choose fewer pages, a larger display, or “One window with tabs”.');
  return cells;
}
export function authLike(url) {
  const u=C.webUrl(url); if(!u)return false;
  return /(^|[/.\-_])(oauth2?|saml|sso|login|signin|sign-in|authorize|authorization|callback)([/.\-_]|$)/i.test(u.hostname+u.pathname)
    || ['accounts.google.com','login.microsoftonline.com','appleid.apple.com'].includes(u.hostname);
}
export function relocatable(url) {
  if (['chrome://newtab/','chrome://new-tab-page/','about:newtab'].includes(url)) return true;
  return C.supported(url) && !authLike(url);
}
