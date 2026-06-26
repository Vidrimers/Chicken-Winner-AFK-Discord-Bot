# HLAE для CS2 — Полный туториал по созданию фраг-муви из демок

> **Версия актуальна для HLAE 2.189+ / AfxHookSource2 / CS2**  
> Официальная документация: https://github.com/advancedfx/advancedfx/wiki/AfxHookSource2

---

## Содержание

1. [Что такое HLAE и зачем он нужен](#1-что-такое-hlae-и-зачем-он-нужен)
2. [Установка и запуск CS2 через HLAE](#2-установка-и-запуск-cs2-через-hlae)
3. [Загрузка и управление демкой](#3-загрузка-и-управление-демкой)
4. [Свободная камера — mirv_input](#4-свободная-камера--mirv_input)
5. [Плавные камера-пути (Campaths)](#5-плавные-камера-пути-campaths)
6. [Запись видео — mirv_streams](#6-запись-видео--mirv_streams)
7. [Полезные команды для чистой картинки](#7-полезные-команды-для-чистой-картинки)
8. [Смерти и убийства — mirv_deathmsg](#8-смерти-и-убийства--mirv_deathmsg)
9. [FOV и вьюмодель](#9-fov-и-вьюмодель)
10. [Системные команды и отладка](#10-системные-команды-и-отладка)
11. [Готовый cfg — все бинды в одном месте](#11-готовый-cfg--все-бинды-в-одном-месте)
12. [Полный воркфлоу: от демки до видео](#12-полный-воркфлоу-от-демки-до-видео)
13. [Частые ошибки и решения](#13-частые-ошибки-и-решения)

---

## 1. Что такое HLAE и зачем он нужен

**HLAE (Half-Life Advanced Effects)** — инструмент для создания контента в CS2. Позволяет:

- Записывать видео **без потери кадров** (frame-perfect запись)
- Делать **плавные кинематографические пути камеры** по демке
- Управлять свободной камерой на паузе
- Убирать HUD, фильтровать уведомления об убийствах
- Менять FOV, скайбокс, эффекты
- Записывать отдельные слои (фон, игроки, оружие) для продвинутого монтажа

> ⚠️ **Важно:** HLAE запускает CS2 в режиме `-insecure`. Никогда не заходи на VAC-серверы через HLAE — бан. Только демки и LAN.

---

## 2. Установка и запуск CS2 через HLAE

### Установка

1. Скачать последний `HLAE_Setup.exe` с [GitHub Releases](https://github.com/advancedfx/advancedfx/releases)
2. Установить, **путь не должен содержать кириллицу** (например: `C:\HLAE`)
3. Опционально — установить FFmpeg через тот же установщик (нужен для записи)

### Запуск CS2

Открыть `HLAE.exe` → **Menu → File → Launch CS2**

| Поле                             | Что указать                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| Game                             | `...\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe` |
| Moviemaking config parent folder | Любая папка без кириллицы, например `C:\HLAE\cfg`                                   |
| Graphic Resolution               | Нужное разрешение (например 1920x1080)                                              |
| Custom command line options      | `-console` (опционально)                                                            |

Нажать **Launch**. В консоли CS2 должно появиться сообщение от `advancedfx.org` — значит HLAE подцепился.

---

## 3. Загрузка и управление демкой

### Загрузить демку

```
demoui          // открыть интерфейс демок (или Shift+F2)
demo_gototick 0 // перейти в начало демки
```

### Управление скоростью воспроизведения

```
host_timescale 1      // нормальная скорость
host_timescale 0.25   // четверть скорости (удобно для campaths)
host_timescale 0.1    // очень медленно
host_timescale 0      // пауза (альтернатива demo_togglepause)
```

### Прыжки по тикам

```
demo_gototick 12345          // перейти на конкретный тик
mirv_skip time -5            // откатиться на 5 секунд назад
mirv_skip time 10            // прыгнуть вперёд на 10 секунд
```

**Рекомендуемые бинды:**

```
bind "F1" "demo_togglepause"
bind "F2" "host_timescale 0.25"
bind "F3" "host_timescale 1"
bind "PGUP" "mirv_skip time 5"
bind "PGDN" "mirv_skip time -5"
```

---

## 4. Свободная камера — mirv_input

Позволяет управлять камерой вручную, независимо от игрока.

### Включение

```
mirv_input camera          // включить свободную камеру
mirv_input off             // выключить, вернуть обычный режим
```

> Для POV-демок (от первого лица) сначала нужно переключиться в thirdperson:
> 
> ```
> sv_cheats 1
> thirdperson
> mirv_input camera
> ```

### Настройка чувствительности камеры

```
mirv_input cfg msens 1.0   // чувствительность мыши
mirv_input cfg ksens 200   // скорость движения клавиатурой (WASD)
```

### Бинды для камеры

```
bind "KP_END"  "mirv_input camera"   // включить свободную камеру (Numpad 1)
bind "KP_INS"  "mirv_input off"      // выключить камеру (Numpad 0)
```

> При открытой консоли управление камерой приостановлено. `mirv_input camera` перекрывает `mirv_campath`. Чувствительность регулируется через `mirv_input cfg`.

### Управление камерой (клавиатура/мышь)

| Клавиша                   | Действие                               |
| ------------------------- | -------------------------------------- |
| WASD / NUMPAD 4/6/8/2     | Движение (вперёд/назад/лево/право)     |
| R / NUMPAD 9              | Вверх                                  |
| F / NUMPAD 3              | Вниз                                   |
| Мышь                      | Обзор (вверх/вниз/влево/вправо)        |
| PAGE UP / колёсико вверх  | Приблизить (уменьшить FOV)             |
| PAGE DOWN / колёсико вниз | Отдалить (увеличить FOV)               |
| Z / NUMPAD 0              | Поворот влево (roll)                   |
| X / NUMPAD .              | Поворот вправо (roll)                  |
| + / -                     | Увеличить/уменьшить скорость ×2 / ×0.5 |
| HOME / NUMPAD 5           | Сброс обзора и скорости                |
| ESC                       | Выйти из режима камеры                 |
| CTRL                      | Пропустить следующую клавишу           |

---

## 5. Плавные камера-пути (Campaths)

Самый важный раздел для создания красивого видео. Campath — это анимированный путь камеры, который HLAE плавно интерполирует между расставленными точками.

### Принцип работы

1. Ты расставляешь **кейфреймы** (минимум 4 штуки) в нужных местах/моментах демки
2. HLAE строит плавный путь между ними
3. При воспроизведении камера сама плавно летит по этому пути

### Шаг 1 — Подготовка

```
host_timescale 0.25         // замедли демку
mirv_input camera           // включи свободную камеру
mirv_campath draw enabled 1 // включи визуализацию пути (очень полезно!)
```

### Шаг 2 — Расстановка кейфреймов

Летай по сцене и **нажимай бинд** чтобы добавить точку:

```
bind "E" "mirv_campath add"   // добавить кейфрейм в текущей позиции/времени
```

> ⚠️ Нужно минимум **4 кейфрейма**. Меньше — campath не включится!

Проверить сколько точек добавлено:

```
mirv_campath print            // список всех кейфреймов
```

### Шаг 3 — Включение campath

```
mirv_campath enable 1         // включить путь камеры
```

Если видишь `Warning: Campath enabled but can not be evaluated yet. Did you add enough points?` — см. [раздел 13](#13-частые-ошибки-и-решения).

### Шаг 4 — Откат и воспроизведение

После включения нужно **откатиться назад** (до первого кейфрейма):

```
demo_gototick <тик до первой точки>
// или
mirv_skip time -10            // откатиться на 10 секунд назад
```

Запусти демку — камера сама полетит по пути.

### Управление campaths — все команды

| Команда                         | Описание                                                              |
| ------------------------------- | --------------------------------------------------------------------- |
| `mirv_campath add`              | Добавить кейфрейм (текущее время + позиция камеры)                    |
| `mirv_campath enable 1`         | Включить campath                                                      |
| `mirv_campath enable 0`         | Выключить campath                                                     |
| `mirv_campath print`            | Показать все кейфреймы в консоли                                      |
| `mirv_campath draw enabled 1`   | Отобразить путь на экране                                             |
| `mirv_campath draw enabled 0`   | Скрыть визуализацию                                                   |
| `mirv_campath draw keyIndex 5`  | Показать номера кейфреймов (размер цифр = 5)                          |
| `mirv_campath clear`            | **Удалить все** кейфреймы                                             |
| `mirv_campath save mypath`      | Сохранить путь в файл `mypath.xml`                                    |
| `mirv_campath load mypath`      | Загрузить путь из файла                                               |
| `mirv_campath remove [id]`      | Удалить конкретный кейфрейм по ID (узнать через `mirv_campath print`) |
| `mirv_campath select <id>`      | Выбрать кейфреймы по номеру (clear/edit будут работать только с ними) |
| `mirv_campath edit start`       | Сдвинуть путь, чтобы он начинался с текущего времени                  |
| `mirv_campath edit duration 10` | Задать длительность пути (в секундах)                                 |
| `mirv_campath setduration 10`   | Растянуть путь до 10 секунд                                           |
| `mirv_campath offset`           | Синхронизировать путь с текущим временем                              |

### Интерполяция (тип плавности)

По умолчанию используется кубическая интерполяция. Можно изменить:

```
mirv_campath edit interp position linear     // линейное движение (без ускорения/замедления)
mirv_campath edit interp position cubic      // кубическое (по умолчанию, плавнее)
mirv_campath edit interp rotation sLinear    // линейный поворот
mirv_campath edit interp fov linear          // линейное изменение FOV
```

### Бинды для campath

```
bind "E"   "mirv_campath add"
bind "R"   "mirv_campath enable 1"
bind "T"   "mirv_campath enable 0"
bind "G"   "mirv_campath clear"
bind "F4"  "mirv_campath draw enabled 1"
bind "F5"  "mirv_campath draw enabled 0"
```

### Советы для хорошего campath

- Расставляй точки **в слоу-мо** (host_timescale 0.1–0.25), а не на паузе — иначе все точки окажутся в одном времени
- Между кейфреймами должно быть **минимум 1–2 секунды** реального времени демки
- Если несколько точек стоят очень близко — удали лишние
- Используй `mirv_campath draw enabled 1` чтобы видеть форму пути в реальном времени
- Сохраняй пути через `mirv_campath save` — потом можно подредактировать XML в Notepad++

### Экспорт камеры в файл (mirv_camio)

```
mirv_camio export start mycamera.xml   // начать экспорт камеры в файл
mirv_camio export end                  // остановить экспорт
```

Альтернатива — автоматический экспорт через mirv_streams:

```
mirv_streams record cam enabled 1      // экспорт начнётся автоматически при записи
// Файл сохранится по тому же пути, что и запись
```

---

## 6. Запись видео — mirv_streams

`mirv_streams` — система записи HLAE. Записывает видео покадрово, без дропов, с нужным фреймрейтом.

### Быстрый старт (простая запись)

```
mirv_streams record name "myrecording"   // начать запись
mirv_streams record stop                 // остановить
```

По умолчанию файлы сохраняются рядом с `cs2.exe`.

### Настройка через FFmpeg (рекомендуется)

FFmpeg позволяет писать сразу в сжатое видео без огромных RAW-файлов.

```
// Запись в H.264 MP4
mirv_streams add normal mystream
mirv_streams edit mystream settings sampler fps 60
mirv_streams edit mystream settings ffmpegOptions "-c:v libx264 -crf 15 -preset slow -pix_fmt yuv420p"
mirv_streams edit mystream settings ffmpegOutputPath "C:/recordings/output.mp4"
mirv_streams record name "take1"
```

### Важные параметры

```
// FPS записи
mirv_streams edit <name> settings sampler fps 60    // 60 fps
mirv_streams edit <name> settings sampler fps 120   // 120 fps (для замедления в монтаже)

// Директория для сырых кадров
mirv_streams edit <name> settings basePath "C:/recordings/"
```

### Бинды для записи

```
bind "F10" "mirv_streams record name take1"
bind "F11" "mirv_streams record stop"
```

### Встроенные пресеты записи

| Пресет                  | Формат                  | Описание                         |
| ----------------------- | ----------------------- | -------------------------------- |
| `afxClassic`            | .tga последовательность | Сырые кадры без сжатия           |
| `afxFfmpeg`             | .mp4                    | Низкий размер, среднее качество  |
| `afxFfmpegHuffyuv`      | .avi                    | Lossless (без потерь)            |
| `afxFfmpegLosslessBest` | .mp4                    | Lossless (максимальное качество) |
| `afxFfmpegLosslessFast` | .mp4                    | Lossless (быстрее)               |
| `afxFfmpegRaw`          | .avi                    | Сырые данные FFmpeg              |
| `afxFfmpegYuv420p`      | .mp4                    | Низкое качество (тесты)          |
| `afxSampler30`          | —                       | 30 FPS                           |

```
// Использование пресета
mirv_streams record screen settings afxFfmpeg
```

### Запись звука

```
mirv_streams record startMovieWav 1    // включить запись звука
```

### Запись карты глубины (Depth Map) и нормалей

Полезно для продвинутого пост-производства (глубина резкости, эффекты в композиторе).

```
// Добавить стримсы для глубины и нормалей
mirv_streams add depth d
mirv_streams add normal n
mirv_streams edit n capture beforeUi
mirv_streams settings edit afxDefault settings afxFfmpegYuv420p

// Записать
host_framerate 300; demo_resume; mirv_streams record start
// ... ждём ...
mirv_streams record end; demo_pause; host_framerate 0
```

### Настройки OpenEXR для depth

```
mirv_streams add depth exr
mirv_streams edit exr depthMode linear
mirv_streams edit exr depthVal 0
mirv_streams edit exr depthValMax 0
mirv_streams edit exr depthChannels gray
mirv_streams edit exr captureType depthF
mirv_streams edit exr settings afxClassic
```

> 💡 Перед записью выключи `mirv_campath draw` — иначе путь попадёт в видео!
> Если появляются ошибки `[AFXERROR: Failed writing image]` — FFmpeg установлен неправильно.

---

## 7. Полезные команды для чистой картинки

### Убрать HUD

```
cl_drawhud 0                        // полностью скрыть HUD
cl_drawhud 1                        // вернуть
cl_drawonlydeathnotices 1           // только прицел + уведомления об убийствах
```

### Убрать флэшбэнг-эффект

```
mirv_noflash 1    // отключить ослепление от флэшбэнгов
mirv_noflash 0    // вернуть
```

### Отключить финальную заставку матча

```
mirv_endofmatch 1   // убрать экран окончания матча/демки
```

### Разблокировать скрытые конвары

```
mirv_cvar_unhide_all          // разблокировать все скрытые консольные команды
mirv_cvar_unlock_sv_cheats    // обойти клиентскую защиту sv_cheats
```

### Дым (прозрачный или непрозрачный)

```
sc_setclassflags SmokeVolumeObject 8   // убрать дым (прозрачный)
sc_setclassflags SmokeVolumeObject 0   // вернуть дым
```

### Скайбокс

```
mirv_sky enabled 1                        // включить управление скайбоксом
mirv_sky color r 0.1 g 0.2 b 0.5         // установить цвет неба (RGB 0.0–1.0)
mirv_sky clouds draw 0                    // скрыть облака
mirv_sky clouds draw 1                    // показать облака
mirv_sky clouds color r 255 g 200 b 150   // цвет облаков (RGB 0–255)
mirv_sky material "materials/skybox/cs_italy_s2_skybox_2.vmat_c"  // свой материал неба
mirv_sky material default                 // вернуть стандартный скайбокс
```

> Как найти материалы: открой `pak01_dir.vpk` через Source2Viewer → папка `materials/skybox` → ПКМ → Copy file path in package.

### Цвета свечения, следов и дыма (mirv_colors)

```
mirv_colors glow ct white                 // свечение игроков CT — белое
mirv_colors glow t red                    // свечение игроков T — красное
mirv_colors trails ct 255 0 0 255         // следы гранат CT — красные (RGBA)
mirv_colors smoke 100 100 100             // цвет дыма (только RGB)
mirv_colors teamid_overhead ct cyan       // индикаторы над головой — голубые
```

Доступные цвета по имени: `red, green, blue, yellow, cyan, magenta, white, black`.
Или формат: `[0-255] [0-255] [0-255] [0-255]` (RGBA). Для дыма — только RGB.

> Цвета свечения и индикаторов обновляются только при смене режима наблюдения. Цвета следов и дыма применяются только при их создании.

### Свечение игроков и объектов (mirv_glow)

```
mirv_glow projectiles smokes T 0          // убрать свечение дымовых гранат T
mirv_glow projectiles smokes CT 0         // убрать свечение дымовых гранат CT
mirv_glow players set x76561198106931330 0  // убрать свечение конкретного игрока (по XUID)
mirv_glow entities set 3471718 1          // включить свечение объекта (handle из mirv_listentities)
mirv_glow players help                    // список ID игроков
```

### Модификация панелей HUD (mirv_panorama)

```
mirv_panorama panelStyle panelId=trueview_row opacity=0       // скрыть текст TrueView
mirv_panorama panelStyle panelClassName=CSGOHudHintText opacity=0  // скрыть сообщение о пленте бомбы
```

### Совместимость с ReShade

```
mirv_reshade enabled 1    // включить ReShade (по умолчанию при запуске через HLAE)
mirv_reshade enabled 0    // выключить ReShade
```

> Ссылка на аддон: https://github.com/advancedfx/ReShade_advancedfx

### Авто-выполнение команд на конкретном тике (mirv_cmd)

```
mirv_cmd add time 45.5 "cl_drawhud 0"   // отключить HUD на 45.5 секунде
mirv_cmd add tick 12000 "mirv_campath enable 1"  // включить campath на тике 12000
mirv_cmd clear                           // удалить все запланированные команды
mirv_cmd save "script.xml"              // сохранить команды в XML
mirv_cmd load "script.xml"              // загрузить команды из XML
```

### Анимация команд по кривым (mirv_cmd addCurves)

Продвинутый способ — плавно изменять параметры во времени:

```
mirv_cmd clear
mirv_cmd addCurves tick 1000 4000 - interp=cubic space=abs 1000 1 1300 2 1600 0.5 1900 2 2100 0.5 2500 2 2800 1 3100 2 3400 0.5 3700 2 4000 1 - interp=linear 0 0 1 100 -- "mirv_time drive {0}; echo {1}% finished: driving: {0}"
mirv_cmd addAtTick 4000 "mirv_time drive default"
```

- `{0}` — кубическая интерполяция (минимум 4 точки)
- `{1}` — линейная интерполяция (минимум 2 точки)
- Кривые работают между тиками 1000–4000, затем на тике 4000 возвращается стандартное состояние

---

## 8. Смерти и убийства — mirv_deathmsg

Фильтрация уведомлений об убийствах в ленте — очень полезно для монтажа.

### Показать все убийства (режим отладки)

```
mirv_deathmsg debug 1    // показывать UID атакующего и жертвы в консоли
```

### Скрыть все убийства кроме нужного игрока

Сначала узнай UID игрока через debug:

```
mirv_deathmsg debug 1
// смотришь в консоль: attackerUid: 12345

// теперь блокируешь всё кроме этого игрока:
mirv_deathmsg filter add attackerMatch=!12345 block=1 lastRule=1
```

### Подсветить убийства конкретного игрока (как в POV)

```
mirv_deathmsg highLightId 12345    // UID игрока
```

### Время показа уведомлений

```
mirv_deathmsg cfg noticeLifeTime 6    // показывать 6 секунд
mirv_deathmsg cfg noticeLifeTime -1   // вернуть стандартное время
```

### Цвета уведомлений (mirv_deathmsg colors)

```
mirv_deathmsg colors ct white                    // CT — белый
mirv_deathmsg colors t red                       // T — красный
mirv_deathmsg colors border 255 255 0 255        // рамка локального игрока — жёлтая
mirv_deathmsg colors background 0 0 0 192        // фон — 75% чёрный
mirv_deathmsg colors backgroundLocal 0 0 0 192   // фон локального игрока
```

Доступные цвета по имени: `red, green, blue, yellow, cyan, magenta, white, black, transparent`.
Или формат: `R G B A` (0–255). `default` — вернуть стандартный.

### Замена имён игроков (mirv_replace_name)

```
mirv_replace_name help players             // список игроков с ID
mirv_replace_name byUserId add 12345 "NewName"   // заменить имя по userId
mirv_replace_name byXuid add x76561198106931330 "Name with Spaces"  // по XUID
mirv_replace_name byUserId print           // показать текущие замены
mirv_replace_name byUserId remove 12345    // удалить замену
```

> UserID меняется в каждом демо. Для постоянного эффекта используй XUID (начинается с `x`).

---

## 9. FOV и вьюмодель

### FOV

```
mirv_fov 90                        // стандартный FOV
mirv_fov 110                       // широкий угол
mirv_fov handleZoom enabled 1      // фиксить скоп при изменённом FOV
```

### Вьюмодель (оружие в руках)

```
mirv_viewmodel enabled 1           // включить управление вьюмоделью
mirv_viewmodel offset x 2          // сдвинуть вправо
mirv_viewmodel offset y 0
mirv_viewmodel offset z -1         // опустить вниз
```

Полный синтаксис:

```
mirv_viewmodel set [X] [Y] [Z] [FOV] [0|1]
```

- `[X] [Y] [Z]` — смещение модели
- `[FOV]` — угол обзора вьюмодела (по умолчанию 68)
- `[0|1]` — 0 = правая рука, 1 = левая
- Используй `*` чтобы оставить значение по умолчанию

```
mirv_viewmodel set 2 0 -1 68 0   // правая рука, стандартный FOV
mirv_viewmodel set * * * 90 *    // только изменить FOV вьюмодела, остальное по умолчанию
```

---

## 10. Системные команды и отладка

### Список сущностей (mirv_listentities)

Показывает все сущности, известные движку. Полезно для поиска ID игроков и объектов.

```
mirv_listentities                          // стандартный вывод
mirv_listentities isPlayer=1              // только игроки (контроллеры и пешки)
mirv_listentities sort=distance limit=10  // 10 ближайших объектов
```

Формат: `entryIndex / handle / debugName / className / clientClassName / [x, y, z, rX, rY, rZ]`

### Исправления (mirv_fix)

```
mirv_fix time 1           // исправить время Panorama и сцен при записи (включено автоматически)
mirv_fix animations 1     // исправить плавность анимаций (по умолчанию 0 — выкл)
mirv_fix time 0           // выключить фикс времени
```

### Загрузка внешних DLL (mirv_loadlibrary)

```
mirv_loadlibrary "C:/path/to/library.dll"   // загрузить DLL
mirv_loadlibrary library.dll                // если DLL рядом с cs2.exe
```

### Приоритет настроек камеры

1. `mirv_campath` (высший)
2. `mirv_camimport`
3. `mirv_fov`
4. `mirv_input camera` (низший)

---

## 11. Готовый cfg — все бинды в одном месте

Создай файл `hlae_movie.cfg` в папке cfg и запускай через консоль: `exec hlae_movie`

```cfg
// ===== HLAE CS2 Moviemaking Config =====

// --- Управление демкой ---
bind "F1"   "demo_togglepause"
bind "F2"   "host_timescale 0.25"
bind "F3"   "host_timescale 1"
bind "PGUP" "mirv_skip time 5"
bind "PGDN" "mirv_skip time -5"

// --- Свободная камера ---
bind "KP_END" "mirv_input camera"
bind "KP_INS" "mirv_input off"

// --- Campath ---
bind "E"   "mirv_campath add"
bind "R"   "mirv_campath enable 1"
bind "T"   "mirv_campath enable 0"
bind "G"   "mirv_campath clear"
bind "F4"  "mirv_campath draw enabled 1"
bind "F5"  "mirv_campath draw enabled 0"
bind "F6"  "mirv_campath print"

// --- Запись ---
bind "F10" "mirv_streams record start"
bind "F11" "mirv_streams record end"

// --- HUD и эффекты ---
bind "H"   "toggle cl_drawhud 0 1"
bind "J"   "toggle mirv_noflash 0 1"
bind "K"   "toggle mirv_glow players set localPlayer 0 1"

// --- Базовые настройки ---
mirv_cvar_unhide_all
mirv_cvar_unlock_sv_cheats
mirv_input cfg msens 1.0
mirv_input cfg ksens 200
mirv_fov handleZoom enabled 1
mirv_endofmatch 1
mirv_fix time 1
mirv_fix animations 1
```

---

## 12. Полный воркфлоу: от демки до видео

### Этап 1 — Подготовка

1. Запустить CS2 через `HLAE → File → Launch CS2`
2. Дождаться сообщения от advancedfx.org в консоли
3. Открыть консоль, выполнить `exec hlae_movie`
4. Загрузить демку: `demoui` → Load → выбрать `.dem` файл

### Этап 2 — Поиск моментов

1. Смотришь демку на нормальной скорости (`F3`)
2. Нашёл крутой момент — запоминаешь тик (`demoui` показывает текущий тик)
3. Откатываешься немного назад: `mirv_skip time -10`

### Этап 3 — Создание campath

1. Замедли демку: `F2` (host_timescale 0.25)
2. Включи свободную камеру: `KP_END`
3. Включи визуализацию: `F4`
4. Летай по сцене, ставь точки клавишей `E` (минимум 4)
5. Проверь: `F6` (`mirv_campath print`) — убедись что точек ≥ 4
6. Включи путь: `R`
7. Откатись до начала: `mirv_skip time -15` или `demo_gototick <тик>`

### Этап 4 — Запись

1. Убери визуализацию: `F5`
2. Убери HUD: `H`
3. Запусти запись: `F10` (`mirv_streams record start`)
4. Запусти демку (нормальная скорость: `F3`)
5. Дождись конца момента
6. Стопни запись: `F11` (`mirv_streams record end`)
7. Сброс campath: `G`

### Этап 5 — Монтаж

Готовые файлы собирай в Premiere / DaVinci Resolve / Vegas.  
Для продвинутого монтажа с отдельными слоями (игроки отдельно от фона) — изучи `mirv_streams` с многослойной записью.

---

## 13. Частые ошибки и решения

### ❌ "Campath enabled but can not be evaluated yet. Did you add enough points?"

**Причина:** точек меньше 4 или они добавлены неправильной командой.

**Решение:**

- Проверь что используешь `mirv_campath add` (не `mirv_campath_add`)
- Выполни `mirv_campath print` — посчитай точки
- Убедись что точки расставлены **в разное время демки** (не на паузе в одном тике)
- Между точками должно быть минимум 1–2 секунды

### ❌ Камера дёргается / путь кривой

**Решение:**

- Включи `mirv_campath draw enabled 1` — посмотри форму пути
- Убери лишние точки (`mirv_campath select` + `mirv_campath clear`)
- Добавляй точки в замедлении, не на паузе
- Увеличь расстояние по времени между кейфреймами

### ❌ Видео не записывается / нет файлов

**Решение:**

- Убедись что FFmpeg установлен (через установщик HLAE)
- Путь для записи не должен содержать кириллицу
- Проверь права на запись в папку назначения

### ❌ CS2 запускается, но HLAE не подцепился (нет сообщения в консоли)

**Решение:**

- Убедись что запускаешь через `HLAE → File → Launch CS2`, а не обычный ярлык Steam
- Проверь путь к `cs2.exe` в настройках запуска
- Путь к HLAE не должен содержать кириллицу или пробелы

### ❌ Зашёл на сервер и получил VAC Warning

- HLAE принудительно ставит `-insecure` — на VAC-серверы заходить нельзя физически (игра не даст)
- Если хочешь играть онлайн — запускай CS2 **через Steam**, а не через HLAE

---

## Полезные ссылки

### Официальная документация

- [Официальная Wiki HLAE](https://github.com/advancedfx/advancedfx/wiki)
- [Команды CS2 (AfxHookSource2)](https://github.com/advancedfx/advancedfx/wiki/Source2:Commands)
- [mirv_campath подробно](https://github.com/advancedfx/advancedfx/wiki/Source2:mirv_campath)
- [mirv_streams подробно](https://github.com/advancedfx/advancedfx/wiki/Source2:mirv_streams)
- [Последние релизы HLAE](https://github.com/advancedfx/advancedfx/releases)

### Видео-туториалы (IBUYMOVIE)

- [Монтаж КС2](https://youtu.be/Lz_o-crz03c) — процесс монтажа мувика
- [Смена неба (Skybox)](https://youtu.be/72enNR9rosc) — создание своего skybox-материала
- [Импорт в UE5](https://youtu.be/5fN26wvGCtA) — импорт футажа из HLAE в Unreal Engine 5

### Файлы и инструменты

- [Папка для монтажа (Google Drive)](https://drive.google.com/drive/folders/1pul1pvniZ1czUgyMzfnVkZt0AmoXWdBf?usp=sharing) — готовые материалы для монтажа
- [FFmpeg — официальный сайт](https://www.ffmpeg.org/download.html) — скачивание FFmpeg для записи
- [ReShade_advancedfx](https://github.com/advancedfx/ReShade_advancedfx) — аддон ReShade для HLAE
- [IBUYMOVIE — справочник команд Mirv/HLAE](https://ibuymovie.com/hlae)
- [YouTube канал IBUYMOVIE](https://www.youtube.com/@ibuymoviecom)

### Скрипты

- [HLAE CamIO To AE](https://github.com/xNWP/HLAE-CamIO-To-AE/releases) — экспорт камеры из HLAE в Adobe After Effects
- [HLAE CamIO To Nuke](https://github.com/Devostated/HLAE-CamIO-To-Nuke/releases) — экспорт камеры из HLAE в The Foundry Nuke
- [HLAE CamIO to Davinci](https://github.com/Devostated/HLAE-CamIO-To-Nuke) — экспорт камеры из HLAE в DaVinci Resolve
- [afx-blender-scripts](https://github.com/advancedfx/afx-blender-scripts) — скрипты для импорта данных камеры в Blender
- [HLAE CamIO To Cinema4D](https://github.com/xNWP/HLAE-CamIO-To-C4D/releases) — экспорт камеры из HLAE в Cinema 4D
