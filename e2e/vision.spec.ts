import { test,expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
for(const scenario of [{theme:'forest',width:1280,black:false},{theme:'forest',width:1280,black:false,margin:true},{theme:'slate',width:390,black:true},{theme:'slate',width:1280,black:true},{theme:'walnut',width:1440,black:false}])test(`real OpenCV and ONNX reconstruct ${scenario.theme} screenshot at ${scenario.width}px${scenario.margin?' with margins':''}`,async({page})=>{
  test.setTimeout(120000);await page.goto('/');
  await page.setViewportSize({width:scenario.width,height:1000});
  await page.getByRole('button',{name:'Настройки',exact:true}).click();
  await page.getByLabel('Стрелка лучшего хода').uncheck();await page.getByLabel('Автоанализ после хода').uncheck();
  await page.getByLabel('Тема доски').selectOption(scenario.theme);
  await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();
  if(scenario.black)await page.getByRole('button',{name:'Перевернуть доску',exact:true}).click();
  const png=await page.locator(scenario.margin?'.board-section':'.board-wrap').screenshot();writeFileSync(`test-results/recognition-${scenario.theme}-${scenario.width}${scenario.margin?'-margins':''}.png`,png);
  const result=await page.evaluate(async bytes=>{
    const worker=new Worker(`${location.pathname}vision-worker.js`);
    const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
    return await new Promise<Record<string,unknown>>((resolve,reject)=>{
      const timer=setTimeout(()=>{worker.terminate();reject(new Error('Vision timeout'));},100000);
      worker.onmessage=e=>{clearTimeout(timer);worker.terminate();resolve(e.data);};worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(new Error(e.message));};
      worker.postMessage({id:1,type:'recognize',bitmap},[bitmap]);
    });
  },[...png]);
  console.log('Vision result',scenario.theme,JSON.stringify({box:result.box,cells:result.cells,error:result.error}));expect(result.error).toBeUndefined();expect(result.model).toContain('Встроенная');
  const cells=result.cells as string[];
  const expected='rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';
  const ordered=scenario.black?[...expected].reverse().join(''):expected;
  if(scenario.width<500){
    // Low-resolution input must reject uncertain squares instead of guessing.
    expect(cells.filter(c=>c!=='?').length).toBeGreaterThanOrEqual(56);
    cells.forEach((c,i)=>{if(c!=='?')expect(c).toBe(ordered[i]);});
  }else{expect(cells.join('')).toBe(ordered);expect(result.orientation).toBe(scenario.black?'black':'white');}
});
test('missing model gives an explicit error and never invents pieces',async({page})=>{
  await page.route('**/models/bundled-pieces.onnx.gz',route=>route.fulfill({status:404,body:'missing'}));
  await page.goto('/scripts/templates.html');const png=await page.screenshot();
  const result=await page.evaluate(async bytes=>{
    const worker=new Worker('/vision-worker.js'),bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
    return await new Promise<Record<string,unknown>>(resolve=>{worker.onmessage=e=>{worker.terminate();resolve(e.data);};worker.postMessage({id:1,type:'recognize',bitmap,crop:{x:0,y:0,size:512/innerWidth}},[bitmap]);});
  },[...png]);
  expect(result.warning).toContain('модель недоступна');expect((result.cells as string[]).every(c=>c==='?')).toBe(true);
});
