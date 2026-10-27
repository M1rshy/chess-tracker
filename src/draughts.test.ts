import{describe,it,expect}from'vitest';
import{initialDraughts,draughtsMoves,parseDraughtsFen,draughtsFen,draughtsNotation,applyDraughts,draughtsDraw,draughtsOutcome,squareIndex,draughtsPlacement,partialBoard}from'../extension/draughts';
import{DraughtsTracker}from'../extension/draughts-tracker';
import{searchDraughts}from'../extension/draughts-search';
const position=(fen:string)=>parseDraughtsFen(fen);
function play(s:ReturnType<typeof initialDraughts>,text:string){const m=draughtsMoves(s).find(m=>draughtsNotation(m)===text);if(!m)throw new Error('Not legal: '+text);return applyDraughts(s,m);}
describe('Russian draughts rules',()=>{
  it('has 12 men per side and seven opening moves',()=>{const s=initialDraughts();expect(s.board.filter(p=>p===1)).toHaveLength(12);expect(s.board.filter(p=>p===-1)).toHaveLength(12);expect(draughtsMoves(s)).toHaveLength(7);expect(s.turn).toBe('w');});
  it('accepts algebraic and 32-square FEN including site counters',()=>{const s=initialDraughts();expect(parseDraughtsFen(draughtsFen(s))).toEqual(s);expect(draughtsFen(position('B:WK29,21:B1,2:H4:F8'))).toContain('B:Wa3,Ka1:Bb8,d8:H4:F8');});
  it('rejects light squares, duplicate pieces and unpromoted back-rank men',()=>{for(const fen of ['W:Wa8:Bb8','W:Wa3,a3:Bb8','W:Wb8:Bb6','W:W33:B1'])expect(()=>position(fen)).toThrow();});
  it('men move only one step forward on a quiet move',()=>{const s=position('W:Wc3:Bb8');expect(draughtsMoves(s).map(draughtsNotation).sort()).toEqual(['c3-b4','c3-d4']);});
  it('capture is mandatory and a man can capture backward',()=>{const s=position('W:Wa3,e5:Bd4');const moves=draughtsMoves(s);expect(moves).toHaveLength(1);expect(draughtsNotation(moves[0])).toBe('e5:c3');});
  it('does not impose the Brazilian maximum-capture rule',()=>{const moves=draughtsMoves(position('W:Wc3:Bb4,d4,f6'));expect(moves.map(m=>m.captures.length).sort()).toEqual([1,2]);expect(moves.map(draughtsNotation)).toContain('c3:a5');});
  it('uses flying kings and offers every legal landing beyond the enemy',()=>{const moves=draughtsMoves(position('W:WKc3:Bf6'));expect(moves.map(draughtsNotation).sort()).toEqual(['c3:g7','c3:h8']);});
  it('promotes during a capture and continues as a flying king',()=>{const s=position('W:Wb6:Bc7,f6'),moves=draughtsMoves(s);expect(moves.map(draughtsNotation).sort()).toEqual(['b6:d8:g5','b6:d8:h4']);for(const m of moves){expect(m.promoted).toBe(true);expect(applyDraughts(s,m).board[m.path.at(-1)!]).toBe(2);}});
  it('captured pieces block the king until the whole capture finishes',()=>{const moves=draughtsMoves(position('W:WKc3:Bb4,d2'));expect(moves.every(m=>m.captures.length===1)).toBe(true);expect(moves.map(draughtsNotation).sort()).toEqual(['c3:a5','c3:e1']);});
  it('requires a complete multi-capture instead of stopping after its first jump',()=>{const moves=draughtsMoves(position('W:Wc3:Bd4,f6'));expect(moves.map(draughtsNotation)).toEqual(['c3:e5:g7']);});
  it('ends the game when a side has no legal moves',()=>{const s=position('W:Wa1:Bb2,c3');expect(draughtsOutcome(s)).toBe('b');});
  it('recognizes king-move and repetition draws with observed history',()=>{const s=position('W:WKa1:BKh8:H29');expect(draughtsDraw(play(s,'a1-b2'))).toBe(true);let r=position('W:WKa1:BKh6');for(let i=0;i<2;i++)for(const m of ['a1-b2','h6-g5','b2-a1','g5-h6'])r=play(r,m);expect(draughtsDraw(r)).toBe(true);});
  it('keeps the material-stability draw clock when the special ending phase changes',()=>{const s=position('W:WKb4,a3,g3:BKh8');s.stableClock=60;s.endingClock=0;expect(draughtsDraw(s)).toBe(true);});
});
describe('Russian draughts live tracking and search',()=>{
  it('tracks two fast plies and keeps the side and move counters',()=>{const t=new DraughtsTracker();let s=initialDraughts();t.accept(draughtsPlacement(s.board));s=play(s,'a3-b4');s=play(s,'b6-a5');const r=t.accept(draughtsPlacement(s.board));expect(r.moves).toEqual(['a3-b4','b6-a5']);expect(t.state).toEqual(s);});
  it('tracks a partial jump without giving the turn to the opponent',()=>{const t=new DraughtsTracker(),s=position('W:Wc3:Bd4,f6'),move=draughtsMoves(s)[0];t.load(draughtsFen(s),draughtsPlacement(s.board));const part=t.accept(draughtsPlacement(partialBoard(s,move,1)));expect(part.source).toBe('partial');expect(t.state?.turn).toBe('w');expect(t.prefix).toEqual([squareIndex('c3'),squareIndex('e5')]);const final=applyDraughts(s,move);t.accept(draughtsPlacement(final.board));expect(t.state?.turn).toBe('b');expect(t.prefix).toHaveLength(0);});
  it('searches real legal moves and guides only the remaining capture steps',()=>{const s=position('W:Wc3:Bd4,f6'),updates:number[]=[];const result=searchDraughts(s,'test',8,1000,[squareIndex('c3'),squareIndex('e5')],a=>updates.push(a.depth));expect(result.path).toEqual(['e5','g7']);expect(result.outcome).toBe('w');expect(result.depth).toBeGreaterThan(0);expect(result.complete).toBe(true);expect(updates.length).toBeGreaterThan(0);});
});
