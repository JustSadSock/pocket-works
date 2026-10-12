# iPhone top control safe area

All quick/enhanced PocketWorks apps load `shared/mobile-runtime.css`. The runtime exports the **top edge for interactive content** as `--app-safe-top`.

* Browser / Safari: `env(safe-area-inset-top) + 12px` on touch or narrow screens, so controls never touch the boundary exposed by iOS browser chrome.
* Home Screen standalone iPhone in portrait: `max(58px, env(safe-area-inset-top) + 12px)`, guarded by iOS WebKit support and a phone-sized display. This reserves a functional tap-safe status-bar strip even while WebKit momentarily reports zero inset on a fresh PWA launch or an orientation change.
* Desktop or larger non-touch layout: only native inset, with **no** artificial top strip.
* The strip stays visually integrated with the page background; it is not a fixed overlay that steals pointer events.

## Rules for app headers

Use `var(--app-safe-top, env(safe-area-inset-top, 0px))` at **exactly one** position in the top-level header or its parent shell. Do not add the guarded value to both a parent and a child.

Example for a flex header:

```css
.app-header {
  min-height: calc(56px + var(--app-safe-top));
  padding: calc(6px + var(--app-safe-top)) 12px 6px;
}
```

For a page where the shell already has top padding, only consume the variable in the shell.

Do not place absolute-positioned buttons in the unsafe space. Make every return/close/menu control at least 44px tall. Avoid replacing the safe offset with fixed `top: 0` for the interactive header.

The launcher applies it to its shelf container; Zamazka applies it to its museum header; Flagpost applies it to its masthead; Folio and Jam Tape already consume the shared runtime variable.

## Tests

Run `npm run validate:mobile` and the normal release checks. Test manually on iPhone Safari and a Home Screen app, including cold start, portrait/landscape change, keyboard appearance and re-entering after backgrounding. Automated CSS-contract checks cannot replace a real iPhone/WebKit interaction test.

## Native modal dialogs on iPhone

A native `<dialog>` enters the browser's **top layer** and is not a descendant
of the safe-area-padded page shell. Applying safe padding to the main launcher
does **not** move a modal header below iOS's status indicators.

Pocket ID/Social mobile dialogs therefore set:
- `position: fixed` and explicit `top: var(--app-safe-top)`;
- `height/max-height: calc(100dvh - top - safe-area-inset-bottom)`;
- a 44 px close target in the top toolbar;
- a second, non-scrolling `Закрыть меню` action at the bottom of the Social
  dialog as a fallback if iOS chrome changes unexpectedly.

Account/recovery forms keep their header sticky while the dialog content
scrolls. Landscape notch side insets are respected. Do not regress to
`height: 100dvh; margin:auto` on the full-bleed mobile social dialog, as this
centers the close button behind the iPhone status bar in standalone mode.
