/**
 * The game: position history, clocks, result and what is remembered between visits.
 *
 * Nothing here touches the DOM. The board draws this; the screens read it; the bot is handed
 * `currentPosition(game)`. That split is what makes undo, review and saving a saved game cheap.
 */
import { START_FEN, clonePosition, fromUci, makeMove, outcome, positionFromFen, positionKey, positionOutcome, toSan, toUci, } from './rules.js';
const SETTINGS_KEY = 'checkmate.settings.v1';
const GAME_KEY = 'checkmate.game.v1';
const STATS_KEY = 'checkmate.stats.v1';
export const DEFAULT_CONFIG = {
    mode: 'bot',
    level: 2,
    side: 'w',
    minutes: 10,
    autoFlip: true,
};
export const DEFAULT_SETTINGS = {
    theme: 'green',
    sound: true,
    coordinates: true,
    confirm: true,
    coach: false,
    debug: false,
};
function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw)
            return fallback;
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    }
    catch { /* private mode, or full: the game carries on */ }
}
export function loadSettings() {
    const saved = readJson(SETTINGS_KEY, {});
    return {
        theme: (saved.theme ?? DEFAULT_SETTINGS.theme),
        sound: saved.sound !== false,
        coordinates: saved.coordinates !== false,
        confirm: saved.confirm !== false,
        coach: saved.coach === true,
        debug: saved.debug === true,
    };
}
export function saveSettings(settings) {
    writeJson(SETTINGS_KEY, settings);
}
export function loadConfig() {
    const saved = readJson(SETTINGS_KEY + '.config', {});
    return {
        mode: saved.mode === 'friend' ? 'friend' : 'bot',
        level: ([1, 2, 3, 4, 5, 6, 7, 8].includes(saved.level) ? saved.level : 2),
        side: saved.side === 'b' || saved.side === 'random' ? saved.side : 'w',
        minutes: typeof saved.minutes === 'number' ? saved.minutes : DEFAULT_CONFIG.minutes,
        autoFlip: saved.autoFlip !== false,
    };
}
export function saveConfig(config) {
    writeJson(SETTINGS_KEY + '.config', config);
}
export function loadStats() {
    return readJson(STATS_KEY, { games: 0, wins: 0, losses: 0, draws: 0 });
}
export function recordResult(game) {
    if (!game.outcome)
        return;
    const stats = loadStats();
    stats.games += 1;
    if (!game.outcome.winner)
        stats.draws += 1;
    else if (game.outcome.winner === game.human)
        stats.wins += 1;
    else
        stats.losses += 1;
    writeJson(STATS_KEY, stats);
}
export function newIds(pos) {
    const ids = new Array(64).fill(null);
    let next = 1;
    for (let sq = 0; sq < 64; sq++)
        if (pos.board[sq])
            ids[sq] = next++;
    return ids;
}
export function clockFor(minutes) {
    const seconds = Math.max(0, Math.round(minutes * 60));
    return { w: seconds, b: seconds };
}
export function createGame(config, fen = START_FEN, human) {
    const startPos = positionFromFen(fen);
    const side = human ?? (config.mode === 'friend'
        ? 'w'
        : config.side === 'random'
            ? (Math.random() < 0.5 ? 'w' : 'b')
            : config.side);
    const clocks = clockFor(config.minutes);
    return {
        config: { ...config },
        startFen: fen,
        startPos,
        startIds: newIds(startPos),
        plies: [],
        clocks: { ...clocks },
        outcome: null,
        human: side,
        flipped: config.mode === 'bot' ? side === 'b' : false,
        pendingPromo: null,
        hint: null,
    };
}
export function currentPosition(game) {
    return game.plies.length ? game.plies[game.plies.length - 1].pos : game.startPos;
}
export function currentIds(game) {
    return game.plies.length ? game.plies[game.plies.length - 1].ids : game.startIds;
}
export function lastMove(game) {
    return game.plies.length ? game.plies[game.plies.length - 1].move : null;
}
export function turn(game) {
    return currentPosition(game).turn;
}
export function isHumanTurn(game) {
    return game.config.mode === 'friend' || turn(game) === game.human;
}
function idsAfter(ids, move) {
    const next = ids.slice();
    const id = next[move.from];
    next[move.from] = null;
    if (move.capture)
        next[move.capture.square] = null;
    next[move.to] = id;
    if (move.castle) {
        const white = move.c === 'w';
        const rookFrom = move.castle === 'k' ? (white ? 63 : 7) : (white ? 56 : 0);
        const rookTo = move.castle === 'k' ? (white ? 61 : 5) : (white ? 59 : 3);
        next[rookTo] = next[rookFrom];
        next[rookFrom] = null;
    }
    return next;
}
/** Play a move: the rules first, then the record. */
export function applyMove(game, move) {
    const before = currentPosition(game);
    const san = toSan(before, move);
    const pos = clonePosition(before);
    makeMove(pos, move);
    const ply = {
        move,
        san,
        pos,
        ids: idsAfter(currentIds(game), move),
        clocks: { ...game.clocks },
    };
    game.plies.push(ply);
    game.pendingPromo = null;
    game.hint = null;
    if (game.config.mode === 'friend' && game.config.autoFlip)
        game.flipped = pos.turn === 'b';
    finish(game);
    return ply;
}
/** Set `outcome` from the position and the repetition count, if the game is over. */
export function finish(game) {
    const pos = currentPosition(game);
    const base = positionOutcome(pos);
    if (base) {
        game.outcome = base;
        return base;
    }
    if (repetitionCount(game) >= 3) {
        game.outcome = outcome('repetition', null, 'The same position appeared three times');
        return game.outcome;
    }
    game.outcome = null;
    return null;
}
export function repetitionCount(game) {
    const key = positionKey(currentPosition(game));
    let seen = positionKey(game.startPos) === key ? 1 : 0;
    for (const ply of game.plies)
        if (positionKey(ply.pos) === key)
            seen++;
    return seen;
}
export function resign(game, loser) {
    const result = outcome('resign', loser === 'w' ? 'b' : 'w', `${loser === 'w' ? 'White' : 'Black'} resigned`);
    game.outcome = result;
    return result;
}
export function flag(game, loser) {
    const drawish = positionOutcome(currentPosition(game))?.kind === 'insufficient';
    const result = drawish
        ? outcome('time', null, 'Out of time, but there is not enough material to mate')
        : outcome('time', loser === 'w' ? 'b' : 'w', `${loser === 'w' ? 'White' : 'Black'} ran out of time`);
    game.outcome = result;
    return result;
}
/** Can the player take a move back? In a bot game, only once they have played one. */
export function canUndo(game) {
    if (!game.plies.length)
        return false;
    if (game.config.mode === 'friend')
        return true;
    if (game.config.mode === 'online')
        return false;
    return game.plies.some(ply => ply.move.c === game.human);
}
/**
 * Take back to the player's own turn: the player's last move and whatever the bot answered it
 * with. In a pass-and-play game it is one ply.
 */
