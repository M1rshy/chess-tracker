// Dependency-free launcher for the built local application.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve('dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.css':'text/css','.json':'application/json','.png':'image/png','.gz':'application/octet-stream','.txt':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{
  try{
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    const file=(await stat(path)).isDirectory()?resolve(path,'index.html'):path;
    const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'}).end('File not found');}
});
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
server.listen(4173,'127.0.0.1',()=>console.log('Chess Vision Trainer: http://127.0.0.1:4173\nKeep this terminal open. Press Ctrl+C to stop.'));
