/**
 * A static server for this folder, with no dependencies: `node serve.mjs [port]`.
 * It exists so the game can be opened at http://localhost:4180 without installing anything.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname);
const port = Number(process.argv[2] ?? 4180);

const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
};

createServer(async (request, response) =>
{
    try
    {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const requested = url.pathname === '/' ? '/index.html' : url.pathname;
        const path = join(root, normalize(decodeURIComponent(requested)));
        if (!path.startsWith(root)) throw new Error('outside the folder');
        const info = await stat(path);
        const file = info.isDirectory() ? join(path, 'index.html') : path;
        const body = await readFile(file);
        response.writeHead(200, {
            'content-type': types[extname(file)] ?? 'application/octet-stream',
            'cache-control': 'no-cache',
        });
        response.end(body);
    }
    catch
    {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    }
}).listen(port, () =>
{
    console.log(`Checkmate on http://localhost:${port}`);
});
