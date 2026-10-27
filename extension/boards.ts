import { placement } from '../src/chess';
import { isSan, normalizeSan } from './tracker';
import { draughtsPlacement } from './draughts';
export type BoardSnapshot={element:HTMLElement;placement:string;black:boolean;kind:string;game:'chess'|'russian'};
export function pageGame(el:HTMLElement,choice:'auto'|'chess'|'russian'='auto'):'chess'|'russian'|null{
  if(choice!=='auto')return choice;
  if(/(?:analysis|variant|editor)\/(?:brazilian|standard|frisian|frysk|antidraughts|breakthrough)(?:\/|$)/.test(location.pathname)&&location.hostname==='lidraughts.org')return null;
  if(!el.querySelector('piece.man,piece.ghostman,piece.ghostking')&&location.hostname!=='lidraughts.org')return'chess';
  if(/(?:analysis|variant|editor)\/russian(?:\/|$)/.test(location.pathname)||document.querySelector('[data-variant="russian"],.variant-russian,a.variant-link[href$="/russian"],.game__meta a[href$="/russian"],.game__meta a[href*="variant/russian"]'))return'russian';
  return null;
}
export function findBoard():HTMLElement|null {
  const candidates=[...document.querySelectorAll<HTMLElement>('wc-chess-board,chess-board,.board-layout-chessboard .board,.chessboard,cg-board')];
  return candidates.filter(el=>{const r=el.getBoundingClientRect();return r.width>=160&&r.height>=160&&Math.abs(r.width/r.height-1)<.07&&getComputedStyle(el).visibility!=='hidden';}).sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width)[0]||null;
}
export function readBoard(el:HTMLElement,game:'chess'|'russian'='chess'):BoardSnapshot|null {
  const lichess=el.tagName.toLowerCase()==='cg-board';
  const black=lichess?Boolean(el.closest('.orientation-black')):el.classList.contains('flipped')||Boolean(el.closest('.flipped,.orientation-black'));
  const nodes=[...el.querySelectorAll<HTMLElement>(lichess?'piece':'.piece')].filter(p=>!p.matches('.ghost,.fading,.ghostman,.ghostking')&&getComputedStyle(p).display!=='none');
  if(!nodes.length||nodes.some(p=>p.matches('.dragging,.anim')))return null;
  const cells=Array<string>(64).fill('.'),bounds=el.getBoundingClientRect();let count=0;
  for(const piece of nodes){
    let symbol='',file=0,rank=0;
    if(lichess){
      const color=piece.classList.contains('white')?'w':piece.classList.contains('black')?'b':'';
      const roles:Record<string,string>=game==='russian'?{man:'w',king:'W'}:{pawn:'p',knight:'n',bishop:'b',rook:'r',queen:'q',king:'k'};
      const role=Object.keys(roles).find(r=>piece.classList.contains(r));if(!color||!role){if(game==='russian')return null;continue;}
      symbol=game==='russian'?(color==='w'?(role==='king'?'W':'w'):(role==='king'?'B':'b')):color==='w'?roles[role].toUpperCase():roles[role];
      const rect=piece.getBoundingClientRect();
      if(game==='russian'&&(Math.abs(rect.width/bounds.width-.125)>.02||Math.abs(rect.height/bounds.height-.125)>.02))return null;
      const col=Math.floor((rect.left+rect.width/2-bounds.left)/bounds.width*8),row=Math.floor((rect.top+rect.height/2-bounds.top)/bounds.height*8);
      if(col<0||col>7||row<0||row>7)return null;
      const cx=(rect.left+rect.width/2-bounds.left)/bounds.width*8,cy=(rect.top+rect.height/2-bounds.top)/bounds.height*8;
      if(Math.abs(cx-col-.5)>.17||Math.abs(cy-row-.5)>.17)return null;
      file=black?8-col:col+1;rank=black?row+1:8-row;
    }else{
      const classes=piece.className,code=classes.match(/\b([wb])([pnbrqk])\b/),square=classes.match(/\bsquare-([1-8])([1-8])\b/);
      if(!code||!square)return null;
      symbol=code[1]==='w'?code[2].toUpperCase():code[2];file=Number(square[1]);rank=Number(square[2]);
    }
    const index=(8-rank)*8+file-1;if(cells[index]!=='.')return null;cells[index]=symbol;count++;
  }
  if(game==='russian'){
    if(count<1||cells.some((p,i)=>p!=='.'&&(Math.floor(i/8)+i%8)%2!==1))return null;
    const code:Record<string,number>={'.':0,w:1,W:2,b:-1,B:-2};
    return{element:el,placement:draughtsPlacement(cells.map(p=>code[p])),black,kind:'Русские шашки 8×8',game};
  }
  if(count<2||cells.filter(p=>p==='K').length!==1||cells.filter(p=>p==='k').length!==1)return null;
  return{element:el,placement:placement(cells,false),black,kind:lichess?'Lichess / Chessground':'Chess.com',game};
}
export function pageEvidence(board:BoardSnapshot):{fen?:string;san?:string[]} {
  let fen:string|undefined;
  for(const el of document.querySelectorAll<HTMLElement>('[data-fen],input.fen,textarea.fen,input[name="fen"],textarea[name="fen"],input.analyse__underboard__fen')){
    const value=el.dataset.fen||(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement?el.value:'');
    if(board.game==='russian'&&/^[WB]:[WB]/.test(value)){fen=value.trim();break;}
    if(value?.trim().split(/\s+/).length===6&&value.split(' ')[0]===board.placement){fen=value.trim();break;}
  }
  const selectors=['[data-ply]','l4x kwdb','l4x move','.move-list .move-text-component','.vertical-move-list .node','.move-list .node'];
  let san:string[]=[];
  if(board.game==='russian')return{fen};
  for(const selector of selectors){
    const elements=[...document.querySelectorAll<HTMLElement>(selector)];
    const moves=elements.map(el=>({ply:Number(el.dataset.ply),text:normalizeSan(el.textContent?.trim()||'')})).filter(v=>isSan(v.text));
    if(selector==='[data-ply]'&&moves.length){moves.sort((a,b)=>a.ply-b.ply);if(moves[0].ply!==1)continue;if(moves.some((m,i)=>m.ply!==i+1))continue;}
    if(moves.length>san.length)san=moves.map(v=>v.text);
  }
  return{fen,san};
}
