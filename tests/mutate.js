// Проверка проверок «Летучей птички»: по одному ломает правило игры в КОПИИ страницы во временной
// папке и гоняет на ней tests/flappy-wings.spec.js (через FLAPPY_FILE). Сломанное правило
// должно уронить хотя бы одну проверку («мутант убит»). Исходник web/flappy-wings не меняется,
// поэтому обрыв скрипта ничего не портит.
// Запуск из корня репозитория: node tests/mutate.js
// Файл не *.spec.js - Playwright его сам не запускает.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'index.html');
const SPEC = 'tests/flappy-wings.spec.js';

// from - точный кусок кода (должен встречаться ровно один раз), to - сломанный вариант
const MUTANTS = [
  { name: 'очко на каждом шаге после колонны (нет отметки «пройдена»)', from: 'if (!c.passed && bx > c.x + COL_W / 2) {', to: 'if (bx > c.x + COL_W / 2) {' },
  { name: 'нет силы тяжести', from: 'bird.vy = Math.min(bird.vy + GRAVITY, MAX_FALL);   // сила тяжести', to: 'bird.vy = Math.min(bird.vy + 0, MAX_FALL);' },
  { name: 'взмах не поднимает', from: 'bird.vy = FLAP_V;', to: 'bird.vy = 0;' },
  { name: 'удар о колонну не замечается', from: 'const hitCol = collidingColumn();', to: 'const hitCol = null;' },
  { name: 'рекорд не записывается', from: "function saveRecords() { kit.save('records', records); }", to: 'function saveRecords() {}' },
  { name: 'пауза не останавливает мир', from: "const live = (kit.mode === 'play' && state.mode === 'run')", to: "const live = (kit.mode !== 'menu' && state.mode === 'run')" },
  { name: 'просвет не сужается', from: 'Math.max(GAP_MIN, GAP0 - n * GAP_STEP)', to: 'GAP0' },
  { name: 'seed не действует', from: 'colRnd = SEED !== null ? mulberry32(SEED) : Math.random;', to: 'colRnd = Math.random;' },
  { name: 'медаль серебра с 30 очков', from: "{ id: 'silver', at: 25,", to: "{ id: 'silver', at: 30," },
  { name: 'клик по кнопке звука считается взмахом', from: "if (b === 'sound') toggleSound();", to: "if (b === 'sound') { toggleSound(); pointerTap = true; }" },
  // независимая проверка 16.10: подсказки называют назначенные клавиши
  { name: 'подсказка перед полётом снова с клавишами по умолчанию', from: "hudText('Взмах - ' + flapKeysText() + ',', VW / 2, 352, 15, 'center', P.hud, VW - 24);", to: "hudText('Взмах - пробел, ↑, W,', VW / 2, 352, 15);" },
  { name: '«Как играть» снова с клавишами по умолчанию', from: "${b(keysOf('flap').concat('W')).join(', ')}", to: '<b>Пробел</b>, <b>↑</b>, <b>W</b>' },
];

// FW_MUT_NAMES=<регулярка> - только мутанты с таким именем (быстрая проверка нового)
const CHOSEN = MUTANTS.filter((m) => !process.env.FW_MUT_NAMES || new RegExp(process.env.FW_MUT_NAMES).test(m.name));

function runSpec(file) {
  const r = spawnSync(`npx playwright test ${SPEC} --workers=1 --max-failures=1 --reporter=dot`, {
    cwd: ROOT, env: { ...process.env, FLAPPY_FILE: file }, shell: true, encoding: 'utf8', timeout: 10 * 60 * 1000,
  });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

function main() {
  const src = fs.readFileSync(SRC, 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-mutants-'));
  const file = path.join(dir, 'index.html');
  let survived = 0;
  try {
    fs.writeFileSync(file, src);
    const base = runSpec(file);
    console.log(`исходная копия: ${base.ok ? 'проверки зелёные' : 'ПРОВЕРКИ КРАСНЫЕ'}`);
    if (!base.ok) { console.log(base.out.slice(-3000)); process.exitCode = 2; return; }
    for (const m of CHOSEN) {
      const n = src.split(m.from).length - 1;
      if (n !== 1) { console.log(`? ${m.name}: кусок кода найден ${n} раз - мутант устарел`); survived++; continue; }
      fs.writeFileSync(file, src.replace(m.from, m.to));
      const r = runSpec(file);
      const failed = /\d+\) .*›.*›\s*(.+)/.exec(r.out);
      console.log(`${r.ok ? 'ВЫЖИЛ' : 'убит '}  ${m.name}${!r.ok && failed ? '  <- ' + failed[1].replace(/[─\s]+$/, '') : ''}`);
      if (r.ok) survived++;
    }
    console.log(`итог: убито ${CHOSEN.length - survived} из ${CHOSEN.length}`);
    if (survived) process.exitCode = 1;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (require.main === module) main();
module.exports = { MUTANTS };
