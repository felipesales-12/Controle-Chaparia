import { build } from 'esbuild';
import { mkdir, copyFile, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(new URL('js/', output), { recursive: true });
await mkdir(new URL('css/', output), { recursive: true });
const result = await build({ entryPoints: [root+'js/app.js'], outdir: root+'dist/js', entryNames: 'app-[hash]', bundle: true, splitting: false, format: 'esm', target: ['es2022'], minify: true, external: ['../firebase-config.js'], legalComments: 'eof', metafile: true });
const scripts = Object.entries(result.metafile.outputs).filter(([path]) => path.endsWith('.js'));
if (scripts.length !== 1 || scripts.some(([, meta]) => meta.imports.some(item => item.kind === 'dynamic-import'))) throw new Error('O aplicativo e o exportador Excel devem estar no mesmo arquivo JavaScript.');
const entryName = basename(scripts[0][0]);
const html = (await readFile(root+'index.template.html', 'utf8')).replace('content="development"', `content="${entryName}"`);
await writeFile(root+'dist/index.html', html.replace('./js/app.js', './js/'+entryName));
// GitHub's branch-based Pages publisher may also run for this repository.
// Its root must contain a browser-ready bundle, never bare npm imports.
await copyFile(root+'dist/js/'+entryName,root+'js/app.bundle.js');
await writeFile(root+'index.html',html.replace('./js/app.js','./js/app.bundle.js?v='+entryName));
for (const file of [ 'firebase-config.js', 'favicon.svg', 'css/legacy.css', 'css/style.css', 'js/startup-guard.js', 'sw.js', '.nojekyll']) await copyFile(root+file, root+'dist/'+file);
console.log('Build completo em dist/. Caminhos relativos compatíveis com GitHub Pages.');
