import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { kingMoves } from '../extension/king-moves';
describe('king-only recommendations',()=>{
  it('has no candidates in the initial position instead of substituting another piece',()=>{
    expect(kingMoves(new Chess().fen())).toEqual([]);
  });
  it('only permits legal king moves and includes legal castling',()=>{
    const fen='r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    expect(kingMoves(fen)).toContain('e1g1');expect(kingMoves(fen)).toContain('e1c1');
    for(const move of kingMoves(fen))expect(new Chess(fen).move({from:move.slice(0,2),to:move.slice(2,4)}).piece).toBe('k');
  });
  it('respects check and the side to move',()=>{
    const fen='4k3/8/8/8/8/8/4R3/4K3 b - - 0 1',moves=kingMoves(fen);
    expect(moves.length).toBeGreaterThan(0);expect(moves).not.toContain('e8e7');
    for(const move of moves){const g=new Chess(fen),m=g.move({from:move.slice(0,2),to:move.slice(2,4)});expect(m.color).toBe('b');expect(g.isAttacked(m.to,'w')).toBe(false);}
  });
});
