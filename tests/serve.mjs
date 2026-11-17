import { createServer } from 'node:http';
import { build } from 'esbuild';
import { mkdir, copyFile, readFile, realpath } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initialState, applyOperation } from '../js/domain.js';
const root=resolve('work/e2e');
await mkdir(root+'/js',{recursive:true});await mkdir(root+'/css',{recursive:true});
await build({entryPoints:['js/app.js'],outdir:root+'/js',entryNames:'[name]',chunkNames:'chunks/[name]-[hash]',bundle:true,splitting:true,format:'esm',plugins:[{name:'qa-cloud',setup(b){b.onResolve({filter:/\/cloud\.js$/},()=>({path:resolve('tests/fixtures/cloud.js')}));}}]});
for(const path of ['index.html','css/style.css','css/legacy.css','favicon.svg'])await copyFile(path,root+'/'+path);
let state=initialState();const subscribers=new Set();
createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/__test/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(`data: ${JSON.stringify(state)}\n\n`);subscribers.add(res);req.on('close',()=>subscribers.delete(res));return;}
  if(url.pathname==='/__test/data'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(state));return;}
  if(url.pathname==='/__test/reset'){state=initialState();for(const client of subscribers)client.write(`data: ${JSON.stringify(state)}\n\n`);res.end('{}');return;}
  if(url.pathname==='/__test/mutate'){
    try{let raw='';for await(const chunk of req)raw+=chunk;const {command,actor}=JSON.parse(raw);state=applyOperation(state,{...command,eventId:randomUUID()},actor,Date.now());for(const client of subscribers)client.write(`data: ${JSON.stringify(state)}\n\n`);res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(state));}
    catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}return;
  }
  try{const pathname=decodeURIComponent(url.pathname.replace(/^\/(Controle-Chaparia|Controle_Chaparia|Codex)\//,'/'));const path=await realpath(resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname)));if(!path.startsWith(root+'/'))throw Error();res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'}).end(await readFile(path));}
  catch{res.writeHead(404).end();}
}).listen(4174,'127.0.0.1');
