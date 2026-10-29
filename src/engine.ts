export type Score = { cp: number | null; mate: number | null };
export type Analysis = Score & { fen: string; depth: number; pv: string[]; best: string; complete: boolean; nodes: number };
type Task = { fen: string; depth: number; skill: number; searchMoves?: string[]; resolve: (a: Analysis) => void; reject: (e: Error) => void; update?: (a: Analysis) => void; canceled: boolean; result: Analysis };
export const emptyAnalysis = (fen: string): Analysis => ({ fen, cp: null, mate: null, depth: 0, pv: [], best: '', complete: false, nodes: 0 });
export function parseInfo(line: string, fen: string): Analysis | null {
  if (!line.startsWith('info ') || !line.includes(' pv ') || /\b(upperbound|lowerbound)\b/.test(line)) return null;
  if (Number(line.match(/\bmultipv (\d+)/)?.[1] || 1) !== 1) return null;
  const cp = line.match(/\bscore cp (-?\d+)/), mate = line.match(/\bscore mate (-?\d+)/);
  if (!cp && !mate) return null;
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
  const pv = line.split(' pv ')[1].trim().split(/\s+/);
  return { fen, cp: cp ? Number(cp[1]) * sign : null, mate: mate ? Number(mate[1]) * sign : null,
    depth: Number(line.match(/\bdepth (\d+)/)?.[1] || 0), nodes: Number(line.match(/\bnodes (\d+)/)?.[1] || 0),
    pv, best: pv[0] || '', complete: false };
}
const blackWins = (mate: number) => mate < 0 || Object.is(mate, -0);
export const scoreText = (a: Score | null) => !a ? '—' : a.mate !== null ? `${blackWins(a.mate) ? '−' : '+'}M${Math.abs(a.mate)}` : a.cp === null ? '—' : `${a.cp >= 0 ? '+' : ''}${(a.cp / 100).toFixed(2)}`;
export const scoreValue = (a: Score) => a.mate !== null ? (blackWins(a.mate) ? -1 : 1) * (100000 - Math.abs(a.mate) * 100) : a.cp;
export function whitePercent(a: Score | null) {
  if (!a || (a.cp === null && a.mate === null)) return 50;
  if (a.mate !== null) return blackWins(a.mate) ? 0 : 100;
  return 50 + 49 * Math.tanh((a.cp || 0) / 450);
}

/** One active UCI search. A stopped search is drained through bestmove before starting the next. */
export class Stockfish {
  private worker: Worker;
  private active?: Task;
  private pending?: Task;
  private ready = false;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout>;
  private searchTimer?: ReturnType<typeof setTimeout>;
  constructor(private status: (s: string) => void = () => {}) {
    this.status('Загрузка Stockfish…');
    this.worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-17.1-lite-single-03e3232.js`);
    this.worker.onmessage = e => String(e.data).split('\n').forEach(line => this.receive(line.trim()));
    this.worker.onerror = () => this.fail(new Error('Stockfish не загрузился. Проверьте локальные файлы JS/WASM.'));
    this.worker.onmessageerror = () => this.fail(new Error('Ошибка сообщения Stockfish'));
    this.timer = setTimeout(() => this.fail(new Error('Stockfish не ответил за 30 секунд')), 30000);
    this.send('uci');
  }
  private send(command: string) { if (!this.disposed) this.worker.postMessage(command); }
  private receive(line: string) {
    if (this.disposed) return;
    if (line === 'uciok') { this.send('setoption name Hash value 32'); this.send('setoption name MultiPV value 1'); this.send('isready'); }
    if (line === 'readyok' && !this.ready) { clearTimeout(this.timer); this.ready = true; this.status('Готов'); this.pump(); }
    const task = this.active;
    if (!task) return;
    if (line.startsWith('info ') && !task.canceled) {
      const info = parseInfo(line, task.fen);
      if (info && info.depth >= task.result.depth && (!task.searchMoves || task.searchMoves.includes(info.best))) { task.result = info; task.update?.(info); }
    }
    if (line.startsWith('bestmove ')) {
      clearTimeout(this.searchTimer);
      this.active = undefined;
      if (!task.canceled) {
        const best = line.split(' ')[1];
        if (task.searchMoves && !task.searchMoves.includes(best)) {
          task.reject(new Error('Stockfish вернул ход вне выбранного списка')); this.pump(); return;
        }
        task.result = { ...task.result, best: /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(best) ? best : '', complete: true };
        task.update?.(task.result); task.resolve(task.result); this.status('Анализ завершён');
      }
      this.pump();
    }
  }
  private pump() {
    if (!this.ready || this.active || !this.pending || this.disposed) return;
    this.active = this.pending; this.pending = undefined;
    this.status('Анализ…');
    this.send(`setoption name Skill Level value ${this.active.skill}`);
    this.send(`position fen ${this.active.fen}`);
    this.send(`go depth ${this.active.depth}${this.active.searchMoves ? ` searchmoves ${this.active.searchMoves.join(' ')}` : ''}`);
    this.searchTimer = setTimeout(() => this.fail(new Error('Превышено время анализа. Перезапустите движок.')), 180000);
  }
  analyze(fen: string, depth = 15, update?: (a: Analysis) => void, skill = 20, searchMoves?: string[]): Promise<Analysis> {
    this.stop();
    if (this.disposed) return Promise.reject(new Error('Stockfish остановлен. Перезапустите движок.'));
    if (searchMoves && (!searchMoves.length || searchMoves.some(move => !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)))) return Promise.reject(new Error('Нет допустимых ходов для ограниченного анализа'));
    return new Promise((resolve, reject) => {
      this.pending = { fen, depth, skill, searchMoves: searchMoves ? [...new Set(searchMoves)] : undefined, resolve, reject, update, canceled: false, result: emptyAnalysis(fen) };
      this.pump();
    });
  }
  stop() {
    const cancel = (t: Task) => { t.canceled = true; t.reject(new DOMException('Анализ отменён', 'AbortError')); };
    if (this.pending) { cancel(this.pending); this.pending = undefined; }
    if (this.active && !this.active.canceled) { cancel(this.active); this.send('stop'); }
  }
  private fail(e: Error) { this.status(e.message); this.active?.reject(e); this.pending?.reject(e); this.dispose(); }
  dispose() { this.stop(); this.disposed = true; clearTimeout(this.timer); clearTimeout(this.searchTimer); this.worker.terminate(); }
}
