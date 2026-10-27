import { scoreText, type Analysis } from '../src/engine';
import { findBoard, readBoard, pageEvidence, type BoardSnapshot } from './boards';
import { PositionTracker, screenCell } from './tracker';

const host=document.createElement('div');host.id='cvt-site-helper';host.style.cssText='position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
const root=host.attachShadow({mode:'open'});
root.innerHTML=`<style>
:host{font:13px/1.5 system-ui;color:#e8f3dd}*{box-sizing:border-box}button,input,select{font:inherit}button,select{cursor:pointer;background:#35472b;color:#ecf6e4;border:1px solid #6a8454;padding:6px 9px;border-radius:6px}button:hover{background:#456032}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #fff}input{background:#141f11;border:1px solid #60734e;color:#e6f1df;width:100%;padding:7px;border-radius:5px}p{margin:7px 0}small{font-size:10px;color:#aabf9c}.panel{pointer-events:auto;position:fixed;right:16px;bottom:16px;width:292px;max-width:calc(100vw - 24px);max-height:45vh;overflow:auto;background:#192416f5;color:#e8f3dd;border:1px solid #91b873;border-radius:10px;box-shadow:0 6px 26px #0006;padding:12px;backdrop-filter:blur(8px)}.header,.row{display:flex;align-items:center;justify-content:space-between;gap:7px}.header strong{color:#c6ed9e;font-size:14px}.header button{padding:1px 7px}.controls{display:flex;gap:7px;margin:10px 0}.controls button{flex:1}.status{font-size:11px;color:#c8d8bc;overflow-wrap:anywhere}.error{color:#ffc0ad}.score{color:#c6ec9d;font-weight:600;font-size:16px}.body[hidden],.overlay[hidden]{display:none!important}details{margin-top:8px}summary{cursor:pointer;color:#b4cd9f;font-size:11px}.fen-row{display:flex;gap:4px;margin-top:7px}.fen-row button{flex-shrink:0}.overlay{position:fixed;pointer-events:none;overflow:visible}.square{position:absolute;box-sizing:border-box;border:4px solid;border-radius:4px;box-shadow:0 0 0 1px #071203cc,0 0 13px #0005;pointer-events:none}.from{border-color:#ffdc59;background:#ffe56316}.to{border-color:#4cf08b;background:#4cf08b20}.square span{position:absolute;top:0;left:0;color:#10180c;padding:0 4px;font:bold 10px/16px system-ui;white-space:nowrap}.from span{background:#ffdc59}.to span{background:#4cf08b}.overlay svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.legend{font-size:10px;color:#b2c69f;margin-top:7px}.minimized{width:auto;padding:7px 10px}.message{font-size:11px;overflow-wrap:anywhere}
</style><div class="overlay" hidden aria-label="Подсказка Chess Vision"><svg viewBox="0 0 800 800"><defs><marker id="cvt-tip" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="#4cf08b"/></marker></defs><line stroke="#4cf08b" stroke-width="7" opacity=".85" marker-end="url(#cvt-tip)"/></svg><div class="square from" data-role="from"><span></span></div><div class="square to" data-role="to"><span></span></div></div>
<section class="panel" hidden><div class="header"><strong>♞ Chess Vision</strong><button id="collapse" title="Свернуть панель" aria-label="Свернуть панель">−</button></div><div class="body"><div class="controls"><button id="toggle">Пауза</button><select id="depth" aria-label="Глубина анализа"><option>8</option><option>12</option><option selected>15</option><option>18</option></select><button id="refresh" title="Перечитать доску">↻</button></div><p class="status" role="status">Ищу доску…</p><div class="row"><span class="best">—</span><span class="score">—</span></div><p class="message"></p><p class="legend">Жёлтый: откуда · Зелёный: куда</p><small class="progress">Stockfish · локальный расчёт</small><details><summary>Позиция FEN / повторная синхронизация</summary><div class="fen-row"><input id="fen" aria-label="Исходный FEN" placeholder="Полный FEN с сайта"><button id="apply">OK</button></div><small>Нужен один раз, если сайт не показывает полную историю.</small><p class="current-fen"></p></details></div></section>`;
document.documentElement.append(host);
const q=<T extends HTMLElement>(s:string)=>root.querySelector<T>(s)!;
const panel=q('.panel'),overlay=q('.overlay'),status=q('.status'),message=q('.message'),toggle=q<HTMLButtonElement>('#toggle'),depthSelect=q<HTMLSelectElement>('#depth');
const tracker=new PositionTracker(),instance=crypto.randomUUID();
let enabled=true,depth=15,sequence=0,job='',requestedFen='',latest:Analysis|null=null,board:BoardSnapshot|null=null,boardElement:HTMLElement|null=null;
let stableKey='',stableSince=0,lastSeen='',safe=false,lastEvidenceKey='',previousMove='';
const observer=new MutationObserver(()=>{clear();stableKey='';});
async function send(type:string,data:Record<string,unknown>={}){
  try{const reply=await chrome.runtime.sendMessage({target:'broker',type,...data});if(reply?.ok===false)throw new Error(reply.error);}
  catch(e){clear();status.textContent=(e as Error).message;status.classList.add('error');}
}
function clear(){safe=false;overlay.hidden=true;}
function stop(){job='';requestedFen='';latest=null;clear();void send('stop');q('.best').textContent='—';q('.score').textContent='—';}
function paint(){
  if(!enabled||!safe||!board||!latest?.best||latest.fen!==tracker.game?.fen()||document.hidden){overlay.hidden=true;return;}
  const r=board.element.getBoundingClientRect();if(!board.element.isConnected||r.width<80||r.bottom<0||r.top>innerHeight){overlay.hidden=true;return;}
  const from=screenCell(latest.best.slice(0,2),board.black),to=screenCell(latest.best.slice(2,4),board.black);
  overlay.style.left=`${r.left}px`;overlay.style.top=`${r.top}px`;overlay.style.width=`${r.width}px`;overlay.style.height=`${r.height}px`;
  for(const [kind,cell,square]of[['from',from,latest.best.slice(0,2)],['to',to,latest.best.slice(2,4)]] as const){
    const frame=q(`.${kind}`);frame.style.left=`${cell.col*12.5}%`;frame.style.top=`${cell.row*12.5}%`;frame.style.width='12.5%';frame.style.height='12.5%';frame.dataset.square=square;frame.querySelector('span')!.textContent=square;
  }
  const line=overlay.querySelector('line')!;
  line.setAttribute('x1',String(from.col*100+50));line.setAttribute('y1',String(from.row*100+50));line.setAttribute('x2',String(to.col*100+50));line.setAttribute('y2',String(to.row*100+50));
  overlay.hidden=false;
}
function analyze(force=false){
  const fen=tracker.game?.fen();if(!enabled||!fen||(!force&&fen===requestedFen))return;
  latest=null;overlay.hidden=true;requestedFen=fen;job=`${instance}:${++sequence}`;q('.best').textContent='Расчёт…';q('.score').textContent='—';status.textContent='Stockfish анализирует позицию…';status.classList.remove('error');
  if(tracker.game!.isGameOver()){status.textContent=tracker.game!.isCheckmate()?'Мат':'Ничья';job='';void send('stop');return;}
  void send('analyze',{id:job,fen,depth});
}
chrome.runtime.onMessage.addListener(m=>{
  if(m?.target!=='content'||m.id!==job||!enabled)return;
  if(m.error){clear();status.textContent=m.error;status.classList.add('error');return;}
  if(m.status){status.textContent=m.status;return;}
  const a=m.analysis as Analysis|undefined;if(!a||a.fen!==tracker.game?.fen()||a.fen!==requestedFen)return;
  if(a.best&&!tracker.game!.moves({verbose:true}).some(m=>m.lan===a.best))return;
  latest=a;q('.score').textContent=scoreText(a);q('.best').textContent=a.best?`${a.best.slice(0,2)} → ${a.best.slice(2,4)}${a.best[4]?' ='+a.best[4].toUpperCase():''}`:'—';q('.progress').textContent=`Глубина ${a.depth} / ${depth} · оценка для белых`;paint();
});
function tick(){
  if(!host.isConnected)document.documentElement.append(host);
  const el=findBoard();
  if(!el){if(boardElement){observer.disconnect();stop();tracker.reset();boardElement=null;board=null;}status.textContent='Доска не найдена. Откройте доску Chess.com или Lichess.';return;}
  panel.hidden=false;
  if(el!==boardElement){observer.disconnect();stop();tracker.reset();stableKey='';lastSeen='';lastEvidenceKey='';previousMove='';boardElement=el;observer.observe(el,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});if(el.parentElement)observer.observe(el.parentElement,{attributes:true,attributeFilter:['class','style']});}
  const snap=readBoard(el);if(!snap){clear();status.textContent=enabled?'Ожидаю завершения движения фигур…':'Пауза';stableKey='';return;}
  board=snap;
  if(!enabled){clear();status.textContent='Пауза';return;}
  const key=snap.placement+'|'+snap.black;
  if(key!==lastSeen){clear();lastSeen=key;status.textContent='Позиция изменилась, проверяю ход…';}
  if(key!==stableKey){stableKey=key;stableSince=performance.now();return;}
  if(performance.now()-stableSince<240)return;
  let tracking;
  if(tracker.game?.fen().split(' ')[0]===snap.placement)tracking={fen:tracker.game.fen(),moves:[],message:''};
  else{
    const evidence=pageEvidence(snap),evidenceKey=snap.placement+'|'+evidence.fen+'|'+evidence.san?.join(' ');
    if(lastEvidenceKey===evidenceKey){clear();return;}
    lastEvidenceKey=evidenceKey;tracking=tracker.accept(snap.placement,evidence);
  }
  if(!tracking.fen){clear();stop();message.textContent=tracking.message;status.textContent='Нужна исходная позиция';return;}
  safe=true;
  if(tracking.moves.length)previousMove=tracking.moves.join(' ');
  message.textContent=previousMove?`Последние ходы: ${previousMove}`:tracking.message||'Позиция отслеживается автоматически.';
  q('.current-fen').textContent=tracking.fen;
  analyze();paint();
}
toggle.onclick=()=>{enabled=!enabled;toggle.textContent=enabled?'Пауза':'Включить';void chrome.storage.local.set({enabled});if(!enabled)stop();else{lastEvidenceKey='';stableKey='';requestedFen='';tick();}};
depthSelect.onchange=()=>{depth=Number(depthSelect.value);void chrome.storage.local.set({depth});analyze(true);};
q('#refresh').onclick=()=>{stop();tracker.reset();stableKey='';lastEvidenceKey='';previousMove='';tick();};
q('#collapse').onclick=()=>{const body=q('.body');body.hidden=!body.hidden;panel.classList.toggle('minimized',body.hidden);q('#collapse').textContent=body.hidden?'+':'−';};
q('#apply').onclick=()=>{
  try{
    const snap=boardElement&&readBoard(boardElement);if(!snap)throw new Error('Сначала откройте неподвижную доску.');
    stop();tracker.load(q<HTMLInputElement>('#fen').value.trim(),snap.placement);board=snap;safe=true;lastEvidenceKey='';message.textContent='FEN подтверждён. Дальнейшие ходы определяются автоматически.';requestedFen='';analyze();
  }catch(e){status.textContent=(e as Error).message;status.classList.add('error');}
};
addEventListener('scroll',paint,true);addEventListener('resize',paint);document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();else{stableKey='';lastSeen='';}});
void chrome.storage.local.get({enabled:true,depth:15}).then(s=>{enabled=Boolean(s.enabled);depth=[8,12,15,18].includes(s.depth)?s.depth:15;depthSelect.value=String(depth);toggle.textContent=enabled?'Пауза':'Включить';tick();setInterval(tick,250);}).catch(()=>{tick();setInterval(tick,250);});
