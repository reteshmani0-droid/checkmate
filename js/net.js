/** A short, human-typeable room code. */
export function makeCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++)
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
    return code;
}
function wrap(conn, handlers) {
    const api = {
        send: (message) => { try {
            conn.send(message);
        }
        catch { /* gone */ } },
        close: () => { try {
            conn.close();
        }
        catch { /* gone */ } },
    };
    conn.on('open', () => handlers.onOpen(api));
    conn.on('data', (data) => {
        if (data && typeof data === 'object' && 't' in data) {
            handlers.onMessage(data);
        }
    });
    conn.on('close', () => handlers.onClose());
    conn.on('error', (error) => handlers.onError(String(error)));
    return api;
}
/** Create a room and wait for one guest. Resolves with the connection once the guest joins. */
export function host(code, handlers) {
    const PeerCtor = window.Peer;
    if (!PeerCtor)
        throw new Error('PeerJS is not loaded');
    const peer = new PeerCtor(code, { debug: 0 });
    let settled = false;
    let conn = null;
    peer.on('open', () => { });
    peer.on('connection', (incoming) => {
        if (settled) {
            incoming.close();
            return;
        }
        settled = true;
        conn = wrap(incoming, handlers);
    });
    peer.on('error', (error) => {
        handlers.onError(String(error));
    });
    return {
        peer,
        cancel: () => {
            try {
                conn?.close();
            }
            catch { /* ignore */ }
            try {
                peer.destroy();
            }
            catch { /* ignore */ }
        },
    };
}
/** Join an existing room. */
export function guest(code, handlers) {
    const PeerCtor = window.Peer;
    if (!PeerCtor)
        throw new Error('PeerJS is not loaded');
    const peer = new PeerCtor(undefined, { debug: 0 });
    let conn = null;
    peer.on('open', () => {
        const incoming = peer.connect(code.toUpperCase(), { reliable: true });
        conn = wrap(incoming, handlers);
    });
    peer.on('error', (error) => {
        handlers.onError(String(error));
    });
    return {
        peer,
        cancel: () => {
            try {
                conn?.close();
            }
            catch { /* ignore */ }
            try {
                peer.destroy();
            }
            catch { /* ignore */ }
        },
    };
}
