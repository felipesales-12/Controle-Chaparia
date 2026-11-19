import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

test('branch-based Pages root loads a compiled browser module with only relative imports',async()=>{
  const html=await readFile('index.html','utf8');
  const src=html.match(/<script type="module" src="([^"]+)"/)[1];
  assert.match(src,/^\.\/js\/app\.bundle\.js\?v=app-[A-Z0-9]+\.js$/);
  assert.ok(html.includes('./js/startup-guard.js'));assert.ok(html.includes('id="startup-reload"'));
  const result=await build({entryPoints:[src.split('?')[0]],bundle:false,write:false,metafile:true,format:'esm',logLevel:'silent'});
  const imports=Object.values(result.metafile.outputs).flatMap(output=>output.imports);
  assert.ok(imports.length>0);assert.ok(imports.every(item=>/^\.\.?\//.test(item.path)));
  assert.ok(imports.every(item=>item.kind!=='dynamic-import'));
});
