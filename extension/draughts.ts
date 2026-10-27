/** Russian draughts-64. Original implementation; rules: fmjd64.org/rules-of-the-game/. */
export type Side='w'|'b';
export type DraughtsState={board:number[];turn:Side;kingClock:number;stableClock:number;endingClock:number;fullmove:number;history:string[]};
export type DraughtsMove={path:number[];captures:number[];promoted:boolean};
export const darkSquares=Array.from({length:64},(_,i)=>i).filter(i=>(Math.floor(i/8)+i%8)%2===1);
const dirs=[[-1,-1],[-1,1],[1,-1],[1,1]];
export const squareName=(i:number)=>'abcdefgh'[i%8]+(8-Math.floor(i/8));
export function squareIndex(s:string){if(!/^[a-h][1-8]$/.test(s))throw new Error('Некорректная клетка шашечной доски');return(8-Number(s[1]))*8+s.charCodeAt(0)-97;}
export const positionKey=(s:Pick<DraughtsState,'board'|'turn'>)=>s.turn+':'+s.board.join(',');
export function draughtsPlacement(board:number[]){
  const names:Record<number,string>={1:'w',2:'W',[-1]:'b',[-2]:'B'};
  return Array.from({length:8},(_,r)=>{let out='',n=0;for(const p of board.slice(r*8,r*8+8)){if(!p)n++;else{if(n)out+=n;n=0;out+=names[p];}}return out+(n||'');}).join('/');
}
export function parseDraughtsFen(fen:string):DraughtsState{
  const parts=fen.trim().split(':');if(!/^[WB]$/i.test(parts[0]))throw new Error('Шашечный FEN: W:W…:B… (W или B — очередь хода)');
  const board=Array<number>(64).fill(0);let white=false,black=false,kingClock=0,fullmove=1;
  for(const part of parts.slice(1)){
    if(/^H\d+$/i.test(part)){kingClock=Number(part.slice(1));continue;}
    if(/^F\d+$/i.test(part)){fullmove=Number(part.slice(1));continue;}
    if(!/^[WB]/i.test(part))throw new Error('Неизвестное поле шашечного FEN');
    const sign=part[0].toUpperCase()==='W'?1:-1;if(sign===1){if(white)throw new Error('Повтор белых в FEN');white=true;}else{if(black)throw new Error('Повтор чёрных в FEN');black=true;}
    for(const entry of part.slice(1).split(',').filter(Boolean)){
      const match=entry.match(/^(K)?([a-h][1-8]|\d{1,2})(?:-(\d{1,2}))?$/i);if(!match)throw new Error('Некорректная шашка в FEN: '+entry);
      const from=match[2],numbers=match[3]?Array.from({length:Number(match[3])-Number(from)+1},(_,j)=>String(Number(from)+j)):[from];
      if(!numbers.length)throw new Error('Некорректный диапазон FEN');
      for(const field of numbers){const i=/^\d+$/.test(field)?darkSquares[Number(field)-1]:squareIndex(field.toLowerCase());if(i===undefined||!darkSquares.includes(i)||board[i])throw new Error('Повтор или неверная клетка в FEN');board[i]=sign*(match[1]?2:1);}
    }
  }
  if(!white||!black||fullmove<1||!Number.isSafeInteger(fullmove)||!Number.isSafeInteger(kingClock))throw new Error('Нужны обе стороны и корректные счётчики');
  for(const sign of [1,-1])if(board.filter(p=>Math.sign(p)===sign).length>12)throw new Error('У стороны не может быть больше 12 шашек');
  if(board.slice(0,8).includes(1)||board.slice(56).includes(-1))throw new Error('На последней горизонтали простая шашка уже должна быть дамкой');
  const state:DraughtsState={board,turn:parts[0].toUpperCase()==='W'?'w':'b',kingClock,stableClock:0,endingClock:0,fullmove,history:[]};state.history=[positionKey(state)];return state;
}
export function draughtsFen(s:DraughtsState){
  const fields=(sign:number)=>darkSquares.filter(i=>Math.sign(s.board[i])===sign).map(i=>(Math.abs(s.board[i])===2?'K':'')+squareName(i)).join(',');
  return `${s.turn.toUpperCase()}:W${fields(1)}:B${fields(-1)}:H${s.kingClock}:F${s.fullmove}`;
}
export const initialDraughts=()=>parseDraughtsFen('W:W21-32:B1-12');
const promoted=(p:number,i:number)=>Math.abs(p)===2?p:(p===1&&i<8?2:p===-1&&i>=56?-2:p);
function at(r:number,c:number){return r>=0&&r<8&&c>=0&&c<8?r*8+c:-1;}
export function draughtsMoves(s:DraughtsState,check:()=>void=()=>{}):DraughtsMove[]{
  const board=[...s.board],sign=s.turn==='w'?1:-1,captures:DraughtsMove[]=[];
  function visit(pos:number,piece:number,path:number[],taken:Set<number>,becameKing:boolean){
    check();let extended=false;
    for(const[dr,dc]of dirs){
      let r=Math.floor(pos/8)+dr,c=pos%8+dc,i=at(r,c);if(i<0)continue;
      if(Math.abs(piece)===2){while(i>=0&&board[i]===0){r+=dr;c+=dc;i=at(r,c);}}
      if(i<0||!board[i]||Math.sign(board[i])===sign||taken.has(i))continue;
      const captured=i;let landing=at(r+dr,c+dc);
      while(landing>=0&&board[landing]===0){
        extended=true;const nextPiece=promoted(piece,landing);board[pos]=0;board[landing]=nextPiece;taken.add(captured);
        // Captured pieces remain blockers until the entire move finishes (Turkish strike rule).
        visit(landing,nextPiece,[...path,landing],taken,becameKing||nextPiece!==piece);
        taken.delete(captured);board[landing]=0;board[pos]=piece;
        if(Math.abs(piece)===1)break;
        r+=dr;c+=dc;landing=at(r+dr,c+dc);
      }
    }
    if(!extended&&taken.size)captures.push({path,captures:[...taken],promoted:becameKing});
  }
  for(const i of darkSquares)if(Math.sign(board[i])===sign)visit(i,board[i],[i],new Set(),false);
  if(captures.length)return captures;
  const quiet:DraughtsMove[]=[];
  for(const i of darkSquares){const p=board[i];if(Math.sign(p)!==sign)continue;
    for(const[dr,dc]of dirs){if(Math.abs(p)===1&&dr!==(sign===1?-1:1))continue;
      let r=Math.floor(i/8)+dr,c=i%8+dc,to=at(r,c);
      while(to>=0&&board[to]===0){quiet.push({path:[i,to],captures:[],promoted:promoted(p,to)!==p});if(Math.abs(p)===1)break;r+=dr;c+=dc;to=at(r,c);}
    }
  }
  return quiet;
}
function ending(s:DraughtsState):{key:string;limit:number}|null{
  const pieces=darkSquares.filter(i=>s.board[i]),wk=pieces.filter(i=>s.board[i]===2).length,bk=pieces.filter(i=>s.board[i]===-2).length;
  for(const weak of [1,-1]){
    const solo=pieces.filter(i=>Math.sign(s.board[i])===weak),strong=pieces.filter(i=>Math.sign(s.board[i])===-weak);
    if(solo.length!==1||Math.abs(s.board[solo[0]])!==2||!strong.length)continue;
    const strongKings=strong.filter(i=>Math.abs(s.board[i])===2).length;
    const diagonal=(i:number)=>Math.floor(i/8)+i%8===7;
    if((strong.length<=2&&strongKings>0)||(strong.length===3&&strongKings>0&&diagonal(solo[0])&&!strong.some(diagonal)))return{key:`five:${weak}:${strong.length}:${strongKings}`,limit:10};
    if(strong.length>=3&&strong.length===strongKings)return{key:`fifteen:${weak}:${strong.length}`,limit:30};
  }
  if(wk&&bk&&pieces.length>=4&&pieces.length<=7)return{key:`stable:${pieces.length}:${wk}:${bk}`,limit:pieces.length<=5?60:120};
  return null;
}
export function applyDraughts(s:DraughtsState,m:DraughtsMove):DraughtsState{
  const board=[...s.board],from=m.path[0],to=m.path[m.path.length-1],p=board[from];board[from]=0;for(const i of m.captures)board[i]=0;board[to]=m.promoted?Math.sign(p)*2:p;
  const next:DraughtsState={board,turn:s.turn==='w'?'b':'w',kingClock:!m.captures.length&&Math.abs(p)===2?s.kingClock+1:0,stableClock:!m.captures.length&&!m.promoted?s.stableClock+1:0,endingClock:0,fullmove:s.fullmove+(s.turn==='b'?1:0),history:[]};
  const before=ending(s),after=ending(next);next.endingClock=before&&after&&before.key===after.key?s.endingClock+1:0;
  next.history=[...s.history,positionKey(next)];if(m.captures.length||m.promoted||Math.abs(p)===1)next.history=[positionKey(next)];return next;
}
export function draughtsDraw(s:DraughtsState){
  const e=ending(s),pieces=s.board.filter(Boolean),stableLimit=pieces.length>=4&&pieces.length<=7&&pieces.includes(2)&&pieces.includes(-2)?(pieces.length<=5?60:120):Infinity;
  return s.kingClock>=30||s.stableClock>=stableLimit||s.history.filter(p=>p===positionKey(s)).length>=3||Boolean(e&&s.endingClock>=e.limit);
}
export function draughtsOutcome(s:DraughtsState,moves?:DraughtsMove[]):Side|'draw'|null{
  if(!(moves||draughtsMoves(s)).length)return s.turn==='w'?'b':'w';return draughtsDraw(s)?'draw':null;
}
export function partialBoard(s:DraughtsState,m:DraughtsMove,step:number,remove=true){
  const board=[...s.board];let p=board[m.path[0]];board[m.path[0]]=0;for(let n=1;n<=step;n++){p=promoted(p,m.path[n]);if(remove)board[m.captures[n-1]]=0;}board[m.path[step]]=p;return board;
}
export const draughtsNotation=(m:DraughtsMove)=>m.path.map(squareName).join(m.captures.length?':':'-');
