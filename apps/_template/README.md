# App template

Copy this directory to `apps/<slug>/` before building a new application.

Replace every `__APP_*__` token in all files:

- `__APP_SLUG__` — lowercase hyphenated directory slug;
- `__APP_NAME__` — human-readable application name;
- `__APP_SHORT_NAME__` — concise home-screen label;
- `__APP_DESCRIPTION__` — one-sentence purpose;
- `__APP_ACCENT__` — app-specific accent color;
- `__APP_CACHE_VERSION__` — unique cache key such as `my-app-v1`.

Then:

1. Add real `icons/icon-192.png` and `icons/icon-512.png` files.
2. Keep the Service Worker scoped to this directory.
3. Add the completed app to `/apps.json`.
4. Test once online, then reload in airplane mode.
5. Test both Safari browser mode and Home Screen standalone mode.

Do not register this template itself in `apps.json`.
