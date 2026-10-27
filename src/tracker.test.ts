import { describe,it,expect } from 'vitest';
import { Chess } from 'chess.js';
import { PositionTracker,screenCell,normalizeSan } from '../extension/tracker';
const board=(g:Chess)=>g.fen().split(' ')[0];
describe('live page position tracking',()=>{
  it('automatically follows a new game and keeps castling and move counters',()=>{
    const t=new PositionTracker(),g=new Chess();t.accept(board(g));
    for(const san of ['Nf3','Nf6','g3','g6','Bg2','Bg7','O-O']){g.move(san);const result=t.accept(board(g));expect(result.fen).toBe(g.fen());expect(result.moves).toHaveLength(1);}
  });
  it('recovers two fast plies without inventing metadata',()=>{
    const t=new PositionTracker(),g=new Chess();t.accept(board(g));g.move('e4');g.move('e5');const result=t.accept(board(g));expect(result.moves).toEqual(['e4','e5']);expect(result.fen).toBe(g.fen());
  });
  it('tracks en passant and promotion as actual legal moves',()=>{
    const t=new PositionTracker(),g=new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');t.load(g.fen(),board(g));g.move('exd6');expect(t.accept(board(g)).fen).toBe(g.fen());
    const p=new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');t.load(p.fen(),board(p));p.move('a8=N');expect(t.accept(board(p)).fen).toBe(p.fen());
  });
  it('restores a matching full move list and refuses unknown midgame state',()=>{
    const t=new PositionTracker(),g=new Chess();g.move('e4');g.move('c5');g.move('Nf3');expect(t.accept(board(g)).fen).toBeUndefined();expect(t.accept(board(g),{san:['e4','c5','Nf3']}).fen).toBe(g.fen());
  });
  it('refuses illegal edits and stale or mismatching FEN',()=>{
    const t=new PositionTracker(),g=new Chess();t.accept(board(g));const edited='rnbqkbnr/pppppppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR';expect(t.accept(edited,{fen:g.fen()}).fen).toBeUndefined();expect(()=>t.load(g.fen(),edited)).toThrow();
  });
  it('maps source and destination squares correctly in either orientation',()=>{
    expect(screenCell('e2',false)).toEqual({col:4,row:6});expect(screenCell('e2',true)).toEqual({col:3,row:1});expect(screenCell('e4',true)).toEqual({col:3,row:3});expect(normalizeSan('1. ♘f3!')).toBe('Nf3');
  });
});
