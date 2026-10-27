import { Chess, validateFen, type Square, type PieceSymbol, type Color } from 'chess.js';
import { scoreValue, type Analysis } from './engine';
export function uciMove(game: Chess, uci: string) {
  return game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
}
export function variation(fen: string, pv: string[], limit = 10) {
  const g = new Chess(fen), result: string[] = [];
  for (const uci of pv.slice(0, limit)) { try { result.push(uciMove(g, uci).san); } catch { break; } }
  return result;
}
export function validatedGame(fen: string) {
  const result = validateFen(fen.trim());
  if (!result.ok) throw new Error(`Некорректный FEN: ${result.error}`);
  const g = new Chess(fen.trim());
  const other: Color = g.turn() === 'w' ? 'b' : 'w';
  const king = g.board().flat().find(p => p?.type === 'k' && p.color === other);
  if (king && g.isAttacked(king.square, g.turn())) throw new Error('Король стороны, которая уже сходила, находится под шахом. Проверьте очередь хода.');
  const rows = fen.trim().split(' ')[0].split('/');
  if (/[pP]/.test(rows[0] + rows[7])) throw new Error('Пешка не может стоять на первой или восьмой горизонтали.');
  const rights = fen.trim().split(' ')[2];
  for (const [flag, k, r, color] of [['K','e1','h1','w'], ['Q','e1','a1','w'], ['k','e8','h8','b'], ['q','e8','a8','b']]) {
    if (rights.includes(flag) && (g.get(k as Square)?.type !== 'k' || g.get(k as Square)?.color !== color || g.get(r as Square)?.type !== 'r' || g.get(r as Square)?.color !== color)) throw new Error('Права рокировки не соответствуют расположению короля и ладьи.');
  }
  return g;
}
export const PIECES = ['.', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'];
export function placement(cells: string[], blackBottom: boolean) {
  if (cells.length !== 64 || cells.some(p => !PIECES.includes(p))) throw new Error('Уточните все 64 клетки: неизвестные фигуры отмечены знаком ?');
  const ordered = blackBottom ? [...cells].reverse() : cells;
  return Array.from({ length: 8 }, (_, row) => {
    let text = '', empty = 0;
    for (const p of ordered.slice(row * 8, row * 8 + 8)) {
      if (p === '.') empty++;
      else { if (empty) text += empty; empty = 0; text += p; }
    }
    return text + (empty || '');
  }).join('/');
}
const names: Record<string, string> = { p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь', k: 'король' };
export function threatened(fen: string) {
  const g = new Chess(fen);
  return g.board().flat().filter(p => p && p.type !== 'k' && g.isAttacked(p.square, p.color === 'w' ? 'b' : 'w')).map(p => {
    const piece = p!;
    return `${piece.color === 'w' ? 'Белые' : 'Чёрные'}: ${names[piece.type]} ${piece.square}${!g.isAttacked(piece.square, piece.color) ? ' без защиты' : ' под атакой'}`;
  });
}
export function explainBest(a: Analysis) {
  if (!a.best || !a.complete) return [];
  const g = new Chess(a.fen), m = uciMove(g, a.best), lines: string[] = [];
  if (m.captured) lines.push(`Взятие: ${names[m.captured]} на ${m.to}${m.isEnPassant() ? ' (на проходе)' : ''}.`);
  if (m.isKingsideCastle() || m.isQueensideCastle()) lines.push('Рокировка перемещает короля и вводит ладью в игру.');
  if (m.promotion) lines.push(`Превращение пешки: ${names[m.promotion]}.`);
  if (g.isCheckmate()) lines.push('Ход ставит мат: у соперника нет легального ответа на шах.');
  else if (g.isCheck()) lines.push('Шах: соперник должен защитить короля.');
  const attacked = g.board().flat().filter(p => p && p.color !== m.color && p.type !== 'k' && g.attackers(p.square, m.color).includes(m.to));
  if (attacked.length) lines.push(`После хода фигура атакует: ${attacked.map(p => `${names[p!.type]} ${p!.square}`).join(', ')}.`);
  if (attacked.length > 1) lines.push('Одновременная атака нескольких фигур — возможная вилка; возможность выигрыша проверяйте по варианту движка.');
  lines.push(`Stockfish предпочитает ${m.san} на глубине ${a.depth}. Продолжение: ${variation(a.fen, a.pv).join(' ')}.`);
  return lines;
}
export function moveQuality(before: Analysis, after: Analysis, mover: Color) {
  const b = scoreValue(before), a = scoreValue(after);
  if (b === null || a === null) return null;
  const loss = Math.max(0, (b - a) * (mover === 'w' ? 1 : -1));
  const label = loss >= 200 ? 'Зевок' : loss >= 100 ? 'Ошибка' : loss >= 50 ? 'Неточность' : loss >= 20 ? 'Хороший ход' : 'Отличный ход';
  return { loss, label };
}
export function cellsFromFen(fen: string) {
  return new Chess(fen).board().flat().map(p => !p ? '.' : p.color === 'w' ? p.type.toUpperCase() : p.type);
}
export function pieceFor(symbol: string): { type: PieceSymbol; color: Color } | null {
  return symbol === '.' || symbol === '?' ? null : { type: symbol.toLowerCase() as PieceSymbol, color: symbol === symbol.toUpperCase() ? 'w' : 'b' };
}
