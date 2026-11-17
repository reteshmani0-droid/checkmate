/**
 * The game: position history, clocks, result and what is remembered between visits.
 *
 * Nothing here touches the DOM. The board draws this; the screens read it; the bot is handed
 * `currentPosition(game)`. That split is what makes undo, review and saving a saved game cheap.
 */
import {
    type Move,
    type Outcome,
    type PieceType,
    type Position,
    START_FEN,
    clonePosition,
    fromUci,
    makeMove,
    outcome,
    positionFromFen,
    positionKey,
    positionOutcome,
    toSan,
    toUci,
} from './rules.js';
import type { BotLevel } from './bot.js';
import type { ThemeId } from './themes.js';

export type Mode = 'bot' | 'friend' | 'online';
export type Side = 'w' | 'b';
export type SideChoice = Side | 'random';

export type Config = {
    mode: Mode;
    level: BotLevel;
    side: SideChoice;
    /** minutes each side gets; 0 is no clock */
    minutes: number;
    /** turn the board for whoever is to move, in a pass-and-play game */
    autoFlip: boolean;
};

export type Settings = {
    theme: ThemeId;
    sound: boolean;
    coordinates: boolean;
    /** ask before resigning or leaving a game in progress */
    confirm: boolean;
};

export type Clocks = { w: number; b: number };

export type Ply = {
    move: Move;
    san: string;
    /** the position AFTER the move */
    pos: Position;
    /** which piece id stands on each square, so the board can slide the right piece */
    ids: Array<number | null>;
    /** the clock as it stood when the move was played */
    clocks: Clocks;
};

export type Game = {
    config: Config;
    startFen: string;
    startPos: Position;
    startIds: Array<number | null>;
    plies: Ply[];
    clocks: Clocks;
    outcome: Outcome | null;
    /** the side the person plays in a bot game */
    human: Side;
    flipped: boolean;
    /** a pawn on the far rank waiting for the player's choice */
    pendingPromo: { from: number; to: number } | null;
    hint: { from: number; to: number } | null;
};

const SETTINGS_KEY = 'checkmate.settings.v1';
const GAME_KEY = 'checkmate.game.v1';
const STATS_KEY = 'checkmate.stats.v1';

export const DEFAULT_CONFIG: Config = {
    mode: 'bot',
    level: 2,
    side: 'w',
    minutes: 10,
    autoFlip: true,
};

export const DEFAULT_SETTINGS: Settings = {
    theme: 'green',
    sound: true,
    coordinates: true,
    confirm: true,
};

function readJson<T>(key: string, fallback: T): T
{
    try
    {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    }
    catch
    {
        return fallback;
    }
}

function writeJson(key: string, value: unknown): void
{
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { /* private mode, or full: the game carries on */ }
}

export function loadSettings(): Settings
{
    const saved = readJson<Partial<Settings>>(SETTINGS_KEY, {});
    return {
        theme: (saved.theme ?? DEFAULT_SETTINGS.theme) as ThemeId,
        sound: saved.sound !== false,
        coordinates: saved.coordinates !== false,
        confirm: saved.confirm !== false,
    };
}

export function saveSettings(settings: Settings): void
{
    writeJson(SETTINGS_KEY, settings);
}

export function loadConfig(): Config
{
    const saved = readJson<Partial<Config>>(SETTINGS_KEY + '.config', {});
    return {
        mode: saved.mode === 'friend' ? 'friend' : 'bot',
        level: (saved.level === 1 || saved.level === 3 || saved.level === 4 ? saved.level : 2) as BotLevel,
        side: saved.side === 'b' || saved.side === 'random' ? saved.side : 'w',
        minutes: typeof saved.minutes === 'number' ? saved.minutes : DEFAULT_CONFIG.minutes,
        autoFlip: saved.autoFlip !== false,
    };
}

export function saveConfig(config: Config): void
{
    writeJson(SETTINGS_KEY + '.config', config);
}

type Stats = { games: number; wins: number; losses: number; draws: number };

export function loadStats(): Stats
{
    return readJson<Stats>(STATS_KEY, { games: 0, wins: 0, losses: 0, draws: 0 });
}

export function recordResult(game: Game): void
{
    if (!game.outcome) return;
    const stats = loadStats();
    stats.games += 1;
    if (!game.outcome.winner) stats.draws += 1;
    else if (game.outcome.winner === game.human) stats.wins += 1;
    else stats.losses += 1;
    writeJson(STATS_KEY, stats);
}

export function newIds(pos: Position): Array<number | null>
{
    const ids: Array<number | null> = new Array(64).fill(null);
    let next = 1;
    for (let sq = 0; sq < 64; sq++) if (pos.board[sq]) ids[sq] = next++;
    return ids;
}

export function clockFor(minutes: number): Clocks
{
    const seconds = Math.max(0, Math.round(minutes * 60));
    return { w: seconds, b: seconds };
}

