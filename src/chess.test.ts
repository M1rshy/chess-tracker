import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { cellsFromFen, explainBest, moveQuality, placement, threatened, uciMove, validatedGame, variation } from './chess';
import { emptyAnalysis } from './engine';

describe('rules, imports and position editing',()=>{
  it('preserves full move history and PGN through legal moves, undo and replay',()=>{
    const g=new Chess();for(const u of ['e2e4','e7e5','g1f3'])uciMove(g,u);
    expect(g.history()).toEqual(['e4','e5','Nf3']);const pgn=g.pgn();const h=new Chess();h.loadPgn(pgn);expect(h.fen()).toBe(g.fen());
    const m=h.undo()!;uciMove(h,m.from+m.to);expect(h.history()).toHaveLength(3);
  });
  it('rejects illegal moves and invalid FEN metadata',()=>{
    expect(()=>uciMove(new Chess(),'e2e5')).toThrow();
    expect(()=>validatedGame('8/8/8/8/8/8/8/8 w - - 0 1')).toThrow();
    expect(()=>validatedGame('4k3/8/8/8/8/8/8/4K3 w K - 0 1')).toThrow(/рокировки/);
    expect(()=>validatedGame('4k3/8/8/8/8/8/8/4R1K1 w - - 0 1')).toThrow(/Король/);
  });
  it('handles castling, en passant and underpromotion',()=>{
    const g=validatedGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');expect(uciMove(g,'e1g1').san).toBe('O-O');
    const ep=validatedGame('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');expect(uciMove(ep,'e5d6').isEnPassant()).toBe(true);expect(ep.get('d5')).toBeUndefined();
    const p=validatedGame('7k/P7/8/8/8/8/8/7K w - - 0 1');uciMove(p,'a7a8n');expect(p.get('a8')?.type).toBe('n');
  });
  it('round trips all 64 recognized cells in either orientation',()=>{
    const fen=new Chess().fen();const cells=cellsFromFen(fen);expect(placement(cells,false)).toBe(fen.split(' ')[0]);expect(placement([...cells].reverse(),true)).toBe(fen.split(' ')[0]);
    expect(()=>placement(Array(64).fill('?'),false)).toThrow(/Уточните/);
  });
  it('uses actual rules for mate explanations and attacked pieces',()=>{
    const fen='6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1';
    const a={...emptyAnalysis(fen),best:'e1e8',pv:['e1e8'],complete:true,depth:15,mate:1};
    expect(explainBest(a).join(' ')).toContain('мат');expect(variation(fen,a.pv)).toEqual(['Re8#']);
    expect(threatened('4k3/8/8/8/8/8/r7/Q3K3 w - - 0 1').join(' ')).toContain('ферзь a1');
  });
  it('grades losses from the mover perspective including black',()=>{
    const a={...emptyAnalysis(new Chess().fen()),cp:50};
    expect(moveQuality(a,{...a,cp:-210},'w')?.label).toBe('Зевок');
    expect(moveQuality({...a,cp:-50},{...a,cp:210},'b')?.loss).toBe(260);
    expect(moveQuality(a,{...a,cp:100},'w')?.loss).toBe(0);
  });
});
