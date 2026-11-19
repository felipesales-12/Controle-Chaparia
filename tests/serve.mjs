import { createServer } from 'node:http';
import { build } from 'esbuild';
import { mkdir, copyFile, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initialState, applyOperation } from '../js/domain.js';
const root=resolve('work/e2e');
await rm(root,{recursive:true,force:true});
await mkdir(root+'/js',{recursive:true});await mkdir(root+'/css',{recursive:true});
await build({entryPoints:['js/app.js'],outdir:root+'/js',entryNames:'[name]',bundle:true,splitting:false,format:'esm',plugins:[{name:'qa-cloud',setup(b){b.onResolve({filter:/\/cloud\.js$/},()=>({path:resolve('tests/fixtures/cloud.js')}));}}]});
for(const path of ['index.html','css/style.css','css/legacy.css','favicon.svg'])await copyFile(path,root+'/'+path);
await build({entryPoints:['tests/fixtures/transport-probe.js'],outfile:root+'/js/transport-probe.js',bundle:true,format:'esm'});
await writeFile(root+'/transport-probe.html',(await readFile('index.html','utf8')).replace('./js/app.js','./js/transport-probe.js'));
let state=initialState();const subscribers=new Set();
createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/__test/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(`data: ${JSON.stringify(state)}\n\n`);subscribers.add(res);req.on('close',()=>subscribers.delete(res));return;}
  if(url.pathname==='/__test/data'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(state));return;}
  if(url.pathname==='/__test/reset'){state=initialState();for(const client of subscribers)client.write(`data: ${JSON.stringify(state)}\n\n`);res.end('{}');return;}
  if(url.pathname==='/__test/legacy-inox'){
    state=initialState();state.sheets['inox-6_35'].quantity=3;
    state.sheets['inox-6']={...state.sheets['inox-6_35'],id:'inox-6',thickness:6,quantity:2};
    state.remnants={'legacy-r':{id:'legacy-r',material:'inox',thickness:6,width:500,length:1000,quantity:2,location:'R1',notes:'Preservar formato',revision:1},consumed:{id:'consumed',material:'inox',thickness:6,width:100,length:200,quantity:0,location:'R2',notes:'Consumido',revision:1}};
    for(const client of subscribers)client.write(`data: ${JSON.stringify(state)}\n\n`);res.end('{}');return;
  }
  if(url.pathname==='/__test/mutate'){
    try{let raw='';for await(const chunk of req)raw+=chunk;const {command,actor}=JSON.parse(raw);state=applyOperation(state,{...command,eventId:randomUUID()},actor,Date.now());for(const client of subscribers)client.write(`data: ${JSON.stringify(state)}\n\n`);res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(state));}
    catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}return;
  }
  try{const pathname=decodeURIComponent(url.pathname.replace(/^\/(Controle-Chaparia|Controle_Chaparia|Codex)\//,'/'));const path=await realpath(resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname)));if(!path.startsWith(root+'/'))throw Error();res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'}).end(await readFile(path));}
  catch{res.writeHead(404).end();}
}).listen(4174,'127.0.0.1');
