export const $ = id => document.getElementById(id);
export async function request(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || 'Anchor is not responding. Reload the extension and try again.');
  return result;
}
export function showError(error) {
  const box = $('error');
  box.textContent = error?.message || String(error);
  box.hidden = false;
}
export function clearError() { if ($('error')) $('error').hidden = true; }
const pendingButtons = new WeakSet();
export async function busy(button, fn) {
  if (button && (button.disabled || pendingButtons.has(button))) return;
  clearError();
  if (button) {pendingButtons.add(button);button.setAttribute('aria-busy','true');}
  try {await fn();}catch(error){showError(error);}finally{if(button){pendingButtons.delete(button);button.removeAttribute('aria-busy');}}
}
export function downloadJson(name, value) {
  const blob = new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
