export type Crop = { x: number; y: number; size: number };
export type VisionResult = { box: Crop; cells: string[]; confidence: number[]; orientation: 'white'|'black'|null; warning: string; model?:string };
export class Vision {
  private worker = new Worker(`${import.meta.env.BASE_URL}vision-worker.js`);
  private seq = 0;
  private pending = new Map<number, { resolve: (v: VisionResult) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor() {
    this.worker.onmessage = e => {
      const p = this.pending.get(e.data.id); if (!p) return;
      clearTimeout(p.timer); this.pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data);
    };
    this.worker.onerror = () => this.rejectAll('Не удалось запустить обработку изображения');
  }
  private rejectAll(message: string) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(message)); } this.pending.clear(); }
  request(type: string, data: Record<string, unknown>, transfer: Transferable[] = []) {
    const id = ++this.seq;
    return new Promise<VisionResult>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Обработка изображения превысила 90 секунд')); }, 90000);
      this.pending.set(id, { resolve, reject, timer }); this.worker.postMessage({ id, type, ...data }, transfer);
    });
  }
  dispose() { this.rejectAll('Обработка отменена'); this.worker.terminate(); }
}
export function frameHash(source: CanvasImageSource) {
  const c = document.createElement('canvas'); c.width=32; c.height=32;
  const ctx=c.getContext('2d')!; ctx.drawImage(source,0,0,32,32);
  const d=ctx.getImageData(0,0,32,32).data;
  return Array.from({length:1024},(_,i)=>Math.round((d[i*4]+d[i*4+1]+d[i*4+2])/24));
}
export function frameChanged(a: number[]|null,b: number[]) { return !a || a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/b.length>.6; }
