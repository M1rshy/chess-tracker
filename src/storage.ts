import { useState } from 'react';
export type Settings = { depth: number; arrows: boolean; auto: boolean; theme: string; flipped: boolean; difficulty: number; player: 'w' | 'b' };
export const defaults: Settings = { depth: 15, arrows: true, auto: true, theme: 'forest', flipped: false, difficulty: 5, player: 'w' };
export type Attempt = { date: string; fen: string; move: string; best: string; loss: number; label: string };
export function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
export function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function useSettings() {
  const [settings, set] = useState<Settings>(() => {
    const s = { ...defaults, ...read<Partial<Settings>>('cvt.settings', {}) };
    s.depth = [8, 12, 15, 18].includes(s.depth) ? s.depth : 15;
    s.difficulty = [0, 3, 5, 10, 15, 20].includes(s.difficulty) ? s.difficulty : 5;
    s.theme = ['forest','slate','walnut'].includes(s.theme) ? s.theme : 'forest';
    s.player = s.player === 'b' ? 'b' : 'w';
    return s;
  });
  function update(patch: Partial<Settings>) { set(s => { const next = { ...s, ...patch }; write('cvt.settings', next); return next; }); }
  return [settings, update] as const;
}
export function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
