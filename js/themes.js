/**
 * Board palettes. Each theme is a pair of square colours plus the highlight colours drawn over them.
 * The highlights are translucent so the square underneath still reads, the way a chess site's do.
 */
export const THEMES = [
    {
        id: 'green', name: 'Green',
        light: '#EEEED2', dark: '#769656',
        coordLight: '#769656', coordDark: '#EEEED2',
        last: 'rgba(255, 236, 122, 0.50)', selected: 'rgba(255, 236, 122, 0.62)',
        dot: 'rgba(20, 30, 14, 0.22)', ring: 'rgba(20, 30, 14, 0.20)',
        hint: 'rgba(96, 178, 255, 0.55)', check: 'rgba(224, 52, 40, 0.85)',
        border: '#4E6B36',
    },
    {
        id: 'wood', name: 'Wood',
        light: '#F0D9B5', dark: '#B58863',
        coordLight: '#B58863', coordDark: '#F0D9B5',
        last: 'rgba(255, 226, 105, 0.55)', selected: 'rgba(255, 226, 105, 0.68)',
        dot: 'rgba(45, 26, 12, 0.22)', ring: 'rgba(45, 26, 12, 0.20)',
        hint: 'rgba(102, 172, 255, 0.55)', check: 'rgba(224, 52, 40, 0.85)',
        border: '#8A6748',
    },
    {
        id: 'blue', name: 'Blue',
        light: '#DEE3E6', dark: '#8CA2AD',
        coordLight: '#8CA2AD', coordDark: '#DEE3E6',
        last: 'rgba(255, 236, 122, 0.50)', selected: 'rgba(255, 236, 122, 0.62)',
        dot: 'rgba(22, 34, 42, 0.22)', ring: 'rgba(22, 34, 42, 0.20)',
        hint: 'rgba(80, 168, 255, 0.55)', check: 'rgba(224, 52, 40, 0.85)',
        border: '#6C8391',
    },
    {
        id: 'night', name: 'Night',
        light: '#A9A7A2', dark: '#54534F',
        coordLight: '#54534F', coordDark: '#A9A7A2',
        last: 'rgba(255, 226, 105, 0.45)', selected: 'rgba(255, 226, 105, 0.58)',
        dot: 'rgba(12, 14, 12, 0.26)', ring: 'rgba(12, 14, 12, 0.24)',
        hint: 'rgba(120, 196, 255, 0.50)', check: 'rgba(232, 62, 50, 0.85)',
        border: '#3E3D3A',
    },
    {
        id: 'coral', name: 'Coral',
        light: '#F7E6DC', dark: '#C68B77',
        coordLight: '#C68B77', coordDark: '#F7E6DC',
        last: 'rgba(255, 226, 105, 0.55)', selected: 'rgba(255, 226, 105, 0.66)',
        dot: 'rgba(52, 24, 18, 0.22)', ring: 'rgba(52, 24, 18, 0.20)',
        hint: 'rgba(96, 168, 255, 0.55)', check: 'rgba(224, 52, 40, 0.85)',
        border: '#9C6450',
    },
];
export const THEME_BY_ID = new Map(THEMES.map(t => [t.id, t]));
export function themeOf(id) {
    return THEME_BY_ID.get(id) ?? THEMES[0];
}
/** Write a theme onto the document as CSS custom properties, so one stylesheet draws every board. */
export function applyTheme(theme) {
    const root = document.documentElement.style;
    root.setProperty('--sq-light', theme.light);
    root.setProperty('--sq-dark', theme.dark);
    root.setProperty('--coord-light', theme.coordLight);
    root.setProperty('--coord-dark', theme.coordDark);
    root.setProperty('--hl-last', theme.last);
    root.setProperty('--hl-selected', theme.selected);
    root.setProperty('--hl-dot', theme.dot);
    root.setProperty('--hl-ring', theme.ring);
    root.setProperty('--hl-hint', theme.hint);
    root.setProperty('--hl-check', theme.check);
    root.setProperty('--board-border', theme.border);
}
export const LEVELS = [
    { level: 1, name: 'Pawn', blurb: 'Learning the ropes', rating: 400 },
    { level: 2, name: 'Knight', blurb: 'Sees a move ahead', rating: 700 },
    { level: 3, name: 'Bishop', blurb: 'A solid club player', rating: 1000 },
    { level: 4, name: 'Rook', blurb: 'Punishes loose pieces', rating: 1300 },
    { level: 5, name: 'Queen', blurb: 'Thinks three moves deep', rating: 1600 },
    { level: 6, name: 'King', blurb: 'Thinks four moves deep', rating: 1900 },
    { level: 7, name: 'Master', blurb: 'Deep search, no mistakes', rating: 2200 },
    { level: 8, name: 'Grandmaster', blurb: 'The strongest engine here', rating: 2500 },
];
export const TIME_CONTROLS = [
    { minutes: 1, label: '1 min', sub: 'Bullet' },
    { minutes: 3, label: '3 min', sub: 'Blitz' },
    { minutes: 5, label: '5 min', sub: 'Blitz' },
    { minutes: 10, label: '10 min', sub: 'Rapid' },
    { minutes: 30, label: '30 min', sub: 'Classic' },
    { minutes: 0, label: 'No clock', sub: 'Casual' },
];
