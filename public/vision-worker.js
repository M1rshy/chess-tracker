/* Local-only image processing. No images or model data leave this worker. */
let cvPromise, modelSession, builtIn = false;
const labels = ['.', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'];
async function opencv() {
  if (!cvPromise) cvPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('OpenCV не инициализировался за 30 секунд')), 30000);
    self.Module = { onRuntimeInitialized: () => { clearTimeout(timeout); resolve(self.cv); } };
    try {
      importScripts('vendor/opencv.js');
      if (self.cv?.then) self.cv.then(api => { self.cv = api; clearTimeout(timeout); resolve(api); });
      else if (self.cv?.Mat) { clearTimeout(timeout); resolve(self.cv); }
      else if (self.cv) self.cv.onRuntimeInitialized = () => { clearTimeout(timeout); resolve(self.cv); };
    } catch (e) { clearTimeout(timeout); reject(e); }
  });
  return cvPromise;
}
function checkerScore(canvas, box) {
  const c = new OffscreenCanvas(80, 80), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, box.x, box.y, box.size, box.size, 0, 0, 80, 80);
  const d = ctx.getImageData(0, 0, 80, 80).data, groups = [[], []];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    // Sample corners of each cell, avoiding central pieces.
    const samples = [];
    for (const [ox, oy] of [[1, 1], [8, 1], [1, 8], [8, 8]]) {
      const i = ((y * 10 + oy) * 80 + x * 10 + ox) * 4;
      samples.push((d[i] + d[i+1] + d[i+2]) / 3);
    }
    samples.sort((a,b) => a-b); groups[(x+y)%2].push((samples[1]+samples[2])/2);
  }
  const mean = a => a.reduce((s,v) => s+v,0)/a.length;
  const a = mean(groups[0]), b = mean(groups[1]);
  const noise = mean(groups[0].map(v => Math.abs(v-a))) + mean(groups[1].map(v => Math.abs(v-b)));
  return Math.abs(a-b) - noise;
}
async function detect(bitmap, crop) {
  const cv = await opencv();
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const c = new OffscreenCanvas(Math.round(bitmap.width*scale), Math.round(bitmap.height*scale));
  const ctx = c.getContext('2d'); ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  if (crop) {
    const box = { x: crop.x*c.width, y: crop.y*c.height, size: crop.size*c.width };
    if (box.size < 32 || box.x < 0 || box.y < 0 || box.x+box.size > c.width+1 || box.y+box.size > c.height+1) throw new Error('Область доски выходит за границы изображения');
    return { box, canvas: c, scale, confidence: checkerScore(c, box) };
  }
  const src = cv.matFromImageData(ctx.getImageData(0,0,c.width,c.height));
  const gray = new cv.Mat(), edges = new cv.Mat(), contours = new cv.MatVector(), hierarchy = new cv.Mat();
  let candidates = [];
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); cv.Canny(gray, edges, 40, 140);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      try {
        const r = cv.boundingRect(contour);
        if (r.width >= 100 && Math.abs(r.width/r.height-1) < .035) candidates.push({ x:r.x, y:r.y, size:Math.min(r.width,r.height) });
      } finally { contour.delete(); }
    }
    if (Math.abs(c.width/c.height-1) < .035) candidates.push({x:0,y:0,size:Math.min(c.width,c.height)});
    // Outer board borders can be interrupted by coordinates; cell contours propose the full grid.
    const cells = candidates.filter(r => r.size < Math.min(c.width,c.height)/4);
    for (const cell of cells.slice(0,400)) for (const row of [0,1,6,7]) for (const col of [0,1,6,7]) {
      const b = { x: cell.x-col*cell.size, y:cell.y-row*cell.size, size:cell.size*8 };
      if (b.x>=0 && b.y>=0 && b.x+b.size<=c.width && b.y+b.size<=c.height) candidates.push(b);
    }
    candidates = candidates.filter(r => r.size>=100).map(box => ({ box, score: checkerScore(c,box) })).sort((a,b) => b.score-a.score);
    if (!candidates.length || candidates[0].score < 12) throw new Error('OpenCV не нашёл уверенную сетку 8×8. Укажите границы вручную. Поддерживаются прямые скриншоты без перспективы.');
    return { box:candidates[0].box, canvas:c, scale, confidence:candidates[0].score };
  } finally { src.delete(); gray.delete(); edges.delete(); contours.delete(); hierarchy.delete(); }
}
async function loadModel(buffer, localTemplate = false) {
  if (new Uint8Array(buffer)[0] === 31 && new Uint8Array(buffer)[1] === 139) {
    buffer = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  if (!self.ort) importScripts('vendor/ort.wasm.min.js');
  self.ort.env.wasm.wasmPaths = new URL('vendor/', self.location.href).href;
  self.ort.env.wasm.numThreads = 1;
  const candidate = await self.ort.InferenceSession.create(buffer, { executionProviders:['wasm'] });
  try {
    if (candidate.inputNames.length !== 1 || candidate.outputNames.length !== 1) throw new Error('Ожидается один вход и один выход');
    const input = new self.ort.Tensor('float32', new Float32Array(3*64*64), [1,3,64,64]);
    const out = await candidate.run({[candidate.inputNames[0]]: input});
    const output = out[candidate.outputNames[0]];
    if (output.data.length !== 13 || output.dims[output.dims.length-1] !== 13) throw new Error('Ожидается выход [1,13]');
    await modelSession?.release(); modelSession = candidate; builtIn = localTemplate;
  } catch(e) { await candidate.release(); throw new Error('Несовместимая модель: '+e.message); }
}
self.onmessage = async ({data}) => {
  const { id, type } = data;
  try {
    if (type === 'model') { await loadModel(data.buffer); self.postMessage({id, model:true}); return; }
    const detected = await detect(data.bitmap, data.crop);
    const { box, canvas, scale } = detected;
    const result = { box:{ x:box.x/scale, y:box.y/scale, size:box.size/scale }, cells:Array(64).fill('?'), confidence:[], orientation:null, warning:'' };
    if (type !== 'detect') {
      if (!modelSession) {
        try {
          const response = await fetch('models/bundled-pieces.onnx.gz');
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          await loadModel(await response.arrayBuffer(), true);
        } catch(e) { result.warning = 'Встроенная модель недоступна: '+e.message+'. Фигуры не распознаны. Загрузите ONNX-модель или расставьте фигуры вручную.'; }
      }
      if (!modelSession) result.cells = Array(64).fill('?');
      else {
        const square = new OffscreenCanvas(64,64), ctx = square.getContext('2d', {willReadFrequently:true});
        for (let i=0; i<64; i++) {
          const step=box.size/8;
          ctx.drawImage(canvas,box.x+(i%8)*step,box.y+Math.floor(i/8)*step,step,step,0,0,64,64);
          const rgba=ctx.getImageData(0,0,64,64).data, rgb=new Float32Array(3*64*64);
          for(let p=0;p<4096;p++) for(let ch=0;ch<3;ch++) rgb[ch*4096+p]=rgba[p*4+ch]/255;
          const output = await modelSession.run({[modelSession.inputNames[0]]:new self.ort.Tensor('float32',rgb,[1,3,64,64])});
          const logits=Array.from(output[modelSession.outputNames[0]].data);
          if (logits.some(v => !Number.isFinite(v))) throw new Error('Модель вернула некорректные вероятности');
          const max=Math.max(...logits), exps=logits.map(v=>Math.exp(v-max)), sum=exps.reduce((a,b)=>a+b,0);
          const idx=logits.indexOf(max), confidence=exps[idx]/sum;
          result.cells[i]=confidence >= .7 && (!builtIn || max >= -8) ? labels[idx] : '?'; result.confidence.push(confidence);
        }
        const white=result.cells.flatMap((p,i)=>p==='K'?[Math.floor(i/8)]:[]), black=result.cells.flatMap((p,i)=>p==='k'?[Math.floor(i/8)]:[]);
        if (white.length===1 && black.length===1 && Math.abs(white[0]-black[0])>=3) result.orientation=white[0]>black[0]?'white':'black';
        result.model = builtIn ? 'Встроенная: фигуры тренажёра' : 'Пользовательская ONNX-модель';
        result.warning=(builtIn?'Встроенная модель предназначена только для стандартных фигур react-chessboard и трёх тем этого приложения. Другие наборы могут распознаваться неверно. ':'')+'Проверьте все фигуры и подтвердите ориентацию. Ориентация по расположению королей — только предположение.';
      }
    }
    data.bitmap.close(); self.postMessage({id,...result});
  } catch(e) { data.bitmap?.close(); self.postMessage({id,error:e.message || String(e)}); }
};
