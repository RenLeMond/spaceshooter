import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

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

async function assertStartDockFitsViewport(page, label) {
  await page.waitForSelector('.home-entry-dock', { state: 'visible', timeout: 10000 });
  const box = await page.locator('.home-entry-dock').boundingBox();
  const viewport = page.viewportSize();

  assert.ok(box, `${label}: bottom dock should have a layout box`);
  assert.ok(viewport, `${label}: page should expose a viewport`);
  assert.ok(box.height >= 30, `${label}: bottom dock should be tall enough, got ${box.height}`);
  assert.ok(box.y + box.height <= viewport.height, `${label}: bottom dock bottom ${box.y + box.height} should fit viewport ${viewport.height}`);
  assert.ok(box.y >= 0, `${label}: bottom dock top ${box.y} should fit viewport`);
  assert.equal(await page.locator('.home-entry-link').count(), 4, `${label}: bottom dock should render all entry links`);
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

test('mobile start screen keeps the bottom dock visible', async t => {
  const { server, port } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const page = await browser.newPage({
    viewport: { width: 393, height: 760 },
    isMobile: true,
    hasTouch: true
  });
  await page.goto(`http://127.0.0.1:${port}/space_shooter.html`, { waitUntil: 'domcontentloaded' });

  await assertStartDockFitsViewport(page, 'generic mobile');
});

test('iPhone Safari profiles keep the start dock inside the visual viewport', async t => {
  const { server, port } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const base = `http://127.0.0.1:${port}`;
  for (const deviceName of ['iPhone SE', 'iPhone 13']) {
    const { defaultBrowserType, ...device } = devices[deviceName];
    const page = await browser.newPage(device);
    await page.goto(`${base}/space_shooter.html`, { waitUntil: 'domcontentloaded' });
    await assertStartDockFitsViewport(page, deviceName);
    await page.close();
  }
});
