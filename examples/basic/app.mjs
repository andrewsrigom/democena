// Original Democena synthetic example. No accounts or external requests.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
export async function startExample(port = 0) {
  const html = await readFile(new URL('./index.html', import.meta.url));
  const server = createServer((_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
