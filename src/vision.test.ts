import { expect,it } from 'vitest';
import { frameChanged } from './vision';
it('ignores unchanged captures and small noise but recognizes a changed board',()=>{
  const a=Array(1024).fill(10);expect(frameChanged(null,a)).toBe(true);expect(frameChanged(a,[...a])).toBe(false);
  const noise=a.map((v,i)=>i%20===0?v+1:v);expect(frameChanged(a,noise)).toBe(false);
  expect(frameChanged(a,Array(1024).fill(13))).toBe(true);
});
