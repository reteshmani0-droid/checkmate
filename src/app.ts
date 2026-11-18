/**
 * The game's screens and everything the player touches.
 *
 * One state object, one render pass: every handler changes something in `state` and then calls
 * `render()`. That keeps selection, review, the bot's turn and the clock from ever disagreeing.
 */
import {
    type Clocks,
    type Config,
    type Game,
    type Settings,
    type Side,
    applyMove,
    canUndo,
    clearSavedGame,
    createGame,
    currentIds,
    currentPosition,
    flag,
    isHumanTurn,
    lastMove,
    loadConfig,
    loadSettings,
    loadStats,
    recordResult,
    resign,
    restoreGame,
    saveConfig,
    saveGame,
    saveSettings,
    savedGame,
    toPgn,
    turn,
    undo,
} from './game.js';
import {
    type Move,
    type PieceType,
    type Position,
    clonePosition,
    fromUci,
    hasLegalMove,
    inCheck,
    legalMovesFrom,
    makeMove,
    other,
    positionFromFen,
    START_FEN,
    toFen,
    toSan,
    toUci,
} from './rules.js';
import { chooseMove, hintMove, type BotLevel } from './bot.js';
import { createRng } from './rng.js';
import { makeCode, host, guest, type Connection, type NetMessage } from './net.js';
import { LEVELS, THEMES, TIME_CONTROLS, applyTheme, themeOf } from './themes.js';
import { Board } from './board.js';
import { pieceSvg } from './piece-art.js';
import { icon, type IconName } from './icons.js';
import { play, setSound, unlockAudio, type SfxName } from './sound.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
{
    const el = document.getElementById(id);
    if (!el) throw new Error(`missing #${id}`);
    return el as T;
};

type Screen = 'home' | 'game';

const state = {
    screen: 'home' as Screen,
    settings: loadSettings(),
    config: loadConfig(),
    game: createGame(loadConfig()),
    selected: null as number | null,
    targets: [] as Move[],
    /** a ply index while reviewing, null while the game is live */
    review: null as number | null,
    thinking: false,
    dialogOpen: false,
    botToken: 0,
    resultShown: false,
    recorded: false,
    evalCp: 0,
    lastSearch: null as { depth: number; nodes: number; score: number; ms: number } | null,
    /** online-play state */
    online: {
        role: null as 'host' | 'guest' | null,
        code: null as string | null,
        connection: null as Connection | null,
        handle: null as { peer: any; cancel: () => void } | null,
        disconnected: false,
        waiting: false,
    },
};

/* ------------------------------------------------------------------ worker */

type BotReply = { uci: string | null; depth?: number; nodes?: number; score?: number; ms?: number };

let worker: Worker | null = null;
let workerBroken = false;
let workerSeq = 0;
const pending = new Map<number, (reply: BotReply) => void>();

