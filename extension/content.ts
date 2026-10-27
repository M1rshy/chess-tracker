import { scoreText, type Analysis } from '../src/engine';
import { findBoard, readBoard, pageEvidence, pageGame, type BoardSnapshot } from './boards';
import { PositionTracker, screenCell,type Tracking } from './tracker';
import { DraughtsTracker } from './draughts-tracker';
import type{DraughtsAnalysis}from'./draughts-search';
import{draughtsFen}from'./draughts';

const host=document.createElement('div');host.id='cvt-site-helper';host.style.cssText='position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
const root=host.attachShadow({mode:'open'});
root.innerHTML=`<style>
:host{font:13px/1.5 system-ui;color:#e8f3dd}*{box-sizing:border-box}button,input,select{font:inherit}button,select{cursor:pointer;background:#35472b;color:#ecf6e4;border:1px solid #6a8454;padding:6px 9px;border-radius:6px}button:hover{background:#456032}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #fff}input{background:#141f11;border:1px solid #60734e;color:#e6f1df;width:100%;padding:7px;border-radius:5px}p{margin:7px 0}small{font-size:10px;color:#aabf9c}.panel{pointer-events:auto;position:fixed;right:16px;bottom:16px;width:292px;max-width:calc(100vw - 24px);max-height:45vh;overflow:auto;background:#192416f5;color:#e8f3dd;border:1px solid #91b873;border-radius:10px;box-shadow:0 6px 26px #0006;padding:12px;backdrop-filter:blur(8px)}.header,.row{display:flex;align-items:center;justify-content:space-between;gap:7px}.header strong{color:#c6ed9e;font-size:14px}.header button{padding:1px 7px}.controls{display:flex;gap:7px;margin:10px 0}.controls button{flex:1}.status{font-size:11px;color:#c8d8bc;overflow-wrap:anywhere}.error{color:#ffc0ad}.score{color:#c6ec9d;font-weight:600;font-size:16px}.body[hidden],.overlay[hidden]{display:none!important}details{margin-top:8px}summary{cursor:pointer;color:#b4cd9f;font-size:11px}.fen-row{display:flex;gap:4px;margin-top:7px}.fen-row button{flex-shrink:0}.overlay{position:fixed;pointer-events:none;overflow:visible}.square{position:absolute;box-sizing:border-box;border:4px solid;border-radius:4px;box-shadow:0 0 0 1px #071203cc,0 0 13px #0005;pointer-events:none}.from{border-color:#ffdc59;background:#ffe56316}.to{border-color:#4cf08b;background:#4cf08b20}.square span{position:absolute;top:0;left:0;color:#10180c;padding:0 4px;font:bold 10px/16px system-ui;white-space:nowrap}.from span{background:#ffdc59}.to span{background:#4cf08b}.overlay svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.legend{font-size:10px;color:#b2c69f;margin-top:7px}.minimized{width:auto;padding:7px 10px}.message{font-size:11px;overflow-wrap:anywhere}
.options{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:8px}.options label{font-size:10px;color:#b5cba5}.options select{width:100%;padding:6px 4px;font-size:11px;margin-top:3px}.waypoint{position:absolute;border:2px dashed #8cebb1;border-radius:4px;box-sizing:border-box}.waypoint span{background:#8cebb1;color:#10230e;font:bold 10px/15px system-ui;padding:1px 3px}.turn{font-size:11px;color:#d1e7bf}
</style><div class="overlay" hidden aria-label="Подсказка Chess Vision"><svg viewBox="0 0 800 800"><defs><marker id="cvt-tip" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="#4cf08b"/></marker></defs><polyline fill="none" stroke="#4cf08b" stroke-width="7" opacity=".85" marker-end="url(#cvt-tip)"/></svg><div class="waypoints"></div><div class="square from" data-role="from"><span></span></div><div class="square to" data-role="to"><span></span></div></div>
<section class="panel" hidden><div class="header"><strong>♞ Chess Vision</strong><button id="collapse" title="Свернуть панель" aria-label="Свернуть панель">−</button></div><div class="body"><div class="controls"><button id="toggle">Пауза</button><select id="depth" aria-label="Глубина анализа"><option>8</option><option>12</option><option selected>15</option><option>18</option></select><button id="refresh" title="Перечитать доску">↻</button></div><div class="options"><label>Моя сторона<select id="my-side" aria-label="Моя сторона"><option value="auto">Авто (снизу)</option><option value="w">Белые</option><option value="b">Чёрные</option></select></label><label>Игра<select id="game-kind" aria-label="Игра"><option value="auto">Определить</option><option value="chess">Шахматы</option><option value="russian">Русские шашки 8×8</option></select></label></div><p class="turn"></p><p class="status" role="status">Ищу доску…</p><div class="row"><span class="best">—</span><span class="score">—</span></div><p class="message"></p><p class="legend">Жёлтый: откуда · Зелёный: куда · только ваш ход</p><small class="progress">Локальный расчёт</small><details><summary>Позиция FEN / повторная синхронизация</summary><div class="fen-row"><input id="fen" aria-label="Исходный FEN" placeholder="Полный FEN с сайта"><button id="apply">OK</button></div><small>Нужен один раз, если сайт не показывает полную историю.</small><p class="current-fen"></p></details></div></section>`;
document.documentElement.append(host);
const q=<T extends HTMLElement>(s:string)=>root.querySelector<T>(s)!;
const panel=q('.panel'),overlay=q('.overlay'),status=q('.status'),message=q('.message'),toggle=q<HTMLButtonElement>('#toggle'),depthSelect=q<HTMLSelectElement>('#depth');
const tracker=new PositionTracker(),draughts=new DraughtsTracker(),instance=crypto.randomUUID();
let enabled=true,depth=15,sequence=0,job='',requestedFen='',latest:(Analysis&Partial<DraughtsAnalysis>)|null=null,board:BoardSnapshot|null=null,boardElement:HTMLElement|null=null;
let mySide:'auto'|'w'|'b'='auto',autoSide:'w'|'b'|null=null,gameChoice:'auto'|'chess'|'russian'='auto',waypointKey='';
const sideStorageKey='side:'+location.hostname,gameStorageKey='game:'+location.hostname;
let stableKey='',stableSince=0,lastSeen='',safe=false,lastEvidenceKey='',previousMove='',acceptedKey='';
const observer=new MutationObserver(()=>{clear();stableKey='';});
async function send(type:string,data:Record<string,unknown>={}){
  try{const reply=await chrome.runtime.sendMessage({target:'broker',type,...data});if(reply?.ok===false)throw new Error(reply.error);}
  catch(e){clear();status.textContent=(e as Error).message;status.classList.add('error');}
}
function clear(){safe=false;overlay.hidden=true;}
function stop(){job='';requestedFen='';latest=null;clear();void send('stop');q('.best').textContent='—';q('.score').textContent='—';}
function current(){
  if(board?.game==='russian'){const s=draughts.state;return s?{key:draughts.key(),fen:importFen(),turn:s.turn,kind:'russian' as const}:null;}
  const g=tracker.game;return g?{key:g.fen(),fen:g.fen(),turn:g.turn(),kind:'chess' as const}:null;
}
function importFen(){return draughts.state?draughtsFen(draughts.state):'';}
function playerSide(){return mySide==='auto'?(autoSide||(board?.black?'b':'w')):mySide;}
function isMyTurn(){const c=current();return Boolean(c&&c.turn===playerSide());}
function resetTrackers(){tracker.reset();draughts.reset();autoSide=null;acceptedKey='';}
function paint(){
  if(!enabled||!safe||!board||!latest?.best||latest.fen!==current()?.key||!isMyTurn()||document.hidden){overlay.hidden=true;return;}
  const r=board.element.getBoundingClientRect();if(!board.element.isConnected||r.width<80||r.bottom<0||r.top>innerHeight){overlay.hidden=true;return;}
  const path=latest.path?.length?latest.path:[latest.best.slice(0,2),latest.best.slice(2,4)],from=screenCell(path[0],board.black),to=screenCell(path.at(-1)!,board.black);
  overlay.style.left=`${r.left}px`;overlay.style.top=`${r.top}px`;overlay.style.width=`${r.width}px`;overlay.style.height=`${r.height}px`;
  for(const [kind,cell,square]of[['from',from,path[0]],['to',to,path.at(-1)!]] as const){
    const frame=q(`.${kind}`);frame.style.left=`${cell.col*12.5}%`;frame.style.top=`${cell.row*12.5}%`;frame.style.width='12.5%';frame.style.height='12.5%';frame.dataset.square=square;frame.querySelector('span')!.textContent=square;
  }
  overlay.querySelector('polyline')!.setAttribute('points',path.map(s=>{const c=screenCell(s,board!.black);return `${c.col*100+50},${c.row*100+50}`;}).join(' '));
  const wk=path.join(',')+board.black;if(waypointKey!==wk){waypointKey=wk;q('.waypoints').replaceChildren(...path.slice(1,-1).map((s,i)=>{const c=screenCell(s,board!.black),el=document.createElement('div'),label=document.createElement('span');el.className='waypoint';el.style.cssText=`left:${c.col*12.5}%;top:${c.row*12.5}%;width:12.5%;height:12.5%`;label.textContent=`${i+1}. ${s}`;el.append(label);return el;}));}
  overlay.hidden=false;
}
function analyze(force=false){
  const c=current(),fen=c?.key;if(!enabled||!fen)return;
  q('.turn').textContent=`${c.turn==='w'?'Ход белых':'Ход чёрных'} · вы: ${playerSide()==='w'?'белые':'чёрные'}`;
  const over=c.kind==='russian'?draughts.outcome():tracker.game!.isGameOver()?(tracker.game!.isCheckmate()?'mate':'draw'):null;
  if(over){if(requestedFen!==fen){stop();requestedFen=fen;}status.textContent=over==='mate'?'Мат':over==='draw'?'Ничья':`Победа ${over==='w'?'белых':'чёрных'}`;q('.best').textContent='Партия завершена';overlay.hidden=true;return;}
  if(!isMyTurn()){if(requestedFen!==fen){stop();requestedFen=fen;}q('.best').textContent='Ход соперника';q('.progress').textContent='Подсказка скрыта до вашего хода';status.textContent='Отслеживаю ход соперника…';overlay.hidden=true;return;}
  if(!force&&fen===requestedFen)return;
  latest=null;overlay.hidden=true;requestedFen=fen;job=`${instance}:${++sequence}`;q('.best').textContent='Расчёт…';q('.score').textContent='—';status.textContent='Stockfish анализирует позицию…';status.classList.remove('error');
  status.textContent=c.kind==='russian'?'Локальный движок анализирует русские шашки…':'Stockfish анализирует позицию…';
  void send('analyze',{id:job,fen,depth,game:c.kind,...(c.kind==='russian'?{state:draughts.state,prefix:draughts.prefix}:{})});
}
chrome.runtime.onMessage.addListener(m=>{
  if(m?.target!=='content'||m.id!==job||!enabled)return;
  if(m.error){clear();status.textContent=m.error;status.classList.add('error');return;}
  if(m.status)status.textContent=m.status;
  const a=m.analysis as (Analysis&Partial<DraughtsAnalysis>)|undefined;if(!a||a.fen!==current()?.key||a.fen!==requestedFen||!isMyTurn())return;
  if(board?.game==='chess'&&a.best&&!tracker.game!.moves({verbose:true}).some(m=>m.lan===a.best))return;
  latest=a;q('.score').textContent=a.outcome?(a.outcome==='draw'?'Ничья':`Выигрыш ${a.outcome==='w'?'белых':'чёрных'}`):scoreText(a);q('.best').textContent=a.path?.length?a.path.join(' → '):a.best?`${a.best.slice(0,2)} → ${a.best.slice(2,4)}${a.best[4]?' ='+a.best[4].toUpperCase():''}`:'—';q('.progress').textContent=`${a.kind==='russian'?'Шашки · лимит 1,5 с':'Stockfish'} · глубина ${a.depth} / ${depth} · оценка для белых`;paint();
});
function tick(){
  if(!host.isConnected)document.documentElement.append(host);
  const el=findBoard();
  if(!el){if(boardElement){observer.disconnect();stop();resetTrackers();boardElement=null;board=null;}status.textContent='Откройте доску Chess.com, Lichess или Lidraughts.';return;}
  panel.hidden=false;
  if(el!==boardElement){observer.disconnect();stop();resetTrackers();stableKey='';lastSeen='';lastEvidenceKey='';previousMove='';boardElement=el;observer.observe(el,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});if(el.parentElement)observer.observe(el.parentElement,{attributes:true,attributeFilter:['class','style']});}
  const game=pageGame(el,gameChoice);if(!game){clear();status.textContent='Укажите игру: поддерживаются шахматы и русские шашки 8×8.';return;}
  if(board&&board.game!==game){stop();resetTrackers();lastEvidenceKey='';stableKey='';}
  const snap=readBoard(el,game);if(!snap){clear();status.textContent=enabled?'Ожидаю неподвижную доску 8×8…':'Пауза';stableKey='';return;}
  board=snap;
  if(!enabled){clear();status.textContent='Пауза';return;}
  const key=snap.game+'|'+snap.placement+'|'+snap.black;
  if(key!==lastSeen){clear();lastSeen=key;status.textContent='Позиция изменилась, проверяю ход…';}
  if(key!==stableKey){stableKey=key;stableSince=performance.now();return;}
  if(performance.now()-stableSince<240)return;
  let tracking:Tracking;
  if(acceptedKey===key&&current())tracking={fen:current()!.fen,moves:[],message:''};
  else{
    const evidence=pageEvidence(snap),evidenceKey=key+'|'+evidence.fen+'|'+evidence.san?.join(' ');
    if(lastEvidenceKey===evidenceKey){clear();return;}
    lastEvidenceKey=evidenceKey;tracking=game==='russian'?draughts.accept(snap.placement,evidence):tracker.accept(snap.placement,evidence);
  }
  if(!tracking.fen){clear();stop();message.textContent=tracking.message;status.textContent='Нужна исходная позиция';return;}
  safe=true;
  acceptedKey=key;
  if(autoSide===null||tracking.source==='initial')autoSide=snap.black?'b':'w';
  if(tracking.moves.length)previousMove=tracking.moves.join(' ');
  message.textContent=previousMove?`Последние ходы: ${previousMove}`:tracking.message||'Позиция отслеживается автоматически.';
  q('.current-fen').textContent=tracking.fen;
  analyze();paint();
}
toggle.onclick=()=>{enabled=!enabled;toggle.textContent=enabled?'Пауза':'Включить';void chrome.storage.local.set({enabled});if(!enabled)stop();else{lastEvidenceKey='';stableKey='';requestedFen='';tick();}};
depthSelect.onchange=()=>{depth=Number(depthSelect.value);void chrome.storage.local.set({depth});analyze(true);};
q<HTMLSelectElement>('#my-side').onchange=()=>{mySide=q<HTMLSelectElement>('#my-side').value as typeof mySide;if(mySide==='auto')autoSide=board?.black?'b':'w';void chrome.storage.local.set({[sideStorageKey]:mySide});stop();lastEvidenceKey='';stableKey='';tick();};
q<HTMLSelectElement>('#game-kind').onchange=()=>{gameChoice=q<HTMLSelectElement>('#game-kind').value as typeof gameChoice;void chrome.storage.local.set({[gameStorageKey]:gameChoice});stop();resetTrackers();lastEvidenceKey='';stableKey='';tick();};
q('#refresh').onclick=()=>{stop();resetTrackers();stableKey='';lastEvidenceKey='';previousMove='';tick();};
q('#collapse').onclick=()=>{const body=q('.body');body.hidden=!body.hidden;panel.classList.toggle('minimized',body.hidden);q('#collapse').textContent=body.hidden?'+':'−';};
q('#apply').onclick=()=>{
  try{
    const kind=boardElement&&pageGame(boardElement,gameChoice),snap=boardElement&&kind&&readBoard(boardElement,kind);if(!snap)throw new Error('Сначала откройте неподвижную доску.');
    stop();(snap.game==='russian'?draughts:tracker).load(q<HTMLInputElement>('#fen').value.trim(),snap.placement);board=snap;safe=true;if(autoSide===null)autoSide=snap.black?'b':'w';lastEvidenceKey='';message.textContent='FEN подтверждён. Дальнейшие ходы определяются автоматически.';requestedFen='';analyze();
  }catch(e){status.textContent=(e as Error).message;status.classList.add('error');}
};
addEventListener('scroll',paint,true);addEventListener('resize',paint);document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();else{stableKey='';lastSeen='';}});
void chrome.storage.local.get({enabled:true,depth:15,[sideStorageKey]:'auto',[gameStorageKey]:'auto'}).then(s=>{enabled=Boolean(s.enabled);depth=[8,12,15,18].includes(s.depth)?s.depth:15;mySide=['w','b'].includes(s[sideStorageKey])?s[sideStorageKey]:'auto';gameChoice=['chess','russian'].includes(s[gameStorageKey])?s[gameStorageKey]:'auto';q<HTMLSelectElement>('#my-side').value=mySide;q<HTMLSelectElement>('#game-kind').value=gameChoice;depthSelect.value=String(depth);toggle.textContent=enabled?'Пауза':'Включить';tick();setInterval(tick,250);}).catch(()=>{tick();setInterval(tick,250);});
