// Законы «Летучей птички / Flappy Wings» (index.html, один файл с каркасом kit.js внутри):
// меню без ошибок, взмах поднимает и сила тяжести тянет вниз, колонна даёт ровно одно очко,
// столкновение кончает полёт и рекорд переживает перезагрузку, пауза останавливает мир,
// страница влезает в телефон и в большой экран, темы, звук, seed, медали.
// Запуск: npx playwright test tests/flappy-wings.spec.js --workers=1
// Проверка проверок (мутации в копии игры): node tests/mutate.js
// FLAPPY_FILE - путь к другой копии игры (так мутационный скрипт гоняет эти законы на сломанной копии).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { WEB } = require('./helpers');
const { fitReport, expectFits } = require('./_games-helpers');
const { hideTab, showTab, blurWindow, focusWindow } = require('./_kit-helpers');

const FILE = process.env.FLAPPY_FILE || path.join(WEB, 'index.html');
const URL = pathToFileURL(FILE).href;

// Захват мыши в проверках только поддельный: настоящий в безголовом Chromium на Windows зажимает курсор
const FAKE_POINTER_LOCK = () => {
  const fake = function () { window.__fakeLock = (window.__fakeLock || 0) + 1; return Promise.resolve(); };
  for (const P of [Element.prototype, HTMLElement.prototype, HTMLCanvasElement.prototype]) Object.defineProperty(P, 'requestPointerLock', { configurable: true, writable: true, value: fake });
  Object.defineProperty(Document.prototype, 'exitPointerLock', { configurable: true, writable: true, value: function () {} });
};

async function openFlappy(page, query = 'seed=1') {
  const errors = [];
  await page.addInitScript(FAKE_POINTER_LOCK);
  page.on('pageerror', (e) => errors.push(String((e && e.stack) || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(/^https?:\/\//, (route) => route.abort());
  await require('./helpers').lockFirst(page); await page.goto(URL + (query ? '?' + query : ''));
  await page.waitForFunction(() => window.__game && window.__game.ready === true);
  return errors;
}
async function reloadFlappy(page) {
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.ready === true);
}
// Начать полёт кнопкой меню и перейти на ручные шаги мира (цикл страницы мир больше не двигает)
async function startManual(page) {
  await page.click('[data-screen=main] [data-id=play]');
  await page.evaluate(() => { __game.manual = true; });
}

test.describe('flappy: страница и меню', () => {
  test('меню открывается без ошибок, все пункты на месте, под меню летает заставка', async ({ page }) => {
    const errors = await openFlappy(page);
    await expect(page.locator('[data-screen=main]')).toBeVisible();
    for (const t of ['Играть', 'Тема', 'Настройки', 'Достижения и рекорды', 'Как играть', 'Об игре']) {
      await expect(page.locator('[data-screen=main] .kit-btn', { hasText: t }).first()).toBeVisible();
    }
    const t0 = await page.evaluate(() => __game.state.t);
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => ({ t: __game.state.t, mode: __game.state.mode, auto: __game.autopilot }));
    expect(s.t).toBeGreaterThan(t0);
    expect(s).toMatchObject({ mode: 'demo', auto: true });
    for (const id of ['howto', 'credits', 'achievements', 'settings']) {
      await page.click(`[data-screen=main] [data-id=${id}]`);
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-screen=main]')).toBeVisible();
    }
    await page.click('[data-screen=main] [data-id=play]');
    expect(await page.evaluate(() => ({ mode: __game.state.mode, phase: __game.state.phase, kit: __game.kit.mode, auto: __game.autopilot })))
      .toEqual({ mode: 'run', phase: 'ready', kit: 'play', auto: false });
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.__fakeLock || 0), 'игра не просит захват мыши').toBe(0);
  });

  test('один файл: каркас внутри страницы, внешних файлов и чужого товарного знака нет', async () => {
    const html = fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');
    // web/dino/kit.js здесь нет: сверка каркаса с ним - закон сборника GameRoom
    const m = /<script id="kit">\n([\s\S]*?)<\/script>/.exec(html);
    expect(m, 'блок <script id="kit">').not.toBe(null);
    const own = html.replace(m[0], '');            // сама игра без каркаса (в комментарии каркаса есть «<script src=»)
    expect(own).not.toMatch(/<script[^>]+src=/);
    expect(own).not.toMatch(/<link[^>]+href=/);
    expect(own).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/flappy\s*bird/i);
    expect(html).toMatch(/<title>Летучая птичка \/ Flappy Wings \(фан-игра/);
  });

  test('испорченные рекорды в хранилище не роняют игру', async ({ page }) => {
    const errors = await openFlappy(page);
    for (const raw of ['{broken', 'null', '7', '[]', '{"best":{"normal":"x","hard":-5},"games":null,"medals":[]}', '{"best":[1,2],"flaps":1e99}']) {
      await page.evaluate((r) => { localStorage.clear(); localStorage.setItem('flappy:records', r); localStorage.setItem('flappy:settings', '{"theme":"purple","sound":"x"}'); }, raw);
      await reloadFlappy(page);
      const r = await page.evaluate(() => {
        const g = __game; g.manual = true; g.start(); g.flap(); g.step(5, false); g.kit.toMenu();
        return { best: g.records.best, theme: g.kit.settings.theme, sound: g.kit.settings.sound };
      });
      expect(r.theme).toBe('auto');
      expect(r.sound).toBe(true);
      for (const v of Object.values(r.best)) expect(Number.isInteger(v) && v >= 0).toBe(true);
    }
    expect(errors).toEqual([]);
  });
});

