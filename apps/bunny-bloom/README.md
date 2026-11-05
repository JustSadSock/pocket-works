# Пух и пыльца

Portrait-first offline minigame for Pocket Works. Three flower beds cycle through plant → water → grow → harvest, yielding three stars per flower. Stars unlock bee, frog and fox companions; companions give bonus stars with a cooldown. Day/night switch and local persistence.

Source attribution: the rabbit character is based on a new OpenAI ImageGen illustration, shown in the app as a local inline PNG. Other art is original programmatic SVG/CSS and embedded GIF animations. The companion and decorative graphics are produced for this app; no runtime network dependency.

Quick PWA. Scope: apps/bunny-bloom/**. Uses ../../shared/mobile-runtime.*. Storage namespace: pocket-works:bunny-bloom:v1.
## Версия 1.1.0

- Три сорта: Розоцвет (9 с / 3 звезды), Лунный звон (20 с / 7) и Солнечник (34 с / 12). Второй и третий открываются за 3 и 8 букетов.
- Полив необязателен и ускоряет оставшееся время примерно вдвое. Растения продолжают расти, пока приложение закрыто.
- Четыре задания с наградами.
- Компаньоны с уникальными способностями: пчёлка ускоряет рост, лягушонок поливает, лисёнок приносит звёзды.
- Сохранение v2 мигрирует прогресс предыдущей версии.

## Версия 1.2.0

- Каждый четвёртый букет запускает 24-секундный звездопад с пятью ловимыми звёздами. За каждую даётся 2 звезды, за полную пятёрку дополнительно 5. Достижение сохраняется независимо от игровых цветов.
- Пого-анимация Пуха запускается нажатием на зайца; после цикла возвращается обычный idle-спрайт.
- Сохранение прогресса звездопадов в отдельном namespace `pocket-works:bunny-bloom:meadow-v3`, восстановление незавершённого события при перезагрузке, безопасная обработка некорректных записей.
