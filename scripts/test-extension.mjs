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
await context.route('https://lidraughts.org/analysis/russian/cvt-test',r=>r.fulfill({contentType:'text/html',body:html.replace('<wc-chess-board></wc-chess-board>','<div class="cg-wrap orientation-white"><cg-board></cg-board></div><input class="analyse__underboard__fen">').replace("document.querySelector('wc-chess-board')","document.querySelector('cg-board')")}));
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
  await host.locator('#my-side').selectOption('b');await expect(overlay).toBeHidden();await expect(host.locator('.best')).toHaveText('Ход соперника');
  game.move('Nf3');await render(page,game.fen(),true);await expect(overlay).toBeVisible();expect(game.get(await from.getAttribute('data-square')).color).toBe('b');
  game.move('Nc6');await render(page,game.fen(),true);await expect(overlay).toBeHidden();await expect(host.locator('.best')).toHaveText('Ход соперника');
  await host.locator('#my-side').selectOption('w');await expect(overlay).toBeVisible();console.log('PASS: only my side receives hints; opponent turns hide frames, arrow and recommendation.');
  await host.locator('#toggle').click();await expect(overlay).toBeHidden();console.log('PASS: pause removes hints.');
  await host.locator('#toggle').click();await expect(overlay).toBeVisible({timeout:60000});
  const mate='6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1';await render(page,mate,false);await expect(overlay).toBeHidden();
  await host.locator('summary').click();await host.locator('#fen').fill(mate);await host.locator('#apply').click();await expect(host.locator('.score')).toHaveText('+M1');await expect(from).toHaveAttribute('data-square','e1');await expect(to).toHaveAttribute('data-square','e8');
  await page.screenshot({path:'test-results/extension-chesscom.png',fullPage:true});console.log('PASS: midgame needs real metadata; confirmed FEN produces the real mating suggestion.');
  await host.locator('#depth').selectOption('8');
  await host.locator('#move-filter').selectOption('king');await expect(overlay).toBeVisible();await expect(from).toHaveAttribute('data-square','g1');await expect(host.locator('.progress')).toContainText('только король');
  await host.locator('#move-filter').selectOption('all');await expect(from).toHaveAttribute('data-square','e1');await expect(to).toHaveAttribute('data-square','e8');
  await host.locator('#move-filter').selectOption('king');await host.locator('#move-filter').selectOption('all');await host.locator('#move-filter').selectOption('king');await expect(from).toHaveAttribute('data-square','g1');
  await page.reload();const restored=page.locator('#cvt-site-helper');await expect(restored.locator('#move-filter')).toHaveValue('king');await render(page,new Chess().fen());
  await expect(restored.locator('.best')).toHaveText('У короля нет легальных ходов');await expect(restored.locator('.overlay')).toBeHidden();await expect(restored.locator('.score')).toHaveText('—');
  console.log('PASS: real WASM limits king moves, switches and persists filters, and reports no king moves without a fake result.');
  await restored.locator('#blindfold').check();await page.addStyleTag({content:'wc-chess-board .piece { display:none!important }'});await restored.locator('#move-filter').selectOption('all');
  await expect(restored.locator('.overlay')).toBeVisible();const hiddenMove=await restored.locator('.from').getAttribute('data-square');expect(new Chess().get(hiddenMove)).toBeTruthy();
  const blindGame=new Chess();blindGame.move('e4');blindGame.move('e5');await render(page,blindGame.fen(),false,'chesscom',blindGame.history());await expect(restored.locator('.current-fen')).toHaveText(blindGame.fen());
  await expect(restored.locator('.overlay')).toBeVisible();
  await page.evaluate(()=>document.querySelector('wc-chess-board').replaceChildren());await expect(restored.locator('.current-fen')).toHaveText(blindGame.fen());await expect(restored.locator('.overlay')).toBeVisible();
  blindGame.move('Nf3');await render(page,blindGame.fen(),false,'chesscom',blindGame.history());await page.evaluate(()=>document.querySelector('wc-chess-board').replaceChildren());await expect(restored.locator('.best')).toHaveText('Ход соперника');await expect(restored.locator('.overlay')).toBeHidden();
  blindGame.move('Nc6');await render(page,blindGame.fen(),true,'chesscom',blindGame.history());await page.evaluate(()=>document.querySelector('wc-chess-board').replaceChildren());await expect(restored.locator('.current-fen')).toHaveText(blindGame.fen());await expect(restored.locator('.overlay')).toBeVisible();
  await page.screenshot({path:'test-results/extension-blindfold.png',fullPage:true});
  console.log('PASS: blindfold tracks hidden DOM pieces and complete indexed history, including flips and opponent turns.');
  await page.evaluate(()=>{document.getElementById('moves').replaceChildren();const el=document.createElement('span');el.dataset.ply='4';el.textContent='Nc6';document.getElementById('moves').append(el);});
  await expect(restored.locator('.overlay')).toBeHidden();await expect(restored.locator('.status')).toContainText('нужны данные');await expect(restored.locator('.score')).toHaveText('—');
  await page.evaluate(fen=>document.querySelector('wc-chess-board').dataset.fen=fen,blindGame.fen());await expect(restored.locator('.overlay')).toBeVisible();
  await page.reload();await expect(restored.locator('#blindfold')).toBeChecked();await render(page,new Chess().fen());await expect(restored.locator('.overlay')).toBeVisible();
  console.log('PASS: incomplete blindfold history disables stale hints; full FEN restores them; the preference persists.');
  const lichess=await context.newPage();await lichess.goto('https://lichess.org/analysis/cvt-test');
  const lgame=new Chess();lgame.move('Nf3');lgame.move('d5');lgame.move('g3');await render(lichess,lgame.fen(),true,'lichess',lgame.history());
  const lhost=lichess.locator('#cvt-site-helper');await expect(lhost.locator('.current-fen')).toHaveText(lgame.fen());await expect(lhost.locator('.overlay')).toBeVisible({timeout:60000});await lichess.screenshot({path:'test-results/extension-lichess.png'});console.log('PASS: Chessground orientation and full SAN history recovery.');
  const draughts=await context.newPage();await draughts.goto('https://lidraughts.org/analysis/russian/cvt-test');
  async function renderD(white,black,fen='',flipped=false){await draughts.evaluate(({white,black,fen,flipped})=>{
    const board=document.querySelector('cg-board');board.parentElement.className='cg-wrap '+(flipped?'orientation-black':'orientation-white');board.replaceChildren();
    for(const[color,pieces]of[['white',white],['black',black]])for(const text of pieces){const king=text.startsWith('K'),square=king?text.slice(1):text,file=square.charCodeAt(0)-97,rank=Number(square[1]),col=flipped?7-file:file,row=flipped?rank-1:8-rank;const piece=document.createElement('piece');piece.className=`${color} ${king?'king':'man'}`;piece.style.transform=`translate(${col*64}px,${row*64}px)`;piece.textContent=king?'♛':'●';piece.style.color=color==='white'?'#fff':'#111';board.append(piece);}document.querySelector('input.analyse__underboard__fen').value=fen;
  },{white,black,fen,flipped});}
  const white=['a3','c3','e3','g3','b2','d2','f2','h2','a1','c1','e1','g1'],black=['b8','d8','f8','h8','a7','c7','e7','g7','b6','d6','f6','h6'];
  await renderD(white,black);const dh=draughts.locator('#cvt-site-helper'),dOverlay=dh.locator('.overlay');
  await expect(dh.locator('#move-filter')).toBeDisabled();
  await expect(dOverlay).toBeVisible();await expect(dh.locator('.progress')).toContainText('Шашки');const suggestedFrom=await dh.locator('.from').getAttribute('data-square');expect(white).toContain(suggestedFrom);console.log('PASS: Russian draughts starts automatically and uses the local draughts worker.');
  white[0]='b4';await renderD(white,black);await expect(dOverlay).toBeHidden();await expect(dh.locator('.best')).toHaveText('Ход соперника');
  black[8]='a5';await renderD(white,black);await expect(dOverlay).toBeVisible();console.log('PASS: draughts hints disappear on the opponent turn and return on my turn.');
  await renderD(['c3'],['d4','f6'],'W:Wc3:Bd4,f6:H0:F1');await expect(dh.locator('.from')).toHaveAttribute('data-square','c3');await expect(dh.locator('.to')).toHaveAttribute('data-square','g7');await expect(dh.locator('.waypoint')).toHaveCount(1);await expect(dOverlay).toBeVisible();
  await draughts.screenshot({path:'test-results/extension-russian.png'});
  await renderD(['e5'],['f6']);await expect(dh.locator('.from')).toHaveAttribute('data-square','e5');await expect(dh.locator('.to')).toHaveAttribute('data-square','g7');await expect(dOverlay).toBeVisible();
  await renderD(['g7'],[]);await expect(dOverlay).toBeHidden();await expect(dh.locator('.status')).toHaveText('Победа белых');console.log('PASS: complete multi-capture, remaining jump and terminal outcome are correct.');
  expect(errors).toEqual([]);console.log('All extension browser checks passed.');
}catch(error){for(const[pIndex,p]of context.pages().entries()){console.error('Extension diagnostics',await p.locator('#cvt-site-helper').locator('.body').innerText().catch(()=>''));await p.screenshot({path:`test-results/extension-failure-${pIndex}.png`}).catch(()=>{});}throw error;}finally{await context.close();}
