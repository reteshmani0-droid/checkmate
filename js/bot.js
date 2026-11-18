/**
 * The bot: a negamax search with alpha-beta pruning, a quiescence search for captures and piece-square tables.
 *
 * It plays on a copy of the position it is handed and puts every move back, so the game's position is untouched.
 * Strength comes from depth and from how often it picks a random legal move instead, so the four levels feel
 * different: a beginner hangs pieces, an expert does not. No clock is read: a search stops at a node budget, which
 * keeps a move's thinking time the same on a slow phone as on a fast desktop.
 */
import { isAttacked, legalMoves, makeMove, other, pseudoMoves, unmakeMove, } from './rules.js';
export const BOT_PROFILES = [
    { level: 1, name: 'Pawn', blurb: 'Just learning. Misses things.', depth: 1, nodes: 3000, wobble: 0.35, noise: 24 },
    { level: 2, name: 'Knight', blurb: 'Sees a move or two ahead.', depth: 2, nodes: 20000, wobble: 0.15, noise: 20 },
    { level: 3, name: 'Bishop', blurb: 'A solid club player.', depth: 2, nodes: 60000, wobble: 0.08, noise: 16 },
    { level: 4, name: 'Rook', blurb: 'Punishes loose pieces.', depth: 3, nodes: 140000, wobble: 0.03, noise: 12 },
    { level: 5, name: 'Queen', blurb: 'Thinks three moves deep.', depth: 3, nodes: 350000, wobble: 0.01, noise: 9 },
    { level: 6, name: 'King', blurb: 'Thinks four moves deep.', depth: 4, nodes: 700000, wobble: 0, noise: 6 },
    { level: 7, name: 'Master', blurb: 'Deep search, no mistakes.', depth: 4, nodes: 1600000, wobble: 0, noise: 3 },
    { level: 8, name: 'Grandmaster', blurb: 'The strongest engine here.', depth: 5, nodes: 3200000, wobble: 0, noise: 1 },
];
export const profileFor = (level) => BOT_PROFILES[level - 1] ?? BOT_PROFILES[0];
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const MATE = 100000;
const INF = 1e9;
// Tables are written as they look on the board for White: the first row is the 8th rank.
const PAWN_TABLE = [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
];
const KNIGHT_TABLE = [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
];
const BISHOP_TABLE = [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
];
const ROOK_TABLE = [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
];
const QUEEN_TABLE = [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
];
const KING_TABLE = [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
];
const KING_END_TABLE = [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
];
const TABLES = {
    p: PAWN_TABLE, n: KNIGHT_TABLE, b: BISHOP_TABLE, r: ROOK_TABLE, q: QUEEN_TABLE, k: KING_TABLE,
};
/** Per-search wobble on the tables, so the bot's openings are not the same every game. */
let tableBias = null;
/** White-positive score, in centipawns. */
export function evaluate(pos) {
    let score = 0;
    let nonPawn = 0;
    const pawnFiles = { w: [0, 0, 0, 0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0, 0, 0, 0] };
    const bishops = { w: 0, b: 0 };
    for (let sq = 0; sq < 64; sq++) {
        const piece = pos.board[sq];
        if (!piece)
            continue;
        const sign = piece.c === 'w' ? 1 : -1;
        const row = piece.c === 'w' ? sq >> 3 : 7 - (sq >> 3);
        const tableIndex = row * 8 + (sq % 8);
        const table = piece.t === 'k' ? KING_TABLE : TABLES[piece.t];
        score += sign * (VALUE[piece.t] + table[tableIndex] + (tableBias ? tableBias[tableIndex] : 0));
        if (piece.t === 'p')
            pawnFiles[piece.c][sq % 8]++;
        if (piece.t !== 'p' && piece.t !== 'k')
            nonPawn += VALUE[piece.t];
        if (piece.t === 'b')
            bishops[piece.c]++;
    }
    // The king wants the middle in the endgame and its own corner while the board is busy.
    const endgame = nonPawn <= 1300;
    if (endgame) {
        for (const c of ['w', 'b']) {
            const sign = c === 'w' ? 1 : -1;
            const sq = pos.kings[c];
            const row = c === 'w' ? sq >> 3 : 7 - (sq >> 3);
            score += sign * (KING_END_TABLE[row * 8 + (sq % 8)] - KING_TABLE[row * 8 + (sq % 8)]);
        }
    }
    for (const c of ['w', 'b']) {
        const sign = c === 'w' ? 1 : -1;
        if (bishops[c] >= 2)
            score += sign * 28;
        for (let f = 0; f < 8; f++) {
            const count = pawnFiles[c][f];
            if (count > 1)
                score -= sign * 14 * (count - 1);
            if (count === 1) {
                const left = f > 0 ? pawnFiles[c][f - 1] : 0;
                const right = f < 7 ? pawnFiles[c][f + 1] : 0;
                if (!left && !right)
                    score -= sign * 12;
            }
        }
    }
    return score;
}
const moveKey = (m) => m.from * 64 + m.to;
function orderMoves(_pos, moves, ctx) {
    const scores = new Map();
    for (const m of moves) {
        let score = ctx.history[moveKey(m)] ?? 0;
        if (m.capture)
            score += 10000 + VALUE[m.capture.t] * 10 - VALUE[m.t];
        if (m.promo)
            score += 9000 + VALUE[m.promo];
        if (m.castle)
            score += 600;
        scores.set(moveKey(m), score);
    }
    moves.sort((a, b) => (scores.get(moveKey(b)) ?? 0) - (scores.get(moveKey(a)) ?? 0));
}
function quiesce(pos, alpha, beta, ctx, depth) {
    ctx.nodes++;
    if (ctx.nodes > ctx.limit) {
        ctx.aborted = true;
        return 0;
    }
    const side = pos.turn === 'w' ? 1 : -1;
    const stand = evaluate(pos) * side;
    if (stand >= beta)
        return beta;
    if (stand > alpha)
        alpha = stand;
    if (depth <= 0)
        return alpha;
    const moves = pseudoMoves(pos).filter(m => m.capture || m.promo);
    orderMoves(pos, moves, ctx);
    for (const m of moves) {
        const undo = makeMove(pos, m);
        if (isAttacked(pos, pos.kings[m.c], other(m.c))) {
            unmakeMove(pos, m, undo);
            continue;
        }
        const score = -quiesce(pos, -beta, -alpha, ctx, depth - 1);
        unmakeMove(pos, m, undo);
        if (ctx.aborted)
            return alpha;
        if (score >= beta)
            return beta;
        if (score > alpha)
            alpha = score;
    }
    return alpha;
}
function negamax(pos, depth, alpha, beta, ply, ctx) {
    ctx.nodes++;
    if (ctx.nodes > ctx.limit) {
        ctx.aborted = true;
        return 0;
    }
    const side = pos.turn;
    const checked = isAttacked(pos, pos.kings[side], other(side));
    if (checked && ply > 0)
        depth += 1;
    if (depth <= 0)
        return quiesce(pos, alpha, beta, ctx, 4);
    const moves = pseudoMoves(pos, side);
    orderMoves(pos, moves, ctx);
    let best = -INF;
    let legal = 0;
    for (const m of moves) {
        const undo = makeMove(pos, m);
        if (isAttacked(pos, pos.kings[m.c], other(m.c))) {
            unmakeMove(pos, m, undo);
            continue;
        }
        legal++;
        const score = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, ctx);
        unmakeMove(pos, m, undo);
        if (ctx.aborted)
            return best === -INF ? 0 : best;
        if (score > best)
            best = score;
        if (score > alpha) {
            alpha = score;
            if (alpha >= beta) {
                ctx.history[moveKey(m)] = (ctx.history[moveKey(m)] ?? 0) + depth * depth;
                break;
            }
        }
    }
    if (!legal)
        return checked ? -MATE + ply : 0;
    return best;
}
function rootSearch(pos, depth, ctx, first) {
    const moves = pseudoMoves(pos);
    if (first) {
        const i = moves.findIndex(m => m.from === first.from && m.to === first.to && m.promo === first.promo);
        if (i > 0)
            moves.unshift(moves.splice(i, 1)[0]);
    }
    else {
        orderMoves(pos, moves, ctx);
    }
    let alpha = -INF;
    let best = null;
    for (const m of moves) {
        const undo = makeMove(pos, m);
        if (isAttacked(pos, pos.kings[m.c], other(m.c))) {
            unmakeMove(pos, m, undo);
            continue;
        }
        const score = -negamax(pos, depth - 1, -INF, -alpha, 1, ctx);
        unmakeMove(pos, m, undo);
        if (ctx.aborted)
            return { move: best, score: alpha };
        if (score > alpha) {
            alpha = score;
            best = m;
        }
    }
    return { move: best, score: alpha };
}
/**
 * The move the bot plays at this level. Ties and near-ties are broken with the game's own seeded rng, so a
 * replay is the same game, and the bot does not repeat the same opening every time.
 */
