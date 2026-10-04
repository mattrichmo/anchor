# Anchor 2.0 asset guide

Original anchor mark, wordmark, favicon and icon sizes are retained in `brand/` and `public/icons/`. Palette: deep green, warm paper, soft lime. SVGs are editable vectors; PNGs are ready exports. No third-party stock imagery or font binaries are redistributed.

Recommended store screenshots, in order (all 1280×800):
1. `01-protection-1280x800.png` — product composition with the actual popup render, explicitly labelled demo state.
2. `05-workspaces-1280x800.png` — actual workspace editor render with fictional example.com pages.
3. `06-layout-1280x800.png` — actual explicitly labelled arrangement preview and actions.
4. `02-settings-1280x800.png` — actual settings UI.
5. `04-welcome-1280x800.png` — actual onboarding UI.

`03-advanced-1280x800.png` is an alternate; choose at most five for the store. `source-*` captures are developer/supporting raw images, not sized store uploads. No screenshot claims a real logged-in dashboard or installed-extension E2E pass. All UI captures in this package use explicit Chrome-API fixtures.

Promotional assets: `promotional/anchor-440x280.png` (required small tile) and `promotional/anchor-1400x560.png` (optional marquee). The marquee is a conceptual illustration of multiple browser windows, not a claim of a four-pane single-window compositor. `asset-manifest.json` records dimensions and provenance.

Regenerate UI captures: `npm run test:ui`. Regenerate compositions: install Pillow/CairoSVG development tools then `python scripts/generate-store-art.py`. Supply paths to your own installed fonts through ANCHOR_FONT_REGULAR/ANCHOR_FONT_BOLD when needed; do not bundle font files.

Chrome's current image documentation specifies a 128px PNG store icon, 440×280 small promo, optional 1400×560 marquee and one to five 1280×800 (or 640×400) screenshots. Reviewed 2026-10-03: https://developer.chrome.com/docs/webstore/images
