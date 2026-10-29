import { afterEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { Stockfish, parseInfo, scoreText, whitePercent } from './engine';
class FakeWorker {
  static current:FakeWorker;commands:string[]=[];onmessage?:(e:{data:string})=>void;onerror?:()=>void;terminated=false;
  constructor(){FakeWorker.current=this;}
  postMessage(s:string){this.commands.push(s);}terminate(){this.terminated=true;}
  emit(s:string){this.onmessage?.({data:s});}
}
afterEach(()=>vi.unstubAllGlobals());
describe('UCI analysis protocol',()=>{
  it('limits the actual root search and drains the prior unrestricted search',async()=>{
    vi.stubGlobal('Worker',FakeWorker);const e=new Stockfish(),w=FakeWorker.current;
    const fen='6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1';w.emit('uciok');w.emit('readyok');
    const first=e.analyze(fen).catch(e=>e.name),allowed=['g1f1','g1h1'],updates=vi.fn();
    const next=e.analyze(fen,8,updates,20,allowed);allowed.push('e1e8');
    w.emit('bestmove e1e8');expect(await first).toBe('AbortError');
    expect(w.commands.at(-1)).toBe('go depth 8 searchmoves g1f1 g1h1');
    w.emit('info depth 8 score mate 1 pv e1e8');expect(updates).not.toHaveBeenCalled();
    w.emit('info depth 8 score cp 30 pv g1f1');w.emit('bestmove g1f1');expect((await next).best).toBe('g1f1');e.dispose();
  });
  it('rejects empty restrictions and unexpected non-king engine results',async()=>{
    vi.stubGlobal('Worker',FakeWorker);const e=new Stockfish(),w=FakeWorker.current;w.emit('uciok');w.emit('readyok');
    await expect(e.analyze(new Chess().fen(),8,undefined,20,[])).rejects.toThrow('Нет допустимых');
    expect(w.commands.some(c=>c.startsWith('go '))).toBe(false);
    const p=e.analyze(new Chess().fen(),8,undefined,20,['e1e2']);w.emit('bestmove e2e4');
    await expect(p).rejects.toThrow('вне выбранного списка');e.dispose();
  });
  it('normalizes centipawn and mate scores to White',()=>{
    const w=new Chess().fen(),b=w.replace(' w ',' b ');
    expect(parseInfo('info depth 15 score cp 45 nodes 10 pv e2e4 e7e5',w)?.cp).toBe(45);
    expect(parseInfo('info depth 15 score cp 45 pv e7e5',b)?.cp).toBe(-45);
    expect(parseInfo('info depth 9 score mate 3 pv e7e5',b)?.mate).toBe(-3);
    expect(parseInfo('info depth 8 score cp 50 lowerbound pv e2e4',w)).toBeNull();
    expect(parseInfo('info depth 8 multipv 2 score cp 50 pv e2e4',w)).toBeNull();
  });
  it('handles both mate directions and terminal signed zero',()=>{
    expect(scoreText({cp:null,mate:-2})).toBe('−M2');
    expect(whitePercent({cp:null,mate:3})).toBe(100);expect(whitePercent({cp:null,mate:-0})).toBe(0);
    expect(scoreText({cp:null,mate:-0})).toBe('−M0');expect(whitePercent(null)).toBe(50);
  });
  it('waits for readyok and drains canceled bestmove before changing position',async()=>{
    vi.stubGlobal('Worker',FakeWorker);const e=new Stockfish();const w=FakeWorker.current;const fen=new Chess().fen();
    const first=e.analyze(fen).catch(err=>err.name);expect(w.commands).toEqual(['uci']);w.emit('uciok');w.emit('readyok');
    expect(w.commands).toContain('go depth 15');const updates=vi.fn();
    const nextFen=fen.replace(' w ',' b '),next=e.analyze(nextFen,12,updates);
    expect(await first).toBe('AbortError');expect(w.commands.at(-1)).toBe('stop');
    w.emit('info depth 15 score cp 900 pv e2e4');expect(updates).not.toHaveBeenCalled();
    w.emit('bestmove e2e4');expect(w.commands.at(-2)).toBe('position fen '+nextFen);expect(w.commands.at(-1)).toBe('go depth 12');
    w.emit('info depth 12 score cp 20 pv e7e5');w.emit('bestmove e7e5');const result=await next;
    expect(result.fen).toBe(nextFen);expect(result.cp).toBe(-20);expect(result.best).toBe('e7e5');expect(result.complete).toBe(true);e.dispose();
  });
  it('keeps only the latest request during cancellation',async()=>{
    vi.stubGlobal('Worker',FakeWorker);const e=new Stockfish(),w=FakeWorker.current,f=new Chess().fen();w.emit('uciok');w.emit('readyok');
    const p1=e.analyze(f).catch(e=>e.name),p2=e.analyze(f,8).catch(e=>e.name),p3=e.analyze(f,12);w.emit('bestmove e2e4');
    expect(w.commands.filter(s=>s.startsWith('go '))).toEqual(['go depth 15','go depth 12']);w.emit('bestmove d2d4');
    expect(await p1).toBe('AbortError');expect(await p2).toBe('AbortError');expect((await p3).best).toBe('d2d4');e.dispose();
  });
});