test.describe('flappy: полёт', () => {
  test('взмах поднимает птичку, сила тяжести тянет вниз', async ({ page }) => {
    await openFlappy(page);
    await startManual(page);
    const r = await page.evaluate(() => {
      const g = __game, b = g.bird;
      g.clearColumns();
      g.step(3, false);
      const ready = { phase: g.state.phase, y: b.y };
      g.flap(); g.step(1, false);
      const afterFlap = { phase: g.state.phase, vy: b.vy };
      const y0 = ready.y; g.step(8, false);
      const up = y0 - b.y;
      const top = b.y; g.step(50, false);
      return { ready, afterFlap, up, fall: b.y - top, vy: b.vy };
    });
    expect(r.ready.phase).toBe('ready');
    expect(r.afterFlap.phase).toBe('fly');
    expect(r.afterFlap.vy).toBeLessThan(0);
    expect(r.up).toBeGreaterThan(30);                // взмах поднял
    expect(r.fall).toBeGreaterThan(100);             // без взмахов птичка падает всё быстрее
    expect(r.vy).toBeGreaterThan(5);
  });

  test('взмах работает от пробела, ↑, W и клика мышью', async ({ page }) => {
    await openFlappy(page);
    await startManual(page);
    const box = await page.locator('#game').boundingBox();
    const inputs = {
      Space: () => page.keyboard.press('Space'),
      ArrowUp: () => page.keyboard.press('ArrowUp'),
      KeyW: () => page.keyboard.press('KeyW'),
      mouse: () => page.mouse.click(box.x + box.width / 2, box.y + box.height / 2),
    };
    for (const [name, act] of Object.entries(inputs)) {
      await page.evaluate(() => { const g = __game; g.start(); g.manual = true; g.clearColumns(); g.flap(); g.step(40, false); });
      const y0 = await page.evaluate(() => __game.bird.y);
      await act();
      const dy = await page.evaluate(() => { __game.step(8, false); return __game.bird.y; });
      expect(y0 - dy, name).toBeGreaterThan(20);
    }
  });

  test('колонна даёт ровно одно очко', async ({ page }) => {
    await openFlappy(page);
    await startManual(page);
    const r = await page.evaluate(() => {
      const g = __game; g.flap(); g.step(1, false);
      g.clearColumns(); g.bird.y = 300; g.bird.vy = 0;
      const c = g.addColumn(150, 300, 190);
      const scores = [];
      for (let i = 0; i < 260; i++) { if (g.bird.y > 315 && g.bird.vy >= 0) g.flap(); g.step(1, false); scores.push(g.state.score); }
      return { final: g.state.score, phase: g.state.phase, passed: c.passed, firstAt: scores.indexOf(1), left: g.columns.length };
    });
    expect(r.phase).toBe('fly');
    expect(r.passed).toBe(true);
    expect(r.firstAt).toBeGreaterThan(30);           // очко - когда колонна позади, а не сразу
    expect(r.final).toBe(1);
    expect(r.left).toBe(0);                          // колонна ушла за левый край и убрана
  });

  test('удар о колонну кончает полёт, рекорд сохраняется и переживает перезагрузку', async ({ page }) => {
    await openFlappy(page);
    await page.evaluate(() => localStorage.clear());
    await startManual(page);
    const r = await page.evaluate(() => {
      const g = __game; g.flap(); g.step(1, false);
      g.clearColumns(); g.bird.y = 300; g.bird.vy = 0;
      for (const dx of [150, 400]) g.addColumn(dx, 300, 190);
      for (let i = 0; i < 230; i++) { if (g.bird.y > 315 && g.bird.vy >= 0) g.flap(); g.step(1, false); }
      const scored = g.state.score;
      g.addColumn(60, 90, 110);                      // просвет высоко, птичка - на середине: удар
      let hitAt = -1;
      for (let i = 0; i < 80 && g.state.phase === 'fly'; i++) { if (g.bird.y > 315 && g.bird.vy >= 0) g.flap(); g.step(1, false); hitAt = i; }
      const phase = g.state.phase, cause = g.state.cause, saved = JSON.parse(localStorage.getItem('flappy:records')).best.normal;
      const s0 = g.state.score;
      g.flap(); g.step(200, false);
      return { scored, phase, cause, hitAt, saved, end: g.state.phase, after: g.state.score, s0, kit: g.kit.mode };
    });
    expect(r.scored).toBe(2);
    expect(r.phase).toBe('dying');
    expect(r.cause).toBe('column');
    expect(r.saved).toBe(2);                         // записано сразу при ударе
    expect(r.end).toBe('over');
    expect(r.after).toBe(r.s0);                      // после удара очки не идут
    expect(r.kit).toBe('menu');
    await expect(page.locator('[data-screen=over]')).toBeVisible();
    await expect(page.locator('[data-screen=over]')).toContainText('Новый рекорд');
    await expect(page.locator('[data-screen=over] [data-id=best]')).toHaveText('2');
    await reloadFlappy(page);
    expect(await page.evaluate(() => __game.records.best.normal)).toBe(2);
    await page.click('[data-screen=main] [data-id=achievements]');
    await expect(page.locator('[data-screen=achievements]')).toContainText('обычная 2');
    await page.keyboard.press('Escape');
    await page.click('[data-screen=main] [data-id=play]');
    await page.evaluate(() => { __game.manual = true; });
    const low = await page.evaluate(() => {                   // полёт хуже рекорда рекорд не трогает
      const g = __game; g.flap(); g.step(1, false); g.clearColumns(); g.step(200, false);
      return { phase: g.state.phase, cause: g.state.cause, best: g.records.best.normal, newBest: g.state.newBest };
    });
    expect(low).toEqual({ phase: 'over', cause: 'ground', best: 2, newBest: false });
    await expect(page.locator('[data-screen=over]')).toContainText('Конец полёта');
  });

  test('R начинает заново в полёте и после конца; «Ещё раз» тоже', async ({ page }) => {
    await openFlappy(page);
    await startManual(page);
    await page.evaluate(() => { const g = __game; g.flap(); g.step(20, false); g.state.score = 3; });
    await page.keyboard.press('KeyR');
    expect(await page.evaluate(() => ({ p: __game.state.phase, s: __game.state.score, k: __game.kit.mode }))).toEqual({ p: 'ready', s: 0, k: 'play' });
    await page.evaluate(() => { const g = __game; g.manual = true; g.clearColumns(); g.flap(); g.step(250, false); });
    await expect(page.locator('[data-screen=over]')).toBeVisible();
    await page.keyboard.press('KeyR');
    await expect(page.locator('[data-screen=over]')).toHaveCount(0);
    expect(await page.evaluate(() => __game.state.phase)).toBe('ready');
    await page.evaluate(() => { const g = __game; g.manual = true; g.clearColumns(); g.flap(); g.step(250, false); });
    await page.click('[data-screen=over] [data-id=again]');
    expect(await page.evaluate(() => ({ p: __game.state.phase, k: __game.kit.mode }))).toEqual({ p: 'ready', k: 'play' });
  });

  test('медали по порогам 10 / 25 / 50 / 100 и на экране итога', async ({ page }) => {
    await openFlappy(page);
    const m = await page.evaluate(() => [0, 9, 10, 24, 25, 49, 50, 99, 100, 500].map((s) => { const x = __game.medalFor(s); return x ? x.id : null; }));
    expect(m).toEqual([null, null, 'bronze', 'bronze', 'silver', 'silver', 'gold', 'gold', 'platinum', 'platinum']);
    await page.evaluate(() => localStorage.clear());
    await startManual(page);
    await page.evaluate(() => { const g = __game; g.flap(); g.step(1, false); g.clearColumns(); g.state.score = 26; g.step(250, false); });
    await expect(page.locator('[data-screen=over]')).toContainText('Серебряное перо');
    await expect(page.locator('[data-screen=over] .medal.silver')).toBeVisible();
    expect(await page.evaluate(() => ({ s: !!__game.kit.unlocked.silver, b: !!__game.kit.unlocked.bronze, g: !!__game.kit.unlocked.gold, n: __game.records.medals.silver }))).toEqual({ s: true, b: true, g: false, n: 1 });
  });

  test('сложность растёт медленно и в пределах: просвет уже, скорость выше', async ({ page }) => {
    await openFlappy(page);
    const r = await page.evaluate(() => {
      const g = __game, out = {};
      for (const d of ['easy', 'normal', 'hard']) {
        g.kit.set('difficulty', d);
        const gaps = Array.from({ length: 400 }, (_, n) => g.gapFor(n)), speeds = Array.from({ length: 400 }, (_, s) => g.speedFor(s));
        out[d] = {
          gaps0: gaps[0], gaps10: gaps[10], gapsEnd: gaps[399], speeds0: speeds[0], speeds10: speeds[10], speedsEnd: speeds[399],
          gapMono: gaps.every((v, i) => i === 0 || v <= gaps[i - 1]), speedMono: speeds.every((v, i) => i === 0 || v >= speeds[i - 1]),
          inLimits: gaps.every((v) => v >= g.LIMITS.gapMin && v <= g.LIMITS.gapMax) && speeds.every((v) => v >= g.LIMITS.vMin && v <= g.LIMITS.vMax),
        };
      }
      g.kit.set('difficulty', 'normal');
      return out;
    });
    for (const d of ['easy', 'normal', 'hard']) {
      const x = r[d];
      expect(x.gapMono && x.speedMono && x.inLimits, d).toBe(true);
      expect(x.gapsEnd).toBeLessThan(x.gaps0);
      expect(x.speedsEnd).toBeGreaterThan(x.speeds0);
      expect(x.gaps0 - x.gaps10, 'просвет сужается медленно').toBeLessThan(15);
      expect(x.speeds10 - x.speeds0, 'скорость растёт медленно').toBeLessThan(0.5);
    }
    expect(r.easy.gaps0).toBeGreaterThan(r.normal.gaps0);
    expect(r.hard.speeds0).toBeGreaterThan(r.normal.speeds0);
  });

  test('колонны проходимы: простой бот набирает 30 очков на обычной сложности', async ({ page }) => {
    await openFlappy(page, 'seed=3');
    await startManual(page);
    const r = await page.evaluate(() => {
      const g = __game; g.flap(); g.step(1, false);
      for (let i = 0; i < 20000 && g.state.phase === 'fly' && g.state.score < 30; i++) {
        const bx = g.state.camX + g.BIRD_X;
        const c = g.columns.find((q) => q.x + g.COL_W + g.CAP_W > bx - g.BIRD_R);
        const target = c ? c.center + c.gap / 2 - 24 : g.GROUND - 170;
        if (g.bird.y > target && g.bird.vy > -2) g.flap();
        g.step(1, false);
      }
      return { score: g.state.score, phase: g.state.phase };
    });
    expect(r).toEqual({ score: 30, phase: 'fly' });
  });

  test('?seed= повторяет колонны: тот же seed - тот же ряд, другой seed - другой', async ({ page }) => {
    const row = async (seed) => {
      await openFlappy(page, 'seed=' + seed);
      await page.waitForTimeout(150 + seed * 10);    // заставка в меню успела полетать - на ряд колонн полёта это не влияет
      return page.evaluate(() => {
        const g = __game, rows = [];
        for (let k = 0; k < 2; k++) { g.start(); rows.push(Array.from({ length: 15 }, () => { const c = g.spawnColumn(); return `${c.center}/${Math.round(c.gap)}/${c.kind}`; }).join(',')); }
        return rows;
      });
    };
    const a = await row(5), b = await row(5), c = await row(6);
    expect(a[0]).toBe(a[1]);
    expect(b[0]).toBe(a[0]);
    expect(c[0]).not.toBe(a[0]);
  });
});

