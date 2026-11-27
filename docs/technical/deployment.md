# Deployment

## Контур

Node.js 24 отдаёт статическую Vite-сборку и API в одном контейнере на 8080. Существующий host Nginx завершает TLS и проксирует приложение. SQLite вынесен в persistent volume proof-data.

```text
HTTPS Nginx → 127.0.0.1:4181 → Node :8080 → DeepSeek Flash либо OpenAI
                                      ↘ speech:8078 (профиль speech)
                                      ↘ SQLite volume
```

compose.yaml публикует порт только на loopback, запускает процесс как node, read-only, с cap_drop ALL и no-new-privileges. /tmp — tmpfs, /app/data — постоянный том. Секреты передаются через env_file .env.local во время запуска. .dockerignore исключает все .env-файлы.

Для DeepSeek задай `PROOF_PROVIDER=deepseek` и `DEEPSEEK_API_KEY` в серверном окружении. Команда `docker compose --profile speech up -d --build` собирает и запускает оба контейнера. При первом запуске speech скачивает модели в отдельный том speech-models и сверяет SHA-256. При следующих запусках использует проверенные файлы из тома. Контейнеру задан предел 2 ГиБ памяти и 3 CPU. Порт речи доступен только внутри сети Compose. Число одновременных разговоров и время ответа нужно проверить на целевом железе перед публикацией.

## Подготовка и публикация

На рабочем VPS активен Compose-проект `proof-live`. Каталог `/opt/testwork-proof/current` указывает на выпущенную версию. Параметры проекта, тега, имени контейнера и порта записаны в серверном `.env`. Закрытый файл `/opt/testwork-proof/shared/production.env` подключён к релизу как `.env.local`. База хранится в томе `proof-live_proof-data`, веса в `proof-live_speech-models`. Актуальный образ и порядок отката указаны в [журнале релизов](../../deployment-report.md). На порту 4174 сохранилось раннее статическое демо. Для отдельной установки порт по умолчанию тоже 4174. В конфигурации Nginx он должен совпадать с `PROOF_PORT`.

1. npm ci, npm test, npm run build, npm audit --audit-level=high.
2. Проверить доступ выбранного AI-провайдера и провести живую сессию. Для режима OpenAI доступна команда npm run check:openai.
3. Подготовить .env.local с ключом, кодом доступа и production APP_ORIGIN. Код может создать npm run setup:access.
4. Собрать docker image с уникальным APP_VERSION.
5. Запустить candidate на отдельном loopback-порту и отдельном томе. Проверить /health, /health/ready, UI, доступ, перезапуск и сохранение данных.
6. После QA и разрешения на публикацию обновить production; проверить HTTPS, cookie Secure, заголовки, живой звонок и отчёт.
7. Записать фактический результат и версию в deployment-report.md и knowledge.

Для Compose APP_ORIGIN задаётся в окружении запуска либо через --env-file .env.local. По умолчанию production origin — https://proof.uisamurai.ru. Внутренний порт закрыт от внешней сети; доверяется ровно один proxy hop. Nginx должен передавать Host, X-Forwarded-Proto и X-Forwarded-For.

Для фото задания host Nginx должен пропускать до 4 MiB (`client_max_body_size 4m` в proxy location). Локальные шаблоны host-nginx-site.conf и host-nginx-bootstrap.conf обновлены; на действующий сервер автоматически не применяются. Перед релизом синхронизировать конфигурацию и выполнить nginx -t. Само приложение строже: /api/briefs — до 3.7 MB, PCM-реплика — до 960000 байт, общий предел — 400000 байт. [Nginx: client_max_body_size](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size).

## Health

- /health: процесс отвечает.
- /health/ready: ключ выбранного провайдера настроен и хранилище открылось. В режиме DeepSeek также отвечает речевой сервис. Это не проверка API-баланса.
- npm run check:openai: проверка реальной генерации, отдельно от healthcheck.

## Резервирование и откат

Сохранять предыдущий image tag и persistent volume. Перед обновлением делать согласованный SQLite backup (SQLite backup API или остановка сервиса; не копировать только основной sqlite-файл при активном WAL). Доступ к backup ограничивать как к данным сессий. Retention рабочих данных не распространяется на внешние backup автоматически.

Откат приложения: выбрать предыдущий APP_VERSION и пересоздать контейнер, сохранив том. Не использовать docker compose down -v на production. Текущий переход со статического frontend на backend требует сохранения прежнего образа; старый frontend не читает новый volume.

deploy/nginx.conf относится к предыдущему статическому runtime и не используется новым Dockerfile. Host TLS-конфигурация остаётся применимой.

### Яндекс LiveTTS

Для выбранного в production голоса в защищённом окружении веб-сервера установлены `PROOF_TTS_PROVIDER=yandex` и `YANDEX_SPEECHKIT_API_KEY`. Приветствие и прощание синтезируются в ходе звонка. Трафик синтеза идёт через HTTPS к `tts.api.cloud.yandex.net`. Контейнер речи обслуживает GigaAM. При выкладке проверь `ttsProvider` в `/api/bootstrap`, реальную динамическую реплику в кандидате и отмену потока при перебивании. Проверка готовности не вызывает платный синтез. Для явного переключения на локальную озвучку используется `PROOF_TTS_PROVIDER=piper`.

## Временный режим тестирования звонков

С 26 ноября 20:11 по Чите суточная квота отключена на время тестирования. В `shared/production.env` задано `DAILY_CALL_LIMIT_ENABLED=false`. Для возврата квот задай `true` и выполни `docker compose up -d --no-deps web` в текущем каталоге релиза. [Проверка тестового режима](../knowledge/entries/2026-11/2026-11-26-test-call-quota.md).

## Текущий релиз

27 ноября 2026 в 13:57 по Чите опубликована версия «Вслух» 0.11.1. Рабочие образы — `testwork-proof:0.11.1-20261127` и `proof-speech:0.11.1-20261127`. Рабочий сайт доступен по адресу [proof.uisamurai.ru](https://proof.uisamurai.ru/).

Для отката к предыдущей версии открой каталог `/opt/testwork-proof/releases/0.11.0-test-calls-20261126` и выполни `docker compose --profile speech up -d --no-build speech web`. Проверь публичный `/health/ready` и верни ссылку `/opt/testwork-proof/current` на этот каталог. [Результаты и резервная копия](../knowledge/entries/2026-11/2026-11-27-vslukh-release.md).