export function createGame(config: Config, fen: string = START_FEN, human?: Side): Game
{
    const startPos = positionFromFen(fen);
    const side: Side = human ?? (config.mode === 'friend'
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

export function currentPosition(game: Game): Position
{
    return game.plies.length ? game.plies[game.plies.length - 1].pos : game.startPos;
}

export function currentIds(game: Game): Array<number | null>
{
    return game.plies.length ? game.plies[game.plies.length - 1].ids : game.startIds;
}

export function lastMove(game: Game): Move | null
{
    return game.plies.length ? game.plies[game.plies.length - 1].move : null;
}

export function turn(game: Game): Side
{
    return currentPosition(game).turn;
}

export function isHumanTurn(game: Game): boolean
{
    return game.config.mode === 'friend' || turn(game) === game.human;
}

function idsAfter(ids: Array<number | null>, move: Move): Array<number | null>
{
    const next = ids.slice();
    const id = next[move.from];
    next[move.from] = null;
    if (move.capture) next[move.capture.square] = null;
    next[move.to] = id;
    if (move.castle)
    {
        const white = move.c === 'w';
        const rookFrom = move.castle === 'k' ? (white ? 63 : 7) : (white ? 56 : 0);
        const rookTo = move.castle === 'k' ? (white ? 61 : 5) : (white ? 59 : 3);
        next[rookTo] = next[rookFrom];
        next[rookFrom] = null;
    }
    return next;
}

/** Play a move: the rules first, then the record. */
export function applyMove(game: Game, move: Move): Ply
{
    const before = currentPosition(game);
    const san = toSan(before, move);
    const pos = clonePosition(before);
    makeMove(pos, move);
    const ply: Ply = {
        move,
        san,
        pos,
        ids: idsAfter(currentIds(game), move),
        clocks: { ...game.clocks },
    };
    game.plies.push(ply);
    game.pendingPromo = null;
    game.hint = null;
    if (game.config.mode === 'friend' && game.config.autoFlip) game.flipped = pos.turn === 'b';
    finish(game);
    return ply;
}

/** Set `outcome` from the position and the repetition count, if the game is over. */
export function finish(game: Game): Outcome | null
{
    const pos = currentPosition(game);
    const base = positionOutcome(pos);
    if (base)
    {
        game.outcome = base;
        return base;
    }
    if (repetitionCount(game) >= 3)
    {
        game.outcome = outcome('repetition', null, 'The same position appeared three times');
        return game.outcome;
    }
    game.outcome = null;
    return null;
}

export function repetitionCount(game: Game): number
{
    const key = positionKey(currentPosition(game));
    let seen = positionKey(game.startPos) === key ? 1 : 0;
    for (const ply of game.plies) if (positionKey(ply.pos) === key) seen++;
    return seen;
}

export function resign(game: Game, loser: Side): Outcome
{
    const result = outcome('resign', loser === 'w' ? 'b' : 'w', `${loser === 'w' ? 'White' : 'Black'} resigned`);
    game.outcome = result;
    return result;
}

export function flag(game: Game, loser: Side): Outcome
{
    const drawish = positionOutcome(currentPosition(game))?.kind === 'insufficient';
    const result = drawish
        ? outcome('time', null, 'Out of time, but there is not enough material to mate')
        : outcome('time', loser === 'w' ? 'b' : 'w', `${loser === 'w' ? 'White' : 'Black'} ran out of time`);
    game.outcome = result;
    return result;
}

/** Can the player take a move back? In a bot game, only once they have played one. */
export function canUndo(game: Game): boolean
{
    if (!game.plies.length) return false;
    if (game.config.mode === 'friend') return true;
    if (game.config.mode === 'online') return false;
    return game.plies.some(ply => ply.move.c === game.human);
}

/**
 * Take back to the player's own turn: the player's last move and whatever the bot answered it
 * with. In a pass-and-play game it is one ply.
 */
export function undo(game: Game): boolean
{
    if (!canUndo(game)) return false;
    if (game.config.mode === 'friend')
    {
        game.plies.pop();
    }
    else
    {
        let index = game.plies.length - 1;
        while (index >= 0 && game.plies[index].move.c !== game.human) index--;
        if (index < 0) return false;
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
export function positionAt(game: Game, index: number | null): Position
{
    if (index === null || index < 0 || index >= game.plies.length) return currentPosition(game);
    return game.plies[index].pos;
}

export function idsAt(game: Game, index: number | null): Array<number | null>
{
    if (index === null || index < 0 || index >= game.plies.length) return currentIds(game);
    return game.plies[index].ids;
}

export type SavedGame = {
    config: Config;
    startFen: string;
    moves: string[];
    clocks: Clocks;
    human: Side;
    flipped: boolean;
    done: boolean;
    /** epoch ms, so "play again" can show how old it is */
    at: number;
};

export function saveGame(game: Game): void
{
    writeJson(GAME_KEY, {
        config: game.config,
        startFen: game.startFen,
        moves: game.plies.map(p => toUci(p.move)),
        clocks: game.clocks,
        human: game.human,
        flipped: game.flipped,
        done: !!game.outcome,
        at: Date.now(),
    } satisfies SavedGame);
}

export function clearSavedGame(): void
{
    try { localStorage.removeItem(GAME_KEY); } catch { /* nothing to clear */ }
}

export function savedGame(): SavedGame | null
{
    const saved = readJson<SavedGame | null>(GAME_KEY, null);
    if (!saved || !Array.isArray(saved.moves) || saved.done) return null;
    return saved;
}

/** Rebuild a saved game by replaying its moves. Null when the save is stale or corrupt. */
export function restoreGame(saved: SavedGame): Game | null
{
    let game: Game;
    try
    {
        game = createGame(saved.config, saved.startFen, saved.human);
    }
    catch
    {
        return null;
    }
    for (const uci of saved.moves)
    {
        const move = fromUci(currentPosition(game), uci);
        if (!move) return null;
        applyMove(game, move);
    }
    game.clocks = { ...saved.clocks };
    game.flipped = !!saved.flipped;
    game.outcome = null;
    return game;
}

/** Which side has more material, in pawns, and how many. */
export const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function resultLabel(game: Game): string
{
    if (!game.outcome) return '';
    return game.outcome.title;
}

/** The game as PGN, for the copy button. */
export function toPgn(game: Game): string
{
    const date = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
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
    const parts: string[] = [];
    game.plies.forEach((ply, i) =>
    {
        if (i % 2 === 0) parts.push(`${i / 2 + 1}.`);
        parts.push(ply.san);
    });
    if (result !== '*') parts.push(result);
    return lines.concat(parts.join(' ')).join('\n');
}
