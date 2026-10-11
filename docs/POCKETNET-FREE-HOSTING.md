# PocketNet: бесплатный постоянно доступный сервер (Oracle Always Free)

Этот путь разворачивает **существующий** Pocket Server (Node 22, WebSocket, горячее обновление игровых модулей, JSON snapshots) на Linux-машине, без переписывания архитектуры. Pocket Works остаётся на Cloudflare. На сервере не нужны платные Lightsail, домен или туннель с включённым домашним компьютером.

> Важно: Oracle требует регистрацию и обычно банковскую карту для верификации. Always Free — не SLA; возможны отсутствие свободных ARM-машин и отзыв простаивающего экземпляра. Не выбирайте paid shapes. Проверяйте маркировку **Always Free-eligible** перед созданием.

## 1. Виртуальная машина

1. Откройте https://www.oracle.com/cloud/free/ , выберите **Start for free** / **Sign up**, подтвердите e-mail, телефон и платёжную карту (при запросе).
2. Укажите **Home region** осознанно: бесплатные инстансы можно создавать только в нём. В консоли Oracle: меню **Compute → Instances → Create instance**.
3. Имя: `pocketnet`. Image: **Canonical Ubuntu 24.04**. Shape: **VM.Standard.A1.Flex (Always Free eligible)**, **1 OCPU / 6 GB RAM**. Если форма предлагает только AMD micro, можно использовать **VM.Standard.E2.1.Micro**, но 1 GB RAM заметно теснее.
4. Сеть: VCN/public subnet, **Assign a public IPv4 address**. Скачайте SSH private key из формы **Add SSH keys / Generate a key pair**; держите его только у себя. Boot volume: стандартный минимальный размер в пределах free quota.
5. После **Create** сохраните **Public IP address**. В разделе **Networking → Virtual Cloud Networks → [ваш VCN] → Security Lists → Default Security List → Add Ingress Rules** добавьте TCP для 80 и 443 с Source CIDR `0.0.0.0/0`. SSH (22) лучше ограничить своим IP, если он стабилен. **Не открывайте 8788** наружу.
6. На Windows PowerShell подключитесь: `ssh -i "C:\\path\\to\\your-key.key" ubuntu@ВАШ_IP`. При необходимости ограничьте права на SSH key и примите fingerprint сервера после проверки. На Ubuntu username обычно `ubuntu`.

## 2. Бесплатный домен + HTTPS

Вместо регистрации домена используйте https://sslip.io/ . Например для IP `203.0.113.24` имя `203-0-113-24.sslip.io` разрешается в ваш серверный IP. Это публичное DNS-имя, не домен, которым вы владеете. Caddy автоматически запросит TLS-сертификат. Нужны открытые 80 и 443, а также публичный маршрут к виртуальной машине.

Узнайте **точный origin** вашего сайта Pocket Works (без пути и завершающего `/`, например `https://pocket-works.имя.workers.dev`). Не вставляйте пример дословно.

## 3. Установить PocketNet

После SSH-входа выполните (замените IP, домен и origin на реальные):

```bash
curl -fsSLo /tmp/pocketnet-install.sh https://raw.githubusercontent.com/JustSadSock/pocket-works/main/pocket-server/deploy/install-ubuntu.sh
less /tmp/pocketnet-install.sh
sudo env POCKET_DOMAIN=203-0-113-24.sslip.io POCKET_SITE_ORIGIN=https://ВАШ-PocketWorks-origin bash /tmp/pocketnet-install.sh
```

Скрипт проверяет Ubuntu 24.04, устанавливает Node 22, Caddy, клонирует `main` в `/opt/pocket-works`, устанавливает серверные зависимости, генерирует секреты, настраивает systemd и HTTPS. Повторный запуск сохраняет секреты и игровые данные. В случае проблемы с HTTPS проверьте обе настройки доступа: **OCI security list** и **локальный firewall** VM (в Ubuntu-образах OCI могут присутствовать дополнительные iptables-правила).

Диагностика:

```bash
sudo systemctl status pocket-server --no-pager
sudo systemctl status caddy --no-pager
sudo journalctl -u pocket-server -n 60 --no-pager
curl http://127.0.0.1:8788/health
curl https://ВАШ-ДОМЕН.sslip.io/health
```

`/health` должен вернуть `{"ok":true,...}`. Публичный URL нельзя считать работающим без фактического HTTPS-ответа.

## 4. Подключить GitHub Actions (обновления без рестарта)

В https://github.com/JustSadSock/pocket-works/settings/variables/actions :

- Вкладка **Variables → New repository variable**: Name `POCKET_SERVER_URL`, Value `https://ВАШ-ДОМЕН.sslip.io`.
- Вкладка **Secrets → New repository secret**: Name `POCKET_DEPLOY_TOKEN`. На сервере получите значение **не публикуя его** командой `sudo sed -n 's/^POCKET_DEPLOY_TOKEN=//p' /etc/pocket-server.env`, затем вставьте его как secret.

В https://github.com/JustSadSock/pocket-works/actions/workflows/pocket-server-modules.yml нажмите **Run workflow**, выберите `main`, затем **Run workflow**. Должны пройти тесты, сборка и `Publish`. После публикации проверяйте `/health`: список `modules` должен содержать, например, `zamazka`. Только после этого создавайте комнаты.

## 5. Подключить игру

Откройте **Pocket Works → ЗАМАЗКА → Создать комнату**, впишите в поле **Адрес PocketNet** тот же `https://ВАШ-ДОМЕН.sslip.io` (один раз; адрес сохраняется в браузере), имя и нажмите **Создать комнату**. Отправьте другу ссылку-приглашение. Новые игровые модули из `main` публикуются через workflow, а существующие комнаты продолжают играть на своей версии.

**Важно:** публичный сервер не означает автоматического запуска всех приложений в онлайн. Каждая игра должна использовать `shared/capabilities/net.js` и иметь свой `apps/<slug>/server/module.ts`.

## 6. Обновление, расходы, данные

После изменений **ядра** (не игровых модулей) обновление вручную на VM:

```bash
sudo env POCKET_DOMAIN=ВАШ-ДОМЕН.sslip.io POCKET_SITE_ORIGIN=https://ВАШ-PocketWorks-origin bash /opt/pocket-works/pocket-server/deploy/install-ubuntu.sh
```

Это перезапустит службу на обновлённом ядре; сохранённые комнаты восстановятся и клиенты переподключатся. Для обычных игровых релизов перезапуск не нужен.

У Oracle Always Free лимиты и правила могут меняться; выбирайте только инстансы/диски с явным free-статусом и проверяйте Billing/Cost Analysis. Free-машина может быть отозвана за низкую нагрузку. Архив данных обязательно держите **за пределами VM**:

```bash
# На своём компьютере: сохраняет снимок на локальный диск.
ssh -i "YOUR_KEY" ubuntu@SERVER_IP "sudo tar -C /var/lib -czf - pocket-server" > pocketnet-backup.tar.gz
```

Папка `/var/lib/pocket-server` содержит версии модулей и snapshots комнат. Не храните её в GitHub и не отправляйте `POCKET_AUTH_SECRET` / `POCKET_DEPLOY_TOKEN` в сообщения или репозиторий.

Сервер ограничен 32 комнатами и 48 открытыми WebSocket-соединениями по умолчанию; эти параметры можно изменить через `POCKET_MAX_ROOMS` и `POCKET_MAX_CONNECTIONS`. Node слушает только `127.0.0.1:8788`; наружу доступен Caddy на HTTPS.
