# Anchor 2.0 — Protected Workspaces

**Keep your place. Explore somewhere else.**

Anchor protects eligible links on pinned or manually protected webpages, routes exploration into the destination you choose, and arranges small dashboard workspaces. Everything runs locally. No account, analytics, remote scripts, runtime dependencies, or backend.

**This is an installable development/beta handoff, not a published or browser-certified release.** Read `docs/TEST-REPORT.md` for exact evidence and the remaining installed-browser acceptance gate.

## Install the included build

1. Disable the old Pinned Tab Link Guard / old Anchor copy so two guards cannot intercept the same click.
2. Extract this ZIP to a folder you will keep. Open `chrome://extensions` and enable Developer mode.
3. Select **Load unpacked** and choose **`Anchor/extension`**, not the project root or a ZIP.
4. Refresh existing dashboards. Right-click the actual webpage tab and choose **Pin**. Pinning Anchor's toolbar icon is a different action.
5. Open Anchor's popup. Confirm the page is connected before relying on link protection. An `ON` badge requires a current-document guard acknowledgement; `!` indicates a connection needs attention.

No build, npm install, server, API key or account is needed to use the prebuilt extension folder. Chrome 123+ is the declared minimum; target-browser acceptance still needs to be run.

### Updating your existing unpacked installation

Export settings from the old Settings page first. To preserve its extension identity/settings, close any old workspace arrangements, replace the contents of the **same existing unpacked extension directory** with this package's `extension/` contents, then click its Reload icon in `chrome://extensions`. Refresh open webpages afterward. Loading a different folder may create a separate extension identity: disable the old copy, then import its settings into the new one. Anchor 1.x settings schema 1 remains supported; new routing defaults to the previous same-window behavior. Version 2 workspace exports are separate from preference exports.

Saved workspace definitions persist locally. Tab/window/document bindings belong to the current browser session. Extension reload/disable/browser restart can invalidate them: opening a saved workspace may create fresh pages. Anchor does not silently match personal tabs by URL or recover unsaved application memory.

## The three workflows

### 1. Ordinary pinned-tab protection

The default is unchanged: pin a webpage and eligible ordinary left-click or Enter-activated links branch into a new tab. Manual protection also works on an unpinned page.

Protection modes are **All links branch**, **Same origin**, and **Home URL**. Same origin means identical protocol, host and port, not all subdomains of a company. Home URL is an exact saved address; fragment-only links are native unless enabled separately.

### 2. One dashboard, exploration elsewhere

In the popup, choose **Where should links open?**:

- **New tab in this window**: classic Anchor behavior.
- **A new window for each link**: each eligible intercepted link creates a normal Chrome window.
- **My browsing window**: new tabs accumulate in one designated window, never overwriting its existing tabs. Anchor creates one on the first link if none is selected.

**Follow the link** and **Stay here** are independent focus choices. The operating system can still influence window focus.

Choose **Make dashboard window** for a one-click solo workspace. Anchor moves the actual existing page into a dedicated normal window when necessary, instead of closing it and reopening its URL. It manually protects the page and selects the original window as the browsing destination when other tabs remain there. If the page is already alone, that window is reserved in place. This flow defaults to staying on the dashboard.

To set the ordinary, non-workspace browsing destination explicitly, visit that window's webpage and use **Window & tab controls → Use this window for browsing links**. Each saved workspace can choose its own destination in its editor.

### 3. Four dashboards you can see together

Open **Workspaces**, name a workspace and add up to four existing pages or home URLs. Selected existing pages are adopted by tab identity and moved without a deliberate reload. Choose **2 × 2 grid**, **My browsing window**, **Stay on the dashboard**, then **Open & arrange**.

**The grid is four real Chrome windows arranged together, not four live tabs embedded inside one browser window.** Native four-pane composition, iframe embedding, and custom browser-shell features are not included.

Other layouts: **One window** (multiple protected tabs, only the active tab visible), **Side by side**, **Stacked**, and **Focus + context**. All window frames remain Chrome/OS-owned. **Display & spacing** supports current-display layout without an additional permission; **Choose another display** requests optional `system.display` access for monitor names/work areas. This is not screen capture.

**Save workspace** saves a definition. **Open & arrange** applies it, reuses known live anchor bindings, and reopens missing pages from saved home URLs only on this explicit request. **Arrange open pages** does not reopen missing pages. There is no automatic restore on startup.

Up to 20 workspaces, each with one to four pages. Window sizes must be usable: a cell smaller than 480×320 is rejected before creating/moving pages. Chrome and OS window managers may adjust geometry; Anchor reads bounds back and reports adjustments. Manual drags are not continuously snapped back. Moving an anchor out of a reserved workspace releases that membership.

## Reserved windows, not kiosk mode

Workspace routing is separate from ordinary page protection. With **Reserve dashboard windows** enabled, supported browser-created extra tabs in a reserved window are moved intact to the workspace's destination. This covers many native Cmd/Ctrl-click, middle-click and `target=_blank` results without replaying their navigation. The newly created tab may briefly appear before relocation.

