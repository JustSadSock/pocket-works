# НЕ ТЕМ ГОЛОСОМ

Cooperative blind-dubbing studio in PocketWorks. Each player receives a role, records **selected** pieces of one common 30–90 second video with a three-second preroll, and hears only their own voice until the joint premiere.

- Quick PWA, responsive portrait/desktop editor, scene library and local video import.
- PocketNet is used for rooms, assignments, readiness and WebRTC signaling. Video and audio are transferred as binary data over peer-to-peer WebRTC channels, **not** stored in PocketNet (16 KB wire limit). WebRTC connectivity varies by NAT; no TURN relay is provisioned.
- Solo studio is fully usable offline with an imported file. Sample movies are licensed CC BY and stream from Wikimedia Commons/Blender when online, with attribution in the scene chooser. Keep original audio muted to avoid dialogue collisions.
- Audio stays private on the player's device until reveal. A local IndexedDB draft keeps the recorded fragments after reload. No server-side MP4 encoding; the premiere plays synchronized tracks in-browser.
- Self-contained app files live here. The immutable PocketNet module release and lock entry are infrastructure-required artifacts under pocketnet/.

Media licenses are not extended to user-uploaded footage; users must have rights to redistribute media they choose to share.

## Собственные видео

Загрузите MP4, MOV или WebM (до 512 МиБ на исходный файл при поддержке декодирования браузером). В экране подготовки задайте начало и длительность сцены (10–90 секунд). Мастерская умеет кодировать только тот фрагмент, который участвует в игре; можно изменить битрейт (пять ступеней) и предельную ширину кадра. После обработки доступен реальный предпросмотр готового файла; он применяется только по кнопке «Использовать фрагмент». Далее обычная кнопка «Продолжить» запускает создание PocketNet-комнаты. Исходный файл не изменяется и не загружается на сервер. Процесс кодирования идёт в реальном времени, при сворачивании экрана прерывается без замены оригинала.

Лимит для прямой WebRTC-передачи одного собственного видео — **96 МиБ**. Этого ограничения придерживаются выбор источника, подтверждение сцены, отправитель и получатель. Сжатие необязательно, если файл уже подходит. Результат кодируется с поддерживаемым браузером видеокодеком (WebM или MP4). Сохранение оригинальной звуковой дорожки зависит от поддержки браузером Web Audio/MediaRecorder; при отсутствии поддержки она может быть исключена. Без MediaRecorder/canvas.captureStream доступны только импорт и встроенная обрезка по таймлайну, без перекодирования. Видео гостям отправляется через WebRTC; для недоступного прямого соединения остаётся ручное подключение подходящего файла.