function ensureWorker(): Worker | null
{
    if (worker || workerBroken) return worker;
    try
    {
        worker = new Worker(new URL('./bot-worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<{ id: number; uci: string | null; depth?: number; nodes?: number; score?: number; ms?: number }>): void =>
        {
            const resolve = pending.get(event.data.id);
            if (!resolve) return;
            pending.delete(event.data.id);
            resolve({ uci: event.data.uci ?? null, depth: event.data.depth, nodes: event.data.nodes, score: event.data.score, ms: event.data.ms });
        };
        worker.onerror = (): void =>
        {
            workerBroken = true;
            worker = null;
            for (const resolve of pending.values()) resolve({ uci: null });
            pending.clear();
        };
    }
    catch
    {
        workerBroken = true;
        worker = null;
    }
    return worker;
}

/** Ask the bot for a move (or a hint) without blocking the board. */
function askBot(kind: 'move' | 'hint', fen: string, level: BotLevel = 1): Promise<BotReply>
{
    const w = ensureWorker();
    if (w)
    {
        return new Promise<BotReply>(resolve =>
        {
            const id = ++workerSeq;
            let settled = false;
            const settle = (reply: BotReply): void =>
            {
                if (settled) return;
                settled = true;
                window.clearTimeout(guard);
                pending.delete(id);
                resolve(reply);
            };
            const guard = window.setTimeout(() =>
            {
                settle(searchInline(kind, fen, level));
            }, 12000);
            pending.set(id, reply => settle(reply));
            w.postMessage({ id, kind, fen, level, seed: (Math.random() * 1e9) | 0 });
        });
    }
    return Promise.resolve(searchInline(kind, fen, level));
}

/** The same search on this thread, for when a worker cannot start. */
function searchInline(kind: 'move' | 'hint', fen: string, level: BotLevel): BotReply
{
    const started = performance.now();
    try
    {
        const pos = positionFromFen(fen);
        if (kind === 'hint')
        {
            const move = hintMove(pos);
            return { uci: move ? toUci(move) : null, ms: performance.now() - started };
        }
        const choice = chooseMove(pos, level, createRng((Math.random() * 1e9) | 0));
        return { uci: choice ? toUci(choice.move) : null, depth: choice?.depth, nodes: choice?.nodes, score: choice?.score, ms: performance.now() - started };
    }
    catch
    {
        return { uci: null, ms: performance.now() - started };
    }
}

/* ------------------------------------------------------------------ board */

const board = new Board({
    canPick: sq =>
    {
        if (!interactive()) return false;
        const piece = currentPosition(state.game).board[sq];
        return !!piece && piece.c === turn(state.game);
    },
    onTap: sq => onTap(sq),
    onDrop: (from, to) => onDrop(from, to),
});

function interactive(): boolean
{
    return state.screen === 'game'
        && state.review === null
        && !state.game.outcome
        && !state.thinking
        && !state.dialogOpen
        && isHumanTurn(state.game);
}

/* ------------------------------------------------------------------ helpers */

const sideName = (side: Side): string => (side === 'w' ? 'White' : 'Black');
const sideValue: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function formatClock(seconds: number): string
{
    const safe = Math.max(0, seconds);
    if (safe < 20)
    {
        const whole = Math.floor(safe);
        const tenth = Math.floor((safe - whole) * 10);
        return `0:${String(whole).padStart(2, '0')}.${tenth}`;
    }
    const total = Math.ceil(safe);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function resultSentence(game: Game): string
{
    if (!game.outcome) return '';
    return game.outcome.detail || game.outcome.title;
}

function outcomeIsWin(game: Game): boolean
{
    return !!game.outcome?.winner && game.outcome.winner === game.human;
}

function outcomeIsLoss(game: Game): boolean
{
    return !!game.outcome?.winner && game.outcome.winner !== game.human;
}

function evaluateSound(move: Move, check: boolean): SfxName
{
    if (move.promo) return 'promote';
    if (move.castle) return 'castle';
    if (move.capture) return 'capture';
    if (check) return 'check';
    return 'move';
}

/* ------------------------------------------------------------------ render */

function applySettings(): void
{
    applyTheme(themeOf(state.settings.theme));
    setSound(state.settings.sound);
    document.documentElement.dataset.coords = state.settings.coordinates ? 'on' : 'off';
    const evalBar = document.getElementById('evalBar');
    if (evalBar) evalBar.hidden = !state.settings.coach && !state.settings.debug;
    const debug = document.getElementById('debugPanel');
    if (debug) debug.hidden = !state.settings.debug;
}

function showScreen(screen: Screen): void
{
    state.screen = screen;
    document.body.dataset.screen = screen;
    $('homeScreen').hidden = screen !== 'home';
    $('gameScreen').hidden = screen !== 'game';
    if (screen === 'home') renderHome();
    else render();
}

function render(): void
{
    const game = state.game;
    applySettings();

    $('modeLabel').textContent = game.config.mode === 'bot'
        ? `Bot · ${LEVELS[game.config.level - 1].name}`
        : game.config.mode === 'online'
            ? 'Online'
            : 'Pass & play';

    renderStatus();
    renderSeats();
    renderBoard();
    renderClocks();
    renderControls();
    renderMoveList();
    renderDebug();
}

function renderStatus(): void
{
    const game = state.game;
    const status = $('statusLine');
    let text: string;
    let tone = '';

    if (state.review !== null)
    {
        text = `Reviewing · ${game.plies[state.review].san}`;
        tone = 'review';
    }
    else if (game.outcome)
    {
        text = game.outcome.winner === 'w' ? 'White wins' : game.outcome.winner === 'b' ? 'Black wins' : 'Draw';
        tone = 'over';
    }
    else if (state.thinking) text = 'Thinking…';
    else if (game.config.mode === 'bot')
    {
        const checked = inCheck(currentPosition(game));
        text = isHumanTurn(game) ? (checked ? 'Your move · you are in check' : 'Your move') : 'Waiting for the bot';
    }
    else
    {
        const checked = inCheck(currentPosition(game));
        text = checked ? `Check · ${sideName(turn(game))} to move` : `${sideName(turn(game))} to move`;
    }

    status.textContent = text;
    status.dataset.tone = tone;
}

function renderBoard(): void
{
    const game = state.game;
    const pos = state.review === null ? currentPosition(game) : game.plies[state.review].pos;
    const ids = state.review === null ? currentIds(game) : game.plies[state.review].ids;
    const last = state.review === null ? lastMove(game) : game.plies[state.review].move;
    const checked = inCheck(pos) ? pos.kings[pos.turn] : null;

    board.draw({
        pos,
        ids,
        flipped: game.flipped,
        last,
        selected: state.selected,
        targets: state.targets,
        check: checked,
        hint: game.hint,
        theme: themeOf(state.settings.theme),
        coordinates: state.settings.coordinates,
        interactive: interactive(),
    });
}

function capturedFor(game: Game, side: Side): PieceType[]
{
    const pos = state.review === null ? currentPosition(game) : game.plies[state.review].pos;
    const lost: Record<Side, PieceType[]> = { w: [], b: [] };
    const start: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
    const live: Record<Side, Record<PieceType, number>> = {
        w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
        b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    };
    for (const piece of pos.board) if (piece) live[piece.c][piece.t]++;
    for (const colour of ['w', 'b'] as Side[])
    {
        for (const type of ['q', 'r', 'b', 'n', 'p'] as PieceType[])
        {
            for (let i = 0; i < start[type] - live[colour][type]; i++) lost[colour].push(type);
        }
    }
    // The pieces this side has taken are the ones the other side lost.
    return lost[other(side)];
}

function materialLead(game: Game): number
{
    const pos = state.review === null ? currentPosition(game) : game.plies[state.review].pos;
    let score = 0;
    for (const piece of pos.board) if (piece) score += (piece.c === 'w' ? 1 : -1) * sideValue[piece.t];
    return score;
}

function seatName(game: Game, side: Side): { name: string; meta: string }
{
    if (game.config.mode === 'friend')
    {
        return { name: sideName(side), meta: turn(game) === side ? 'To move' : 'Waiting' };
    }
    if (game.config.mode === 'online')
    {
        if (side === game.human) return { name: 'You', meta: 'Playing ' + sideName(side) };
        return { name: 'Opponent', meta: 'Playing ' + sideName(side) };
    }
    if (side === game.human) return { name: 'You', meta: 'Playing ' + sideName(side) };
    const level = LEVELS[game.config.level - 1];
    return { name: `Bot · ${level.name}`, meta: `Level ${level.level} · ${level.rating}` };
}

function displayClocks(game: Game): Clocks
{
    if (state.review !== null && game.plies[state.review]) return game.plies[state.review].clocks;
    return game.clocks;
}

function renderSeats(): void
{
    const game = state.game;
    const bottom: Side = game.flipped ? 'b' : 'w';
    const top = other(bottom);
    $('seatTop').innerHTML = seatHtml(top, game);
    $('seatBottom').innerHTML = seatHtml(bottom, game);
    clockCache.w = '';
    clockCache.b = '';
    renderClocks();
}

function seatHtml(side: Side, game: Game): string
{
    const { name, meta } = seatName(game, side);
    const taken = capturedFor(game, side);
    const lead = materialLead(game) * (side === 'w' ? 1 : -1);
    const active = !game.outcome && state.review === null && turn(game) === side;
    const thinking = state.thinking && game.config.mode === 'bot' && side !== game.human;
    const clocks = displayClocks(game);
    const takenHtml = taken
        .map(type => `<span class="taken__piece" title="${type}">${pieceSvg(other(side) + type)}</span>`)
        .join('');

    return `<div class="seat ${active ? 'seat--active' : ''}" data-side="${side}">
        <div class="seat__avatar">${game.config.mode === 'bot' && side !== game.human ? icon('robot', 22) : pieceSvg(side + 'n')}</div>
        <div class="seat__who">
            <div class="seat__line">
                <span class="seat__name">${name}</span>
                ${lead > 0 ? `<span class="seat__lead">+${lead}</span>` : ''}
            </div>
            <div class="seat__meta">${thinking ? '<span class="thinking">thinking<span>.</span><span>.</span><span>.</span></span>' : meta}</div>
            <div class="seat__taken">${takenHtml}</div>
        </div>
        ${game.config.minutes === 0 ? '' : `<div class="clock ${active ? 'clock--active' : ''}" data-clock="${side}">
            <span class="clock__time">${formatClock(clocks[side])}</span>
        </div>`}
    </div>`;
}

const clockCache: Record<Side, string> = { w: '', b: '' };

function renderEvalBar(): void
{
    const fill = document.getElementById('evalFill');
    const label = document.getElementById('evalLabel');
    if (!fill) return;
    const cp = Math.max(-800, Math.min(800, state.evalCp));
    const pct = 50 + (cp / 800) * 40;
    fill.style.height = `${pct}%`;
    if (label) label.textContent = `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
}

function renderDebug(): void
{
    const panel = document.getElementById('debugPanel');
    if (!panel) return;
    panel.hidden = !state.settings.debug;
    const ls = state.lastSearch;
    if (ls)
    {
        const d = document.getElementById('dbgDepth'); if (d) d.textContent = String(ls.depth);
        const n = document.getElementById('dbgNodes'); if (n) n.textContent = ls.nodes.toLocaleString();
        const s = document.getElementById('dbgScore'); if (s) s.textContent = (ls.score / 100).toFixed(2);
        const m = document.getElementById('dbgMs'); if (m) m.textContent = ls.ms.toFixed(0);
    }
}

function renderClocks(): void
{
    const game = state.game;
    const clocks = displayClocks(game);
    for (const side of ['w', 'b'] as Side[])
    {
        const el = document.querySelector<HTMLElement>(`.clock[data-clock="${side}"]`);
        if (!el) continue;
        const text = game.config.minutes === 0 ? '∞' : formatClock(clocks[side]);
        const low = game.config.minutes > 0 && clocks[side] <= 20;
        const critical = game.config.minutes > 0 && clocks[side] <= 10;
        const key = `${text}|${low}|${critical}|${game.config.minutes === 0}`;
        if (clockCache[side] === key) continue;
        clockCache[side] = key;
        const time = el.querySelector<HTMLElement>('.clock__time');
        if (time) time.textContent = text;
        el.classList.toggle('clock--low', low);
        el.classList.toggle('clock--critical', critical);
        el.classList.toggle('clock--off', game.config.minutes === 0);
    }
}

function renderControls(): void
{
    const game = state.game;
    const buttons = [
        { id: 'undoBtn', label: 'Undo', icon: 'undo', enabled: canUndo(game) && !state.thinking },
        { id: 'hintBtn', label: 'Hint', icon: 'bulb', enabled: interactive() },
        { id: 'flipBtn', label: 'Flip', icon: 'flip', enabled: true },
        { id: 'resignBtn', label: 'Resign', icon: 'flag', enabled: !game.outcome },
    ] as const;

    for (const button of buttons)
    {
        const el = document.getElementById(button.id) as HTMLButtonElement | null;
        if (!el) continue;
        el.disabled = !button.enabled;
    }

    const review = $('reviewBar');
    if (state.review === null)
    {
        review.hidden = true;
    }
    else
    {
        review.hidden = false;
        const ply = game.plies[state.review];
        const total = Math.ceil(game.plies.length / 2);
        $('reviewText').textContent = `${ply.san} · move ${Math.floor(state.review / 2) + 1} of ${total}`;
    }
}

function renderMoveList(): void
{
    const game = state.game;
    const list = $('moveList');
    const rows: string[] = [];
    const active = state.review;

    for (let i = 0; i < game.plies.length; i += 2)
    {
        const white = game.plies[i];
        const black = game.plies[i + 1];
        rows.push(`<li class="moverow">
            <span class="moverow__num">${i / 2 + 1}.</span>
            <button class="san ${active === i ? 'san--active' : ''}" data-ply="${i}">${white.san}</button>
            ${black ? `<button class="san ${active === i + 1 ? 'san--active' : ''}" data-ply="${i + 1}">${black.san}</button>` : '<span class="san san--empty"></span>'}
        </li>`);
    }

    list.innerHTML = rows.join('') || '<li class="moves__empty">The moves will appear here.</li>';
    if (active === null || active >= game.plies.length - 1) list.scrollTop = list.scrollHeight;

    for (const button of list.querySelectorAll<HTMLButtonElement>('.san[data-ply]'))
    {
        button.addEventListener('click', () =>
        {
            const ply = Number(button.dataset.ply);
            setReview(state.review === ply ? null : ply);
        });
    }

    const banner = $('resultBanner');
    if (game.outcome)
    {
        banner.hidden = false;
        banner.dataset.tone = outcomeIsWin(game) ? 'win' : outcomeIsLoss(game) ? 'loss' : 'draw';
        banner.innerHTML = `<span class="resultbanner__title">${game.outcome.title}</span>
            <span class="resultbanner__detail">${resultSentence(game)}</span>
            <button class="btn btn--primary btn--sm" id="rematchBanner">Rematch</button>`;
        $('rematchBanner').addEventListener('click', () => rematch());
    }
    else
    {
        banner.hidden = true;
        banner.innerHTML = '';
    }
}

/* ------------------------------------------------------------------ home */

function renderHome(): void
{
    applySettings();
    const config = state.config;

    for (const button of document.querySelectorAll<HTMLButtonElement>('#modeSeg [data-mode]'))
    {
        button.classList.toggle('is-on', button.dataset.mode === config.mode);
        button.setAttribute('aria-selected', String(button.dataset.mode === config.mode));
    }
    $('botOptions').hidden = config.mode !== 'bot';
    $('friendOptions').hidden = config.mode !== 'friend';
    $('onlineOptions').hidden = config.mode !== 'online';

    $('levelCards').innerHTML = LEVELS.map(level => `
        <button class="level ${config.level === level.level ? 'is-on' : ''}" data-level="${level.level}">
            <span class="level__badge">${level.level}</span>
            <span class="level__name">${level.name}</span>
            <span class="level__blurb">${level.blurb}</span>
            <span class="level__rating">${level.rating}</span>
        </button>`).join('');

    for (const button of $('levelCards').querySelectorAll<HTMLButtonElement>('[data-level]'))
    {
        button.addEventListener('click', () =>
        {
            state.config.level = Number(button.dataset.level) as BotLevel;
            saveConfig(state.config);
            play('click');
            renderHome();
        });
    }

    for (const button of document.querySelectorAll<HTMLButtonElement>('#sideSeg [data-side]'))
    {
        button.classList.toggle('is-on', button.dataset.side === config.side);
    }

    $('timeChips').innerHTML = TIME_CONTROLS.map(time => `
        <button class="chip ${config.minutes === time.minutes ? 'is-on' : ''}" data-minutes="${time.minutes}">
            <span class="chip__label">${time.label}</span>
            <span class="chip__sub">${time.sub}</span>
        </button>`).join('');

    for (const button of $('timeChips').querySelectorAll<HTMLButtonElement>('[data-minutes]'))
    {
        button.addEventListener('click', () =>
        {
            state.config.minutes = Number(button.dataset.minutes);
            saveConfig(state.config);
            play('click');
            renderHome();
        });
    }

    ($<HTMLInputElement>('autoFlipSwitch')).checked = config.autoFlip;
    const slider = $<HTMLInputElement>('levelSlider');
    if (slider) { slider.value = String(config.level); }

    $('themeRow').innerHTML = THEMES.map(theme => `
        <button class="theme-dot ${state.settings.theme === theme.id ? 'is-on' : ''}" data-theme="${theme.id}"
            title="${theme.name}" aria-label="${theme.name} board">
            <span style="background:${theme.light}"></span><span style="background:${theme.dark}"></span>
        </button>`).join('');

    for (const button of $('themeRow').querySelectorAll<HTMLButtonElement>('[data-theme]'))
    {
        button.addEventListener('click', () =>
        {
            state.settings.theme = button.dataset.theme as Settings['theme'];
            saveSettings(state.settings);
            play('click');
            renderHome();
        });
    }

    $('soundToggle').innerHTML = icon(state.settings.sound ? 'sound' : 'mute');
    $('soundToggle').classList.toggle('is-off', !state.settings.sound);

    const saved = savedGame();
    const resume = $<HTMLButtonElement>('resumeBtn');
    resume.hidden = !saved;
    if (saved)
    {
        const label = saved.config.mode === 'bot' ? 'Bot game' : 'Pass & play';
        resume.innerHTML = `${icon('play', 18)}<span>Continue ${label} · ${Math.ceil(saved.moves.length / 2)} move${saved.moves.length > 2 ? 's' : ''}</span>`;
    }

    const stats = loadStats();
    $('statsLine').textContent = stats.games
        ? `${stats.games} game${stats.games === 1 ? '' : 's'} · ${stats.wins} won · ${stats.draws} drawn · ${stats.losses} lost`
        : 'Full rules: castling, en passant, promotion, and every way a game can end.';
}

/* ------------------------------------------------------------------ game flow */

function resetGameFlags(): void
{
    state.selected = null;
    state.targets = [];
    state.review = null;
    state.thinking = false;
    state.resultShown = false;
    state.recorded = false;
    state.botToken++;
}

let onlinePingTimer: number | null = null;
let onlineWatchdog: number | null = null;

function clearOnlineTimers(): void
{
    if (onlinePingTimer !== null) { window.clearInterval(onlinePingTimer); onlinePingTimer = null; }
    if (onlineWatchdog !== null) { window.clearTimeout(onlineWatchdog); onlineWatchdog = null; }
}

function resetOnlineWatchdog(): void
{
    if (onlineWatchdog !== null) window.clearTimeout(onlineWatchdog);
    onlineWatchdog = window.setTimeout(() => markDisconnected(), 12000);
}

function cleanupOnline(): void
{
    clearOnlineTimers();
    try { state.online.connection?.close(); } catch { /* ignore */ }
    try { state.online.handle?.cancel(); } catch { /* ignore */ }
    state.online.role = null;
    state.online.code = null;
    state.online.connection = null;
    state.online.handle = null;
    state.online.disconnected = false;
    state.online.waiting = false;
}

function startGame(config: Config): void
{
    state.config = { ...config };
    saveConfig(state.config);
    state.game = createGame(state.config);
    resetGameFlags();
    closeDialog();
    showScreen('game');
    maybeBotMove();
}

function rematch(): void
{
    closeDialog();
    if (state.game.config.mode === 'online') { onlineRematch(); return; }
    startGame(state.game.config);
}

function startOnlineGame(humanSide: 'w' | 'b', minutes: number): void
{
    const config: Config = { mode: 'online', level: 2, side: humanSide, minutes, autoFlip: false };
    state.config = { ...config };
    state.game = createGame(config, START_FEN, humanSide);
    state.game.flipped = humanSide === 'b';
    resetGameFlags();
    clearOnlineTimers();
    resetOnlineWatchdog();
    onlinePingTimer = window.setInterval(() =>
    {
        const conn = state.online.connection;
        if (conn && !state.online.disconnected) conn.send({ t: 'ping' });
    }, 4000);
    closeDialog();
    showScreen('game');
    render();
}

function handleNetMessage(message: NetMessage): void
{
    resetOnlineWatchdog();
    if (message.t === 'ping') return;
    if (message.t === 'hello')
    {
        const hostSide = message.hostSide;
        const humanSide: 'w' | 'b' = hostSide === 'w' ? 'b' : 'w';
        startOnlineGame(humanSide, message.minutes);
        return;
    }

    const game = state.game;
    if (!game || game.config.mode !== 'online') return;

    if (message.t === 'move')
    {
        if (game.outcome) return;
        const move = fromUci(currentPosition(game), message.uci);
        if (!move) return;
        // sync mover's clock
        const mover: 'w' | 'b' = move.c;
        game.clocks[mover] = message.clocks[mover];
        commitMove(move, true, true);
        return;
    }

    if (message.t === 'resign')
    {
        if (game.outcome) return;
        const loser: 'w' | 'b' = other(game.human) as 'w' | 'b';
        resign(game, loser);
        render();
        finish();
        return;
    }

    if (message.t === 'flag')
    {
        if (game.outcome) return;
        flag(game, message.loser);
        render();
        finish();
        return;
    }

    if (message.t === 'rematch')
    {
        onlineDoRematch();
        return;
    }

    if (message.t === 'bye')
    {
        state.online.disconnected = true;
        toast('Opponent left the game');
        return;
    }
}

function handleNetClose(): void { markDisconnected(); }

function markDisconnected(): void
{
    clearOnlineTimers();
    if (state.game?.config.mode === 'online' && !state.online.disconnected)
    {
        state.online.disconnected = true;
        toast('Opponent disconnected');
    }
}

function handleNetError(error: string): void
{
    /* ignore */
    if (error.toLowerCase().includes('unavailable') || error.toLowerCase().includes('taken'))
    {
        toast('That code is not available. Try again.');
        cleanupOnline();
        showScreen('home');
        return;
    }
    // connection dropped
    if (state.online.connection)
    {
        markDisconnected();
    }
}

function onlineRematch(): void
{
    const conn = state.online.connection;
    if (conn) conn.send({ t: 'rematch' });
    onlineDoRematch();
}

function onlineDoRematch(): void
{
    const game = state.game;
    const minutes = game.config.minutes;
    const humanSide: 'w' | 'b' = game.human === 'w' ? 'b' : 'w';
    const config: Config = { mode: 'online', level: 2, side: humanSide, minutes, autoFlip: false };
    state.config = { ...config };
    state.game = createGame(config, START_FEN, humanSide);
    state.game.flipped = humanSide === 'b';
    resetGameFlags();
    showScreen('game');
    render();
}

function sendOnlineMove(move: Move): void
{
    const conn = state.online.connection;
    if (!conn) return;
    const game = state.game;
    conn.send({ t: 'move', uci: toUci(move), clocks: { ...game.clocks } });
}

function openCreateGame(): void
{
    const config = state.config;
    const dialog = openDialog(`
        ${dialogHeader('Create a game', 'Choose a time control, then share the code with a friend.')}
        <div class="online__create">
            <div class="field">
                <span class="label">Time</span>
                <div class="chips" id="onlineTimeChips"></div>
            </div>
            <div class="field">
                <span class="label">You play</span>
                <div class="seg seg--sm" id="onlineSideSeg" role="tablist">
                    <button class="seg__item" data-side="w" role="tab">White</button>
                    <button class="seg__item" data-side="b" role="tab">Black</button>
                    <button class="seg__item" data-side="random" role="tab">Random</button>
                </div>
            </div>
            <button class="btn btn--primary btn--block btn--lg" id="createConfirm">Create</button>
        </div>`, { dimissible: true });

    const timeHost = dialog.querySelector<HTMLElement>('#onlineTimeChips')!;
    const controls = [0, 1, 3, 5, 10, 15];
    const labels: Record<number, string> = { 0: 'No clock', 1: '1 min', 3: '3 min', 5: '5 min', 10: '10 min', 15: '15 min' };
    timeHost.innerHTML = controls.map(m => `<button class="chip ${config.minutes === m ? 'is-on' : ''}" data-minutes="${m}"><span class="chip__label">${labels[m]}</span></button>`).join('');
    for (const button of timeHost.querySelectorAll<HTMLButtonElement>('[data-minutes]'))
    {
        button.addEventListener('click', () =>
        {
            config.minutes = Number(button.dataset.minutes);
            for (const b of timeHost.querySelectorAll('.chip')) b.classList.toggle('is-on', b === button);
        });
    }
    const sideSeg = dialog.querySelector<HTMLElement>('#onlineSideSeg')!;
    let chosenSide: 'w' | 'b' | 'random' = config.side === 'b' || config.side === 'random' ? config.side : 'w';
    for (const button of sideSeg.querySelectorAll<HTMLButtonElement>('[data-side]'))
    {
        button.classList.toggle('is-on', button.dataset.side === chosenSide);
        button.addEventListener('click', () =>
        {
            chosenSide = button.dataset.side as 'w' | 'b' | 'random';
            for (const b of sideSeg.querySelectorAll('.seg__item')) b.classList.toggle('is-on', b === button);
        });
    }

    dialog.querySelector('#createConfirm')?.addEventListener('click', () =>
    {
        closeDialog();
        startHosting(chosenSide, config.minutes);
    });
}

function startHosting(sideChoice: 'w' | 'b' | 'random', minutes: number): void
{
    cleanupOnline();
    const code = makeCode();
    state.online.role = 'host';
    state.online.code = code;
    state.online.waiting = true;

    const side: 'w' | 'b' = sideChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : sideChoice;

    const handle = host(code, {
        onOpen: (connection) =>
        {
            state.online.connection = connection;
            state.online.waiting = false;
            window.setTimeout(() =>
            {
                connection.send({ t: 'hello', minutes, hostSide: side });
                startOnlineGame(side, minutes);
                try { closeDialog(); } catch { /* ignore */ }
            }, 200);
        },
        onMessage: message => handleNetMessage(message),
        onClose: () => handleNetClose(),
        onError: error => handleNetError(error),
    });
    state.online.handle = handle;

    const link = `${location.origin}${location.pathname}?room=${code}`;
    const dialog = openDialog(`
        ${dialogHeader('Waiting for a friend', 'Share this code or link. The game starts when they join.')}
        <div class="online__wait">
            <div class="online__code">${code}</div>
            <button class="btn btn--subtle btn--block" id="copyCodeBtn">Copy link</button>
            <button class="btn btn--ghost btn--block" id="cancelHostBtn">Cancel</button>
        </div>`, { dimissible: false });

    dialog.querySelector('#copyCodeBtn')?.addEventListener('click', () => copyText(link, 'Link copied'));
    dialog.querySelector('#cancelHostBtn')?.addEventListener('click', () =>
    {
        cleanupOnline();
        closeDialog();
        showScreen('home');
    });
}

function continueSaved(): void
{
    const saved = savedGame();
    if (!saved) return;
    const game = restoreGame(saved);
    if (!game)
    {
        clearSavedGame();
        renderHome();
        return;
    }
    state.config = { ...game.config };
    state.game = game;
    resetGameFlags();
    closeDialog();
    showScreen('game');
    maybeBotMove();
}

function setReview(index: number | null): void
{
    state.review = index;
    state.selected = null;
    state.targets = [];
    render();
}

function selectSquare(sq: number): void
{
    state.selected = sq;
    state.targets = legalMovesFrom(currentPosition(state.game), sq);
    render();
    renderBoard();
}

function deselect(): void
{
    state.selected = null;
    state.targets = [];
    renderBoard();
    renderControls();
}

function onTap(sq: number): void
{
    if (state.review !== null)
    {
        setReview(null);
        return;
    }
    if (!interactive()) return;

    const game = state.game;
    const pos = currentPosition(game);
    const piece = pos.board[sq];

    if (state.selected !== null)
    {
        const options = state.targets.filter(move => move.to === sq);
        if (options.length > 1)
        {
            openPromotion(options);
            return;
        }
        if (options.length === 1)
        {
            commitMove(options[0], false);
            return;
        }
        if (sq === state.selected)
        {
            deselect();
            return;
        }
        if (piece && piece.c === pos.turn)
        {
            selectSquare(sq);
            return;
        }
        play('illegal');
        board.bump(sq);
        return;
    }

    if (piece && piece.c === pos.turn) selectSquare(sq);
}

function onDrop(from: number, to: number): void
{
    if (state.review !== null || !interactive()) return;
    if (state.selected !== from)
    {
        const pos = currentPosition(state.game);
        const piece = pos.board[from];
        if (!piece || piece.c !== pos.turn) return;
        selectSquare(from);
    }
    onTap(to);
}

/** Play a move: rules, sound, save, then whoever moves next. */
function commitMove(move: Move, byBot: boolean, remote = false): void
{
    const game = state.game;
    const before = currentPosition(game);
    const after = clonePosition(before);
    makeMove(after, move);
    const checked = inCheck(after);
    const mate = checked && !hasLegalMove(after);

    applyMove(game, move);
    state.selected = null;
    state.targets = [];
    state.review = null;

    if (remote) play(evaluateSound(move, checked && !mate));
    else if (!byBot) play(evaluateSound(move, checked && !mate));
    else if (move.capture || move.promo) play(evaluateSound(move, false));

    render();
    if (game.outcome) finish();
    else
    {
        if (game.config.mode !== 'online') saveGame(game);
        if (game.config.mode === 'online' && !byBot && !remote) sendOnlineMove(move);
        if ((!byBot || game.config.mode === 'friend') && game.config.mode !== 'online') maybeBotMove();
    }

    if (!byBot && !remote && state.settings.coach && game.config.mode !== 'online')
    {
        void runCoach(before, move, game);
    }
}

async function runCoach(before: Position, played: Move, game: Game): Promise<void>
{
    try
    {
        const level = Math.min(game.config.level, 3) as BotLevel;
        const rng = createRng(1);
        const bestChoice = chooseMove(before, level, rng);
        const bestUci = bestChoice ? toUci(bestChoice.move) : null;
        const bestScore = bestChoice ? bestChoice.score : 0;

        const after = clonePosition(before);
        makeMove(after, played);
        const oppChoice = chooseMove(after, level, createRng(2));
        const playedScore = oppChoice ? -oppChoice.score : 0;

        const diff = bestScore - playedScore;

        let label: string;
        if (bestUci && toUci(played) === bestUci) label = 'Best move';
        else if (diff <= 40) label = 'Good move';
        else if (diff <= 120) label = 'Inaccuracy';
        else if (diff <= 300) label = 'Mistake';
        else label = 'Blunder';

        let bestText = '';
        if (bestUci && toUci(played) !== bestUci)
        {
            const bestMove = fromUci(before, bestUci);
            if (bestMove) bestText = ` · best was ${toSan(before, bestMove)}`;
        }

        const evalText = `${playedScore >= 0 ? '+' : ''}${(playedScore / 100).toFixed(1)}`;
        toast(`${label}${bestText} (${evalText})`);

        state.evalCp = playedScore;
        renderEvalBar();
    }
    catch
    {
        /* ignore */
    }
}

function finish(): void
{
    const game = state.game;
    if (!game.outcome) return;
    clearSavedGame();
    if (!state.recorded && game.config.mode === 'bot')
    {
        state.recorded = true;
        recordResult(game);
    }
    window.setTimeout(() =>
    {
        if (state.game !== game || game.outcome === null || state.resultShown) return;
        if (outcomeIsWin(game)) play('win');
        else if (outcomeIsLoss(game)) play('lose');
        else play('draw');
        state.resultShown = true;
        openResult();
    }, 620);
}

function maybeBotMove(): void
{
    const game = state.game;
    if (game.config.mode !== 'bot' || game.outcome || isHumanTurn(game) || state.thinking) return;
    if (state.screen !== 'game') return;

    const token = ++state.botToken;
    state.thinking = true;
    renderStatus();
    renderSeats();
    renderControls();

    const fen = toFen(currentPosition(game));
    const level = game.config.level;
    const started = performance.now();

    void askBot('move', fen, level).then(reply =>
    {
        const uci = reply.uci;
        state.lastSearch = { depth: reply.depth ?? 0, nodes: reply.nodes ?? 0, score: reply.score ?? 0, ms: reply.ms ?? 0 };
        const elapsed = performance.now() - started;
        const base = 320 + Math.random() * 620 + state.game.config.level * 90;
        const wait = Math.max(260, base - elapsed);
        window.setTimeout(() =>
        {
            if (token !== state.botToken || state.screen !== 'game') return;
            state.thinking = false;
            if (!uci)
            {
                render();
                return;
            }
            const move = fromUci(currentPosition(state.game), uci);
            if (!move)
            {
                render();
                return;
            }
            commitMove(move, true);
        }, wait);
    });
}

/* ------------------------------------------------------------------ clock */

let lastFrame = performance.now();

function tick(now: number): void
{
    const delta = Math.min(0.5, (now - lastFrame) / 1000);
    lastFrame = now;
    const game = state.game;

    const running = state.screen === 'game'
        && !game.outcome
        && !state.dialogOpen
        && state.review === null
        && game.config.minutes > 0
        && game.plies.length > 0;

    if (running)
    {
        const side = turn(game);
        game.clocks[side] = Math.max(0, game.clocks[side] - delta);
        renderClocks();
        if (game.clocks[side] <= 0)
        {
            flag(game, side);
            render();
            finish();
            if (game.config.mode === 'online')
            {
                const conn = state.online.connection;
                if (conn) conn.send({ t: 'flag', loser: side });
            }
        }
    }
    requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ dialogs */

const overlay = $('overlay');

function openDialog(html: string, options: { dimissible?: boolean; onClose?: () => void } = {}): HTMLElement
{
    state.dialogOpen = true;
    overlay.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">${html}</div>`;
    overlay.hidden = false;
    requestAnimationFrame(() =>
    {
        overlay.classList.add('is-open');
        const focus = overlay.querySelector<HTMLElement>('button, [href], input');
        focus?.focus();
    });
    overlay.dataset.dismissible = options.dimissible === false ? 'no' : 'yes';
    overlay.onclick = event =>
    {
        if (event.target === overlay && overlay.dataset.dismissible === 'yes') closeDialog(options.onClose);
    };
    requestAnimationFrame(() => renderBoard());
    return overlay.firstElementChild as HTMLElement;
}

function closeDialog(onClose?: () => void): void
{
    const wasOpen = state.dialogOpen;
    state.dialogOpen = false;
    overlay.classList.remove('is-open');
    overlay.hidden = true;
    overlay.innerHTML = '';
    if (wasOpen && onClose) onClose();
    if (wasOpen) render();
}

function dialogHeader(title: string, subtitle = ''): string
{
    return `<div class="dialog__head">
        <h2 class="dialog__title">${title}</h2>
        ${subtitle ? `<p class="dialog__sub">${subtitle}</p>` : ''}
    </div>`;
}

function openPromotion(options: Move[]): void
{
    const colour = options[0].c;
    const order: PieceType[] = ['q', 'r', 'b', 'n'];
    const names: Record<string, string> = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
    const dialog = openDialog(`
        ${dialogHeader('Promote to')}
        <div class="promo">
            ${order.map(type => `<button class="promo__choice" data-promo="${type}" aria-label="${names[type]}">
                ${pieceSvg(colour + type)}<span>${names[type]}</span>
            </button>`).join('')}
        </div>
        <button class="btn btn--subtle btn--block" data-cancel>Cancel</button>`, { dimissible: true });

    dialog.querySelector('[data-cancel]')?.addEventListener('click', () => closeDialog());
    for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-promo]'))
    {
        button.addEventListener('click', () =>
        {
            const move = options.find(option => option.promo === button.dataset.promo);
            closeDialog();
            if (move) commitMove(move, false);
        });
    }
}

function openResult(): void
{
    const game = state.game;
    if (!game.outcome) return;
    const win = outcomeIsWin(game);
    const loss = outcomeIsLoss(game);
    const headline = game.config.mode === 'bot'
        ? win ? 'You won' : loss ? 'You lost' : 'Draw'
        : game.outcome.winner ? `${sideName(game.outcome.winner)} won` : 'Draw';

    openDialog(`
        <div class="result result--${win ? 'win' : loss ? 'loss' : 'draw'}">
            <div class="result__icon">${icon(win ? 'trophy' : loss ? 'flag' : 'users', 30)}</div>
            <h2 class="result__title">${headline}</h2>
            <p class="result__reason">${game.outcome.title} · ${resultSentence(game)}</p>
            <p class="result__line">${Math.ceil(game.plies.length / 2)} move${Math.ceil(game.plies.length / 2) === 1 ? '' : 's'} · ${game.config.minutes ? `${game.config.minutes} min per side` : 'no clock'}</p>
        </div>
        <div class="result__actions">
            <button class="btn btn--primary btn--block" data-rematch>Rematch</button>
            <button class="btn btn--subtle btn--block" data-review>Review the game</button>
            <div class="result__row">
                <button class="btn btn--ghost" data-copy>${icon('copy', 16)} Copy PGN</button>
                <button class="btn btn--ghost" data-home>${icon('back', 16)} Home</button>
            </div>
        </div>`, { dimissible: true });

    overlay.querySelector('[data-rematch]')?.addEventListener('click', () => rematch());
    overlay.querySelector('[data-review]')?.addEventListener('click', () =>
    {
        closeDialog();
        if (game.plies.length) setReview(game.plies.length - 1);
    });
    overlay.querySelector('[data-home]')?.addEventListener('click', () =>
    {
        closeDialog();
        clearSavedGame();
        showScreen('home');
    });
    overlay.querySelector('[data-copy]')?.addEventListener('click', () => copyText(toPgn(game), 'PGN copied'));
}

function copyText(text: string, message: string): void
{
    const done = (): void => toast(message);
    if (navigator.clipboard?.writeText)
    {
        void navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
        return;
    }
    fallbackCopy(text, done);
}

function fallbackCopy(text: string, done: () => void): void
{
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    try { document.execCommand('copy'); } catch { /* nothing else to try */ }
    area.remove();
    done();
}

let toastTimer = 0;
function toast(message: string): void
{
    const el = $('toast');
    el.textContent = message;
    el.classList.add('is-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove('is-on'), 1900);
}

function confirmDialog(title: string, body: string, confirmLabel: string, danger: boolean, onConfirm: () => void): void
{
    const dialog = openDialog(`
        ${dialogHeader(title, body)}
        <div class="dialog__actions">
            <button class="btn ${danger ? 'btn--danger' : 'btn--primary'} btn--block" data-yes>${confirmLabel}</button>
            <button class="btn btn--subtle btn--block" data-no>Keep playing</button>
        </div>`, { dimissible: true });

    dialog.querySelector('[data-yes]')?.addEventListener('click', () =>
    {
        closeDialog();
        onConfirm();
    });
    dialog.querySelector('[data-no]')?.addEventListener('click', () => closeDialog());
}

function openJoinGame(prefill?: string): void
{
    const dialog = openDialog(`
        ${dialogHeader('Join a game', 'Enter the code your friend shared.')}
        <div class="online__join">
            <input class="input" id="joinCodeInput" type="text" maxlength="8" placeholder="ABCDEF" autocomplete="off" spellcheck="false">
            <button class="btn btn--primary btn--block btn--lg" id="joinConfirm">Join</button>
            <button class="btn btn--ghost btn--block" id="joinCancel">Cancel</button>
        </div>`, { dimissible: true });

    const input = dialog.querySelector<HTMLInputElement>('#joinCodeInput')!;
    if (prefill) input.value = prefill;
    input.focus();
    input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

    dialog.querySelector('#joinConfirm')?.addEventListener('click', () =>
    {
        const code = input.value.trim();
        if (code.length < 4) { toast('Enter a valid code'); return; }
        closeDialog();
        startJoining(code);
    });
    dialog.querySelector('#joinCancel')?.addEventListener('click', () => closeDialog());
}

function startJoining(code: string): void
{
    cleanupOnline();
    state.online.role = 'guest';
    state.online.code = code;
    state.online.waiting = true;

    const handle = guest(code, {
        onOpen: (connection) =>
        {
            state.online.connection = connection;
            state.online.waiting = false;
        },
        onMessage: message => handleNetMessage(message),
        onClose: () => handleNetClose(),
        onError: error => handleNetError(error),
    });
    state.online.handle = handle;

    openDialog(`
        ${dialogHeader('Connecting…', 'Joining room ' + code.toUpperCase())}
        <div class="online__wait">
            <button class="btn btn--ghost btn--block" id="cancelJoinBtn">Cancel</button>
        </div>`, { dimissible: false });

    const dlg = document.querySelector('#overlay .dialog')!;
    dlg.querySelector('#cancelJoinBtn')?.addEventListener('click', () =>
    {
        cleanupOnline();
        closeDialog();
        showScreen('home');
    });
}

function openMenu(): void
{
    const settings = state.settings;
    const dialog = openDialog(`
        ${dialogHeader('Game settings')}
        <div class="menu">
            <div class="menu__row">
                <span class="menu__label">Board</span>
                <div class="menu__themes">
                    ${THEMES.map(theme => `<button class="theme-dot ${settings.theme === theme.id ? 'is-on' : ''}" data-theme="${theme.id}"
                        title="${theme.name}" aria-label="${theme.name} board">
                        <span style="background:${theme.light}"></span><span style="background:${theme.dark}"></span>
                    </button>`).join('')}
                </div>
            </div>
            <label class="menu__row">
                <span class="menu__label">Sound</span>
                <span class="switch switch--row">
                    <input type="checkbox" data-sound ${settings.sound ? 'checked' : ''}>
                    <span class="switch__track"><span class="switch__knob"></span></span>
                </span>
            </label>
            <label class="menu__row">
                <span class="menu__label">Coordinates</span>
                <span class="switch switch--row">
                    <input type="checkbox" data-coords ${settings.coordinates ? 'checked' : ''}>
                    <span class="switch__track"><span class="switch__knob"></span></span>
                </span>
            </label>
            <label class="menu__row">
                <span class="menu__label">Ask before leaving a game</span>
                <span class="switch switch--row">
                    <input type="checkbox" data-confirm ${settings.confirm ? 'checked' : ''}>
                    <span class="switch__track"><span class="switch__knob"></span></span>
                </span>
            </label>
            <label class="menu__row">
                <span class="menu__label">Coach (move comments)</span>
                <span class="switch switch--row">
                    <input type="checkbox" data-coach ${settings.coach ? 'checked' : ''}>
                    <span class="switch__track"><span class="switch__knob"></span></span>
                </span>
            </label>
            <label class="menu__row">
                <span class="menu__label">Debug (engine stats)</span>
                <span class="switch switch--row">
                    <input type="checkbox" data-debug ${settings.debug ? 'checked' : ''}>
                    <span class="switch__track"><span class="switch__knob"></span></span>
                </span>
            </label>
            <div class="menu__row menu__row--stack">
                <button class="btn btn--subtle btn--block" data-copy-pgn>${icon('copy', 16)} Copy PGN</button>
                <button class="btn btn--subtle btn--block" data-copy-fen>${icon('copy', 16)} Copy position (FEN)</button>
                <button class="btn btn--subtle btn--block" data-new>${icon('sparkle', 16)} New game</button>
                <button class="btn btn--ghost btn--block" data-home>${icon('back', 16)} Back to home</button>
            </div>
            <p class="menu__hint">Keys: <b>U</b> undo · <b>H</b> hint · <b>F</b> flip · <b>←</b> <b>→</b> review</p>
        </div>`, { dimissible: true });

    for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-theme]'))
    {
        button.addEventListener('click', () =>
        {
            state.settings.theme = button.dataset.theme as Settings['theme'];
            saveSettings(state.settings);
            applySettings();
            render();
            for (const dot of dialog.querySelectorAll('.theme-dot')) dot.classList.toggle('is-on', dot === button);
        });
    }
    dialog.querySelector<HTMLInputElement>('[data-sound]')?.addEventListener('change', event =>
    {
        state.settings.sound = (event.target as HTMLInputElement).checked;
        saveSettings(state.settings);
        setSound(state.settings.sound);
        play('click');
    });
    dialog.querySelector<HTMLInputElement>('[data-coords]')?.addEventListener('change', event =>
    {
        state.settings.coordinates = (event.target as HTMLInputElement).checked;
        saveSettings(state.settings);
        render();
    });
    dialog.querySelector<HTMLInputElement>('[data-confirm]')?.addEventListener('change', event =>
    {
        state.settings.confirm = (event.target as HTMLInputElement).checked;
        saveSettings(state.settings);
    });
    dialog.querySelector<HTMLInputElement>('[data-coach]')?.addEventListener('change', event =>
    {
        state.settings.coach = (event.target as HTMLInputElement).checked;
        saveSettings(state.settings);
        applySettings();
        render();
    });
    dialog.querySelector<HTMLInputElement>('[data-debug]')?.addEventListener('change', event =>
    {
        state.settings.debug = (event.target as HTMLInputElement).checked;
        saveSettings(state.settings);
        applySettings();
        render();
    });
    dialog.querySelector('[data-copy-pgn]')?.addEventListener('click', () => copyText(toPgn(state.game), 'PGN copied'));
    dialog.querySelector('[data-copy-fen]')?.addEventListener('click', () =>
        copyText(toFen(currentPosition(state.game)), 'Position copied'));
    dialog.querySelector('[data-new]')?.addEventListener('click', () =>
    {
        closeDialog();
        resetGameFlags();
        showScreen('home');
    });
    dialog.querySelector('[data-home]')?.addEventListener('click', () =>
    {
        closeDialog();
        showScreen('home');
    });
}

/* ------------------------------------------------------------------ wiring */

function bindHome(): void
{
    for (const button of document.querySelectorAll<HTMLButtonElement>('#modeSeg [data-mode]'))
    {
        button.addEventListener('click', () =>
        {
            const m = button.dataset.mode;
            state.config.mode = m === 'friend' ? 'friend' : m === 'online' ? 'online' : 'bot';
            saveConfig(state.config);
            play('click');
            renderHome();
        });
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>('#sideSeg [data-side]'))
    {
        button.addEventListener('click', () =>
        {
            const value = button.dataset.side;
            state.config.side = value === 'b' || value === 'random' ? value : 'w';
            saveConfig(state.config);
            play('click');
            renderHome();
        });
    }
    $('autoFlipSwitch').addEventListener('change', event =>
    {
        state.config.autoFlip = (event.target as HTMLInputElement).checked;
        saveConfig(state.config);
    });

    $('levelSlider')?.addEventListener('input', event =>
    {
        const level = Number((event.target as HTMLInputElement).value) as BotLevel;
        state.config.level = level;
        saveConfig(state.config);
        play('click');
        renderHome();
    });
    $('startBtn').addEventListener('click', () =>
    {
        unlockAudio();
        play('click');
        startGame(state.config);
    });
    $('resumeBtn').addEventListener('click', () =>
    {
        unlockAudio();
        play('click');
        continueSaved();
    });

    $('createGameBtn').addEventListener('click', () =>
    {
        unlockAudio();
        play('click');
        openCreateGame();
    });
    $('joinGameBtn').addEventListener('click', () =>
    {
        unlockAudio();
        play('click');
        openJoinGame();
    });
    $('soundToggle').addEventListener('click', () =>
    {
        state.settings.sound = !state.settings.sound;
        saveSettings(state.settings);
        setSound(state.settings.sound);
        unlockAudio();
        if (state.settings.sound) play('click');
        renderHome();
    });
}

function bindGame(): void
{
    $('backBtn').addEventListener('click', () =>
    {
        const game = state.game;
        if (game.config.mode === 'online')
        {
            const conn = state.online.connection;
            if (conn) conn.send({ t: 'bye' });
            cleanupOnline();
            showScreen('home');
            return;
        }
        if (!game.outcome && game.plies.length && state.settings.confirm)
        {
            confirmDialog('Leave this game?', 'It is saved, so you can pick it up again.', 'Save and leave', false, () =>
            {
                saveGame(game);
                showScreen('home');
            });
            return;
        }
        showScreen('home');
    });

    $('undoBtn').addEventListener('click', () =>
    {
        if (!canUndo(state.game)) return;
        state.botToken++;
        state.thinking = false;
        if (undo(state.game))
        {
            state.resultShown = false;
            state.recorded = false;
            state.review = null;
            saveGame(state.game);
            play('click');
            render();
        }
    });

    $('hintBtn').addEventListener('click', () =>
    {
        const game = state.game;
        if (!interactive()) return;
        play('click');
        const fen = toFen(currentPosition(game));
        void askBot('hint', fen, game.config.level).then(reply =>
        {
            const uci = reply.uci;
            if (state.game !== game || !interactive() || !uci) return;
            const move = fromUci(currentPosition(game), uci);
            if (!move) return;
            game.hint = { from: move.from, to: move.to };
            renderBoard();
        });
    });

    $('flipBtn').addEventListener('click', () =>
    {
        state.game.flipped = !state.game.flipped;
        play('click');
        render();
    });

    $('resignBtn').addEventListener('click', () =>
    {
        const game = state.game;
        if (game.outcome) return;
        const loser: Side = game.config.mode === 'bot' ? game.human : turn(game);
        confirmDialog('Resign?', game.config.mode === 'bot'
            ? 'The bot takes the win.'
            : game.config.mode === 'online'
                ? 'You give up the game.'
                : `${sideName(loser)} gives up the game.`, 'Resign', true, () =>
        {
            if (game.config.mode === 'online')
            {
                const conn = state.online.connection;
                if (conn) conn.send({ t: 'resign' });
            }
            resign(game, loser);
            render();
            finish();
        });
    });

    $('menuBtn').addEventListener('click', openMenu);

    document.getElementById('analyzeBtn')?.addEventListener('click', () =>
    {
        const game = state.game;
        const fen = toFen(currentPosition(game));
        const level = game.config.level;
        void askBot('move', fen, level).then(reply =>
        {
            state.lastSearch = { depth: reply.depth ?? 0, nodes: reply.nodes ?? 0, score: reply.score ?? 0, ms: reply.ms ?? 0 };
            if (reply.uci)
            {
                const move = fromUci(currentPosition(game), reply.uci);
                if (move)
                {
                    const san = toSan(currentPosition(game), move);
                    toast(`Analysis: ${san} (${((reply.nodes ?? 0) / 1000).toFixed(1)}k nodes)`);
                }
            }
            renderDebug();
        });
    });

    $('reviewLive').addEventListener('click', () => setReview(null));
    $('reviewBack').addEventListener('click', () => setReview(Math.max(0, (state.review ?? state.game.plies.length) - 1)));
    $('reviewNext').addEventListener('click', () =>
    {
        const current = state.review ?? state.game.plies.length - 1;
        const next = current + 1;
        setReview(next >= state.game.plies.length - 1 ? null : next);
    });
}

function bindKeys(): void
{
    window.addEventListener('keydown', event =>
    {
        if (event.key === 'Escape')
        {
            if (state.dialogOpen) { closeDialog(); return; }
            if (state.review !== null) { setReview(null); return; }
            if (state.screen === 'game') $('backBtn').click();
            return;
        }
        if (state.dialogOpen) return;
        if (state.screen !== 'game') return;

        if (event.key === 'ArrowLeft')
        {
            const current = state.review ?? state.game.plies.length;
            if (current > 0) setReview(current - 1);
            event.preventDefault();
        }
        else if (event.key === 'ArrowRight')
        {
            const current = state.review ?? state.game.plies.length - 1;
            if (current + 1 >= state.game.plies.length - 1) setReview(null);
            else setReview(current + 1);
            event.preventDefault();
        }
        else if (event.key.toLowerCase() === 'u') $('undoBtn').click();
        else if (event.key.toLowerCase() === 'h') $('hintBtn').click();
        else if (event.key.toLowerCase() === 'f') $('flipBtn').click();
    });
}

function paintStaticIcons(): void
{
    $('backBtn').innerHTML = icon('back');
    $('menuBtn').innerHTML = icon('menu');
    $('reviewBack').innerHTML = icon('back', 18);
    $('reviewNext').innerHTML = icon('forward', 18);
    const controls: Array<[string, IconName]> = [
        ['undoBtn', 'undo'],
        ['hintBtn', 'bulb'],
        ['flipBtn', 'flip'],
        ['resignBtn', 'flag'],
    ];
    for (const [id, name] of controls)
    {
        const el = document.getElementById(id);
        if (el) el.insertAdjacentHTML('afterbegin', icon(name, 19));
    }
}

function boot(): void
{
    paintStaticIcons();
    $('brandMark').innerHTML = pieceSvg('wn');
    $('boardHost').append(board.el);
    bindHome();
    bindGame();
    bindKeys();
    applySettings();
    const roomParam = new URLSearchParams(location.search).get('room');
    if (roomParam)
    {
        state.config.mode = 'online';
        saveConfig(state.config);
        // open join dialog after boot
        window.setTimeout(() => openJoinGame(roomParam), 50);
    }
    showScreen('home');
    requestAnimationFrame(tick);
    document.addEventListener('pointerdown', () => unlockAudio(), { once: true });
}

boot();

/* ------------------------------------------------------------------ testing hook */

declare global
{
    interface Window
    {
        checkmate?: {
            state: typeof state;
            game: () => Game;
            start: (config?: Partial<Config>) => void;
            fen: (fen: string) => void;
            move: (uci: string) => boolean;
            clocks: () => Clocks;
            screen: () => Screen;
        };
    }
}

window.checkmate = {
    state,
    game: () => state.game,
    start: (config?: Partial<Config>): void =>
    {
        startGame({ ...state.config, ...config });
    },
    fen: (fen: string): void =>
    {
        state.game = createGame({ ...state.config, mode: 'friend', minutes: 0 }, fen);
        resetGameFlags();
        showScreen('game');
    },
    move: (uci: string): boolean =>
    {
        const move = fromUci(currentPosition(state.game), uci);
        if (!move) return false;
        commitMove(move, false);
        return true;
    },
    clocks: () => ({ ...state.game.clocks }),
    screen: () => state.screen,
};
