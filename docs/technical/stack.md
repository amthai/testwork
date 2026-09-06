# Technical stack

## Текущий стек

| Зона | Решение |
|---|---|
| UI | React + TypeScript |
| Сборка | Vite |
| Стили | Tailwind CSS через официальный Vite-плагин и локальные CSS-правила |
| UI primitives | shadcn/ui-подход, Radix UI, Lucide React |
| Motion | `motion` |
| Шрифты | Archivo и Space Grotesk через `@fontsource-variable` |
| Media | Browser Media Capture API |
| Realtime | `RealtimeTransport` с mock-реализацией |
| Deployment | Статический Vite build в Nginx-контейнере |

## Архитектурные границы

- `src/App.tsx` координирует состояние пользовательского потока.
- `src/pages/` содержит экранные композиции состояний landing, preflight, call и feedback.
- `src/hooks/use-media-session.ts` инкапсулирует микрофон, screen share, статусы и остановку media tracks.
- `src/lib/realtime.ts` скрывает realtime-провайдера за интерфейсом транспорта.
- `src/components/` содержит общие и UI-компоненты.
- На текущем этапе backend и постоянное хранилище отсутствуют.

## Основные ограничения

- Не переносить browser-only media логику в компоненты, которым она не нужна.
- Не смешивать UI-состояние с будущим провайдером realtime.
- Не добавлять OpenAI credentials в Vite client bundle.
- Не использовать screenshot sampling как замену непрерывной видеозаписи.
- Новая серверная интеграция требует отдельного технического решения, потому что текущий deployment статический.

## Структура исходников

```text
src/
├── components/
│   ├── ui/
│   └── ...
├── hooks/
├── lib/
├── pages/
├── App.tsx
├── main.tsx
└── styles.css
```
