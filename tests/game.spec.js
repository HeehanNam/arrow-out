const { test, expect } = require('@playwright/test');
const C = require('../campaign.json');

async function load(page, level = 1) {
  await page.addInitScript(level => {
    if (!sessionStorage.getItem('test-initialized')) {
      localStorage.clear();
      localStorage.setItem('arrowOutLevel', level);
      localStorage.setItem('arrowOutUnlocked', 100);
      localStorage.setItem('arrowOutSeen-v2', '1');
      localStorage.setItem('arrowOutSound', 'off');
      sessionStorage.setItem('test-initialized', '1');
    }
  }, level);
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('.piece')).toHaveCount(C.levels[level - 1].pieces.length);
}
async function remove(page, id) {
  const piece = page.locator(`[data-id="${id}"]`);
  await piece.focus();
  await page.keyboard.press('Enter');
  await expect(piece).toHaveCount(0);
}

test('390px touch: blocked choice, optimal hint, real tap, resume, zoom, no overflow', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await load(page);
  const p = C.levels[0];
  const goal = page.locator(`[data-id="${p.targetId}"]`);
  await goal.focus(); await page.keyboard.press('Space');
  await expect(page.locator('#challenge')).toHaveText('0');
  await expect(page.locator('#toast')).toContainText('먼저');
  await page.locator('#hint').tap();
  await expect(page.locator(`[data-id="${p.optimal[0]}"]`)).toHaveClass(/hinted/);
  const first = p.pieces.find(a => a.id === p.optimal[0]);
  const position = await page.locator('#board').evaluate((board, point) => {
    const p = new DOMPoint(point.c + .5, point.r + .5).matrixTransform(board.getScreenCTM());
    return { x: p.x, y: p.y };
  }, first.points[0]);
  await page.touchscreen.tap(position.x, position.y);
  await expect(page.locator(`[data-id="${first.id}"]`)).toHaveCount(0);
  await page.reload(); await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('.piece')).toHaveCount(p.pieces.length - 1);
  await expect(page.locator('#hints')).toHaveText('2');
  await page.locator('#zoom-in').tap(); await expect(page.locator('#zoom-value')).toHaveText('150%');
  await page.locator('#zoom-reset').tap(); await expect(page.locator('#zoom-value')).toHaveText('100%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

for (const level of [1, 3, 5, 25, 65, 100]) {
  test(`level ${level}: optimal play wins, terminal state and next level`, async ({ page }) => {
    await load(page, level);
    await page.screenshot({ path: `.test-results/level-${level}-mobile.png`, fullPage: true });
    const p = C.levels[level - 1];
    for (const id of p.optimal) await remove(page, id);
    await expect(page.locator('#win')).toBeVisible();
    await expect(page.locator('#final')).toHaveText(String(p.par));
    await expect(page.locator('#stars')).toHaveText('★★★');
    await page.locator('#win [data-close]').tap();
    await expect(page.locator('#hint')).toBeDisabled();
    await expect(page.locator('#continue')).toBeVisible();
    expect(await page.evaluate(level => JSON.parse(localStorage.getItem('arrowOutRecords-v2'))[level].stars, level)).toBe(3);
    await page.locator('#continue').tap();
    if (level === 100) await expect(page.locator('#level-dialog')).toBeVisible();
    else await expect(page.locator('#level')).toHaveText(String(level + 1).padStart(2, '0'));
  });
}

test('move limit: decoys consume moves, defeat and exact replay', async ({ page }) => {
  await load(page, 3);
  const p = C.levels[2];
  for (const id of p.solution.slice(0, p.moveLimit)) await remove(page, id);
  await expect(page.locator('#lose')).toBeVisible();
  await page.locator('#retry').tap();
  await expect(page.locator('.piece')).toHaveCount(p.pieces.length);
  await expect(page.locator('#challenge')).toHaveText(String(p.moveLimit));
  await expect(page.locator('#hint')).toBeEnabled();
});

test('time starts on first choice, pauses in menus, expires and retries', async ({ page }) => {
  await page.clock.install();
  await load(page, 5);
  const p = C.levels[4];
  await page.clock.runFor(3000);
  await expect(page.locator('#challenge')).toHaveText(`${p.timeLimit}초`);
  await page.locator(`[data-id="${p.targetId}"]`).focus(); await page.keyboard.press('Enter');
  await page.clock.runFor(2100);
  const time = await page.locator('#challenge').textContent();
  expect(time).not.toBe(`${p.timeLimit}초`);
  await page.locator('#pause').tap();
  await page.clock.runFor(10000); await expect(page.locator('#challenge')).toHaveText(time);
  await page.locator('#pause-dialog [data-close]').tap();
  await page.clock.runFor((p.timeLimit + 1) * 1000);
  await expect(page.locator('#lose')).toBeVisible();
  await page.locator('#retry').tap(); await expect(page.locator('#challenge')).toHaveText(`${p.timeLimit}초`);
});

test('onboarding, locked map, help and restart confirmation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#tutorial')).toBeVisible();
  await page.locator('#tutorial .primary').tap();
  await page.locator('#levels').tap();
  await expect(page.locator('#level-grid button')).toHaveCount(100);
  await expect(page.locator('#level-grid button:disabled')).toHaveCount(99);
  await page.locator('#level-dialog .close').tap();
  await remove(page, C.levels[0].optimal[0]);
  await page.locator('#restart').tap(); await expect(page.locator('#restart-dialog')).toBeVisible();
  await page.locator('#confirm-restart').tap();
  await expect(page.locator('.piece')).toHaveCount(C.levels[0].pieces.length);
});

test('normal-speed movement changes the route, preserves length, and blocks repeat input', async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await load(page);
  const id = C.levels[0].optimal[0];
  const piece = page.locator(`[data-id="${id}"]`);
  const line = piece.locator('.arrow-line');
  const initial = await line.getAttribute('d');
  const length = await line.evaluate(node => node.getTotalLength());
  await piece.focus(); await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.clock.runFor(120);
  expect(await line.getAttribute('d')).not.toBe(initial);
  expect(await line.evaluate(node => node.getTotalLength())).toBeCloseTo(length, 4);
  expect(await piece.getAttribute('transform')).toBeNull();
  await expect(page.locator('#challenge')).toHaveText('1');
  await expect(page.locator('#hint')).toBeDisabled();
  await page.clock.runFor(1000);
  await expect(piece).toHaveCount(0);
  await expect(page.locator('#hint')).toBeEnabled();
});
