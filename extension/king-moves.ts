import { Chess } from 'chess.js';

/** Root candidates only: replies remain unrestricted so the evaluation uses real chess. */
export function kingMoves(fen: string): string[] {
  return new Chess(fen).moves({ verbose: true }).filter(move => move.piece === 'k').map(move => move.lan);
}
