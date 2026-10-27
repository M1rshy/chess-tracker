import{applyDraughts,draughtsMoves,draughtsNotation,draughtsDraw,type DraughtsState,type DraughtsMove,squareName}from'./draughts';
import type{Analysis}from'../src/engine';
export type DraughtsAnalysis=Analysis&{kind:'russian';path:string[];outcome?:'w'|'b'|'draw'};
const TIMEOUT=Symbol('time');
function material(s:DraughtsState){let value=0;for(let i=0;i<64;i++){const p=s.board[i];if(!p)continue;const sign=Math.sign(p),row=Math.floor(i/8),center=3.5-Math.abs(i%8-3.5);value+=sign*(Math.abs(p)===2?310+center*3:100+(sign===1?7-row:row)*3+center*2);}return value;}
export function searchDraughts(state:DraughtsState,key:string,depthLimit:number,milliseconds:number,prefix:number[]=[],update:(a:DraughtsAnalysis)=>void=()=>{}):DraughtsAnalysis{
  const deadline=performance.now()+milliseconds;let nodes=0;
  const check=()=>{if(performance.now()>deadline)throw TIMEOUT;};
  const root=draughtsMoves(state,check).filter(m=>prefix.every((p,i)=>m.path[i]===p));
  const sign=state.turn==='w'?1:-1;
  const make=(move:DraughtsMove|undefined,value:number,depth:number,complete:boolean):DraughtsAnalysis=>{const path=move?move.path.slice(Math.max(0,prefix.length-1)).map(squareName):[];const score=value*sign;return{fen:key,cp:Math.abs(score)>=99000?null:Math.round(score),mate:null,depth,pv:move?[draughtsNotation(move)]:[],best:path.length?path[0]+path.at(-1):'',complete,nodes,kind:'russian',path,outcome:Math.abs(score)>=99000?(score>0?'w':'b'):undefined};};
  if(!root.length)return make(undefined,-100000,0,true);
  if(draughtsDraw(state))return{...make(undefined,0,0,true),outcome:'draw'};
  let best:DraughtsAnalysis|undefined,previous=root[0];
  const ordered=(moves:DraughtsMove[])=>moves.sort((a,b)=>b.captures.length-a.captures.length+Number(b.promoted)-Number(a.promoted));
  function visit(s:DraughtsState,depth:number,alpha:number,beta:number,ply:number):number{
    if((++nodes&127)===0)check();const moves=draughtsMoves(s,check);if(!moves.length)return-100000+ply;if(draughtsDraw(s))return 0;
    if(depth<=0&&!moves[0].captures.length)return material(s)*(s.turn==='w'?1:-1);
    let value=-Infinity;for(const m of ordered(moves)){value=Math.max(value,-visit(applyDraughts(s,m),depth-1,-beta,-alpha,ply+1));alpha=Math.max(alpha,value);if(alpha>=beta)break;}return value;
  }
  for(let depth=1;depth<=Math.min(18,depthLimit);depth++){
    try{check();let value=-Infinity,choice=previous;const moves=[previous,...root.filter(m=>m!==previous)];
      for(const m of moves){check();const v=-visit(applyDraughts(state,m),depth-1,-Infinity,-value,1);if(v>value){value=v;choice=m;}}
      previous=choice;best=make(choice,value,depth,false);update(best);if(Math.abs(value)>=99000)break;
    }catch(e){if(e!==TIMEOUT)throw e;break;}
  }
  if(!best)throw new Error('Движок не успел завершить ни одного уровня поиска. Попробуйте более простую позицию.');
  return{...best,complete:true,nodes};
}
