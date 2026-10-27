import { Stockfish } from '../src/engine';
type Entry={engine:Stockfish;id:string};
const engines=new Map<number,Entry>();
function send(tabId:number,id:string,data:Record<string,unknown>){void chrome.runtime.sendMessage({target:'broker',type:'update',tabId,id,...data}).catch(()=>{});}
chrome.runtime.onMessage.addListener((m,_sender,reply)=>{
  if(m?.target!=='engine')return;
  if(m.type==='stop'){engines.get(m.tabId)?.engine.dispose();engines.delete(m.tabId);reply({ok:true});return;}
  if(m.type==='analyze'){
    let entry=engines.get(m.tabId);
    if(!entry){entry={id:m.id,engine:new Stockfish(status=>{const e=engines.get(m.tabId);if(e)send(m.tabId,e.id,{status});})};engines.set(m.tabId,entry);}
    entry.id=m.id;
    void entry.engine.analyze(m.fen,m.depth,a=>{if(engines.get(m.tabId)?.id===m.id)send(m.tabId,m.id,{analysis:a});}).catch(e=>{if(e.name!=='AbortError'&&engines.get(m.tabId)?.id===m.id){send(m.tabId,m.id,{error:e.message});engines.get(m.tabId)?.engine.dispose();engines.delete(m.tabId);}});
    reply({ok:true});
  }
});
