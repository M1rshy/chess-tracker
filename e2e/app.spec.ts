import { test,expect } from '@playwright/test';

test('real WASM analysis, legal history, undo/redo, FEN, mate and arrows',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await expect(page.getByTestId('best-move')).not.toHaveText('—',{timeout:60000});
  await expect(page.getByTestId('depth')).toHaveText('15',{timeout:60000});
  await page.getByRole('button',{name:'Новая партия',exact:true}).click();
  await expect(page.getByTestId('best-move')).not.toHaveText('—',{timeout:60000});
  await expect(page.getByTestId('depth')).toHaveText('15',{timeout:60000});
  await page.getByRole('textbox',{name:'Ход UCI'}).fill('e2e4');await page.getByRole('button',{name:'Сделать ход'}).click();
  await page.getByRole('textbox',{name:'Ход UCI'}).fill('e7e5');await page.getByRole('button',{name:'Сделать ход'}).click();
  await expect(page.getByTestId('move-history')).toContainText('e4');await expect(page.getByTestId('move-history')).toContainText('e5');
  await page.getByRole('button',{name:'Отменить ход',exact:true}).click();await expect(page.getByTestId('move-history')).not.toContainText('e5');
  await page.getByRole('button',{name:'Повторить ход',exact:true}).click();await expect(page.getByTestId('move-history')).toContainText('e5');
  await page.getByRole('button',{name:'FEN / PGN',exact:true}).click();
  await page.getByRole('textbox',{name:'FEN для импорта'}).fill('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1');await page.getByRole('button',{name:'Загрузить FEN',exact:true}).click();
  await expect(page.getByTestId('best-move')).toHaveText('Re8#');await expect(page.getByTestId('evaluation')).toHaveText('+M1');
  const arrow=page.locator('.board-wrap svg line[marker-end]');await expect(arrow).toHaveAttribute('stroke','#23b86c');await expect(arrow.locator('..')).toBeVisible();
  const beforeFlip=await arrow.getAttribute('x1');
  await page.getByRole('button',{name:'Перевернуть доску',exact:true}).click();
  await expect(arrow).not.toHaveAttribute('x1',beforeFlip!);
  await page.getByRole('textbox',{name:'Ход UCI'}).fill('e1e8');await page.getByRole('button',{name:'Сделать ход'}).click();
  await expect(page.getByTestId('evaluation')).toHaveText('+M0');expect(errors).toEqual([]);
});
test('PGN import, persistence, invalid FEN and responsive layout',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'FEN / PGN',exact:true}).click();
  await page.getByRole('textbox',{name:'PGN для импорта'}).fill('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');await page.getByRole('button',{name:'Загрузить PGN',exact:true}).click();
  await page.getByRole('button',{name:'Анализ',exact:true}).last().click();await expect(page.getByTestId('move-history')).toContainText('Bb5');
  await page.reload();await expect(page.getByTestId('move-history')).toContainText('a6');
  await page.getByRole('button',{name:'FEN / PGN',exact:true}).click();await page.getByRole('textbox',{name:'FEN для импорта'}).fill('invalid');await page.getByRole('button',{name:'Загрузить FEN',exact:true}).click();await expect(page.getByRole('alert')).toContainText('FEN');
  for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:960});await expect(page.locator('body')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`test-results/layout-${width}.png`,fullPage:true});}
});
test('computer makes a legal reply and training hides solution',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Против компьютера',exact:true}).click();await page.getByRole('textbox',{name:'Ход UCI'}).fill('e2e4');await page.getByRole('button',{name:'Сделать ход'}).click();
  await expect(page.getByTestId('move-history').locator('>div')).toHaveCount(2,{timeout:60000});
  await page.getByRole('button',{name:'Отменить ход',exact:true}).click();await expect(page.getByTestId('move-history').locator('>div')).toHaveCount(0);
  await page.getByRole('button',{name:'Найти лучший ход',exact:true}).click();await expect(page.getByTestId('best-move')).toHaveText('Подсказка скрыта');await expect(page.getByTestId('evaluation')).toHaveText('?');
  await page.getByRole('textbox',{name:'Ход UCI'}).fill('d2d4');await page.getByRole('button',{name:'Сделать ход'}).click();await expect(page.getByText('1 попыток сохранено')).toBeVisible({timeout:60000});
});
test('Screen Capture permission failure is handled',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{value:()=>Promise.reject(new DOMException('Denied','NotAllowedError'))});});
  await page.goto('/');await page.getByRole('button',{name:'Захват',exact:true}).click();await page.getByRole('button',{name:'Начать захват',exact:true}).click();await expect(page.getByRole('alert')).toContainText('NotAllowedError');
});
test('Screen Capture preview and source closure stop the stream',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{value:async()=>{
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=640;
      const ctx=canvas.getContext('2d')!;for(let y=0;y<8;y++)for(let x=0;x<8;x++){ctx.fillStyle=(x+y)%2?'#728c6b':'#e7e9dc';ctx.fillRect(x*80,y*80,80,80);}
      const stream=canvas.captureStream(1);(window as any).__captureStream=stream;(window as any).__captureCanvas=canvas;return stream;
    }});
  });
  await page.goto('/');await page.getByRole('button',{name:'Захват',exact:true}).click();await page.getByRole('button',{name:'Начать захват',exact:true}).click();
  await expect(page.getByRole('img',{name:'Источник распознавания'})).toBeVisible();
  await page.evaluate(()=>{const t=(window as any).__captureStream.getVideoTracks()[0];t.stop();t.dispatchEvent(new Event('ended'));});
  await expect(page.getByRole('button',{name:'Начать захват',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__captureStream.getTracks().every((t:MediaStreamTrack)=>t.readyState==='ended'))).toBe(true);
});
