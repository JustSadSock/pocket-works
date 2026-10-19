# Space Run

Original modular spaceship co-op, ship expansion, inventory/shop, repair minigames, module seats, combat waves and authored asset set retained. PocketNet runs the original authoritative engine with persistent player Maps and hull Sets. Offline solo practice uses the same module and isolated saved state. Explicit create/join room actions replace implicit shared server rooms. Touch controls cover movement, shield, firing, repair hold and module rotation.

## 0.1.1 — Reliability pass

New repair console for repair stations (sequence, timing, circuit), target switching and touch actions. Offline practice validates and flushes saves; touch fire can select the closest enemy until manually aimed. Occupied seats are disabled; keyboard shortcuts do not hijack form inputs. Building previews show invalid placement and keep the selection for retry. Service-worker install caches base assets, while optional sprite variants are cached when visited.

QA: `node --test apps/space-run/qa/reliability.test.mjs`. The complete implementation plan is in [ROADMAP.md](./ROADMAP.md). Live PocketNet multiplayer regression and full mobile/browser visual inspection are still required.

## 0.3.0 — инженерный корпус

Каждая клетка обшивки имеет локальное HP. Вражеский снаряд может её пробить: повреждённые участки перестают проводить ток, отключая модули ниже по сети. Базовая вспомогательная шина расположена в клетке (0,0), исправные реакторы работают как дополнительные источники. Работающие системы выделяют тепло; перегретые отключаются и возвращаются в работу после охлаждения. В мастерской кнопки «Залатать» тратят кредиты; во время боевой волны эти действия доступны только инженеру в запитанном ремонтном модуле за энергию. Инженерная панель и визуальные предупреждения показывают фактическое состояние.

## 0.4.0 — тепловая и энергетическая архитектура

В мастерской откройте «Инженерная диагностика» → «Монтаж автомата» и нажмите клетку корпуса. Автомат стоит 22 кредита. В панели можно размыкать/замыкать шину, демонтировать и менять приоритет модулей от П0 до П3. При нехватке мощности сеть отключает модули с низким приоритетом. В бою активный инженер переключает автоматы за энергию, включая аварийное восстановление обесточенного отсека.

Новый «Thermal Radiator» устанавливается из стартового склада или магазина. Он пассивно охлаждает только физически соседние модули. Заняв радиатор, удерживайте Пробел для ускоренного охлаждения с расходом энергии. Удары по пробитым пустым крайним пластинам могут оторвать их, меняя форму и массу корабля.

## 0.5.0 — динамическое разрушение

Повторно пробитая секция корпуса может оторваться и породить несколько самостоятельных физических обломков. Металл сохраняет часть скорости и вращения корабля, разлетается в разные стороны и способен столкнуться с врагами либо вернуться в корабль. Стрельба противника сдвигает корпус и при ударах по краям слегка его закручивает.

Критически перегретые модули вызывают тепловые аварии, обжигают окружающую броню и нагревают соседние установки. Инциденты имеют ограничение частоты; авария реактора особенно опасна. Визуальные эффекты искажают траектории и форму, но не подменяют физические расчёты сервера. Старые сохранения автоматически принимают новое поле динамических обломков.
