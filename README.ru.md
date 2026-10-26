<div align="center">

# FlappyWings - Летучая птичка

**Летучая птичка (Flappy Wings) - игра «пролети между колоннами» на одной HTML-странице: птичка летит сама, а вы машете её крыльями. Работает в браузере без сервера и без интернета: откройте `index.html` или играйте онлайн.**

[**▶ Играть онлайн →**](https://alexalesha.github.io/FlappyWings/) &nbsp;·&nbsp; [English version of this file](README.md)

[![Status](https://img.shields.io/badge/status-stable-brightgreen)](#) [![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/docs/Web/HTML) [![Website](https://img.shields.io/badge/Website-open-0A84FF?logo=googlechrome&logoColor=white)](https://alexalesha.github.io/FlappyWings/) [![Built with Claude Code](https://img.shields.io/badge/Built_with-Claude_Code-D97757?logo=claude&logoColor=white)](https://claude.com/claude-code)

Код, тесты и документация этого проекта написаны Claude (Anthropic) в Claude Code. Идеи, проверка и решения - Алексей.

</div>

> Фанатская игра. Не связана с авторами и правообладателями известных игр этого жанра.

![Меню](docs/screens/menu.png)

![Полёт](docs/screens/play.png)

## Что есть в игре

- Полёт между каменными и деревянными колоннами: каждая колонна - очко; с каждой колонной просвет чуть уже, а полёт чуть быстрее.
- Три сложности, у каждой свой рекорд; медали за один полёт: бронзовое перо - 10 очков, серебряное - 25, золотое - 50, платиновое - 100.
- Достижения и рекорды, светлая и тёмная тема (или как в системе), настройки с переназначением клавиш, геймпад.
- Игра встаёт на паузу сама, если окно или вкладку скрыть.
- Птичка, колонны и пейзаж нарисованы кодом, звуки и музыка синтезируются WebAudio; ни одного файла из интернета.

## Управление

| Клавиша | Действие |
|---|---|
| Пробел, ↑, W, клик или касание | взмах |
| P или Esc | пауза |
| R | заново |
| M | звук |
| T | светлая или тёмная тема |

## Запуск у себя

Откройте `index.html` в Chrome, Edge или Firefox. Всё лежит в репозитории, ничего не скачивается.

## Проверки

Законы - проверки Playwright в `tests/`. Они открывают страницу по файловому адресу в
безголовом Chromium, по одной за раз:

```
npm install
npx playwright install chromium
npm test
node tests/mutate.js     # мутационная проверка: сломанные копии игры должны валить законы
```

Захват мыши в проверках всегда поддельный (настоящий `requestPointerLock` в безголовом Chromium
на Windows может зажать курсор человека). Мутационная проверка ломает копию игры во временной
папке и `index.html` не трогает. Картинки выше сняты без окна.

## История

Игра сделана в сборнике [Hub](https://github.com/ALEXalesha/ALEXalesha.github.io) (папка `web/flappy-wings`), там же она запускается в «Хабе» ([играть там](https://alexalesha.github.io/)). Здесь игра со своей историей коммитов.

## Лицензия

MIT, см. [LICENSE](LICENSE).
