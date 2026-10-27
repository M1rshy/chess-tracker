import { applyDraughts,draughtsFen,draughtsMoves,draughtsOutcome,draughtsPlacement,initialDraughts,parseDraughtsFen,partialBoard,positionKey,draughtsNotation,type DraughtsState,type DraughtsMove } from './draughts';
import type { Tracking } from './tracker';
export class DraughtsTracker{
  state?:DraughtsState;
  prefix:number[]=[];
  reset(){this.state=undefined;this.prefix=[];}
  key(){return this.state?draughtsFen(this.state)+`|${this.state.stableClock},${this.state.endingClock}|${this.state.history.join(';')}|${this.prefix.join(',')}`:'';}
  private result(moves:string[],message:string,source='tracking'):Tracking{return{fen:this.state?draughtsFen(this.state):undefined,moves,message,source};}
  load(fen:string,board:string){const s=parseDraughtsFen(fen);if(draughtsPlacement(s.board)!==board)throw new Error('Шашечный FEN не совпадает с доской.');this.state=s;this.prefix=[];return this.result([],'Шашечный FEN подтверждён','fen');}
  outcome(){return this.state&&!this.prefix.length?draughtsOutcome(this.state):null;}
  accept(board:string,evidence:{fen?:string;san?:string[]}={}):Tracking{
    if(this.state&&!this.prefix.length&&draughtsPlacement(this.state.board)===board)return this.result([],'Шашечная позиция отслеживается');
    if(this.state){
      const legal=draughtsMoves(this.state).filter(m=>this.prefix.every((p,i)=>m.path[i]===p)),full=legal.filter(m=>draughtsPlacement(applyDraughts(this.state!,m).board)===board);
      if(full.length){this.state=applyDraughts(this.state,full[0]);this.prefix=[];return this.result([draughtsNotation(full[0])],'Ход определён');}
      const partial=new Map<string,{move:DraughtsMove;step:number}>();
      for(const m of legal)if(m.captures.length)for(let step=1;step<m.path.length-1;step++)if([true,false].some(remove=>draughtsPlacement(partialBoard(this.state!,m,step,remove))===board))partial.set(m.path.slice(0,step+1).join(',')+'|'+m.captures.slice(0,step).join(','),{move:m,step});
      if(partial.size===1){const p=[...partial.values()][0];this.prefix=p.move.path.slice(0,p.step+1);return this.result([],'Серия взятий: продолжайте бой той же шашкой.','partial');}
      const current=this.state.board;
      const target=board.replaceAll('/','').replace(/[1-8]/g,n=>'.'.repeat(Number(n)));
      const old=draughtsPlacement(current).replaceAll('/','').replace(/[1-8]/g,n=>'.'.repeat(Number(n)));
      const changed=new Set(Array.from({length:64},(_,i)=>i).filter(i=>old[i]!==target[i]));
      const matches=new Map<string,{next:DraughtsState;moves:string[]}>();
      for(const first of legal){if(!changed.has(first.path[0])&&!changed.has(first.path.at(-1)!))continue;
        const next=applyDraughts(this.state,first);
        for(const reply of draughtsMoves(next)){if(!changed.has(reply.path[0])&&!changed.has(reply.path.at(-1)!))continue;const final=applyDraughts(next,reply);if(draughtsPlacement(final.board)===board)matches.set(positionKey(final),{next:final,moves:[draughtsNotation(first),draughtsNotation(reply)]});}
      }
      if(matches.size===1){const m=[...matches.values()][0];this.state=m.next;this.prefix=[];return this.result(m.moves,'Определены два быстрых полухода');}
    }
    if(evidence.fen){try{return this.load(evidence.fen,board);}catch{/* Ignore a stale FEN during animation. */}}
    const start=initialDraughts();if(draughtsPlacement(start.board)===board){this.state=start;this.prefix=[];return this.result([],'Начальная расстановка русских шашек.','initial');}
    return{moves:[],message:'Не удалось достоверно восстановить шашечную позицию. Дождитесь завершения боя или вставьте FEN с сайта один раз.'};
  }
}
