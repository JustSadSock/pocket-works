# КАНЦЕЛЯРИЯ 0.1

Локальный анализатор сохранений Europa Universalis V для Pocket Works.

## Основной сценарий

1. Пользователь выбирает `.eu5`, обычный ZIP-контейнер или бросает файл на приёмный лист.
2. Приложение определяет контейнер, распаковывает `gamestate` и `meta`, затем потоково разбирает Clausewitz-текст.
3. Извлекаются метаданные кампании, страна игрока, базовая экономика, население, контроль, территории, армии, флот, войны и дипломатические записи.
4. Паспорт и, при наличии места, исходный файл сохраняются локально в IndexedDB.
5. Дело можно открыть повторно, разобрать заново или удалить. Сеть и сервер не используются.

## Поддержка сохранений

- Plaintext с заголовком `EU5txt` или без него.
- ZIP с файлами `gamestate` и опциональным `meta`/`metadata`.
- ZIP Store и Deflate через встроенный `DecompressionStream`.
- Бинарный/Ironman формат определяется и получает явную ошибку `BINARY_SAVE_UNSUPPORTED`.

Бинарные сейвы намеренно не разбираются эвристически: для них требуется версионный token resolver EU5. Это запланировано отдельным этапом.

## Архитектура

- `parser.js` — определение контейнера, ZIP-reader, токенизатор Clausewitz, потоковый visitor и адаптер `CampaignSnapshot`.
- `storage.js` — IndexedDB с fallback на localStorage без исходного Blob.
- `app.js` — импорт, архив, паспорт кампании, повторный разбор и удаление.
- `tests/parser.test.mjs` — plaintext, ZIP и бинарная диагностика.

## Проверки

```bash
node --check apps/chancellery/app.js
node --check apps/chancellery/parser.js
node --check apps/chancellery/storage.js
node --test apps/chancellery/tests/parser.test.mjs
npm run registry:check
npm run validate:configs
```

## Приватность

Файлы сохранений не отправляются в сеть. Service Worker кэширует только файлы приложения и общие runtime-файлы Pocket Works.
