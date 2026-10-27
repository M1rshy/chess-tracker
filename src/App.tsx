import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { ArrowLeft, ArrowRight, RotateCw, FlipVertical2, Settings2, ScanLine, ChevronRight, Play, Pause, Download, Upload, Crosshair, Cpu, GraduationCap, Activity, X, Check, Copy } from 'lucide-react';
import { Stockfish, type Analysis, scoreText, whitePercent } from './engine';
import { explainBest, moveQuality, threatened, uciMove, validatedGame, variation } from './chess';
import { download, read, write, useSettings, type Attempt } from './storage';
import VisionPanel from './VisionPanel';

type Mode = 'analysis'|'computer'|'training';
const puzzles = [
  { title:'Мат на последней горизонтали', fen:'6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1' },
  { title:'Найдите решающий шах', fen:'7k/6pp/5K2/8/8/8/8/6R1 w - - 0 1' },
  { title:'Активность тяжёлых фигур', fen:'3r2k1/pp3ppp/2p5/8/2B5/8/PP3PPP/3R2K1 w - - 0 1' },
];
const themes: Record<string,{light:string;dark:string}> = { forest:{light:'#e7e9dc',dark:'#728c6b'}, slate:{light:'#d9e2ec',dark:'#647b95'}, walnut:{light:'#ead6b6',dark:'#a37753'} };
function restore() {try{const g=new Chess();const s=read<{pgn:string}>('cvt.game',{pgn:''});if(s.pgn)g.loadPgn(s.pgn);return g;}catch{return new Chess();}}
function aborted(e:unknown) {return (e as Error).name==='AbortError';}
export default function App() {
  const [initialGame]=useState(restore);
  const game=useRef<Chess>(initialGame), redo=useRef<string[]>([]);
  const [fen,setFen]=useState(game.current.fen()), [moves,setMoves]=useState(game.current.history({verbose:true}));
  const [settings,update]=useSettings(), [mode,setMode]=useState<Mode>('analysis'), [tab,setTab]=useState('analysis');
  const [status,setStatus]=useState('Загрузка Stockfish…'), [analysis,setAnalysis]=useState<Analysis|null>(null);
  const [enabled,setEnabled]=useState(settings.auto), [restart,setRestart]=useState(0), [request,setRequest]=useState(0);
  const engine=useRef<Stockfish>(), reviewer=useRef<Stockfish>(), opponent=useRef<Stockfish>();
  const cache=useRef(new Map<string,Analysis>()), generation=useRef(0), latestFen=useRef(fen);
  const [error,setError]=useState(''), [notice,setNotice]=useState(''), [selected,setSelected]=useState<Square|null>(null);
  const [fenInput,setFenInput]=useState(''), [pgnInput,setPgnInput]=useState(''), [moveInput,setMoveInput]=useState('');
  const [promotion,setPromotion]=useState<{from:string;to:string}|null>(null);
  const [review,setReview]=useState<{message:string;before?:Analysis;after?:Analysis;loss?:number;label?:string}|null>(null);
  const [attempts,setAttempts]=useState<Attempt[]>(()=>{const a=read<Attempt[]>('cvt.attempts',[]);return Array.isArray(a)?a:[];});
  const [reveal,setReveal]=useState(false), [puzzle,setPuzzle]=useState(0), [thinking,setThinking]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false), [boardWidth,setBoardWidth]=useState(560);
  const boardContainer=useRef<HTMLDivElement>(null), modeRef=useRef(mode), settingsRef=useRef(settings);
  modeRef.current=mode;settingsRef.current=settings;
  const [storageError,setStorageError]=useState(false);
  useEffect(()=>{const node=boardContainer.current;if(!node)return;const ro=new ResizeObserver(([e])=>setBoardWidth(Math.floor(e.contentRect.width)));ro.observe(node);return()=>ro.disconnect();},[]);
  useEffect(()=> {
    engine.current=new Stockfish(setStatus);
    return()=>{engine.current?.dispose();};
  },[restart]);
  useEffect(()=>()=>{reviewer.current?.dispose();opponent.current?.dispose();},[]);
  useEffect(()=> {
    latestFen.current=fen;
    setAnalysis(null);
    if(!enabled){engine.current?.stop();return;}
    let current=true;
    const terminal=game.current.isGameOver();
    if(terminal){engine.current?.stop();setStatus(game.current.isCheckmate()?'Мат':'Ничья');setAnalysis({fen,cp:game.current.isCheckmate()?null:0,mate:game.current.isCheckmate()?(game.current.turn()==='b'?0:-0):null,depth:0,pv:[],best:'',nodes:0,complete:true});return;}
    engine.current?.analyze(fen,settings.depth,a=>{
      if(current&&a.fen===latestFen.current){setAnalysis(a);if(a.complete){cache.current.set(`${a.fen}|${settings.depth}`,a);if(cache.current.size>80)cache.current.delete(cache.current.keys().next().value!);}}
    }).catch(e=>{if(current&&!aborted(e))setStatus(e.message);});
    return()=>{current=false;engine.current?.stop();};
  },[fen,settings.depth,enabled,restart,request]);
  function sync(clearReview=true) {
    const g=game.current;latestFen.current=g.fen();generation.current++;setFen(g.fen());setMoves(g.history({verbose:true}));setSelected(null);setPromotion(null);setAnalysis(null);
    if(clearReview){setReview(null);reviewer.current?.stop();}
    setStorageError(!write('cvt.game',{pgn:g.pgn()}));setError('');setRequest(n=>n+1);
    if(settingsRef.current.auto)setEnabled(true);
  }
  function loadPosition(value:string) {try{const next=validatedGame(value);opponent.current?.stop();game.current=next;redo.current=[];sync();setMode('analysis');setTab('analysis');setNotice('Позиция загружена');}catch(e){setError((e as Error).message);}}
  async function assess(beforeFen:string,afterFen:string,uci:string,mover:'w'|'b',token:number,training:boolean) {
    setReview({message:'Сравниваем позиции до и после хода…'});
    if(!reviewer.current)reviewer.current=new Stockfish();
    const depth=settingsRef.current.depth;
    try{
      const before=cache.current.get(`${beforeFen}|${depth}`) || await reviewer.current.analyze(beforeFen,depth);
      if(token!==generation.current)return;
      let after:Analysis;
      const ag=new Chess(afterFen);
      if(ag.isCheckmate())after={...before,fen:afterFen,cp:null,mate:mover==='w'?0:-0,depth,pv:[],best:'',complete:true};
      else if(ag.isDraw())after={...before,fen:afterFen,cp:0,mate:null,depth,pv:[],best:'',complete:true};
      else after=cache.current.get(`${afterFen}|${depth}`) || await reviewer.current.analyze(afterFen,depth);
      if(token!==generation.current)return;
      let quality=moveQuality(before,after,mover);
      if(ag.isCheckmate())quality={loss:0,label:'Мат'};
      if(!quality)throw new Error('Движок не вернул оценку для сравнения');
      const alternative=variation(beforeFen,before.pv,8).join(' ');
      setReview({before,after,...quality,message:`${quality.label}. ${before.best===uci?'Ваш ход совпал с лучшим ходом Stockfish.':`Предпочтительное продолжение: ${alternative}.`} ${quality.loss>=10000?'Изменился исход матовой последовательности.':`Потеря оценки: ${(quality.loss/100).toFixed(2)} пешки.`} Сравнение на глубине ${depth}; это оценка поиска, она может уточняться.`});
      if(training){setReveal(true);const item:Attempt={date:new Date().toISOString(),fen:beforeFen,move:uci,best:before.best,loss:quality.loss,label:quality.label};setAttempts(old=>{const next=[item,...old].slice(0,200);if(!write('cvt.attempts',next))setStorageError(true);return next;});}
    }catch(e){if(token===generation.current&&!aborted(e))setReview({message:`Сравнение недоступно: ${(e as Error).message}`});}
  }
  function perform(from:string,to:string,promote='q',computerMove=false) {
    const g=game.current;if(modeRef.current==='computer'&&!computerMove&&g.turn()!==settingsRef.current.player)return false;
    if(modeRef.current==='training'&&!computerMove&&review&&!reveal)return false;
    const before=g.fen(),mover=g.turn();
    try{
      const m=g.move({from,to,promotion:promote});const uci=m.from+m.to+(m.promotion||'');redo.current=[];sync();
      const token=generation.current;
      if(!computerMove)void assess(before,g.fen(),uci,mover,token,modeRef.current==='training');
      if(modeRef.current==='training')setReveal(true);
      return true;
    }catch{return false;}
  }
  function makeMove(from:string,to:string) {
    if(!to||from===to)return false;
    const g=game.current;
    if(modeRef.current==='computer'&&g.turn()!==settingsRef.current.player)return false;
    const legal=g.moves({verbose:true}).filter(m=>m.from===from&&m.to===to);
    if(!legal.length)return false;
    if(legal.some(m=>m.promotion)){setPromotion({from,to});return false;}
    return perform(from,to);
  }
  useEffect(()=> {
    if(mode!=='computer'||game.current.turn()===settings.player||game.current.isGameOver()){opponent.current?.stop();setThinking(false);return;}
    let active=true;setThinking(true);
    if(!opponent.current)opponent.current=new Stockfish();
    const depth=Math.min(15,Math.max(3,Math.floor(settings.difficulty/2)+3));
    opponent.current.analyze(fen,depth,undefined,settings.difficulty).then(a=>{
      if(active&&latestFen.current===a.fen&&a.best)perform(a.best.slice(0,2),a.best.slice(2,4),a.best[4]||'q',true);
    }).catch(e=>{if(active&&!aborted(e))setError(`Компьютер: ${e.message}`);}).finally(()=>{if(active)setThinking(false);});
    return()=>{active=false;opponent.current?.stop();};
  },[mode,fen,settings.difficulty,settings.player]);
  function undoMove() {opponent.current?.stop();let changed=false;for(let i=0;i<(mode==='computer'?2:1);i++){const m=game.current.undo();if(!m)break;changed=true;redo.current.push(m.from+m.to+(m.promotion||''));if(mode==='computer'&&game.current.turn()===settings.player)break;}if(changed){sync();setReveal(false);}}
  function redoMove() {let changed=false;for(let i=0;i<(mode==='computer'?2:1);i++){const u=redo.current.pop();if(!u)break;uciMove(game.current,u);changed=true;if(mode==='computer'&&game.current.turn()===settings.player)break;}if(changed){sync();setReveal(false);}}
  function newGame() {opponent.current?.stop();game.current=new Chess();redo.current=[];sync();setReveal(false);setNotice('Новая партия');}
  function startPuzzle(index:number) {const next=(index+puzzles.length)%puzzles.length;opponent.current?.stop();game.current=validatedGame(puzzles[next].fen);redo.current=[];sync();setMode('training');setPuzzle(next);setReveal(false);setTab('analysis');setNotice(puzzles[next].title);}
  function changeMode(next:Mode) {opponent.current?.stop();reviewer.current?.stop();generation.current++;setReview(null);setMode(next);if(next==='training'){setReveal(false);setNotice('Найдите лучший ход в текущей позиции. Подсказки скрыты до попытки.');}else setNotice('');}
  const actions=useRef({undoMove,redoMove,newGame});actions.current={undoMove,redoMove,newGame};
  useEffect(()=>{const key=(e:KeyboardEvent)=>{const el=e.target as HTMLElement;if(el.closest('input,textarea,select,[contenteditable]')||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='ArrowLeft'){e.preventDefault();actions.current.undoMove();}if(e.key==='ArrowRight'){e.preventDefault();actions.current.redoMove();}if(e.key.toLowerCase()==='f')update({flipped:!settingsRef.current.flipped});if(e.key==='Escape'){setSelected(null);setPromotion(null);setSettingsOpen(false);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  function importPgn(text:string) {try{const g=new Chess();g.loadPgn(text);validatedGame(g.fen());opponent.current?.stop();game.current=g;redo.current=[];sync();setMode('analysis');setNotice('PGN импортирован');}catch(e){setError(`Ошибка PGN: ${(e as Error).message}`);}}
  const hidden=mode==='training'&&!reveal;
  const visible=analysis?.fen===fen&&!hidden?analysis:null;
  const best=visible?.best||'', theme=themes[settings.theme]||themes.forest;
  const bestSan=useMemo(()=>{try{return best?variation(fen,[best],1)[0]:'';}catch{return '';}},[fen,best]);
  const highlights:Record<string,CSSProperties>={};
  if(settings.arrows&&best){highlights[best.slice(0,2)]={backgroundColor:'rgba(29,185,102,.45)'};highlights[best.slice(2,4)]={backgroundColor:'rgba(29,185,102,.55)'};}
  if(selected){highlights[selected]={backgroundColor:'rgba(249,205,91,.6)'};for(const m of game.current.moves({square:selected,verbose:true}))highlights[m.to]={background:'radial-gradient(circle, rgba(15,23,20,.25) 22%, transparent 24%)'};}
  const percent=hidden?50:whitePercent(visible);
  const statusText=game.current.isCheckmate()?'Мат':game.current.isStalemate()?'Пат':game.current.isDraw()?'Ничья':thinking?'Компьютер думает…':`${game.current.turn()==='w'?'Белые':'Чёрные'} ходят${game.current.isCheck()?' · Шах':''}`;
  const facts=visible?.complete?explainBest(visible):[], threats=hidden?[]:threatened(fen);
  const initialPly=moves.length?((Number(moves[0].before.split(' ')[5])-1)*2+(moves[0].color==='b'?1:0)):0;
  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#"><div className="brand-mark">♞</div><div><strong>CHESS VISION<span>TRAINER</span></strong><small>Видеть дальше. Играть сильнее.</small></div></a><div className="header-right"><span className="local-badge"><span className="dot"/> Локально на устройстве</span><button className={`icon-button ${settingsOpen?'active':''}`} title="Настройки" aria-label="Настройки" onClick={()=>setSettingsOpen(v=>!v)}><Settings2 size={20}/></button></div></header>
    <div className="workspace-heading"><div><span className="eyebrow">YOUR CHESS WORKSPACE</span><h1>{mode==='training'?'Тренируйте шахматное зрение':mode==='computer'?'Сыграйте против Stockfish':'Каждая позиция — возможность'}</h1><p>Исследуйте варианты и понимайте свои решения.</p></div><div className="engine-pill"><Cpu size={17}/><div><strong>Stockfish 17.1 <span>WASM</span></strong><small data-testid="engine-status">{status}</small></div></div></div>
    <nav className="mode-nav" aria-label="Режим работы">{([{id:'analysis',label:'Анализ',icon:Activity},{id:'computer',label:'Против компьютера',icon:Cpu},{id:'training',label:'Найти лучший ход',icon:GraduationCap}] as const).map(({id,label,icon:Icon})=><button key={id} className={mode===id?'active':''} onClick={()=>changeMode(id)}><Icon size={17}/>{label}</button>)}<span className="depth-badge">DEPTH {settings.depth} <i/> MULTIPV 1</span></nav>
    {error&&<div className="error banner" role="alert">{error}<button className="icon-button" aria-label="Закрыть ошибку" onClick={()=>setError('')}><X size={16}/></button></div>}
    {storageError&&<p className="error" role="alert">Хранилище браузера недоступно или заполнено. Экспортируйте PGN и историю тренировок, чтобы сохранить данные.</p>}
    {notice&&<div className="notice banner" role="status">{notice}<button className="icon-button" aria-label="Закрыть уведомление" onClick={()=>setNotice('')}><X size={16}/></button></div>}
    {settingsOpen&&<section className="settings-panel card"><div className="section-heading"><h2>Настройки</h2><button className="icon-button" onClick={()=>setSettingsOpen(false)} aria-label="Закрыть настройки"><X size={18}/></button></div><div className="settings-grid"><label>Глубина анализа<select value={settings.depth} onChange={e=>update({depth:Number(e.target.value)})}>{[8,12,15,18].map(n=><option key={n} value={n}>{n}{n===15?' · по умолчанию':''}</option>)}</select></label><label>Тема доски<select value={settings.theme} onChange={e=>update({theme:e.target.value})}><option value="forest">Лесная</option><option value="slate">Сланец</option><option value="walnut">Орех</option></select></label><label>Сложность компьютера<select value={settings.difficulty} onChange={e=>update({difficulty:Number(e.target.value)})}>{[0,3,5,10,15,20].map(n=><option key={n} value={n}>Skill {n} / 20</option>)}</select></label><label>Вы играете<select value={settings.player} onChange={e=>update({player:e.target.value as 'w'|'b'})}><option value="w">Белыми</option><option value="b">Чёрными</option></select></label><label className="check"><input type="checkbox" checked={settings.arrows} onChange={e=>update({arrows:e.target.checked})}/> Стрелка лучшего хода</label><label className="check"><input type="checkbox" checked={settings.auto} onChange={e=>{update({auto:e.target.checked});setEnabled(e.target.checked);}}/> Автоанализ после хода</label></div><p className="muted caption">← / → отмена и повтор · F переворот · Esc закрыть. Настройки сохраняются автоматически.</p></section>}
    <div className="workspace"><section className="board-section">
      <div className="player-row"><div className="avatar">{settings.flipped?'♔':'♚'}</div><div><strong>{settings.flipped?'Белые':'Чёрные'}</strong><small>{mode==='computer'?(settings.player===(settings.flipped?'w':'b')?'Вы':`Stockfish · Skill ${settings.difficulty}`):'Тренировочная доска'}</small></div><span className="side-tag">{settings.flipped?'WHITE':'BLACK'}</span></div>
      <div className="board-row"><div className="eval-bar" aria-label={`Оценка для белых ${scoreText(visible)}`}><div className="eval-white" style={{height:`${percent}%`,[settings.flipped?'top':'bottom']:0}}/><span className={percent>50?'eval-text dark-text':'eval-text'}>{hidden?'?':scoreText(visible)}</span></div><div className="board-wrap" ref={boardContainer}>
        <Chessboard id="trainer-board" onPromotionCheck={()=>false} boardWidth={boardWidth} position={fen} boardOrientation={settings.flipped?'black':'white'} onPieceDrop={(from,to)=>makeMove(from,to)} onSquareClick={square=>{if(selected&&makeMove(selected,square)){setSelected(null);return;}setSelected(game.current.get(square)?.color===game.current.turn()?square:null);}} arePiecesDraggable={!thinking&&!promotion&&!game.current.isGameOver()} customLightSquareStyle={{backgroundColor:theme.light}} customDarkSquareStyle={{backgroundColor:theme.dark}} customSquareStyles={highlights} customArrows={settings.arrows&&best?[[best.slice(0,2) as Square,best.slice(2,4) as Square,'#23b86c']]:[]} areArrowsAllowed={false} animationDuration={180} customBoardStyle={{borderRadius:'4px'}}/>
        {promotion&&<div className="promotion-dialog" role="dialog" aria-label="Превращение пешки"><strong>Превратить пешку в…</strong><div className="button-row">{[['q','Ферзь'],['r','Ладья'],['b','Слон'],['n','Конь']].map(([p,label])=><button key={p} onClick={()=>perform(promotion.from,promotion.to,p)}>{label}</button>)}<button onClick={()=>setPromotion(null)}>Отмена</button></div></div>}
      </div></div>
      <div className="player-row bottom"><div className="avatar light-avatar">{settings.flipped?'♚':'♔'}</div><div><strong>{settings.flipped?'Чёрные':'Белые'}</strong><small>{statusText}</small></div><span className="side-tag">{settings.flipped?'BLACK':'WHITE'}</span></div>
      <div className="board-toolbar"><button title="Новая партия" onClick={newGame}><RotateCw size={16}/><span>Новая партия</span></button><div className="button-row"><button className="icon-button" aria-label="Отменить ход" title="Отменить ход (←)" disabled={!moves.length} onClick={undoMove}><ArrowLeft size={19}/></button><button className="icon-button" aria-label="Повторить ход" title="Повторить ход (→)" disabled={!redo.current.length} onClick={redoMove}><ArrowRight size={19}/></button><span className="toolbar-divider"/><button className="icon-button" aria-label="Перевернуть доску" title="Перевернуть (F)" onClick={()=>update({flipped:!settings.flipped})}><FlipVertical2 size={18}/></button></div></div>
      <form className="move-input" onSubmit={e=>{e.preventDefault();if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(moveInput)||!perform(moveInput.slice(0,2),moveInput.slice(2,4),moveInput[4]||'q'))setError('Нелегальный ход. Формат: e2e4 или a7a8n.');else setMoveInput('');}}><input aria-label="Ход UCI" placeholder="Введите ход: e2e4" value={moveInput} onChange={e=>setMoveInput(e.target.value.toLowerCase())}/><button type="submit">Сделать ход <ChevronRight size={15}/></button></form>
      <div className="board-footnote"><span className="dot"/> Без аккаунта. Без облачного анализа.<span>chess.js · React Chessboard</span></div>
    </section>
    <aside className="analysis-sidebar card"><nav className="panel-tabs">{[{id:'analysis',label:'Анализ'},{id:'vision',label:'Захват',icon:ScanLine},{id:'import',label:'FEN / PGN'}].map(t=><button key={t.id} className={tab===t.id?'active':''} onClick={()=>setTab(t.id)}>{t.icon&&<t.icon size={15}/>} {t.label}</button>)}</nav>
      <div className="panel-content" style={{display:tab==='analysis'?'block':'none'}}>
        <div className="section-heading"><div><span className="eyebrow">POSITION INSIGHT</span><h2>{hidden?'Ваш лучший ход?':'Анализ позиции'}</h2></div><button className="icon-button" aria-label={enabled?'Остановить анализ':'Начать анализ'} title={enabled?'Остановить анализ':'Начать анализ'} onClick={()=>{if(enabled){setEnabled(false);engine.current?.stop();setStatus('Анализ остановлен');}else{setEnabled(true);setRequest(n=>n+1);}}}>{enabled?<Pause size={18}/>:<Play size={18}/>}</button></div>
        <div className="evaluation-card"><div><span>{hidden?'Сначала сделайте ход':'Оценка для белых'}</span><strong data-testid="evaluation">{hidden?'?':scoreText(visible)}</strong><small>{visible?.mate!==null&&visible?.mate!==undefined?'Матовая последовательность':visible?.cp!==null&&visible?.cp!==undefined?(Math.abs(visible.cp)<30?'Примерно равная позиция':visible.cp>0?'Преимущество белых':'Преимущество чёрных'):'Ожидаем ответ движка'}</small></div><Activity size={28}/></div>
        <div className="analysis-meta"><span><i className={status==='Анализ…'?'pulse dot':'dot'}/>{visible?.complete?'Готово':status==='Анализ…'?'Анализируем':'Stockfish'}</span><span>Глубина <b data-testid="depth">{visible?.depth??'—'}</b> / {settings.depth}</span></div><div className="progress-track"><div style={{width:`${visible?visible.depth/settings.depth*100:0}%`}}/></div>
        <div className="best-move"><div className="best-icon"><Crosshair size={21}/></div><div><small>Лучший ход</small><strong data-testid="best-move">{hidden?'Подсказка скрыта':bestSan||'—'}</strong></div>{best&&<span className="uci">{best}</span>}</div>
        <div className="variation"><span className="eyebrow">ОСНОВНОЙ ВАРИАНТ</span><p data-testid="pv">{visible?.pv.length?variation(fen,visible.pv,12).map((san,i)=><span key={i} className={i===0?'first':''}>{san}</span>):hidden?'Найдите ход на доске, затем сравните решение.':'Вариант появится после ответа Stockfish.'}</p></div>
        {hidden&&<button className="button wide" onClick={()=>setReveal(true)}>Показать решение</button>}
        {mode==='training'&&<div className="training-actions"><button onClick={()=>startPuzzle(puzzle+1)}><GraduationCap size={16}/> Следующая позиция</button><small>{attempts.length} попыток сохранено</small></div>}
        <section className="explanation"><h3><GraduationCap size={17}/> Разбор решения</h3>{review?<><p className={review.label==='Зевок'?'review blunder':'review'}>{review.message}</p>{review.before&&review.after&&<div className="review-scores"><span>До <b>{scoreText(review.before)}</b></span><ChevronRight size={14}/><span>После <b>{scoreText(review.after)}</b></span></div>}</>:<p className="muted">{hidden?'Сделайте свой ход. Движок сравнит оценку до и после.':'После вашего хода сравним две позиции на одинаковой глубине.'}</p>}{facts.map((f,i)=><p key={i}>{f}</p>)}<small className="muted caption">Факты из chess.js и поиск Stockfish. Это не полный стратегический комментарий.</small></section>
        {!hidden&&threats.length>0&&<details className="threats"><summary>Под атакой · {threats.length}</summary>{threats.map(t=><p key={t}>{t}</p>)}<small className="muted">Атака не всегда означает выигрыш: учитывайте связки, защиту и варианты.</small></details>}
        <section className="history-section"><div className="section-heading small"><h3>История ходов</h3><span className="muted caption">{moves.length} полуходов</span></div><div className="move-history" data-testid="move-history">{!moves.length?<p className="muted">Первый ход — за вами.</p>:moves.map((m,i)=><div className={i===moves.length-1?'latest':''} key={i}><span>{Math.floor((initialPly+i)/2)+1}{m.color==='w'?'.':'…'}</span><b>{m.san}</b><small>{m.color==='w'?'Белые':'Чёрные'}</small></div>)}</div></section>
        {attempts.length>0&&<details className="training-history"><summary>История тренировок · {attempts.length}</summary>{attempts.slice(0,12).map((a,i)=><div className="attempt-row" key={i}><button onClick={()=>loadPosition(a.fen)}>{a.move}</button><span>{a.label}</span><small>{new Date(a.date).toLocaleDateString('ru')}</small></div>)}<button className="text-button" onClick={()=>download(JSON.stringify(attempts,null,2),'training-history.json')}>Экспорт истории</button></details>}
        <button className="text-button restart-engine" onClick={()=>{setRestart(n=>n+1);setEnabled(true);}}>Перезапустить Stockfish</button>
      </div>
      <div className="panel-content" style={{display:tab==='vision'?'block':'none'}}><VisionPanel onPosition={loadPosition}/></div>
      <div className="panel-content import-panel" style={{display:tab==='import'?'block':'none'}}><span className="eyebrow">BRING YOUR OWN GAME</span><h2>Импорт и экспорт</h2><h3>Позиция FEN</h3><textarea aria-label="FEN для импорта" placeholder="Все 6 полей FEN…" value={fenInput} onChange={e=>setFenInput(e.target.value)} rows={3}/><button className="primary wide" onClick={()=>loadPosition(fenInput)}>Загрузить FEN</button><div className="current-fen">{fen}</div><div className="button-row"><button onClick={()=>download(fen,'position.fen')}><Download size={15}/> Экспорт FEN</button><button onClick={()=>navigator.clipboard.writeText(fen).then(()=>setNotice('FEN скопирован')).catch(()=>setError('Копирование недоступно. Используйте экспорт FEN.'))}><Copy size={15}/> Копировать</button></div><h3>Партия PGN</h3><textarea aria-label="PGN для импорта" placeholder={'[Event "Training"]\n\n1. e4 e5 2. Nf3…'} rows={7} value={pgnInput} onChange={e=>setPgnInput(e.target.value)}/><button className="primary wide" onClick={()=>importPgn(pgnInput)}>Загрузить PGN</button><div className="button-row"><label className="button"><Upload size={15}/> Файл PGN<input type="file" accept=".pgn,text/plain" hidden onChange={e=>{const f=e.target.files?.[0];if(f)f.text().then(importPgn).catch(()=>setError('Файл PGN не прочитан'));}}/></label><button onClick={()=>download(game.current.pgn(),'training.pgn')}><Download size={15}/> Экспорт PGN</button></div><p className="muted">Партия сохраняется в браузере после каждого хода. Для резервной копии используйте экспорт PGN.</p></div>
    </aside></div>
    <footer><span>♞ CHESS VISION TRAINER</span><span>Пространство для обучения и разрешённого анализа.</span><a href={`${import.meta.env.BASE_URL}licenses/stockfish.txt`} target="_blank" rel="noreferrer">Stockfish · GPLv3 · Лицензии</a></footer>
  </main>;
}