export function undo(game) {
    if (!canUndo(game))
        return false;
    if (game.config.mode === 'friend') {
        game.plies.pop();
    }
    else {
        let index = game.plies.length - 1;
        while (index >= 0 && game.plies[index].move.c !== game.human)
            index--;
        if (index < 0)
            return false;
        game.plies.length = index;
    }
    game.clocks = game.plies.length ? { ...game.plies[game.plies.length - 1].clocks } : clockFor(game.config.minutes);
    game.outcome = null;
    game.pendingPromo = null;
    game.hint = null;
    game.flipped = game.config.mode === 'bot' ? game.human === 'b' : game.config.autoFlip && turn(game) === 'b';
    return true;
}
/** Truncate to a ply index for review: `null` is the live position. */
export function positionAt(game, index) {
    if (index === null || index < 0 || index >= game.plies.length)
        return currentPosition(game);
    return game.plies[index].pos;
}
export function idsAt(game, index) {
    if (index === null || index < 0 || index >= game.plies.length)
        return currentIds(game);
    return game.plies[index].ids;
}
export function saveGame(game) {
    writeJson(GAME_KEY, {
        config: game.config,
        startFen: game.startFen,
        moves: game.plies.map(p => toUci(p.move)),
        clocks: game.clocks,
        human: game.human,
        flipped: game.flipped,
        done: !!game.outcome,
        at: Date.now(),
    });
}
export function clearSavedGame() {
    try {
        localStorage.removeItem(GAME_KEY);
    }
    catch { /* nothing to clear */ }
}
export function savedGame() {
    const saved = readJson(GAME_KEY, null);
    if (!saved || !Array.isArray(saved.moves) || saved.done)
        return null;
    return saved;
}
/** Rebuild a saved game by replaying its moves. Null when the save is stale or corrupt. */
export function restoreGame(saved) {
    let game;
    try {
        game = createGame(saved.config, saved.startFen, saved.human);
    }
    catch {
        return null;
    }
    for (const uci of saved.moves) {
        const move = fromUci(currentPosition(game), uci);
        if (!move)
            return null;
        applyMove(game, move);
    }
    game.clocks = { ...saved.clocks };
    game.flipped = !!saved.flipped;
    game.outcome = null;
    return game;
}
/** Which side has more material, in pawns, and how many. */
export const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export function resultLabel(game) {
    if (!game.outcome)
        return '';
    return game.outcome.title;
}
/** The game as PGN, for the copy button. */
export function toPgn(game) {
    const date = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const result = !game.outcome ? '*' : game.outcome.winner === 'w' ? '1-0' : game.outcome.winner === 'b' ? '0-1' : '1/2-1/2';
    const black = game.config.mode === 'bot'
        ? `Checkmate Bot (${game.human === 'w' ? 'Black' : 'White'})`
        : game.human === 'w' ? 'Black' : 'White';
    const white = game.config.mode === 'bot'
        ? game.human === 'w' ? 'You' : `Checkmate Bot`
        : game.human === 'w' ? 'White' : 'Black';
    const lines = [
        `[Event "Casual game"]`,
        `[Site "Checkmate"]`,
        `[Date "${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}"]`,
        `[White "${white}"]`,
        `[Black "${black}"]`,
        `[Result "${result}"]`,
        `[TimeControl "${game.config.minutes ? game.config.minutes * 60 : '-'}"]`,
        '',
    ];
    const parts = [];
    game.plies.forEach((ply, i) => {
        if (i % 2 === 0)
            parts.push(`${i / 2 + 1}.`);
        parts.push(ply.san);
    });
    if (result !== '*')
        parts.push(result);
    return lines.concat(parts.join(' ')).join('\n');
}
