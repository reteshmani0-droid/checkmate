/** Interface icons, inline. Stroke only, so they take the colour of whatever they sit in. */
const PATHS = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    forward: '<path d="M9 6l6 6-6 6"/>',
    undo: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4.5h4.5"/>',
    bulb: '<path d="M12 3a6 6 0 0 0-3.4 10.9c.6.4.9 1.1.9 1.8V17h5v-1.3c0-.7.3-1.4.9-1.8A6 6 0 0 0 12 3z"/><path d="M9.5 20.5h5"/>',
    flip: '<path d="M4 8h14l-3.2-3.2"/><path d="M20 16H6l3.2 3.2"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-1.2 3.5L16 11H5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M12 6h.01M12 12h.01M12 18h.01" stroke-width="2.6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    sound: '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M16 9a4.5 4.5 0 0 1 0 6"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/>',
    mute: '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M16.5 9.5l4 5M20.5 9.5l-4 5"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.8 19.5c0-3.2 2.8-5.2 6.2-5.2s6.2 2 6.2 5.2"/><path d="M16.5 5.4a3.2 3.2 0 0 1 0 6.2"/><path d="M18 14.6c2 .5 3.4 1.9 3.4 3.6"/>',
    robot: '<rect x="4" y="7.5" width="16" height="12" rx="3"/><path d="M12 3.5v4"/><circle cx="9.2" cy="13" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.8" cy="13" r="1.2" fill="currentColor" stroke="none"/><path d="M9.5 16.5h5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    play: '<path d="M7 4.5l13 7.5-13 7.5z" stroke-linejoin="round"/>',
    restart: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M21 4v5h-5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    trophy: '<path d="M8 4h8v4.5a4 4 0 0 1-8 0z"/><path d="M8 5.5H5.5V7a3 3 0 0 0 3 3"/><path d="M16 5.5h2.5V7a3 3 0 0 1-3 3"/><path d="M12 12.5V16"/><path d="M9 20h6"/><path d="M9.5 16h5l.7 4h-6.4z"/>',
    download: '<path d="M12 4v11"/><path d="M8 11.5l4 4 4-4"/><path d="M4 19h16"/>',
    sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
};
export function icon(name, size = 20) {
    return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
        stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}
