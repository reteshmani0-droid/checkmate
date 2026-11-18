/**
 * The board: 64 squares, the pieces on them, and every mark drawn over a square.
 *
 * Pieces are keyed by the id the game gives them, not by square. That one choice is what makes a
 * move look like a move: the same element slides to its new square, and a captured one shrinks
 * away, instead of the board being repainted each time.
 */
import { fileOf, rankOf, squareName } from './rules.js';
import { pieceSvg } from './piece-art.js';
const key = (piece) => piece.c + piece.t;
export class Board {
    el;
    squares;
    marks;
    pieces;
    coords;
    handlers;
    state = null;
    pieceEls = new Map();
    size = 0;
    flipped = false;
    drag = null;
    constructor(handlers) {
        this.handlers = handlers;
        this.el = document.createElement('div');
        this.el.className = 'board';
        this.el.setAttribute('role', 'grid');
        this.el.setAttribute('aria-label', 'Chess board');
        this.squares = document.createElement('div');
        this.squares.className = 'board__squares';
        this.marks = document.createElement('div');
        this.marks.className = 'board__marks';
        this.pieces = document.createElement('div');
        this.pieces.className = 'board__pieces';
        this.coords = document.createElement('div');
        this.coords.className = 'board__coords';
        for (let sq = 0; sq < 64; sq++) {
            const cell = document.createElement('div');
            cell.className = `sq ${(fileOf(sq) + rankOf(sq)) % 2 === 0 ? 'sq--light' : 'sq--dark'}`;
            cell.dataset.sq = String(sq);
            cell.setAttribute('role', 'gridcell');
            cell.setAttribute('aria-label', squareName(sq));
            this.squares.append(cell);
        }
        this.el.append(this.squares, this.marks, this.pieces, this.coords);
        this.el.addEventListener('pointerdown', this.onPointerDown);
        this.el.addEventListener('pointermove', this.onPointerMove);
        this.el.addEventListener('pointerup', this.onPointerUp);
        this.el.addEventListener('pointercancel', this.onPointerCancel);
        this.el.addEventListener('contextmenu', event => event.preventDefault());
        new ResizeObserver(() => this.layout()).observe(this.el);
    }
    /* ---------------------------------------------------------------- geometry */
    squareAt(clientX, clientY) {
        const rect = this.el.getBoundingClientRect();
        if (!rect.width)
            return null;
        const size = rect.width / 8;
        const col = Math.floor((clientX - rect.left) / size);
        const row = Math.floor((clientY - rect.top) / size);
        if (col < 0 || col > 7 || row < 0 || row > 7)
            return null;
        return this.flipped ? (7 - row) * 8 + (7 - col) : row * 8 + col;
    }
    colRow(sq) {
        const col = fileOf(sq);
        const row = rankOf(sq);
        return this.flipped ? { col: 7 - col, row: 7 - row } : { col, row };
    }
    layout() {
        const rect = this.el.getBoundingClientRect();
        this.size = rect.width / 8;
        for (const [id, el] of this.pieceEls) {
            const sq = this.squareOfId(id);
            if (sq === null)
                continue;
            const { col, row } = this.colRow(sq);
            el.classList.add('piece--static');
            el.style.transform = `translate(${col * this.size}px, ${row * this.size}px)`;
            void el.offsetWidth;
            el.classList.remove('piece--static');
        }
        this.layoutCoordinates();
    }
    squareOfId(id) {
        const ids = this.state?.ids;
        if (!ids)
            return null;
        const sq = ids.indexOf(id);
        return sq < 0 ? null : sq;
    }
    layoutSquares() {
        this.squares.style.gridTemplateColumns = 'repeat(8, 1fr)';
        // A grid draws a8 first for White; flipping reverses the order of the cells instead.
        const cells = [...this.squares.children];
        cells.forEach((cell, index) => { cell.dataset.show = String(index); });
        this.squares.style.transform = this.flipped ? 'rotate(180deg)' : '';
        for (const cell of cells)
            cell.style.transform = this.flipped ? 'rotate(180deg)' : '';
    }
    layoutCoordinates() {
        if (!this.state)
            return;
        this.coords.innerHTML = '';
        if (!this.state.coordinates)
            return;
        this.coords.style.setProperty('--coord-size', `${Math.max(8, Math.round(this.squareSize() * 0.16))}px`);
        for (let i = 0; i < 8; i++) {
            const rankRow = this.flipped ? 7 - i : i;
            const rankSq = rankRow * 8;
            const rankLabel = document.createElement('span');
            rankLabel.className = `coord coord--rank ${(fileOf(rankSq) + rankOf(rankSq)) % 2 === 0 ? 'coord--onlight' : 'coord--ondark'}`;
            rankLabel.textContent = String(8 - rankRow);
            rankLabel.style.left = '3px';
            rankLabel.style.top = `${i * 12.5}%`;
            this.coords.append(rankLabel);
            const fileCol = this.flipped ? 7 - i : i;
            const fileSq = 56 + fileCol;
            const fileLabel = document.createElement('span');
            fileLabel.className = `coord coord--file ${(fileOf(fileSq) + rankOf(fileSq)) % 2 === 0 ? 'coord--onlight' : 'coord--ondark'}`;
            fileLabel.textContent = 'abcdefgh'[fileCol];
            fileLabel.style.left = `${i * 12.5}%`;
            fileLabel.style.top = '87.5%';
            this.coords.append(fileLabel);
        }
    }
    /* ---------------------------------------------------------------- drawing */
    draw(state) {
        const flipChanged = state.flipped !== this.flipped;
        this.state = state;
        this.flipped = state.flipped;
        if (flipChanged) {
            this.layoutSquares();
            this.layoutCoordinates();
        }
        const size = this.squareSize();
        const dragged = this.drag?.moved ? this.drag.id : null;
        const live = new Set();
        for (let sq = 0; sq < 64; sq++) {
            const id = state.ids[sq];
            const piece = state.pos.board[sq];
            if (id === null || id === undefined || !piece)
                continue;
            live.add(id);
            let el = this.pieceEls.get(id);
            const texture = key(piece);
            if (!el || !el.isConnected) {
                el = this.createPiece(piece, sq);
                this.pieceEls.set(id, el);
                this.pieces.append(el);
            }
            else if (el.dataset.piece !== texture) {
                el.dataset.piece = texture;
                el.innerHTML = pieceSvg(texture);
                el.classList.remove('piece--promote');
                void el.offsetWidth;
                el.classList.add('piece--promote');
            }
            if (dragged !== id) {
                const { col, row } = this.colRow(sq);
                el.style.transform = `translate(${col * size}px, ${row * size}px)`;
            }
            el.classList.toggle('piece--dim', !state.interactive);
            el.classList.toggle('piece--lifted', state.selected === sq);
            el.dataset.sq = String(sq);
        }
        for (const [id, el] of [...this.pieceEls]) {
            if (live.has(id))
                continue;
            this.pieceEls.delete(id);
            el.classList.add('piece--gone');
            window.setTimeout(() => el.remove(), 190);
        }
        this.drawMarks(state);
    }
    createPiece(piece, sq) {
        const el = document.createElement('div');
        const texture = key(piece);
        el.className = 'piece piece--static';
        el.dataset.piece = texture;
        el.innerHTML = pieceSvg(texture);
        const { col, row } = this.colRow(sq);
        const size = this.size || this.el.getBoundingClientRect().width / 8;
        el.style.transform = `translate(${col * size}px, ${row * size}px)`;
        void el.offsetWidth;
        el.classList.remove('piece--static');
        return el;
    }
    addMark(sq, className, style) {
        const mark = document.createElement('div');
        mark.className = `mark ${className}`;
        mark.style.left = `${this.colRow(sq).col * 12.5}%`;
        mark.style.top = `${this.colRow(sq).row * 12.5}%`;
        if (style)
            Object.assign(mark.style, style);
        this.marks.append(mark);
        return mark;
    }
    drawMarks(state) {
        this.marks.innerHTML = '';
        const last = state.last;
        if (last) {
            this.addMark(last.from, 'mark--last');
            this.addMark(last.to, 'mark--last');
        }
        if (state.hint) {
            this.addMark(state.hint.from, 'mark--hint');
            this.addMark(state.hint.to, 'mark--hint');
        }
        if (state.selected !== null) {
            this.addMark(state.selected, 'mark--selected');
        }
        if (state.check !== null && state.check >= 0)
            this.addMark(state.check, 'mark--check');
        for (const target of state.targets) {
            if (target.capture)
                this.addMark(target.to, 'mark--ring');
            else
                this.addMark(target.to, 'mark--dot');
        }
        // The coordinate layer sits above the squares, so it is redrawn with them.
        this.layoutCoordinates();
        // Engine best-move arrow (coach/debug).
        if (state.arrow) {
            const from = this.colRow(state.arrow.from);
            const to = this.colRow(state.arrow.to);
            const size = this.squareSize();
            const fx = (from.col + 0.5) * size;
            const fy = (from.row + 0.5) * size;
            const tx = (to.col + 0.5) * size;
            const ty = (to.row + 0.5) * size;
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'board__arrow');
            svg.setAttribute('width', String(size * 8));
            svg.setAttribute('height', String(size * 8));
            svg.style.position = 'absolute';
            svg.style.inset = '0';
            svg.style.pointerEvents = 'none';
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', String(fx));
            line.setAttribute('y1', String(fy));
            line.setAttribute('x2', String(tx));
            line.setAttribute('y2', String(ty));
            line.setAttribute('stroke', 'rgba(96, 178, 255, 0.85)');
            line.setAttribute('stroke-width', String(size * 0.18));
            line.setAttribute('stroke-linecap', 'round');
            line.setAttribute('marker-end', 'url(#arrowhead)');
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', 'arrowhead');
            marker.setAttribute('markerWidth', '10');
            marker.setAttribute('markerHeight', '7');
            marker.setAttribute('refX', '9');
            marker.setAttribute('refY', '3.5');
            marker.setAttribute('orient', 'auto');
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', '0 0, 10 3.5, 0 7');
            poly.setAttribute('fill', 'rgba(96, 178, 255, 0.85)');
            marker.append(poly);
            defs.append(marker);
            svg.append(defs, line);
            this.marks.append(svg);
        }
    }
    /* ---------------------------------------------------------------- pointer */
    squareSize() {
        return this.size || this.el.getBoundingClientRect().width / 8;
    }
    onPointerDown = (event) => {
        if (!this.state || !this.state.interactive)
            return;
        if (event.pointerType === 'mouse' && event.button !== 0)
            return;
        const sq = this.squareAt(event.clientX, event.clientY);
        if (sq === null)
            return;
        const id = this.state.ids[sq];
        const pickable = id !== null && id !== undefined && this.handlers.canPick(sq);
        this.drag = {
            from: sq,
            id: id ?? -1,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
            el: pickable ? (this.pieceEls.get(id ?? -1) ?? null) : null,
        };
        try {
            this.el.setPointerCapture(event.pointerId);
        }
        catch { /* a synthetic pointer has nothing to capture */ }
        event.preventDefault();
    };
    onPointerMove = (event) => {
        const drag = this.drag;
        if (!drag || event.pointerId !== drag.pointerId || !drag.el)
            return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) < 5)
            return;
        drag.moved = true;
        const el = drag.el;
        el.classList.add('piece--dragging');
        const rect = this.el.getBoundingClientRect();
        const size = this.squareSize();
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;
        el.style.transform = `translate(${x}px, ${y}px) scale(1.06)`;
    };
    onPointerUp = (event) => {
        const drag = this.drag;
        if (!drag || event.pointerId !== drag.pointerId)
            return;
        this.drag = null;
        try {
            if (this.el.hasPointerCapture(event.pointerId))
                this.el.releasePointerCapture(event.pointerId);
        }
        catch { /* never captured */ }
        const el = drag.el;
        if (el) {
            el.classList.remove('piece--dragging');
            if (drag.moved) {
                // Put it back where it belongs; a real move redraws it to its new square.
                const sq = this.squareOfId(drag.id);
                if (sq !== null) {
                    const { col, row } = this.colRow(sq);
                    const size = this.squareSize();
                    el.style.transform = `translate(${col * size}px, ${row * size}px)`;
                }
            }
        }
        if (drag.moved) {
            const to = this.squareAt(event.clientX, event.clientY);
            if (to !== null && to !== drag.from)
                this.handlers.onDrop(drag.from, to);
            else
                this.handlers.onTap(drag.from);
        }
        else {
            this.handlers.onTap(drag.from);
        }
    };
    onPointerCancel = () => {
        const drag = this.drag;
        this.drag = null;
        if (!drag)
            return;
        const sq = this.squareOfId(drag.id);
        if (drag.el && sq !== null) {
            drag.el.classList.remove('piece--dragging');
            const { col, row } = this.colRow(sq);
            const size = this.squareSize();
            drag.el.style.transform = `translate(${col * size}px, ${row * size}px)`;
        }
    };
    /** Pulse a square, for an illegal move. */
    bump(sq) {
        const mark = this.addMark(sq, 'mark--bump');
        window.setTimeout(() => mark.remove(), 320);
    }
}
