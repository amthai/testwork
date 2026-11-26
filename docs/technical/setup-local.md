# Локальная разработка

## Требования

Node.js 24, npm и браузер с WebRTC, getUserMedia и getDisplayMedia. Для media необходим HTTPS либо localhost.

```bash
npm ci
npm run dev
```

Команда запускает Fastify на 3001 и Vite на 5173. Vite проксирует /api и /health. Браузер открывается на http://localhost:5173.

## Локальная речь и DeepSeek

В `.env.local` установи `PROOF_PROVIDER=deepseek` и задай `DEEPSEEK_API_KEY`. Сервер использует `deepseek-flash` через Responses API. При пустом ключе UI показывает недоступность AI. Если выбор провайдера не задан, ключ DeepSeek имеет приоритет. Установка только с ключом OpenAI продолжает использовать Realtime.

Для голоса из production задай `PROOF_TTS_PROVIDER=yandex` и серверный `YANDEX_SPEECHKIT_API_KEY`. Используется LiveTTS с голосом `denis` и амплуа `casual`. Сервисному аккаунту нужна роль `ai.speechkit-tts.user`, ключу — область `yc.ai.speechkitTts.execute`. В локальном режиме по умолчанию используется `PROOF_TTS_PROVIDER=piper`. GigaAM нужен в обоих режимах.

Для локального речевого сервиса нужен Python 3.11. Один раз подготовь окружение и скачай веса (около 288 МБ). По умолчанию они хранятся в `~/.cache/proof/speech`. Другой путь можно указать через `PROOF_MODELS`. Загрузчик проверяет SHA-256.

```bash
python3.11 -m venv "$HOME/.local/share/proof-speech/venv"
"$HOME/.local/share/proof-speech/venv/bin/pip" install -r speech/requirements.txt
"$HOME/.local/share/proof-speech/venv/bin/python" speech/models.py
"$HOME/.local/share/proof-speech/venv/bin/python" speech/service.py
```

В другом терминале запусти `npm run dev`. Fastify обращается к речи по `SPEECH_URL` (по умолчанию `http://127.0.0.1:8078`). Процесс слушает loopback и после загрузки весов работает офлайн. Аудио обрабатывается в памяти. Для браузерного захвата нужны Web Audio, AudioWorklet и HTTPS либо localhost.

[GigaAM (MIT)](https://huggingface.co/ai-sage/GigaAM-v3) · [Piper (GPL-3.0)](https://github.com/OHF-Voice/piper1-gpl) · [Голос Denis и обучающие данные](https://huggingface.co/rhasspy/piper-voices/blob/main/ru/ru_RU/denis/medium/MODEL_CARD) · [Цены DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/)

## Настройки

Ключ выбранного провайдера хранится только в игнорируемом `.env.local` как `DEEPSEEK_API_KEY` или `OPENAI_API_KEY`. Шаблон допустимых имён — `.env.example`. `VITE_` разрешён только для публичных build-настроек. Ключ не должен попадать в assets или Docker layers.

| Переменная | Назначение / default |
|---|---|
| APP_ORIGIN | Разрешённый origin, локально http://localhost:5173 |
| PORT / HOST | 3001 / 127.0.0.1 |
| OPENAI_REALTIME_MODEL | gpt-realtime-2.1 |
| OPENAI_FEEDBACK_MODEL | gpt-4.1-mini |
| OPENAI_TRANSCRIPTION_MODEL | gpt-4o-mini-transcribe |
| PROOF_ACCESS_CODE | Код приглашения; обязателен в production (от 12 символов) |
| DATA_DIR | Каталог SQLite, data |
| MAX_SESSION_SECONDS | 1200 |
| MAX_DAILY_SESSIONS | 30 попыток за скользящие 24 часа на сервер |
| MAX_OWNER_DAILY_SESSIONS | 5 попыток за 24 часа на профиль устройства |
| MAX_CONCURRENT_SESSIONS | 3 |
| RETENTION_DAYS | 7 |
| TRUST_PROXY_HOPS | 0 локально; 1 только за закрытым reverse proxy |
| VITE_BASE_PATH | / |

`npm run setup:access` безопасно создаёт случайный код в .env.local, не меняет существующий и не выводит значение. Для изменения окружения требуется перезапуск сервера.

## Проверки и production build

```bash
npm test
npm run build
npm start
```

Сборка проверяет frontend и backend TypeScript, создаёт dist и dist-server. Последняя команда отдаёт их одним сервером; при локальном запуске собранного сервера установи APP_ORIGIN=http://localhost:3001.

`npm run check:openai` проверяет доступность Realtime-модели и выполняет короткую генерацию Responses. Это реальный платный запрос; команда выводит только статус, без ключа. Пустой баланс отличается от rate limit. Проверка не заменяет браузерный прогон голоса, экрана и отчёта.

Тестовые провайдеры используются исключительно в tests/. В runtime mock-режима и резервных статичных результатов нет.

## Методология дизайн-лида

Рабочие инструкции: server/methodology/rules.ts. Они компилируются вместе с backend и входят в Docker image без отдельного копирования markdown. В режиме OpenAI параметр OPENAI_FEEDBACK_MODEL используется для распознавания фото и итогового отчёта. Вопросы планирует Realtime через function calling.

Перед звонком обязателен подготовленный бриф. Анализ: до 2 × MAX_OWNER_DAILY_SESSIONS на профиль и 2 × MAX_DAILY_SESSIONS суммарно за сутки; одновременно не более MAX_CONCURRENT_SESSIONS подготовок. Бриф хранится отдельно 24 часа, копия — в сессии по RETENTION_DAYS.

Подготовка разбита на задание → устройства → советы. Принимает текст и до 3 фото JPG/PNG/WebP по 10 МБ, включая только фото. В режиме OpenAI для анализа нужен vision-capable OPENAI_FEEDBACK_MODEL; текущий провайдер использует Responses input_image и строгую схему источников. В БД сохраняется распознанный контекст, не файлы. До старта распознавание доступно для проверки пользователем. Тесты tests/preflight.test.ts перехватывают fetch только внутри теста SDK; тестовые изображения не отправляются настоящему API.

`npm run eval:methodology` показывает синтетические сценарии без API-запросов. Только `--live` запускает платную проверку брифа и отчётов; `--case=strong-answer` ограничивает её одним сценарием. Выводы сохраняются в output/evaluations и требуют экспертного чтения. Подробности: [QA методологии](../qa/design-lead-evaluation.md).

Для потоковой озвучки DeepSeek установи FFmpeg с кодировщиком libopus в PATH процесса Node. Production-образ включает FFmpeg. Доступность кодировщика можно проверить командой `ffmpeg -encoders` по строке `libopus`.
