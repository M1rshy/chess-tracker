import { Stockfish } from '../src/engine';
type Entry={engine?:Stockfish;worker?:Worker;id:string;kind:'chess'|'russian'};
const engines=new Map<number,Entry>();
function dispose(tabId:number){const e=engines.get(tabId);e?.engine?.dispose();e?.worker?.terminate();engines.delete(tabId);}
function send(tabId:number,id:string,data:Record<string,unknown>){void chrome.runtime.sendMessage({target:'broker',type:'update',tabId,id,...data}).catch(()=>{});}
chrome.runtime.onMessage.addListener((m,_sender,reply)=>{
  if(m?.target!=='engine')return;
  if(m.type==='stop'){dispose(m.tabId);reply({ok:true});return;}
  if(m.type==='analyze'){
    const kind=m.game==='russian'?'russian':'chess';
    if(engines.get(m.tabId)?.kind!==kind)dispose(m.tabId);
    let entry=engines.get(m.tabId);
    if(kind==='russian'){
      entry?.worker?.terminate();const worker=new Worker(chrome.runtime.getURL('draughts-worker.js'));entry={id:m.id,kind,worker};engines.set(m.tabId,entry);
      worker.onmessage=({data})=>{if(engines.get(m.tabId)?.id===data.id)send(m.tabId,data.id,{analysis:data.analysis,status:data.status,error:data.error});};
      worker.onerror=()=>{if(engines.get(m.tabId)?.id===m.id){send(m.tabId,m.id,{error:'Не удалось запустить локальный движок русских шашек'});dispose(m.tabId);}};
      worker.postMessage({id:m.id,key:m.fen,state:m.state,prefix:m.prefix||[],depth:m.depth});reply({ok:true});return;
    }
    if(!entry){entry={id:m.id,kind,engine:new Stockfish(status=>{const e=engines.get(m.tabId);if(e)send(m.tabId,e.id,{status});})};engines.set(m.tabId,entry);}
    entry.id=m.id;
    void entry.engine!.analyze(m.fen,m.depth,a=>{if(engines.get(m.tabId)?.id===m.id)send(m.tabId,m.id,{analysis:a});}).catch(e=>{if(e.name!=='AbortError'&&engines.get(m.tabId)?.id===m.id){send(m.tabId,m.id,{error:e.message});dispose(m.tabId);}});
    reply({ok:true});
  }
});
