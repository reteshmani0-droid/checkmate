/**
 * The bot, off the main thread. A search at the top level runs for a few hundred milliseconds at
 * most, but doing it here means the board never stutters while it thinks.
 */
import { positionFromFen, toUci } from './rules.js';
import { chooseMove, hintMove, type BotLevel } from './bot.js';
import { createRng } from './rng.js';

type Request =
    | { id: number; kind: 'move'; fen: string; level: BotLevel; seed: number }
    | { id: number; kind: 'hint'; fen: string };

const scope = self as unknown as {
    onmessage: ((event: MessageEvent<Request>) => void) | null;
    postMessage: (message: unknown) => void;
};

scope.onmessage = (event: MessageEvent<Request>): void =>
{
    const request = event.data;
    const started = performance.now();
    try
    {
        const pos = positionFromFen(request.fen);
        if (request.kind === 'hint')
        {
            const move = hintMove(pos);
            scope.postMessage({ id: request.id, uci: move ? toUci(move) : null, ms: performance.now() - started });
            return;
        }
        const choice = chooseMove(pos, request.level, createRng(request.seed));
        scope.postMessage({
            id: request.id,
            uci: choice ? toUci(choice.move) : null,
            depth: choice?.depth ?? 0,
            nodes: choice?.nodes ?? 0,
            score: choice?.score ?? 0,
            ms: performance.now() - started,
        });
    }
    catch (error)
    {
        scope.postMessage({ id: request.id, uci: null, error: String(error) });
    }
};
