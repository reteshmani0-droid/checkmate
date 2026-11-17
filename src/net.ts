/**
 * Online play: a tiny wrapper around PeerJS (loaded from the CDN) that gives us a
 * peer-to-peer data channel between two browsers. No backend, no accounts: one player
 * creates a room code, the other types it in (or opens a shared link), and moves
 * travel directly between them.
 */
export type NetMessage =
    | { t: 'hello'; minutes: number; hostSide: 'w' | 'b' }
    | { t: 'move'; uci: string; clocks: { w: number; b: number } }
    | { t: 'resign' }
    | { t: 'flag'; loser: 'w' | 'b' }
    | { t: 'rematch' }
    | { t: 'bye' }
    | { t: 'ping' };

export type Connection = {
    send: (message: NetMessage) => void;
    close: () => void;
};

type Handlers = {
    onOpen: (connection: Connection) => void;
    onMessage: (message: NetMessage) => void;
    onClose: () => void;
    onError: (error: string) => void;
};

declare global
{
    interface Window
    {
        Peer?: new (id?: string, options?: Record<string, unknown>) => PeerInstance;
    }
}

type PeerInstance = {
    on: (event: string, callback: (...args: any[]) => void) => void;
    connect: (id: string, options?: Record<string, unknown>) => DataConnection;
    destroy: () => void;
    id: string;
};

type DataConnection = {
    on: (event: string, callback: (...args: any[]) => void) => void;
    send: (data: unknown) => void;
    close: () => void;
    open: boolean;
};

/** A short, human-typeable room code. */
export function makeCode(): string
{
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    return code;
}

function wrap(conn: DataConnection, handlers: Handlers): Connection
{
    const api: Connection = {
        send: (message: NetMessage) => { try { conn.send(message); } catch { /* gone */ } },
        close: () => { try { conn.close(); } catch { /* gone */ } },
    };
    conn.on('open', () => handlers.onOpen(api));
    conn.on('data', (data: unknown) =>
    {
        if (data && typeof data === 'object' && 't' in (data as object))
        {
            handlers.onMessage(data as NetMessage);
        }
    });
    conn.on('close', () => handlers.onClose());
    conn.on('error', (error: unknown) => handlers.onError(String(error)));
    return api;
}

/** Create a room and wait for one guest. Resolves with the connection once the guest joins. */
export function host(code: string, handlers: Handlers): { peer: PeerInstance; cancel: () => void }
{
    const PeerCtor = window.Peer;
    if (!PeerCtor) throw new Error('PeerJS is not loaded');
    const peer = new PeerCtor(code, { debug: 0 });
    let settled = false;
    let conn: Connection | null = null;

    peer.on('open', () => { /* ready to accept */ });
    peer.on('connection', (incoming: DataConnection) =>
    {
        if (settled) { incoming.close(); return; }
        settled = true;
        conn = wrap(incoming, handlers);
    });
    peer.on('error', (error: unknown) =>
    {
        handlers.onError(String(error));
    });

    return {
        peer,
        cancel: () =>
        {
            try { conn?.close(); } catch { /* ignore */ }
            try { peer.destroy(); } catch { /* ignore */ }
        },
    };
}

/** Join an existing room. */
export function guest(code: string, handlers: Handlers): { peer: PeerInstance; cancel: () => void }
{
    const PeerCtor = window.Peer;
    if (!PeerCtor) throw new Error('PeerJS is not loaded');
    const peer = new PeerCtor(undefined, { debug: 0 });
    let conn: Connection | null = null;

    peer.on('open', () =>
    {
        const incoming = peer.connect(code.toUpperCase(), { reliable: true });
        conn = wrap(incoming, handlers);
    });
    peer.on('error', (error: unknown) =>
    {
        handlers.onError(String(error));
    });

    return {
        peer,
        cancel: () =>
        {
            try { conn?.close(); } catch { /* ignore */ }
            try { peer.destroy(); } catch { /* ignore */ }
        },
    };
}
