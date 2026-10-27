// Reproducible synthetic examples from the MIT licensed react-chessboard pieces.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Chessboard } from 'react-chessboard';
import '../src/style.css';
const labels=['.','P','N','B','R','Q','K','p','n','b','r','q','k'];
const themes=[['#e7e9dc','#728c6b'],['#d9e2ec','#647b95'],['#ead6b6','#a37753']];
const theme=Number(new URLSearchParams(location.search).get('theme')||0);
const position:Record<string,string>={};
labels.forEach((p,k)=>{if(p!=='.')for(let j=0;j<2;j++){const i=k*2+j;position['abcdefgh'[i%8]+(8-Math.floor(i/8))]=(p===p.toUpperCase()?'w':'b')+p.toUpperCase();}});
createRoot(document.getElementById('root')!).render(<Chessboard id="templates" boardWidth={512} position={position} arePiecesDraggable={false} showBoardNotation={false} animationDuration={0} customLightSquareStyle={{backgroundColor:themes[theme][0]}} customDarkSquareStyle={{backgroundColor:themes[theme][1]}}/>);
