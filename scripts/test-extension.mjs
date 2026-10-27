import { chromium,expect as baseExpect } from '@playwright/test';
import { Chess } from 'chess.js';
import { resolve } from 'node:path';
import { mkdir,mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
const expect=baseExpect.configure({timeout:30000});
await mkdir('test-results',{recursive:true});
const extension=resolve('extension-build');
const context=await chromium.launchPersistentContext(await mkdtemp(resolve(tmpdir(),'cvt-extension-')),{channel:process.env.CVT_EXTENSION_BROWSER||'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1280,height:900}});
const errors=[];context.on('weberror',e=>errors.push(e.error().message));
const html=`<!doctype html><html><head><style>body{margin:0;background:#172014;color:#eef5e4;height:1700px;font:16px system-ui}wc-chess-board,cg-board{display:block;position:relative;width:512px;height:512px;margin:70px 100px;background:conic-gradient(#e7e9dc 25%,#728c6b 0 50%,#e7e9dc 0 75%,#728c6b 0);background-size:128px 128px}.piece,piece{position:absolute;width:64px;height:64px;font:48px/64px serif;text-align:center}.orientation-black{display:contents}</style></head><body><wc-chess-board></wc-chess-board><div id="moves"></div><script>window.clicks=0;document.querySelector('wc-chess-board').addEventListener('click',()=>window.clicks++);</script></body></html>`;
await context.route('https://www.chess.com/analysis/cvt-test',r=>r.fulfill({contentType:'text/html',body:html}));
await context.route('https://lichess.org/analysis/cvt-test',r=>r.fulfill({contentType:'text/html',body:html.replace('<wc-chess-board></wc-chess-board>','<div class="cg-wrap orientation-white"><cg-board></cg-board></div>').replace("document.querySelector('wc-chess-board')","document.querySelector('cg-board')")}));
async function render(page,fen,black=false,kind='chesscom',history=[]){
  const pieces=new Chess(fen).board().flat().filter(Boolean).map(p=>({square:p.square,type:p.type,color:p.color}));
  await page.evaluate(({pieces,black,kind,history})=>{
    const board=document.querySelector(kind==='lichess'?'cg-board':'wc-chess-board');board.replaceChildren();board.classList.toggle('flipped',black);
    if(kind==='lichess'){board.parentElement.className='cg-wrap '+(black?'orientation-black':'orientation-white');}
    const roles={p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'},glyphs={p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚'};
    for(const p of pieces){const f=p.square.charCodeAt(0)-97,r=Number(p.square[1]),col=black?7-f:f,row=black?r-1:8-r;const el=document.createElement(kind==='lichess'?'piece':'div');el.className=kind==='lichess'?`${p.color==='w'?'white':'black'} ${roles[p.type]}`:`piece ${p.color}${p.type} square-${f+1}${r}`;el.style.transform=`translate(${col*64}px,${row*64}px)`;el.textContent=glyphs[p.type];el.style.color=p.color==='w'?'#fff':'#111';board.append(el);}
    document.getElementById('moves').replaceChildren(...history.map((san,i)=>{const el=document.createElement('span');el.dataset.ply=String(i+1);el.textContent=san;return el;}));
  },{pieces,black,kind,history});
}
try{
  const page=await context.newPage();await page.goto('https://www.chess.com/analysis/cvt-test');
  const game=new Chess();await render(page,game.fen());
  const host=page.locator('#cvt-site-helper'),overlay=host.locator('.overlay'),from=host.locator('[data-role="from"]'),to=host.locator('[data-role="to"]');
  await expect(overlay).toBeVisible({timeout:60000});await expect(host.locator('.progress')).toContainText('15 / 15',{timeout:60000});
  const suggested=(await from.getAttribute('data-square'))+(await to.getAttribute('data-square'));
  if(!game.moves({verbose:true}).some(m=>m.lan===suggested))throw new Error('Engine suggestion was not legal');
  const boardBox=await page.locator('wc-chess-board').boundingBox(),fromBox=await from.boundingBox();
  const f=suggested.charCodeAt(0)-97,r=Number(suggested[1]);expect(Math.abs(fromBox.x-(boardBox.x+f*64))).toBeLessThan(1);expect(Math.abs(fromBox.y-(boardBox.y+(8-r)*64))).toBeLessThan(1);
  await page.mouse.click(fromBox.x+32,fromBox.y+32);expect(await page.evaluate(()=>window.clicks)).toBe(1);
  console.log('PASS: extension uses real WASM, legal move, correctly aligned click-through square frames.');
  await render(page,game.fen(),true);await expect(overlay).toBeVisible();await expect(from).toHaveCSS('top',`${(r-1)*64}px`);
  await page.evaluate(()=>scrollTo(0,30));await expect(overlay).toHaveCSS('top','40px');console.log('PASS: frames follow board flip and scrolling.');
  game.move('e4');game.move('e5');await render(page,game.fen(),true);
  await expect(host.locator('.current-fen')).toHaveText(game.fen());await expect(overlay).toBeVisible();await expect(host.locator('.progress')).toContainText('15 / 15');
  console.log('PASS: two rapid plies are tracked with correct side, rights and counters.');
  await host.locator('#toggle').click();await expect(overlay).toBeHidden();console.log('PASS: pause removes hints.');
  await host.locator('#toggle').click();await expect(overlay).toBeVisible({timeout:60000});
  const mate='6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1';await render(page,mate,false);await expect(overlay).toBeHidden();
  await host.locator('summary').click();await host.locator('#fen').fill(mate);await host.locator('#apply').click();await expect(host.locator('.score')).toHaveText('+M1');await expect(from).toHaveAttribute('data-square','e1');await expect(to).toHaveAttribute('data-square','e8');
  await page.screenshot({path:'test-results/extension-chesscom.png',fullPage:true});console.log('PASS: midgame needs real metadata; confirmed FEN produces the real mating suggestion.');
  const lichess=await context.newPage();await lichess.goto('https://lichess.org/analysis/cvt-test');
  const lgame=new Chess();lgame.move('Nf3');lgame.move('d5');lgame.move('g3');await render(lichess,lgame.fen(),true,'lichess',lgame.history());
  const lhost=lichess.locator('#cvt-site-helper');await expect(lhost.locator('.current-fen')).toHaveText(lgame.fen());await expect(lhost.locator('.overlay')).toBeVisible({timeout:60000});await lichess.screenshot({path:'test-results/extension-lichess.png'});console.log('PASS: Chessground orientation and full SAN history recovery.');
  expect(errors).toEqual([]);console.log('All 6 extension browser checks passed.');
}finally{await context.close();}
