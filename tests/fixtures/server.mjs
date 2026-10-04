import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
let posts=0;
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
  if(url.pathname==='/frame'){res.end('<!doctype html><html lang="en"><title>Frame fixture</title><a id="frame-self" href="/destination?frame=self">Stay in frame</a><a id="frame-top" href="/destination?frame=top" target="_top">Navigate top</a></html>');return;}
  if(url.pathname.startsWith('/destination')||url.pathname==='/search'){res.end(`<!doctype html><html lang="en"><title>Destination · Anchor Demo</title><body><h1 id="destination">A little room to explore.</h1><p>This is a local navigation-test destination.</p><a href="/">Back to dashboard</a></body></html>`);return;}
  res.end(await readFile(resolve(root,'index.html')));
 }catch{res.statusCode=500;res.end('Fixture server error');}
});
server.listen(8765,'0.0.0.0',()=>console.log('Anchor demo: http://127.0.0.1:8765'));
