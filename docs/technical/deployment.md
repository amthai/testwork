# Deployment

## Текущий контур

Приложение собирается в статический каталог `dist`, который отдаётся Nginx внутри непривилегированного контейнера.

```text
npm run build
  → dist/
  → Nginx :8080
  → host reverse proxy / HTTPS
```

Описание последнего развёртывания и фактические release-данные хранятся в корневом [`deployment-report.md`](../../deployment-report.md), а не дублируются в методологии.

## Docker

- `Dockerfile` использует отдельный build-stage и runtime-stage на Nginx.
- `compose.yaml` публикует контейнер только на loopback-хосте.
- Контейнер работает read-only, сбрасывает capabilities и имеет healthcheck.
- `VITE_BASE_PATH` передаётся на этапе сборки.
- `APP_VERSION` используется как тег локального образа; `PROOF_PORT` — как локальный host-порт.

## Healthcheck

Nginx отдаёт `200` и текст `ok` по адресу:

```text
/health
```

Перед публикацией проверяй:

1. `npm run build`;
2. запуск candidate-контейнера;
3. `/health` и загрузку корневой страницы;
4. отсутствие секретов в собранных assets;
5. основной пользовательский сценарий в браузере.

## Безопасность

- Не добавляй секреты в Dockerfile, Compose, Nginx-конфигурацию или Git.
- Не запускай контейнер с избыточными правами.
- Любое изменение внешнего reverse proxy, DNS, TLS или production-сервиса фиксируй отдельной `infra`-записью в knowledge-журнале.
