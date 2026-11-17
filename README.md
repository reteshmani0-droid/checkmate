# Checkmate

A chess game for the browser: play a friend on this device, or take on a bot at four
strengths. Plain TypeScript, HTML and CSS — no framework, no game engine, no dependencies.
Everything the game draws is either CSS or inline SVG, and every sound is synthesised with
the Web Audio API, so there is nothing to download after the page.

## Play

The game is published at **https://reteshmani0-droid.github.io/checkmate/**.

To run it on this machine:

```
node serve.mjs
```

Then open <http://localhost:4180>. Any static server works; there is no build step for the
browser, because the compiled files in `js/` are committed.

To change the code, install TypeScript once and rebuild after each edit:

```
npx tsc -p .        # or: npm run build
```

`npm run serve` starts the same little server. There is nothing to install for either.

## What is in it

- **Two ways to play** — against the bot (levels 1–4, or play as White, Black or random) or
  pass-and-play with an optional board flip after every move.
- **Full rules** — castling, en passant, promotion (with a picker), check, checkmate,
  stalemate, threefold repetition, the fifty-move rule, and draws for insufficient material.
- **Clocks** — bullet, blitz, rapid or no clock, with tenths under 20 seconds and a flag.
- **The board** — legal-move dots and capture rings, last-move and selected highlights, a
  pulsing check, a slide animation for every move, drag or tap to move, coordinates.
- **Controls** — undo (back to your own turn, past the bot's reply), a hint from the engine,
  flip, resign, and a move list you can click to review any position.
- **Around the game** — captured pieces and material lead, five board themes, synthesised
  sound, a PGN and FEN copy, saved games that survive a reload, and win/loss/draw stats.
- **Keys** — `U` undo, `H` hint, `F` flip, `←` `→` review, `Esc` close or step back.

The bot is a negamax search with alpha-beta, quiescence, piece-square tables and a small
amount of per-game noise so its openings vary. It runs in a Web Worker, so the board never
stutters while it thinks; if workers are unavailable it falls back to the same search on the
page. The rules engine and bot were checked against perft counts for six positions and against
mate-in-one and hanging-piece positions at every level.

## Layout

| File | What it is |
| --- | --- |
| `index.html` | The two screens' markup and the element ids the app binds to |
| `style.css` | The whole look: variables, home, board, seats, clocks, dialogs, breakpoints |
| `src/app.ts` | Screens, state, interaction, clocks, bot scheduling, dialogs, saving |
| `src/board.ts` | The board: 64 squares, piece sprites keyed by id, drag, marks, coordinates |
| `src/game.ts` | Game state, clocks, undo, review, PGN, saved games, results |
| `src/rules.ts` | Move generation, legality, checkmate, SAN, FEN, zobrist keys |
| `src/bot.ts` | The search and evaluation |
| `src/bot-worker.ts` | Runs the search off the main thread |
| `src/piece-art.ts` | The twelve chess men, inlined SVG |
| `src/themes.ts` | Board palettes, bot levels, time controls |
| `src/sound.ts` | Synthesised move, capture, castle, check, promotion and result sounds |
| `src/icons.ts` | Interface icons |
| `src/rng.ts` | Seeded random numbers |
| `serve.mjs` | A dependency-free static server, for running it locally |

Compiled output goes to `js/`, which is what `index.html` loads.

## Notes

- There is no online play, and the bot is not a strong engine — it is a fair club-strength
  opponent at level 4 and a beginner at level 1.
- The board is played with a pointer; there is no keyboard-only way to move a piece.
- Saved games hold the move list, not the clock's sub-second state.

## Credits

The chess men are the Cburnett set from Wikimedia Commons, CC BY-SA 3.0. See `CREDITS.md`.
