import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
let posts=0;
const slowSameUrlRequests=new Map();
const page=(title='Destination · Anchor Demo')=>`<!doctype html><html lang="en"><title>${title}</title><body><h1 id="destination">A little room to explore.</h1><p>This is a local navigation-test destination.</p><a href="/">Back to dashboard</a></body></html>`;
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:8765');
 try{
  if(url.pathname==='/health'){res.end('ok');return;}
  if(url.pathname==='/counts'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({posts}));return;}
  if(req.method==='POST'){posts++;for await(const _ of req){}res.setHeader('Content-Type','text/html');res.end('<h1>POST received once</h1>');return;}
  if(url.pathname==='/download'){res.setHeader('Content-Disposition','attachment; filename="anchor-demo.txt"');res.end('Anchor download fixture');return;}
  if(url.pathname==='/redirect'){res.writeHead(302,{Location:'/destination?redirected=1'});res.end();return;}
  if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(resolve(root,'fixture.js')));return;}
  if(url.pathname==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(await readFile(resolve(root,'fixture.css')));return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(url.pathname==='/frame'){
   const kind=url.searchParams.get('case')||'other';
   if(kind==='nested-parent'){res.end('<!doctype html><html lang="en"><title>Outer frame</title><iframe id="nested-frame" title="Nested target fixture" src="/frame?case=nested-child"></iframe></html>');return;}
   if(kind==='nested-child'){res.end('<!doctype html><html lang="en"><title>Nested frame</title><a id="frame-parent" href="/destination?frame=nested-parent" target="_parent">Navigate the parent frame</a></html>');return;}
   const base=kind==='matching'?'<base href="/?frame=matching">':'';
   const hash=`<a id="frame-top-hash" href="#section" target="_top">Top-page section</a>`;
   const parent='<a id="frame-parent" href="/destination?frame=parent" target="_parent">Navigate parent</a>';
   const form='<form id="frame-parent-form" action="/search?frame=parent-form" method="get" target="_parent"><input name="q" value="iframe"><button id="frame-parent-submit">Submit to parent</button></form>';
   res.end(`<!doctype html><html lang="en"><head><title>Frame fixture</title>${base}</head><body><a id="frame-self" href="/destination?frame=self">Stay in frame</a><a id="frame-top" href="/destination?frame=top" target="_top">Navigate top</a>${hash}${parent}${form}</body></html>`);return;
  }
  if(url.pathname==='/slow-same-url'){
   const key=url.searchParams.get('case')||'default',count=(slowSameUrlRequests.get(key)||0)+1;slowSameUrlRequests.set(key,count);
   if(count>1)await new Promise(resolve=>setTimeout(resolve,1500));
   res.end(page('Same URL recovery race fixture'));return;
  }
  if(url.pathname.startsWith('/destination')||url.pathname==='/search'){res.end(page());return;}
  res.end(await readFile(resolve(root,'index.html')));
 }catch{res.statusCode=500;res.end('Fixture server error');}
});
server.listen(8765,'0.0.0.0',()=>console.log('Anchor demo: http://127.0.0.1:8765'));
