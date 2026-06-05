import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const requestPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const filePath = path.resolve(root, '.' + requestPath);
      if (!filePath.startsWith(root + path.sep) || !(await stat(filePath)).isFile()) {
        response.writeHead(404).end();
        return;
      }
      response.setHeader('Content-Type', mimeTypes[path.extname(filePath)] || 'application/octet-stream');
      response.end(await readFile(filePath));
    } catch (_) {
      response.writeHead(404).end();
    }
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

test('critical pages load without script errors and the game runtime starts', async t => {
  const { server, port } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const base = `http://127.0.0.1:${port}`;

  for (const pagePath of ['/index.html', '/leaderboard.html', '/v6_hangar.html', '/space_shooter.html']) {
    const response = await page.goto(base + pagePath, { waitUntil: 'domcontentloaded' });
    assert.equal(response.ok(), true, `${pagePath} should load successfully`);
    await page.waitForTimeout(500);
  }

  await page.waitForFunction(() => Boolean(window.gameWorker || window.gameEngine), null, { timeout: 10000 });
  assert.deepEqual(pageErrors, []);
});

test('V6 hangar recalculates tactical attributes after changing a wingman', async t => {
  const { server, port } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/v6_hangar.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#btn-right-gravity').click();

  await assert.doesNotReject(() => page.waitForFunction(() => {
    return document.getElementById('val-em').textContent === '60%'
      && document.getElementById('val-grav').textContent === '70%'
      && document.getElementById('synergyName').textContent === '混合战术共鸣';
  }));
});
