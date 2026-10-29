let creating:Promise<void>|undefined;
const queues=new Map<number,Promise<unknown>>();
async function ensureEngine(){
  const contexts=await chrome.runtime.getContexts({contextTypes:[chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],documentUrls:[chrome.runtime.getURL('engine.html')]});
  if(contexts.length)return;
  if(!creating)creating=chrome.offscreen.createDocument({url:'engine.html',reasons:[chrome.offscreen.Reason.WORKERS],justification:'Run the local Stockfish WASM engine in a Web Worker.'}).finally(()=>{creating=undefined;});
  await creating;
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.target!=='broker')return;
  const handle=async()=>{
    if(message.type==='update'&&sender.url===chrome.runtime.getURL('engine.html')){
      const key=`job:${message.tabId}`,s=await chrome.storage.session.get(key);
      if(s[key]===message.id)await chrome.tabs.sendMessage(message.tabId,{...message,target:'content'}).catch(()=>{});
      return;
    }
    const tabId=sender.tab?.id;if(tabId===undefined)return;
    const key=`job:${tabId}`;
    if(message.type==='analyze'){
      if(typeof message.id!=='string'||typeof message.fen!=='string'||![8,12,15,18].includes(message.depth)||(message.game!==undefined&&!['chess','russian'].includes(message.game))||(message.kingOnly!==undefined&&typeof message.kingOnly!=='boolean'))throw new Error('Некорректный запрос анализа');
      await chrome.storage.session.set({[key]:message.id});await ensureEngine();
      await chrome.runtime.sendMessage({...message,target:'engine',tabId});
    }else if(message.type==='stop'){
      await chrome.storage.session.remove(key);
      if((await chrome.runtime.getContexts({contextTypes:[chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]})).length)await chrome.runtime.sendMessage({target:'engine',type:'stop',tabId});
    }
  };
  const tabId=sender.tab?.id;
  const pending=tabId===undefined?handle():(queues.get(tabId)||Promise.resolve()).catch(()=>{}).then(handle);
  if(tabId!==undefined)queues.set(tabId,pending);
  void pending.then(()=>reply({ok:true})).catch(e=>reply({ok:false,error:e.message})).finally(()=>{if(tabId!==undefined&&queues.get(tabId)===pending)queues.delete(tabId);});
  return true;
});
chrome.tabs.onRemoved.addListener(tabId=>{void chrome.storage.session.remove(`job:${tabId}`);void chrome.runtime.getContexts({contextTypes:[chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]}).then(c=>{if(c.length)return chrome.runtime.sendMessage({target:'engine',type:'stop',tabId});}).catch(()=>{});});
