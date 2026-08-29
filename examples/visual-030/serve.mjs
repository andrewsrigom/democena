/**
 * Static file server for the 0.3.0 visual review example. No build step, no extra dependencies.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = import.meta.dirname;
const port = Number(process.env.PORT ?? 4174);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  const relative = normalize(path === '/' ? 'index.html' : path.slice(1)).replace(/^(\.\.[/\\])+/, '');

  try {
    const body = await readFile(join(root, relative));
    response.writeHead(200, { 'content-type': TYPES[extname(relative)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
  }
});

server.listen(port, () => console.log(`visual-030 app on http://localhost:${port}`));