test.describe('flappy: пауза, темы, звук', () => {
  test('пауза по P останавливает мир, Esc продолжает', async ({ page }) => {
    await openFlappy(page);
    await page.click('[data-screen=main] [data-id=play]');
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    await page.keyboard.press('KeyP');
    await expect(page.locator('[data-screen=pause]')).toBeVisible();
    const a = await page.evaluate(() => ({ t: __game.state.t, y: __game.bird.y, x: __game.state.camX, k: __game.kit.mode }));
    await page.waitForTimeout(500);
    const b = await page.evaluate(() => ({ t: __game.state.t, y: __game.bird.y, x: __game.state.camX, k: __game.kit.mode }));
    expect(a.k).toBe('paused');
    expect(b).toEqual(a);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const c = await page.evaluate(() => ({ t: __game.state.t, k: __game.kit.mode }));
    expect(c.k).toBe('play');
    expect(c.t).toBeGreaterThan(a.t + 5);
  });

  test('Esc - пауза; скрытая вкладка и потеря фокуса ставят паузу, возврат её не снимает', async ({ page }) => {
    await openFlappy(page);
    await page.click('[data-screen=main] [data-id=play]');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => __game.kit.mode)).toBe('paused');
    for (const t of ['Продолжить', 'Настройки', 'Заново', 'В меню']) await expect(page.locator(`[data-screen=pause] .kit-btn:has-text("${t}")`)).toBeVisible();
    await page.click('[data-screen=pause] [data-id=resume]');
    await page.evaluate(() => __game.kit.audioCtx());
    await hideTab(page);
    const hidden = await page.evaluate(() => ({ mode: __game.kit.mode, audio: __game.kit.ctx.state }));
    await showTab(page);
    await page.waitForTimeout(200);
    expect(hidden).toEqual({ mode: 'paused', audio: 'suspended' });
    expect(await page.evaluate(() => __game.kit.mode)).toBe('paused');
    await page.click('[data-screen=pause] [data-id=resume]');
    await blurWindow(page); await focusWindow(page);
    expect(await page.evaluate(() => __game.kit.mode)).toBe('paused');
  });

  test('тема следует системе, переключается и запоминается', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openFlappy(page);
    expect(await page.evaluate(() => ({ t: __game.theme, b: document.body.classList.contains('dark') }))).toEqual({ t: 'dark', b: true });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => __game.theme)).toBe('light');            // «как в системе» меняется вместе с системой
    await page.click('[data-screen=main] [data-id=theme]');                    // как в системе -> светлая
    await page.click('[data-screen=main] [data-id=theme]');                    // -> тёмная
    await expect(page.locator('[data-screen=main] [data-id=theme]')).toHaveText('Тема: тёмная');
    expect(await page.evaluate(() => ({ t: __game.theme, b: document.body.classList.contains('dark') }))).toEqual({ t: 'dark', b: true });
    await reloadFlappy(page);
    expect(await page.evaluate(() => __game.theme)).toBe('dark');
    await page.click('[data-screen=main] [data-id=play]');
    const p = await page.evaluate(() => __game.hudButtonCss('theme'));
    await page.mouse.click(p.x, p.y);                                          // кнопка темы в углу: не взмах
    expect(await page.evaluate(() => ({ t: __game.theme, phase: __game.state.phase }))).toEqual({ t: 'light', phase: 'ready' });
    await page.keyboard.press('KeyT');
    expect(await page.evaluate(() => __game.theme)).toBe('dark');
  });

  test('звук выключается клавишей M и кнопкой в углу, выбор запоминается', async ({ page }) => {
    await openFlappy(page);
    await page.evaluate(() => { localStorage.clear(); __game.kit.audioCtx(); });
    await page.click('[data-screen=main] [data-id=play]');
    await page.keyboard.press('KeyM');
    expect(await page.evaluate(() => ({ s: __game.kit.settings.sound, g: __game.kit.master.gain.value }))).toEqual({ s: false, g: 0 });
    // мир на ручных шагах: после клика по кнопке звука делаем шаги и проверяем, что взмаха не было
    await page.evaluate(() => { __game.manual = true; });
    const p = await page.evaluate(() => __game.hudButtonCss('sound'));
    await page.mouse.click(p.x, p.y);
    await page.evaluate(() => __game.step(3));
    expect(await page.evaluate(() => ({ s: __game.kit.settings.sound, g: __game.kit.master.gain.value, phase: __game.state.phase, flaps: __game.state.flaps }))).toEqual({ s: true, g: 1, phase: 'ready', flaps: 0 });
    await page.keyboard.press('KeyM');
    await reloadFlappy(page);
    expect(await page.evaluate(() => __game.kit.settings.sound)).toBe(false);
  });

  test('клавиши W, R, M, T нельзя забрать под другое действие', async ({ page }) => {
    await openFlappy(page);
    await page.click('[data-screen=main] [data-id=settings]');
    await page.click('[data-bind="pause:0"]');
    await page.keyboard.press('KeyR');
    await expect(page.locator('.kit-modal .kit-warn')).toContainText('уже занята');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-bind="pause:0"]')).toHaveText('P');
  });

  // Независимая проверка 16.10: подсказка перед полётом и «Как играть» называли клавиши по умолчанию
  // («пробел, ↑», «P»), даже когда их переназначили, - пробел уже ничего не делал, а подсказка звала его.
  test('подсказка перед полётом и «Как играть» называют назначенные клавиши', async ({ page }) => {
    await page.addInitScript(() => {
      window.__drawn = [];
      const f = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { if (window.__drawn.length < 20000) window.__drawn.push(String(t)); return f.call(this, t, ...a); };
    });
    await openFlappy(page);
    const hint = async () => {
      await page.evaluate(() => { __drawn.length = 0; });
      await page.waitForTimeout(250);
      return page.evaluate(() => [...new Set(__drawn)].filter((t) => /Взмах|пауза/.test(t)).join(' | '));
    };
    // по умолчанию - как раньше
    await page.click('[data-screen=main] [data-id=play]');
    expect(await hint()).toBe('Взмах - пробел, ↑, W, | P или Esc - пауза, R - заново');
    await page.keyboard.press('KeyP');
    await page.click('[data-screen=pause] [data-id=menu]');
    // взмах на F и G, пауза на O
    await page.click('[data-screen=main] [data-id=settings]');
    for (const [bind, key] of [['flap:0', 'KeyF'], ['flap:1', 'KeyG'], ['pause:0', 'KeyO']]) {
      await page.click(`[data-bind="${bind}"]`);
      await page.keyboard.press(key);
    }
    await page.click('[data-screen=settings] .kit-btn.primary');
    await page.click('[data-screen=main] [data-id=play]');
    const h = await hint();
    expect(h).toBe('Взмах - F, G, W, | O или Esc - пауза, R - заново');
    // подсказка не врёт: пробел не взмахивает, F - взмахивает
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => __game.state.phase)).toBe('ready');
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => __game.state.phase)).toBe('fly');
    await page.keyboard.press('KeyO');
    await page.click('[data-screen=pause] [data-id=menu]');
    await page.click('[data-screen=main] [data-id=howto]');
    const howto = await page.locator('[data-screen=howto]').textContent();
    expect(howto).toContain('F, G, W, клик мышью или касание');
    expect(howto).toContain('O или Esc - пауза');
    expect(howto).not.toMatch(/Пробел|↑/);
  });
});