export function chooseMove(pos, level, rng) {
    const profile = profileFor(level);
    const legal = legalMoves(pos);
    if (!legal.length)
        return null;
    if (profile.wobble > 0 && rng.chance(profile.wobble))
        return { move: rng.pick(legal), score: 0, depth: 0, nodes: 0 };
    const ctx = { nodes: 0, limit: profile.nodes, aborted: false, history: new Int32Array(64 * 64) };
    let bestMove = legal[0];
    let bestScore = 0;
    let reached = 0;
    // A little noise on the piece-square tables, fixed for this move only: the bot values the same
    // squares slightly differently from game to game, so its openings vary, while a pawn is still
    // worth a pawn.
    tableBias = new Int8Array(64);
    for (let i = 0; i < 64; i++)
        tableBias[i] = rng.int(-profile.noise, profile.noise);
    try {
        for (let depth = 1; depth <= profile.depth; depth++) {
            const result = rootSearch(pos, depth, ctx, depth === 1 ? null : bestMove);
            if (ctx.aborted && depth > 1)
                break;
            if (result.move) {
                bestMove = result.move;
                bestScore = result.score;
                reached = depth;
            }
            if (ctx.aborted)
                break;
        }
    }
    finally {
        tableBias = null;
    }
    return { move: bestMove, score: bestScore, depth: reached, nodes: ctx.nodes };
}
/** A move worth showing as a hint: the strongest the bot can find, quickly. */
export function hintMove(pos) {
    const ctx = { nodes: 0, limit: 120000, aborted: false, history: new Int32Array(64 * 64) };
    const result = rootSearch(pos, 3, ctx, null);
    return result.move;
}
