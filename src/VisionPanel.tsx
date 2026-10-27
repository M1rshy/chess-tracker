import { useEffect, useRef, useState } from 'react';
import { Camera, Upload, ScanLine, Square, X, Check } from 'lucide-react';
import { Vision, frameChanged, frameHash, type Crop, type VisionResult } from './vision';
import { PIECES, placement, validatedGame } from './chess';

const glyphs: Record<string,string> = { '.':'·', '?':'?', P:'♙',N:'♘',B:'♗',R:'♖',Q:'♕',K:'♔',p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚' };
type Props = { onPosition: (fen: string) => void };
export default function VisionPanel({onPosition}: Props) {
  const vision = useRef<Vision>();
  const stream = useRef<MediaStream|null>(null), video = useRef<HTMLVideoElement>(null);
  const [capture,setCapture]=useState(false), [image,setImage]=useState(''), [busy,setBusy]=useState(false);
  const [error,setError]=useState(''), [note,setNote]=useState(''), [model,setModel]=useState('Встроенная модель: фигуры тренажёра');
  const [result,setResult]=useState<VisionResult|null>(null), [cells,setCells]=useState<string[]>(Array(64).fill('?'));
  const [palette,setPalette]=useState('P'), [orientation,setOrientation]=useState(''), [turn,setTurn]=useState('');
  const [castling,setCastling]=useState(''), [ep,setEp]=useState(''), [half,setHalf]=useState(0), [full,setFull]=useState(1);
  const [crop,setCrop]=useState<Crop>({x:0,y:0,size:1}), [manual,setManual]=useState(false), [auto,setAuto]=useState(false);
  const [dimensions,setDimensions]=useState({width:1,height:1});
  const lock=useRef(false), alive=useRef(true), prev=useRef<number[]|null>(null), stable=useRef<number[]|null>(null), imageRef=useRef('');
  const processRef=useRef<(blob:Blob)=>Promise<void>>();
  useEffect(()=> {
    alive.current=true; vision.current=new Vision();
    return ()=> { alive.current=false; stream.current?.getTracks().forEach(t=>t.stop()); vision.current?.dispose(); if(imageRef.current)URL.revokeObjectURL(imageRef.current); };
  },[]);
  function showImage(blob:Blob) {
    if(imageRef.current)URL.revokeObjectURL(imageRef.current);
    const url=URL.createObjectURL(blob); imageRef.current=url; setImage(url);
  }
  async function process(blob:Blob, type='recognize') {
    if(lock.current)return;
    lock.current=true; setBusy(true); setError(''); setNote('Обработка локально в Web Worker…');
    try {
      const bitmap=await createImageBitmap(blob); setDimensions({width:bitmap.width,height:bitmap.height});
      const res=await vision.current!.request(type,{bitmap,crop:manual?crop:null},[bitmap]);
      if(!alive.current)return;
      setResult(res); setCells(res.cells); if(res.model)setModel(res.model); setNote(res.warning || 'Границы доски найдены. Можно расставить фигуры вручную.');
      if(res.orientation)setNote(res.warning+` Предположительно снизу ${res.orientation==='white'?'белые':'чёрные'}. Подтвердите выбор.`);
    } catch(e) { if(alive.current){setError((e as Error).message);setNote('');setResult(null);} }
    finally {lock.current=false;if(alive.current)setBusy(false);}
  }
  processRef.current=async blob=>process(blob);
  function stop() { stream.current?.getTracks().forEach(t=>{t.onended=null;t.stop();}); stream.current=null; if(video.current)video.current.srcObject=null;setCapture(false);prev.current=null;stable.current=null; }
  async function start() {
    setError('');
    if(!navigator.mediaDevices?.getDisplayMedia) {setError('Screen Capture API недоступен. Откройте приложение через HTTPS или localhost в Chrome/Chromium.');return;}
    try {
      const s=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:2},audio:false});
      if(!alive.current){s.getTracks().forEach(t=>t.stop());return;}
      stream.current=s; s.getVideoTracks()[0].onended=()=>{stop();setNote('Трансляция закрыта или разрешение отозвано.');};
      video.current!.srcObject=s;await video.current!.play(); setCapture(true);setNote('Захват активен. Проверка изменений каждые 2 секунды.');
    } catch(e) {stop();setError(`Захват не начат: ${(e as Error).name}. Выбор источника можно повторить.`);}
  }
  useEffect(()=> {
    if(!capture)return;
    const tick=()=> {
      const v=video.current;if(!v?.videoWidth||lock.current)return;
      const canvas=document.createElement('canvas');const ratio=Math.min(1,1600/v.videoWidth);
      canvas.width=Math.round(v.videoWidth*ratio);canvas.height=Math.round(v.videoHeight*ratio);canvas.getContext('2d')!.drawImage(v,0,0,canvas.width,canvas.height);
      let hashCanvas=canvas;
      const box=manual?{x:crop.x*canvas.width,y:crop.y*canvas.height,size:crop.size*canvas.width}:result?.box;
      if(box){hashCanvas=document.createElement('canvas');hashCanvas.width=128;hashCanvas.height=128;
        const f=manual?1:canvas.width/dimensions.width;
        hashCanvas.getContext('2d')!.drawImage(canvas,box.x*f,box.y*f,box.size*f,box.size*f,0,0,128,128);}
      const hash=frameHash(hashCanvas);
      if(!frameChanged(prev.current,hash))return;
      if(auto && frameChanged(stable.current,hash)){stable.current=hash;return;}
      prev.current=hash;
      canvas.toBlob(blob=>{if(!blob||!alive.current)return;showImage(blob);if(auto)void processRef.current?.(blob);},'image/png');
    };
    tick();const timer=setInterval(tick,2000);return()=>clearInterval(timer);
  },[capture,auto,manual,crop,result?.box,dimensions.width]);
  async function recognize() {if(image)await process(await (await fetch(image)).blob());}
  async function loadModel(file:File) {
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{await vision.current!.request('model',{buffer:await file.arrayBuffer()});setModel(file.name);setNote('Модель проверена на входе [1,3,64,64] и выходе [1,13].');}
    catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
  }
  function apply() {
    setError('');
    try{
      if(!orientation||!turn||!castling||!ep)throw new Error('Укажите ориентацию, очередь хода, рокировку и поле взятия на проходе. Эти данные нельзя получить из скриншота.');
      const fen=`${placement(cells,orientation==='black')} ${turn} ${castling} ${ep} ${half} ${full}`;
      validatedGame(fen);onPosition(fen);setNote('Проверенная позиция передана на тренировочную доску.');
    }catch(e){setError((e as Error).message);}
  }
  return <div className="vision-panel">
    <div className="section-heading"><div><span className="eyebrow">SCREEN → POSITION</span><h2>Распознать доску</h2></div><Camera size={22}/></div>
    <p className="muted">Скриншоты тренировок и разрешённых позиций. Изображения обрабатываются на этом устройстве.</p>
    <div className="button-row"><button className={capture?'danger':'primary'} onClick={capture?stop:start}><Camera size={16}/>{capture?'Остановить захват':'Начать захват'}</button>
      <label className="button"><Upload size={16}/> Изображение<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{const f=e.target.files?.[0];if(f){stop();showImage(f);setResult(null);prev.current=null;}}}/></label></div>
    <label className="check"><input type="checkbox" checked={auto} onChange={e=>{setAuto(e.target.checked);prev.current=null;stable.current=null;}}/> Распознавать изменившуюся доску после двух стабильных кадров</label>
    <video ref={video} muted playsInline hidden/>
    {image&&<><div className="screenshot"><img src={image} alt="Источник распознавания" onLoad={e=>setDimensions({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight})}/>{(result||manual)&&<div className="crop-outline" style={manual?{left:`${crop.x*100}%`,top:`${crop.y*100}%`,width:`${crop.size*100}%`,height:`${crop.size*dimensions.width/dimensions.height*100}%`}:{left:`${result!.box.x/dimensions.width*100}%`,top:`${result!.box.y/dimensions.height*100}%`,width:`${result!.box.size/dimensions.width*100}%`,height:`${result!.box.size/dimensions.height*100}%`}}/>}</div>
      <label className="check"><input type="checkbox" checked={manual} onChange={e=>setManual(e.target.checked)}/> Указать квадратные границы вручную</label>
      {manual&&<div className="fields three">{(['x','y','size'] as const).map(key=><label key={key}>{key==='size'?'Ширина %':`${key.toUpperCase()} %`}<input aria-label={`Граница ${key}`} type="number" min={0} max={100} step={.1} value={Math.round(crop[key]*1000)/10} onChange={e=>setCrop({...crop,[key]:Number(e.target.value)/100})}/></label>)}</div>}
      <button className="primary wide" disabled={busy} onClick={recognize}><ScanLine size={17}/>{busy?'Обработка…':'Найти доску и распознать'}</button></>}
    <div className="model-status"><span className="dot amber"/>{model}<label className="text-button">Загрузить ONNX<input type="file" accept=".onnx,.gz" hidden disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void loadModel(f);}}/></label></div>
    <details><summary>Требования к модели и ограничения</summary><p className="muted">RGB float32 [1,3,64,64], диапазон 0…1; выход — логиты [1,13]. Классы: пусто, P N B R Q K p n b r q k. Уверенность ниже 70% отмечается ?. Встроен классификатор по эталонам фигур react-chessboard 4.7.3, для трёх тем тренажёра. Это не универсальная модель. Для других наборов нужна обученная модель с тем же контрактом. Если модель недоступна, фигуры не распознаются. Автопоиск рассчитан на скриншоты плоской доски, не фотографии под углом.</p></details>
    {note&&<p className="notice" role="status">{note}</p>}{error&&<p className="error" role="alert">{error}</p>}
    <div className="section-heading small"><h3>Ручная корректировка</h3><button className="icon-button" title="Очистить все клетки" onClick={()=>setCells(Array(64).fill('.'))}><X size={16}/></button></div>
    <div className="palette">{PIECES.map(p=><button key={p} className={palette===p?'selected':''} title={p==='.'?'Пустая клетка':p} onClick={()=>setPalette(p)}>{glyphs[p]}</button>)}</div>
    <div className="editor-grid" aria-label="Редактор распознанных фигур">{cells.map((p,i)=><button key={i} aria-label={`Клетка ${i+1}: ${p}`} className={`${(Math.floor(i/8)+i%8)%2?'dark':'light'} ${p==='?'?'unknown':''} ${p===p.toUpperCase()?'white-piece':'black-piece'}`} onClick={()=>setCells(c=>c.map((v,j)=>j===i?palette:v))}>{glyphs[p]}</button>)}</div>
    <p className="muted caption">Клетки показаны в порядке на изображении. Выберите фигуру выше и нажмите на клетку.</p>
    <div className="fields"><label>Снизу на изображении<select aria-label="Ориентация изображения" value={orientation} onChange={e=>setOrientation(e.target.value)}><option value="">Укажите…</option><option value="white">Белые</option><option value="black">Чёрные</option></select></label>
      <label>Очередь хода<select aria-label="Очередь хода" value={turn} onChange={e=>setTurn(e.target.value)}><option value="">Укажите…</option><option value="w">Белые</option><option value="b">Чёрные</option></select></label>
      <label>Рокировка<select value={castling} onChange={e=>setCastling(e.target.value)}><option value="">Укажите…</option>{['-','KQkq','KQ','kq','K','Q','k','q','Kk','Kq','Qk','Qq','KQk','KQq','Kkq','Qkq'].map(v=><option key={v} value={v}>{v==='-'?'Нет прав':v}</option>)}</select></label>
      <label>Взятие на проходе<input placeholder="Укажите - или e3…" value={ep} onChange={e=>setEp(e.target.value.trim())}/></label>
      <label>Полуходов без взятия<input type="number" min={0} value={half} onChange={e=>setHalf(Math.max(0,Math.floor(Number(e.target.value))))}/></label><label>Номер хода<input type="number" min={1} value={full} onChange={e=>setFull(Math.max(1,Math.floor(Number(e.target.value))))}/></label></div>
    <button className="primary wide" disabled={busy} onClick={apply}><Check size={16}/> Проверить FEN и анализировать</button>
  </div>;
}
