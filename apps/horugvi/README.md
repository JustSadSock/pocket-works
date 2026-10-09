# ХОРУГВИ

A portrait-first, offline-capable tactical mini-campaign inspired by medieval illuminated manuscripts and stained glass.

## Playing

Choose a blue standard, select **Поход** then tap a destination, or choose **Натиск** then tap an enemy. **Стоять** and **Сбор** act immediately. Only two new orders can be issued each turn; existing orders persist. The commander can relay orders only to nearby banners without delay. Resolve all troops simultaneously with **Прожить ход**. Defeat enemies through morale, flanking and terrain advantages; complete three distinct chronicles.

## Technical contract

Self-contained Quick-PWA app under `apps/horugvi/`, using shared mobile runtime, app-owned Canvas and CSS, isolated localStorage key `horugvi-campaign-v1:save`, and namespaced cache `horugvi-v1.0.0`. No third-party assets or network calls. Replays are deterministic per scenario and save version. Character renderings, landscape and terrain are procedural canvas art (not external images). Sound is disabled by default and can be enabled in the pause menu.

## QA

Play from menu through a battle, order/hold/rally, next turn, victory/defeat, continue; inspect saved progress after reload, narrow portrait + short landscape viewport, console, Service Worker offline reload. QA state exposed at `window.__HORUGVI_QA__()`.