Likely sign-in flows, unsupported browser-owned pages, ambiguous blank tabs, and explicitly dragged-in tabs are handled conservatively rather than forcibly ejected. A new browser window opened by a native Shift-click is already outside the dashboard and is not commandeered. An extra native tab can remain when moving it cannot be confirmed. Status notices explain the known cases.

Use **Pause 5 minutes** for sign-in or maintenance. Use **Release workspace** to restore prior per-tab protection choices and remove reservations. Release/delete/reset do not close or reload browser pages. A previously pinned page may remain protected under normal Anchor defaults after release. Closing an anchor never triggers automatic resurrection.

**Working copy** opens the current address separately; it does not clone unsaved application state. **Return to original anchor** follows a local branch relationship, without guessing by URL or reopening a closed source. The relationship journal is session-only and bounded.

## What this does not promise

Anchor is link protection, not a browser navigation firewall, read-only mode or data-loss-prevention tool. JavaScript-only buttons, automatic redirects, address-bar changes, browser back/forward, reloads and application side effects are not universally prevented. An app can change data or log out without navigating. A capture listener cannot neutralize all earlier page handlers. Pausing is the explicit escape hatch for apps that require native behavior.

Modifier clicks, downloads, already-new-context link targets, `mailto:`/`tel:`, editable content, POST forms, and password/file forms remain native at the link-interception layer. Simple GET forms are opt-in. Same-frame iframe navigation is native; eligible top-escaping iframe links can be guarded where Chrome permits injection. Closed shadow roots/custom JS controls are not universally inspectable.

Optional address-bar/bookmark recovery remains **experimental and off by default**. It observes selected committed typed/bookmark navigations, branches and attempts to reload the previous URL once until re-armed. It is not a synchronous veto and cannot restore unsaved memory. It does not automatically replay POST bodies, auth redirects or arbitrary SPA history.

Pinning and page messaging are asynchronous. Revisions, document checks and pointer/focus preflight harden state delivery, but an immediate click before a formerly unprotected page receives the new pinned state is not atomically preventable. Wait for connected protection; after upgrades/reloads, refresh the webpage. Known-protected disconnected clicks are cancelled with a notice, not silently replayed.

## Data and permissions

Preferences, exact-origin rules, workspace names/home URLs and display preference IDs are in `chrome.storage.local`. Runtime bindings, limited local navigation/protection state, gesture IDs, branch provenance, pending operations and layout readback are in `chrome.storage.session`. Chrome retains normal browsing history according to its own settings. Nothing is sent to an Anchor server; visited sites receive normal browser requests.

Exports can contain private paths or tokens you put into saved home URLs. Review before sharing. No passwords, form bodies, screenshot captures or analytics payloads are persisted. Review `docs/PRIVACY.md` and `store/PRIVACY-AND-PERMISSIONS.md`.

Required permissions: `storage`, `scripting`, `contextMenus`, `alarms`, `webNavigation`, plus HTTP/HTTPS host access. Optional: `system.display`. No `tabs`, `history`, `cookies`, `debugger`, `tabCapture`, `desktopCapture` or `webRequest` permission. The tab/window APIs used here do not require a separate generic `windows` permission. Incognito is disabled. Host access is significant; the store justification explains why it is required for automatic protection on arbitrary pinned sites.

## Development and verification

Node 20+ and Python 3.10+ are development tools only. JavaScript ES modules use no runtime package dependencies.

```sh
npm run check
python -m pip install -r tests/e2e/requirements.txt
python -m playwright install chromium
npm run test:ui
npm run test:e2e
npm run package
```

`npm run test:ui` renders the real UI and guard with explicit mocked Chrome APIs; it is not installed-extension evidence. `npm run test:e2e` installs the built extension into a fresh temporary allowed Chromium profile and starts the local fixture server. Exit code 2 means startup was blocked/unavailable, not a pass. Never bypass enterprise policies. `CHROME_BIN` selects a permitted Chromium executable; `ANCHOR_HEADED=1` enables a headed run. Linux CI may use `xvfb-run`.

`npm run demo` serves local navigation fixtures at `http://127.0.0.1:8765`. `examples/workspace-local-demo.json` supplies four local demo pages; start the server before explicitly opening it. Fixture outcomes are not customer or production data.

Build copies `public/` and `src/` to `extension/`. Edit source, not only the generated folder. Packaging produces `release/anchor-2.0.0-complete.zip` and `release/anchor-2.0.0-chrome-store.zip`, without dependencies or font binaries. The store ZIP contains `manifest.json` at its root.

## Handoff map

`extension/` installable build · `src/` readable modules · `public/` UI/manifest · `brand/` original SVG/PNG assets · `website/` static landing/support/privacy pages · `store/` copy/declarations/images/upload ZIP · `tests/` policy, worker, DOM and live-browser suites · `docs/` architecture, safety, behavior and evidence · `examples/` import fixture · `scripts/` reproducible build/package/art tooling.

Publisher details prepared for Matt Richmond (`hello@mattrichmond.ca`). Hosting URLs, store ID, account certifications, name/mark clearance and final distribution remain owner decisions. No submission, hosting or external account change was performed.
