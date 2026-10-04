window.fixtureEvents=[];
document.addEventListener('click',e=>{
 const a=e.target.closest?.('a');if(a)window.fixtureEvents.push({id:a.id,trusted:e.isTrusted});
});
document.getElementById('spa').addEventListener('click',e=>{e.preventDefault();history.pushState({},'',e.currentTarget.href);document.querySelector('h1').textContent='Routed inside the app';});
document.getElementById('js-only').onclick=()=>location.href='/destination?js=1';
document.getElementById('pushstate').onclick=()=>history.pushState({},'','/destination?history=1');
document.getElementById('insert').onclick=()=>{const a=document.createElement('a');a.id='dynamic';a.href='/destination?dynamic=1';a.textContent='Dynamically added link';document.querySelector('.tests').append(a);};
const shadow=document.getElementById('shadow').attachShadow({mode:'open'});const a=document.createElement('a');a.href='/destination?shadow=1';a.id='shadow-link';a.textContent='Shadow link';shadow.append(a);
if(new URLSearchParams(location.search).has('showcase'))document.body.classList.add('hide-tests');
