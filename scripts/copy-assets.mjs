import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
for (const dir of ['public/engine', 'public/vendor', 'public/licenses']) await mkdir(dir, { recursive: true });
const sf = 'node_modules/stockfish';
const files = await readdir(join(sf, 'src'));
for (const file of files.filter(f => /^stockfish-17\.1-lite-single-[a-f0-9]+\.(js|wasm)$/.test(f))) {
  await copyFile(join(sf, 'src', file), join('public/engine', file));
}
if (!files.some(f => /^stockfish-17\.1-lite-single-.*\.wasm$/.test(f))) throw new Error('Stockfish WASM is missing');
await copyFile('node_modules/@techstark/opencv-js/dist/opencv.js', 'public/vendor/opencv.js');
const ort = 'node_modules/onnxruntime-web/dist';
for (const file of (await readdir(ort)).filter(f => f === 'ort.wasm.min.js' || /^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(f))) {
  await copyFile(join(ort, file), join('public/vendor', file));
}
const licenses = [
  ['stockfish', 'Copying.txt'], ['chess.js', 'LICENSE'], ['react-chessboard', 'LICENSE'],
  ['react', 'LICENSE'], ['react-dom', 'LICENSE'],
  ['@techstark/opencv-js', 'LICENSE'], ['lucide-react', 'LICENSE'], ['tailwindcss', 'LICENSE'],
];
for (const [pkg, file] of licenses) {
  try { await writeFile(`public/licenses/${pkg.replaceAll('/', '-')}.txt`, await readFile(`node_modules/${pkg}/${file}`)); }
  catch { console.warn(`License file ${pkg}/${file}: see THIRD_PARTY_NOTICES.md`); }
}
console.log('Local Stockfish, OpenCV, ONNX Runtime assets copied.');
await copyFile('scripts/licenses/onnxruntime-web.txt','public/licenses/onnxruntime-web.txt');
