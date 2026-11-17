/**
 * Chess rules: the board, every legal move, and how a game ends.
 *
 * The board is 64 squares in display order: index 0 is a8 (top-left with White at the bottom), index 63 is h1.
 * Rank 0 is the 8th rank, file 0 the a file. Positions are plain data and the move maker changes one in place and
 * hands back what it needs to be undone, so the bot's search can walk the tree without building a board at every node.
 * Nothing here touches the engine: it is rules, and a perft run checks it.
 */
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const FILES = 'abcdefgh';
export const other = (c) => (c === 'w' ? 'b' : 'w');
export const fileOf = (sq) => sq % 8;
export const rankOf = (sq) => Math.floor(sq / 8);
export const squareName = (sq) => FILES[fileOf(sq)] + String(8 - rankOf(sq));
export const squareIndex = (name) => {
    const file = FILES.indexOf(name[0]);
    const rank = 8 - Number(name[1]);
    return rank * 8 + file;
};
const KNIGHT_STEPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const BISHOP_STEPS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_STEPS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const PROMOS = ['q', 'r', 'b', 'n'];
const backRank = (c) => (c === 'w' ? 'RNBQKBNR' : 'rnbqkbnr');
export function initialPosition() {
    return positionFromFen(START_FEN);
}
export function positionFromFen(fen) {
    const parts = fen.trim().split(/\s+/);
    const rows = parts[0].split('/');
    const board = new Array(64).fill(null);
    for (let r = 0; r < 8; r++) {
        let file = 0;
        for (const ch of rows[r] ?? '') {
            if (ch >= '1' && ch <= '8') {
                file += Number(ch);
                continue;
            }
            const c = ch === ch.toUpperCase() ? 'w' : 'b';
            board[r * 8 + file] = { t: ch.toLowerCase(), c };
            file++;
        }
    }
    const turn = parts[1] === 'b' ? 'b' : 'w';
    const rights = parts[2] ?? '-';
    const kings = { w: board.findIndex(p => p?.t === 'k' && p.c === 'w'), b: board.findIndex(p => p?.t === 'k' && p.c === 'b') };
    const pos = {
        board,
        turn,
        castling: {
            wk: rights.includes('K'),
            wq: rights.includes('Q'),
            bk: rights.includes('k'),
            bq: rights.includes('q'),
        },
        ep: parts[3] && parts[3] !== '-' ? squareIndex(parts[3]) : null,
        halfmove: Number(parts[4] ?? 0) || 0,
        fullmove: Number(parts[5] ?? 1) || 1,
        kings,
    };
    return pos;
}
export function toFen(pos) {
    const rows = [];
    for (let r = 0; r < 8; r++) {
        let row = '';
        let empty = 0;
        for (let f = 0; f < 8; f++) {
            const p = pos.board[r * 8 + f];
            if (!p) {
                empty++;
                continue;
            }
            if (empty) {
                row += String(empty);
                empty = 0;
            }
            row += p.c === 'w' ? p.t.toUpperCase() : p.t;
        }
        if (empty)
            row += String(empty);
        rows.push(row);
    }
    const rights = `${pos.castling.wk ? 'K' : ''}${pos.castling.wq ? 'Q' : ''}${pos.castling.bk ? 'k' : ''}${pos.castling.bq ? 'q' : ''}` || '-';
    return `${rows.join('/')} ${pos.turn} ${rights} ${pos.ep === null ? '-' : squareName(pos.ep)} ${pos.halfmove} ${pos.fullmove}`;
}
/** The part of a position that makes a repetition, without clocks. */
export function positionKey(pos) {
    const fen = toFen(pos);
    return fen.split(' ').slice(0, 4).join(' ');
}
export function clonePosition(pos) {
    return {
        board: pos.board.map(p => (p ? { t: p.t, c: p.c } : null)),
        turn: pos.turn,
        castling: { ...pos.castling },
        ep: pos.ep,
        halfmove: pos.halfmove,
        fullmove: pos.fullmove,
        kings: { ...pos.kings },
    };
}
export function isEmpty(pos, sq) {
    if (sq < 0 || sq > 63)
        return false;
    return pos.board[sq] === null;
}
/** Is `sq` attacked by any piece of `by`? */
export function isAttacked(pos, sq, by) {
    const f = fileOf(sq);
    const r = rankOf(sq);
    // Pawns: a white pawn moves toward row 0, so one attacking (r, f) stands on row r + 1.
    const pawnRow = by === 'w' ? r + 1 : r - 1;
    if (pawnRow >= 0 && pawnRow < 8) {
        for (const df of [-1, 1]) {
            const pf = f + df;
            if (pf < 0 || pf > 7)
                continue;
            const p = pos.board[pawnRow * 8 + pf];
            if (p && p.c === by && p.t === 'p')
                return true;
        }
    }
    for (const [dr, df] of KNIGHT_STEPS) {
        const nr = r + dr;
        const nf = f + df;
        if (nr < 0 || nr > 7 || nf < 0 || nf > 7)
            continue;
        const p = pos.board[nr * 8 + nf];
        if (p && p.c === by && p.t === 'n')
            return true;
    }
    for (const [dr, df] of KING_STEPS) {
        const nr = r + dr;
        const nf = f + df;
        if (nr < 0 || nr > 7 || nf < 0 || nf > 7)
            continue;
        const p = pos.board[nr * 8 + nf];
        if (p && p.c === by && p.t === 'k')
            return true;
    }
    for (const [dr, df] of BISHOP_STEPS) {
        let nr = r + dr;
        let nf = f + df;
        while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
            const p = pos.board[nr * 8 + nf];
            if (p) {
                if (p.c === by && (p.t === 'b' || p.t === 'q'))
                    return true;
                break;
            }
            nr += dr;
            nf += df;
        }
    }
    for (const [dr, df] of ROOK_STEPS) {
        let nr = r + dr;
        let nf = f + df;
        while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
            const p = pos.board[nr * 8 + nf];
            if (p) {
                if (p.c === by && (p.t === 'r' || p.t === 'q'))
                    return true;
                break;
            }
            nr += dr;
            nf += df;
        }
    }
    return false;
}
export function inCheck(pos, color = pos.turn) {
    return isAttacked(pos, pos.kings[color], other(color));
}
/** Every move the side to move could make, ignoring whether it leaves its own king in check. */
export function pseudoMoves(pos, color = pos.turn) {
    const moves = [];
    const enemy = other(color);
    const push = (from, to, t, extra) => {
        const target = pos.board[to] ?? null;
        const m = {
            from,
            to,
            t,
            c: color,
            ...(target && target.c === enemy ? { capture: { square: to, t: target.t } } : {}),
            ...(extra ?? {}),
        };
        moves.push(m);
    };
    const pawnMoves = (from) => {
        const r = rankOf(from);
        const f = fileOf(from);
        const dir = color === 'w' ? -1 : 1;
        const promoRow = color === 'w' ? 0 : 7;
        const addPawnMove = (to, extra) => {
            if (rankOf(to) === promoRow) {
                for (const promo of PROMOS)
                    moves.push({ from, to, t: 'p', c: color, promo, ...(extra ?? {}) });
            }
            else {
                moves.push({ from, to, t: 'p', c: color, ...(extra ?? {}) });
            }
        };
        const oneRow = r + dir;
        if (oneRow >= 0 && oneRow < 8) {
            const one = oneRow * 8 + f;
            if (!pos.board[one]) {
                addPawnMove(one);
                const startRow = color === 'w' ? 6 : 1;
                if (r === startRow) {
                    const two = (r + 2 * dir) * 8 + f;
                    if (!pos.board[two])
                        addPawnMove(two);
                }
            }
            for (const df of [-1, 1]) {
                const nf = f + df;
                if (nf < 0 || nf > 7)
                    continue;
                const to = oneRow * 8 + nf;
                const target = pos.board[to];
                if (target && target.c === enemy)
                    addPawnMove(to, { capture: { square: to, t: target.t } });
                else if (!target && pos.ep === to) {
                    // the captured pawn stands beside the mover, on its own rank
                    addPawnMove(to, { capture: { square: r * 8 + nf, t: 'p' } });
                }
            }
        }
    };
    const stepMoves = (from, steps, t) => {
        const r = rankOf(from);
        const f = fileOf(from);
        for (const [dr, df] of steps) {
            const nr = r + dr;
            const nf = f + df;
            if (nr < 0 || nr > 7 || nf < 0 || nf > 7)
                continue;
            const to = nr * 8 + nf;
            const target = pos.board[to];
            if (target && target.c === color)
                continue;
            push(from, to, t);
        }
    };
    const slideMoves = (from, steps, t) => {
        const r = rankOf(from);
        const f = fileOf(from);
        for (const [dr, df] of steps) {
            let nr = r + dr;
            let nf = f + df;
            while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
                const to = nr * 8 + nf;
                const target = pos.board[to];
                if (target) {
                    if (target.c !== color)
                        push(from, to, t);
                    break;
                }
                push(from, to, t);
                nr += dr;
                nf += df;
            }
        }
    };
    const castleMoves = (from) => {
        const homeRow = color === 'w' ? 7 : 0;
        if (rankOf(from) !== homeRow || fileOf(from) !== 4)
            return;
        const rookRight = color === 'w' ? pos.castling.wk : pos.castling.bk;
        const queenRight = color === 'w' ? pos.castling.wq : pos.castling.bq;
        if (!rookRight && !queenRight)
            return;
        if (isAttacked(pos, from, enemy))
            return;
        const rook = color === 'w' ? 63 : 7;
        const queenRook = color === 'w' ? 56 : 0;
        if (rookRight && pos.board[rook]?.t === 'r' && pos.board[rook]?.c === color
            && !pos.board[from + 1] && !pos.board[from + 2]
            && !isAttacked(pos, from + 1, enemy) && !isAttacked(pos, from + 2, enemy)) {
            moves.push({ from, to: from + 2, t: 'k', c: color, castle: 'k' });
        }
        if (queenRight && pos.board[queenRook]?.t === 'r' && pos.board[queenRook]?.c === color
            && !pos.board[from - 1] && !pos.board[from - 2] && !pos.board[from - 3]
            && !isAttacked(pos, from - 1, enemy) && !isAttacked(pos, from - 2, enemy)) {
            moves.push({ from, to: from - 2, t: 'k', c: color, castle: 'q' });
        }
    };
    for (let sq = 0; sq < 64; sq++) {
        const piece = pos.board[sq];
        if (!piece || piece.c !== color)
            continue;
        switch (piece.t) {
            case 'p':
                pawnMoves(sq);
                break;
            case 'n':
                stepMoves(sq, KNIGHT_STEPS, 'n');
                break;
            case 'b':
                slideMoves(sq, BISHOP_STEPS, 'b');
                break;
            case 'r':
                slideMoves(sq, ROOK_STEPS, 'r');
                break;
            case 'q':
                slideMoves(sq, [...BISHOP_STEPS, ...ROOK_STEPS], 'q');
                break;
            case 'k':
                stepMoves(sq, KING_STEPS, 'k');
                castleMoves(sq);
                break;
        }
    }
    return moves;
}
/** Every move the side to move may actually play. */
export function legalMoves(pos, color = pos.turn) {
    const moves = [];
    for (const m of pseudoMoves(pos, color)) {
        const undo = makeMove(pos, m);
        if (!isAttacked(pos, pos.kings[color], other(color)))
            moves.push(m);
        unmakeMove(pos, m, undo);
    }
    return moves;
}
export function hasLegalMove(pos, color = pos.turn) {
    for (const m of pseudoMoves(pos, color)) {
        const undo = makeMove(pos, m);
        const okay = !isAttacked(pos, pos.kings[color], other(color));
        unmakeMove(pos, m, undo);
        if (okay)
            return true;
    }
    return false;
}
export function legalMovesFrom(pos, from) {
    return legalMoves(pos).filter(m => m.from === from);
}
export function findMove(pos, from, to, promo) {
    const matches = legalMoves(pos).filter(m => m.from === from && m.to === to && (!promo || m.promo === promo));
    return matches[0] ?? null;
}
/** Play a move on this position; hand back what unmakeMove needs. */
export function makeMove(pos, m) {
    const undo = {
        castling: { ...pos.castling },
        ep: pos.ep,
        halfmove: pos.halfmove,
        fullmove: pos.fullmove,
        kings: { ...pos.kings },
    };
    const piece = pos.board[m.from] ?? { t: m.t, c: m.c };
    pos.board[m.from] = null;
    if (m.capture)
        pos.board[m.capture.square] = null;
    pos.board[m.to] = m.promo ? { t: m.promo, c: m.c } : piece;
    if (m.castle) {
        const k = m.c === 'w';
        if (m.castle === 'k') {
            const rf = k ? 63 : 7;
            const rt = k ? 61 : 5;
            pos.board[rt] = pos.board[rf];
            pos.board[rf] = null;
        }
        else {
            const rf = k ? 56 : 0;
            const rt = k ? 59 : 3;
            pos.board[rt] = pos.board[rf];
            pos.board[rf] = null;
        }
    }
    if (m.t === 'k')
        pos.kings[m.c] = m.to;
    if (m.t === 'k') {
        if (m.c === 'w') {
            pos.castling.wk = false;
            pos.castling.wq = false;
        }
        else {
            pos.castling.bk = false;
            pos.castling.bq = false;
        }
    }
    if (m.t === 'r') {
        if (m.from === 56)
            pos.castling.wq = false;
        if (m.from === 63)
            pos.castling.wk = false;
        if (m.from === 0)
            pos.castling.bq = false;
        if (m.from === 7)
            pos.castling.bk = false;
    }
    if (m.capture) {
        const sq = m.capture.square;
        if (sq === 56)
            pos.castling.wq = false;
        if (sq === 63)
            pos.castling.wk = false;
        if (sq === 0)
            pos.castling.bq = false;
        if (sq === 7)
            pos.castling.bk = false;
    }
    pos.ep = null;
    if (m.t === 'p' && Math.abs(m.to - m.from) === 16)
        pos.ep = (m.from + m.to) / 2;
    if (m.t === 'p' || m.capture)
        pos.halfmove = 0;
    else
        pos.halfmove += 1;
    if (m.c === 'b')
        pos.fullmove += 1;
    pos.turn = other(m.c);
    return undo;
}
export function unmakeMove(pos, m, undo) {
    const moved = pos.board[m.to];
    pos.board[m.to] = null;
    pos.board[m.from] = m.promo ? { t: 'p', c: m.c } : moved;
    if (m.capture)
        pos.board[m.capture.square] = { t: m.capture.t, c: other(m.c) };
    if (m.castle) {
        const k = m.c === 'w';
        if (m.castle === 'k') {
            const rf = k ? 63 : 7;
            const rt = k ? 61 : 5;
            pos.board[rf] = pos.board[rt];
            pos.board[rt] = null;
        }
        else {
            const rf = k ? 56 : 0;
            const rt = k ? 59 : 3;
            pos.board[rf] = pos.board[rt];
            pos.board[rt] = null;
        }
    }
    pos.castling = undo.castling;
    pos.ep = undo.ep;
    pos.halfmove = undo.halfmove;
    pos.fullmove = undo.fullmove;
    pos.kings = undo.kings;
    pos.turn = m.c;
}
/** Standard algebraic notation, with the check or mate mark, written before the move is played. */
export function toSan(pos, move) {
    let base;
    if (move.castle === 'k')
        base = 'O-O';
    else if (move.castle === 'q')
        base = 'O-O-O';
    else if (move.t === 'p') {
        base = move.capture
            ? `${FILES[fileOf(move.from)]}x${squareName(move.to)}`
            : squareName(move.to);
        if (move.promo)
            base += `=${move.promo.toUpperCase()}`;
    }
    else {
        const rivals = legalMoves(pos).filter(o => o !== move && o.t === move.t && o.to === move.to && o.from !== move.from);
        let disambiguation = '';
        if (rivals.length) {
            const sameFile = rivals.some(o => fileOf(o.from) === fileOf(move.from));
            const sameRank = rivals.some(o => rankOf(o.from) === rankOf(move.from));
            if (!sameFile)
                disambiguation = FILES[fileOf(move.from)];
            else if (!sameRank)
                disambiguation = String(8 - rankOf(move.from));
            else
                disambiguation = squareName(move.from);
        }
        base = `${move.t.toUpperCase()}${disambiguation}${move.capture ? 'x' : ''}${squareName(move.to)}`;
    }
    const undo = makeMove(pos, move);
    const checker = pos.turn;
    const check = isAttacked(pos, pos.kings[checker], other(checker));
    const mate = check && !hasLegalMove(pos, checker);
    unmakeMove(pos, move, undo);
    return base + (mate ? '#' : check ? '+' : '');
}
/** 64 squares (the en passant square included), so a saved move can be played back exactly. */
export function toUci(move) {
    return squareName(move.from) + squareName(move.to) + (move.promo ?? '');
}
export function fromUci(pos, uci) {
    if (uci.length < 4)
        return null;
    const from = squareIndex(uci.slice(0, 2));
    const to = squareIndex(uci.slice(2, 4));
    const promo = uci.length > 4 ? uci[4] : undefined;
    return findMove(pos, from, to, promo);
}
const KIND_TITLE = {
    checkmate: 'Checkmate',
    stalemate: 'Stalemate',
    fifty: 'Draw',
    insufficient: 'Draw',
    repetition: 'Draw',
    resign: 'Resignation',
    time: 'Out of time',
    agreement: 'Draw',
};
export function outcome(kind, winner, detail) {
    return { kind, winner, title: KIND_TITLE[kind], detail };
}
/** Only kings, or a king and one minor piece a side: no one can force a mate. */
export function insufficientMaterial(pos) {
    const pieces = [];
    for (const p of pos.board)
        if (p && p.t !== 'k')
            pieces.push(p);
    if (pieces.length === 0)
        return true;
    if (pieces.length === 1)
        return pieces[0].t === 'n' || pieces[0].t === 'b';
    if (pieces.length === 2 && pieces.every(p => p.t === 'b') && pieces[0].c !== pieces[1].c) {
        const squares = [];
        pos.board.forEach((p, i) => { if (p && p.t === 'b')
            squares.push(i); });
        const light = (s) => (fileOf(s) + rankOf(s)) % 2 === 0;
        return light(squares[0]) === light(squares[1]);
    }
    return false;
}
/** The result of the position alone, or null while play goes on. Repetition and the clock are the game's own. */
export function positionOutcome(pos) {
    const moves = hasLegalMove(pos);
    if (!moves) {
        if (inCheck(pos))
            return outcome('checkmate', other(pos.turn), `${pos.turn === 'w' ? 'Black' : 'White'} wins by checkmate`);
        return outcome('stalemate', null, 'Stalemate: no legal moves, and the king is not in check');
    }
    if (pos.halfmove >= 100)
        return outcome('fifty', null, 'Fifty moves without a capture or a pawn move');
    if (insufficientMaterial(pos))
        return outcome('insufficient', null, 'Not enough material left to force a checkmate');
    return null;
}
/** How many pieces of each type each side has lost, for the captured trays. */
export function capturedPieces(pos) {
    const start = {
        w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
        b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
    };
    const live = {
        w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
        b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    };
    for (const p of pos.board)
        if (p)
            live[p.c][p.t]++;
    const order = ['q', 'r', 'b', 'n', 'p'];
    const rest = { w: [], b: [] };
    for (const c of ['w', 'b']) {
        for (const t of order) {
            for (let i = 0; i < start[c][t] - live[c][t]; i++)
                rest[c].push(t);
        }
    }
    return rest;
}
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
/** Material lead in pawns, positive for White. */
export function materialBalance(pos) {
    let score = 0;
    for (const p of pos.board)
        if (p)
            score += (p.c === 'w' ? 1 : -1) * PIECE_VALUE[p.t];
    return score;
}
export function pieceLetter(t) {
    return t.toUpperCase();
}
export function pieceName(t) {
    return { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[t];
}
export { backRank };
/** Every leaf at this depth, for the rules test. */
export function perft(pos, depth) {
    if (depth === 0)
        return 1;
    let total = 0;
    for (const m of pseudoMoves(pos)) {
        const undo = makeMove(pos, m);
        if (!isAttacked(pos, pos.kings[m.c], other(m.c)))
            total += perft(pos, depth - 1);
        unmakeMove(pos, m, undo);
    }
    return total;
}