test.describe('flappy: окно', () => {
  test.use({ hasTouch: true });
  test('касание экрана - взмах', async ({ page }) => {
    await openFlappy(page);
    await startManual(page);
    await page.evaluate(() => { const g = __game; g.clearColumns(); g.flap(); g.step(40, false); });
    const y0 = await page.evaluate(() => __game.bird.y);
    const box = await page.locator('#game').boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    const y1 = await page.evaluate(() => { __game.step(8, false); return __game.bird.y; });
    expect(y0 - y1).toBeGreaterThan(20);
  });

  const SIZES = [
    { width: 360, height: 640, name: 'телефон' }, { width: 390, height: 844, name: 'телефон высокий' }, { width: 844, height: 390, name: 'телефон боком' },
    { width: 768, height: 1024, name: 'планшет' }, { width: 1280, height: 800, name: 'ноутбук' }, { width: 1920, height: 1080, name: 'большой экран' },
  ];
  for (const size of SIZES) {
    test(`${size.name} ${size.width}x${size.height}: игра, меню и итог влезают, холст чёткий, кнопки в углу на холсте`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      const errors = await openFlappy(page);
      expectFits(expect, await fitReport(page, '#game'));
      expectFits(expect, await fitReport(page, '[data-screen=main] .kit-panel'));
      const c = await page.evaluate(() => { const c = document.getElementById('game'), r = c.getBoundingClientRect(); return { ratio: c.width / r.width, dpr: devicePixelRatio, h: r.height, w: r.width }; });
      expect(Math.abs(c.ratio - c.dpr)).toBeLessThan(0.02);
      expect(Math.max(c.w / size.width, c.h / size.height), 'холст занимает окно по одной из сторон').toBeGreaterThan(0.9);
      await page.click('[data-screen=main] [data-id=play]');
      const r = await page.evaluate(() => { const c = document.getElementById('game').getBoundingClientRect(); return { c: { l: c.left, t: c.top, r: c.right, b: c.bottom }, s: __game.hudButtonCss('sound'), m: __game.hudButtonCss('theme') }; });
      for (const p of [r.s, r.m]) { expect(p.x).toBeGreaterThan(r.c.l); expect(p.x).toBeLessThan(r.c.r); expect(p.y).toBeGreaterThan(r.c.t); expect(p.y).toBeLessThan(r.c.b); }
      await page.evaluate(() => { const g = __game; g.manual = true; g.clearColumns(); g.flap(); g.step(250, false); });
      await expect(page.locator('[data-screen=over]')).toBeVisible();
      expectFits(expect, await fitReport(page, '[data-screen=over] .kit-panel'));
      expect(errors).toEqual([]);
    });
  }
});
