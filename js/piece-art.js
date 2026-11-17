/**
 * The twelve chess men, as inline SVG.
 *
 * These are the classic Cburnett pieces from Wikimedia Commons (CC BY-SA 3.0, see CREDITS.md).
 * Inlining them means no network request per piece, no font dependency, and the same drawing on
 * every platform — which is the difference between a board that looks designed and one that looks
 * like the system's symbol fallback.
 */
const KING_LIGHT = `<g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">
<path stroke-linejoin="miter" d="M22.5 11.63V6M20 8h5"/>
<path fill="#fff" stroke-linecap="butt" stroke-linejoin="miter" d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/>
<path fill="#fff" d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7"/>
<path d="M12.5 30c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0"/>
</g>`;
const KING_DARK = `<g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">
<path d="M22.5,11.63 L22.5,6" stroke-linejoin="miter"/>
<path d="M22.5,25 C22.5,25 27,17.5 25.5,14.5 C25.5,14.5 24.5,12 22.5,12 C20.5,12 19.5,14.5 19.5,14.5 C18,17.5 22.5,25 22.5,25" fill="#000" stroke-linecap="butt" stroke-linejoin="miter"/>
<path d="M12.5,37 C18,40.5 27,40.5 32.5,37 L32.5,30 C32.5,30 41.5,25.5 38.5,19.5 C34.5,13 25,16 22.5,23.5 L22.5,27 L22.5,23.5 C20,16 10.5,13 6.5,19.5 C3.5,25.5 12.5,30 12.5,30 L12.5,37" fill="#000"/>
<path d="M20,8 L25,8" stroke-linejoin="miter"/>
<path d="M32,29.5 C32,29.5 40.5,25.5 38.03,19.85 C34.15,14 25,18 22.5,24.5 L22.5,26.6 L22.5,24.5 C20,18 10.85,14 6.97,19.85 C4.5,25.5 13,29.5 13,29.5" stroke="#fff"/>
<path d="M12.5,30 C18,27 27,27 32.5,30 M12.5,33.5 C18,30.5 27,30.5 32.5,33.5 M12.5,37 C18,34 27,34 32.5,37" stroke="#fff"/>
</g>`;
const QUEEN_LIGHT = `<g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round">
<path d="M9,26 C17.5,24.5 30,24.5 36,26 L38.5,13.5 L31,25 L30.7,10.9 L25.5,24.5 L22.5,10 L19.5,24.5 L14.3,10.9 L14,25 L6.5,13.5 L9,26 z"/>
<path d="M9,26 C9,28 10.5,28 11.5,30 C12.5,31.5 12.5,31 12,33.5 C10.5,34.5 11,36 11,36 C9.5,37.5 11,38.5 11,38.5 C17.5,39.5 27.5,39.5 34,38.5 C34,38.5 35.5,37.5 34,36 C34,36 34.5,34.5 33,33.5 C32.5,31 32.5,31.5 33.5,30 C34.5,28 36,28 36,26 C27.5,24.5 17.5,24.5 9,26 z"/>
<path d="M11.5,30 C15,29 30,29 33.5,30" fill="none"/>
<path d="M12,33.5 C18,32.5 27,32.5 33,33.5" fill="none"/>
<circle cx="6" cy="12" r="2"/><circle cx="14" cy="9" r="2"/><circle cx="22.5" cy="8" r="2"/><circle cx="31" cy="9" r="2"/><circle cx="39" cy="12" r="2"/>
</g>`;
const QUEEN_DARK = `<g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
<path d="M9,26 C17.5,24.5 30,24.5 36,26 L38.5,13.5 L31,25 L30.7,10.9 L25.5,24.5 L22.5,10 L19.5,24.5 L14.3,10.9 L14,25 L6.5,13.5 L9,26 z" stroke-linecap="butt"/>
<path d="m9,26 c0,2 1.5,2 2.5,4 1,1.5 1,1 0.5,3.5 -1.5,1 -1,2.5 -1,2.5 -1.5,1.5 0,2.5 0,2.5 6.5,1 16.5,1 23,0 0,0 1.5,-1 0,-2.5 0,0 0.5,-1.5 -1,-2.5 -0.5,-2.5 -0.5,-2 0.5,-3.5 1,-2 2.5,-2 2.5,-4 -8.5,-1.5 -18.5,-1.5 -27,0 z"/>
<path d="M11.5,30 C15,29 30,29 33.5,30"/>
<path d="m12,33.5 c6,-1 15,-1 21,0"/>
<circle cx="6" cy="12" r="2"/><circle cx="14" cy="9" r="2"/><circle cx="22.5" cy="8" r="2"/><circle cx="31" cy="9" r="2"/><circle cx="39" cy="12" r="2"/>
<path d="M11,38.5 A35,35 1 0 0 34,38.5" fill="none" stroke-linecap="butt"/>
<g fill="none" stroke="#fff">
<path d="M11,29 A35,35 1 0 1 34,29"/>
<path d="M12.5,31.5 L32.5,31.5"/>
<path d="M11.5,34.5 A35,35 1 0 0 33.5,34.5"/>
<path d="M10.5,37.5 A35,35 1 0 0 34.5,37.5"/>
</g>
</g>`;
const ROOK_LIGHT = `<g style="fill:#fff;stroke:#000;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round" transform="translate(0,0.3)">
<path d="M9,39 L36,39 L36,36 L9,36 L9,39 z" stroke-linecap="butt"/>
<path d="M12,36 L12,32 L33,32 L33,36 L12,36 z" stroke-linecap="butt"/>
<path d="M11,14 L11,9 L15,9 L15,11 L20,11 L20,9 L25,9 L25,11 L30,11 L30,9 L34,9 L34,14" stroke-linecap="butt"/>
<path d="M34,14 L31,17 L14,17 L11,14"/>
<path d="M31,17 L31,29.5 L14,29.5 L14,17" stroke-linecap="butt" stroke-linejoin="miter"/>
<path d="M31,29.5 L32.5,32 L12.5,32 L14,29.5"/>
<path d="M11,14 L34,14" style="fill:none;stroke-linejoin:miter"/>
</g>`;
const ROOK_DARK = `<g fill="#000" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,0.3)">
<path d="M9,39 L36,39 L36,36 L9,36 L9,39 z" stroke-linecap="butt"/>
<path d="M12.5,32 L14,29.5 L31,29.5 L32.5,32 L12.5,32 z" stroke-linecap="butt"/>
<path d="M12,36 L12,32 L33,32 L33,36 L12,36 z" stroke-linecap="butt"/>
<path d="M14,29.5 L14,16.5 L31,16.5 L31,29.5 L14,29.5 z" stroke-linecap="butt" stroke-linejoin="miter"/>
<path d="M14,16.5 L11,14 L34,14 L31,16.5 L14,16.5 z" stroke-linecap="butt"/>
<path d="M11,14 L11,9 L15,9 L15,11 L20,11 L20,9 L25,9 L25,11 L30,11 L30,9 L34,9 L34,14 L11,14 z" stroke-linecap="butt"/>
<path d="M12,35.5 L33,35.5" fill="none" stroke="#fff" stroke-width="1" stroke-linejoin="miter"/>
<path d="M13,31.5 L32,31.5" fill="none" stroke="#fff" stroke-width="1" stroke-linejoin="miter"/>
<path d="M14,29.5 L31,29.5" fill="none" stroke="#fff" stroke-width="1" stroke-linejoin="miter"/>
<path d="M14,16.5 L31,16.5" fill="none" stroke="#fff" stroke-width="1" stroke-linejoin="miter"/>
<path d="M11,14 L34,14" fill="none" stroke="#fff" stroke-width="1" stroke-linejoin="miter"/>
</g>`;
const BISHOP_LIGHT = `<g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,0.6)">
<g fill="#fff" stroke-linecap="butt">
<path d="M9,36 C12.39,35.03 19.11,36.43 22.5,34 C25.89,36.43 32.61,35.03 36,36 C36,36 37.65,36.54 39,38 C38.32,38.97 37.35,38.99 36,38.5 C32.61,37.53 25.89,38.96 22.5,37.5 C19.11,38.96 12.39,37.53 9,38.5 C7.65,38.99 6.68,38.97 6,38 C7.35,36.54 9,36 9,36 z"/>
<path d="M15,32 C17.5,34.5 27.5,34.5 30,32 C30.5,30.5 30,30 30,30 C30,27.5 27.5,26 27.5,26 C33,24.5 33.5,14.5 22.5,10.5 C11.5,14.5 12,24.5 17.5,26 C17.5,26 15,27.5 15,30 C15,30 14.5,30.5 15,32 z"/>
<path d="M25 8 A2.5 2.5 0 1 1 20,8 A2.5 2.5 0 1 1 25 8 z"/>
</g>
<path d="M17.5,26 L27.5,26 M15,30 L30,30 M22.5,15.5 L22.5,20.5 M20,18 L25,18" style="fill:none;stroke-linejoin:miter"/>
</g>`;
const BISHOP_DARK = `<g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,0.6)">
<g fill="#000" stroke-linecap="butt">
<path d="M9,36 C12.39,35.03 19.11,36.43 22.5,34 C25.89,36.43 32.61,35.03 36,36 C36,36 37.65,36.54 39,38 C38.32,38.97 37.35,38.99 36,38.5 C32.61,37.53 25.89,38.96 22.5,37.5 C19.11,38.96 12.39,37.53 9,38.5 C7.65,38.99 6.68,38.97 6,38 C7.35,36.54 9,36 9,36 z"/>
<path d="M15,32 C17.5,34.5 27.5,34.5 30,32 C30.5,30.5 30,30 30,30 C30,27.5 27.5,26 27.5,26 C33,24.5 33.5,14.5 22.5,10.5 C11.5,14.5 12,24.5 17.5,26 C17.5,26 15,27.5 15,30 C15,30 14.5,30.5 15,32 z"/>
<path d="M25 8 A2.5 2.5 0 1 1 20,8 A2.5 2.5 0 1 1 25 8 z"/>
</g>
<path d="M17.5,26 L27.5,26 M15,30 L30,30 M22.5,15.5 L22.5,20.5 M20,18 L25,18" style="fill:none;stroke:#fff;stroke-linejoin:miter"/>
</g>`;
const KNIGHT_LIGHT = `<g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,0.3)">
<path d="M22,10 C32.5,11 38.5,18 38,39 L15,39 C15,30 25,32.5 23,18" fill="#fff"/>
<path d="M24,18 C24.38,20.91 18.45,25.37 16,27 C13,29 13.18,31.34 11,31 C9.958,30.06 12.41,27.96 11,28 C10,28 11.19,29.23 10,30 C9,30 5.997,31 6,26 C6,24 12,14 12,14 C12,14 13.89,12.1 14,10.5 C13.27,9.506 13.5,8.5 13.5,7.5 C14.5,6.5 16.5,10 16.5,10 L18.5,10 C18.5,10 19.28,8.008 21,7 C22,7 22,10 22,10" fill="#fff"/>
<path d="M9.5 25.5 A0.5 0.5 0 1 1 8.5,25.5 A0.5 0.5 0 1 1 9.5 25.5 z" fill="#000"/>
<path d="M15 15.5 A0.5 1.5 0 1 1 14,15.5 A0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" fill="#000"/>
</g>`;
const KNIGHT_DARK = `<g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,0.3)">
<path d="M22,10 C32.5,11 38.5,18 38,39 L15,39 C15,30 25,32.5 23,18" fill="#000"/>
<path d="M24,18 C24.38,20.91 18.45,25.37 16,27 C13,29 13.18,31.34 11,31 C9.958,30.06 12.41,27.96 11,28 C10,28 11.19,29.23 10,30 C9,30 5.997,31 6,26 C6,24 12,14 12,14 C12,14 13.89,12.1 14,10.5 C13.27,9.506 13.5,8.5 13.5,7.5 C14.5,6.5 16.5,10 16.5,10 L18.5,10 C18.5,10 19.28,8.008 21,7 C22,7 22,10 22,10" fill="#000"/>
<path d="M9.5 25.5 A0.5 0.5 0 1 1 8.5,25.5 A0.5 0.5 0 1 1 9.5 25.5 z" fill="#fff" stroke="#fff"/>
<path d="M15 15.5 A0.5 1.5 0 1 1 14,15.5 A0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" fill="#fff" stroke="#fff"/>
<path d="M24.55,10.4 L24.1,11.85 L24.6,12 C27.75,13 30.25,14.49 32.5,18.75 C34.75,23.01 35.75,29.06 35.25,39 L35.2,39.5 L37.45,39.5 L37.5,39 C38,28.94 36.62,22.15 34.25,17.66 C31.88,13.17 28.46,11.02 25.06,10.5 L24.55,10.4 z" fill="#fff" stroke="none"/>
</g>`;
const PAWN_LIGHT = `<path d="m22.5,9 c-2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C17.33,16.5 16,18.59 16,21 c0,2.03 0.94,3.84 2.41,5.03 C15.41,27.09 11,31.58 11,39.5 H34 C34,31.58 29.59,27.09 26.59,26.03 28.06,24.84 29,23.03 29,21 29,18.59 27.67,16.5 25.72,15.38 26.21,14.71 26.5,13.89 26.5,13 c0,-2.21 -1.79,-4 -4,-4 z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="miter"/>`;
const PAWN_DARK = `<path d="m22.5,9 c-2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C17.33,16.5 16,18.59 16,21 c0,2.03 0.94,3.84 2.41,5.03 C15.41,27.09 11,31.58 11,39.5 H34 C34,31.58 29.59,27.09 26.59,26.03 28.06,24.84 29,23.03 29,21 29,18.59 27.67,16.5 25.72,15.38 26.21,14.71 26.5,13.89 26.5,13 c0,-2.21 -1.79,-4 -4,-4 z" fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="miter"/>`;
const SHAPES = {
    wk: KING_LIGHT, wq: QUEEN_LIGHT, wr: ROOK_LIGHT, wb: BISHOP_LIGHT, wn: KNIGHT_LIGHT, wp: PAWN_LIGHT,
    bk: KING_DARK, bq: QUEEN_DARK, br: ROOK_DARK, bb: BISHOP_DARK, bn: KNIGHT_DARK, bp: PAWN_DARK,
};
/** The whole `<svg>` for a piece key such as `wn` or `bk`. */
export function pieceSvg(key) {
    return `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${SHAPES[key] ?? ''}</svg>`;
}
export const PIECE_KEYS = Object.keys(SHAPES);
