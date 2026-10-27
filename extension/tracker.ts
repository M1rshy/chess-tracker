import { Chess } from 'chess.js';
import { validatedGame } from '../src/chess';

export const INITIAL_PLACEMENT = new Chess().fen().split(' ')[0];
export type Tracking = { fen?: string; moves: string[]; message: string; source?: string };
export function normalizeSan(text: string) {
  const symbols: Record<string,string> = {'♔':'K','♚':'K','♕':'Q','♛':'Q','♖':'R','♜':'R','♗':'B','♝':'B','♘':'N','♞':'N','♙':'','♟':''};
  return text.replace(/[♔♚♕♛♖♜♗♝♘♞♙♟]/g,s=>symbols[s]).replace(/^\d+\.(?:\.\.)?\s*/,'').replace(/0/g,'O').replace(/[!?]+$/,'').trim();
}
export function isSan(text: string) {return /^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?$/.test(normalizeSan(text));}
function differences(a: string,b: string) {
  const expand=(p:string)=>p.split('/').join('').replace(/[1-8]/g,n=>'.'.repeat(Number(n)));
  const x=expand(a),y=expand(b),out=new Set<string>();
  for(let i=0;i<64;i++)if(x[i]!==y[i])out.add('abcdefgh'[i%8]+(8-Math.floor(i/8)));
  return out;
}
export class PositionTracker {
  game?: Chess;
  reset(){this.game=undefined;}
  load(fen:string,board:string){const g=validatedGame(fen);if(g.fen().split(' ')[0]!==board)throw new Error('FEN не совпадает с доской на странице.');this.game=g;return this.result([],'FEN подтверждён','fen');}
  private result(moves:string[],message:string,source='tracking'):Tracking {return{fen:this.game?.fen(),moves,message,source};}
  accept(board:string,evidence:{fen?:string;san?:string[]}={}):Tracking {
    if(this.game?.fen().split(' ')[0]===board)return this.result([],'Позиция отслеживается');
    // A full, matching FEN supplied by the page preserves otherwise invisible metadata.
    if(evidence.fen){try{return this.load(evidence.fen,board);}catch{/* Do not use stale page FEN. */}}
    if(this.game){
      const delta=differences(this.game.fen().split(' ')[0],board),matches:{fen:string;uci:string[];san:string[]}[]=[];
      const before=this.game.fen();
      for(const m of this.game.moves({verbose:true})){
        if(!delta.has(m.from)&&!delta.has(m.to))continue;
        const g=new Chess(before);g.move(m);if(g.fen().split(' ')[0]===board)matches.push({fen:g.fen(),uci:[m.lan],san:[m.san]});
      }
      // Recover two fast plies between samples. Prune by changed squares before applying replies.
      if(!matches.length)for(const m of this.game.moves({verbose:true})){
        if(!delta.has(m.from)&&!delta.has(m.to))continue;
        const g=new Chess(before);g.move(m);const nextDelta=differences(g.fen().split(' ')[0],board);
        if(nextDelta.size>4)continue;
        for(const reply of g.moves({verbose:true})){
          if(!nextDelta.has(reply.from)||!nextDelta.has(reply.to))continue;
          g.move(reply);if(g.fen().split(' ')[0]===board)matches.push({fen:g.fen(),uci:[m.lan,reply.lan],san:[m.san,reply.san]});g.undo();
        }
      }
      const unique=new Map(matches.map(m=>[m.fen,m]));
      if(unique.size===1){const m=[...unique.values()][0];for(const u of m.uci)this.game.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]});return this.result(m.san,`Ход: ${m.san.join(' ')}.`);}
    }
    if(evidence.san?.length){
      try{const g=new Chess();for(const text of evidence.san)g.move(normalizeSan(text));if(g.fen().split(' ')[0]===board){this.game=g;return this.result([],'Позиция восстановлена из списка ходов сайта','history');}}catch{/* A partial or virtualized move list is not sufficient evidence. */}
    }
    if(board===INITIAL_PLACEMENT){this.game=new Chess();return this.result([],'Начальная расстановка. Наблюдение с начала партии.','initial');}
    return {moves:[],message:'Нужна исходная позиция: список ходов сайта неполный. Вставьте полный FEN один раз; следующие ходы отслеживаются автоматически.'};
  }
}
export function screenCell(square:string,black:boolean){
  const file=square.charCodeAt(0)-97,rank=Number(square[1]);
  if(file<0||file>7||rank<1||rank>8)throw new Error('Некорректная клетка');
  return black?{col:7-file,row:rank-1}:{col:file,row:8-rank};
}
