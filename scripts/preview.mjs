import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const prefixes = ['/Controle-Chaparia', '/Controle_Chaparia', '/Codex'];
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml' };
createServer(async (req,res) => {
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  try {
    let pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    for (const prefix of prefixes) {
      if (pathname===prefix) { res.writeHead(301,{ Location:prefix+'/' }).end(); return; }
      if (pathname.startsWith(prefix+'/')) { pathname=pathname.slice(prefix.length); break; }
    }
    if (pathname.split('/').some(part=>part.startsWith('.'))) throw Error();
    const path = await realpath(resolve(root, '.'+(pathname.endsWith('/')?pathname+'index.html':pathname)));
    if (!path.startsWith(root.endsWith(sep)?root:root+sep)) throw Error();
    const file=await readFile(path);
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(req.method==='HEAD'?undefined:file);
  } catch { res.writeHead(404).end('Arquivo não encontrado.'); }
}).listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Local: http://localhost:${port}/Controle-Chaparia/`));
