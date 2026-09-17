import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { captureBrowser } from '../browser.mjs';

async function fixture(t) {
  const output = await mkdtemp(path.join(tmpdir(), 'democena-capture-'));
  let externalVisits = 0;
  const external = createServer((_req, res) => {
    externalVisits++;
    res.end('<h1>Destination</h1>');
  });
  await new Promise((resolve) => external.listen(0, '127.0.0.1', resolve));
  const externalUrl = `http://127.0.0.1:${external.address().port}`;
  const server = createServer((req, res) => {
    if (req.url === '/leave') {
      res.writeHead(302, { Location: externalUrl });
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<style>body {background:white;margin:100px} [data-testid=secret] {position:absolute;left:0;top:0;width:64px;height:64px;background:red}</style>
      <h1>${req.headers.cookie?.includes('session=synthetic') ? 'Signed in' : 'Example'}</h1>
      <a href="/leave">Leave</a><input type="password" aria-label="Password">
      <script>document.body.insertAdjacentHTML('beforeend','<div data-testid="secret">Sample secret</div>')</script>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await Promise.all([
      new Promise((resolve) => server.close(resolve)),
      new Promise((resolve) => external.close(resolve)),
    ]);
    await rm(output, { recursive: true, force: true });
  });
  return {
    output,
    url: `http://127.0.0.1:${server.address().port}`,
    externalUrl,
    visits: () => externalVisits,
  };
}
const check = {
  id: 'initial',
  action: 'expect',
  target: { role: 'heading', name: 'Example' },
};
test('capture measures real events, loads saved auth and redacts dynamic content across navigation', async (t) => {
  const f = await fixture(t);
  const state = {
    cookies: [
      {
        name: 'session',
        value: 'synthetic',
        domain: '127.0.0.1',
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ],
    origins: [],
  };
  const result = await captureBrowser(
    {
      url: f.url,
      redact: ['[data-testid=secret]'],
      steps: [
        { ...check, target: { role: 'heading', name: 'Signed in' } },
        {
          id: 'first',
          action: 'mark',
          target: { role: 'heading', name: 'Signed in' },
        },
        { id: 'navigate', action: 'goto', url: '/second' },
        {
          id: 'second',
          action: 'mark',
          target: { role: 'heading', name: 'Signed in' },
        },
      ],
    },
    f.output,
    { storageState: state },
  );
  const duration = Number(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        result.recording,
      ],
      { encoding: 'utf8' },
    ).trim(),
  );
  assert(
    result.events.every((e) => e.at >= 0 && e.end >= e.at && e.end < duration),
  );
  const first = result.events.find((e) => e.id === 'first');
  assert(first.box.width > 0);
  assert(Number.isFinite(first.boxAt) && first.boxAt >= first.at && first.boxAt <= first.end);
  assert.equal(result.events[0].verified, true);
  assert(result.clock.lastFrameTimestamp >= result.clock.firstFrameTimestamp);
  for (const file of [
    result.preview,
    ...result.events.filter((e) => e.screenshot).map((e) => e.screenshot),
  ]) {
    const pixel = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-i',
      file,
      '-vf',
      'crop=1:1:16:16',
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1',
    ]);
    assert.deepEqual(
      [...pixel],
      [255, 255, 255],
      'redacted region must show the white background, not the red secret',
    );
  }
});
test('unapproved redirect is blocked; an explicitly allowed origin can be recorded', async (t) => {
  const f = await fixture(t);
  const plan = {
    url: f.url,
    steps: [
      check,
      { id: 'leave', action: 'click', target: { role: 'link', name: 'Leave' } },
    ],
  };
  await assert.rejects(
    captureBrowser(plan, path.join(f.output, 'blocked')),
    /allowed origins/,
  );
  assert.equal(f.visits(), 0);
  const result = await captureBrowser(
    {
      ...plan,
      allowedOrigins: [f.externalUrl],
      steps: [
        ...plan.steps,
        {
          id: 'destination',
          action: 'expect',
          target: { role: 'heading', name: 'Destination' },
        },
      ],
    },
    path.join(f.output, 'allowed'),
  );
  assert(result.events.at(-1).verified);
  assert(f.visits() > 0);
});
test('invalid redaction and password entry cannot silently produce successful takes', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    captureBrowser(
      { url: f.url, redact: ['['], steps: [check] },
      path.join(f.output, 'selector'),
    ),
  );
  await assert.rejects(
    captureBrowser(
      {
        url: f.url,
        steps: [
          check,
          {
            id: 'password',
            action: 'fill',
            target: { label: 'Password' },
            value: 'synthetic-password',
          },
        ],
      },
      path.join(f.output, 'password'),
    ),
    (error) =>
      /password/.test(error.message) &&
      !error.message.includes('synthetic-password'),
  );
});
test('capture deadline closes the browser and reports failure', async (t) => {
  const f = await fixture(t);
  const start = Date.now();
  await assert.rejects(
    captureBrowser(
      {
        url: f.url,
        timeoutMs: 5000,
        steps: [check, { id: 'slow-step', action: 'wait', durationMs: 10000 }],
      },
      f.output,
    ),
    /deadline|timed out/,
  );
  assert(Date.now() - start < 15000);
});
