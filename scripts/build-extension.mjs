import { build } from 'esbuild';
import { mkdir,copyFile,readdir,readFile,writeFile } from 'node:fs/promises';
const out='extension-build';await mkdir(`${out}/engine`,{recursive:true});await mkdir(`${out}/licenses`,{recursive:true});
for(const entry of ['content','background','offscreen'])await build({entryPoints:[`extension/${entry}.ts`],outfile:`${out}/${entry}.js`,bundle:true,format:'iife',platform:'browser',target:'chrome116',define:{'import.meta.env.BASE_URL':JSON.stringify('./')},minify:true});
for(const file of ['manifest.json','engine.html','help.html','help.css'])await copyFile(`extension/${file}`,`${out}/${file}`);
for(const file of (await readdir('node_modules/stockfish/src')).filter(f=>/^stockfish-17\.1-lite-single-.*\.(js|wasm)$/.test(f)))await copyFile(`node_modules/stockfish/src/${file}`,`${out}/engine/${file}`);
await copyFile('node_modules/stockfish/Copying.txt',`${out}/licenses/stockfish.txt`);await copyFile('node_modules/chess.js/LICENSE',`${out}/licenses/chess.js.txt`);
await copyFile('LICENSE',`${out}/LICENSE`);await copyFile('THIRD_PARTY_NOTICES.md',`${out}/THIRD_PARTY_NOTICES.md`);
console.log(`Browser extension built: ${out} (local Stockfish included)`);
