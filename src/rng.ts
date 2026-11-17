/**
 * A small seeded random source, shaped the way the bot wants one. Seeding it means a saved game
 * replayed gives the same bot moves it gave the first time.
 */

export type Rng = {
    between(min: number, max: number): number;
    int(min: number, max: number): number;
    pick<T>(list: readonly T[]): T;
    chance(p: number): boolean;
};

export function createRng(seed: number): Rng
{
    let state = (seed >>> 0) || 0x9e3779b9;
    const next = (): number =>
    {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        between: (min, max) => min + next() * (max - min),
        int: (min, max) => min + Math.floor(next() * (max - min + 1)),
        pick: list => list[Math.floor(next() * list.length)],
        chance: p => next() < p,
    };
}
