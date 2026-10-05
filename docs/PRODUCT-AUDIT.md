# Anchor product audit — 5 October 2026

## Product intent

Anchor adds navigation protection to pinned tabs: keep an important working page in place while opening exploration elsewhere. Manual page protection, selectable browsing destinations, and saved dashboard workspaces extend this core purpose.

The intended hierarchy is protection → destination → workspace. The prior description started with generic working pages and window arrangement, obscuring why someone would install Anchor in the first place.

## Implementation compared with the intent

| User action | Current behavior | Source evidence |
| --- | --- | --- |
| Pin a supported webpage | Activates protection by default, subject to enabled/site/pause/override state | `src/shared/core.js`: `makeSnapshot` |
| Follow an eligible ordinary link | Cancels the source click and requests a separate destination | `src/content/guard.js`: `click`, `cancel`, `send`; `src/background/branches.js`: `openBranch` |
| Follow a link handled by a typical SPA router | Capture can protect eligible anchor clicks before the router handles them; custom controls and earlier handlers can escape | `src/content/guard.js`: window capture listener and `findLink` |
| Change the address bar or use a bookmark | Native by default; optional selected recovery opens the destination and reloads the old URL after commit | `src/background/service-worker.js`: `onCommitted`; `src/shared/core.js`: `shouldRecover` |
| Back/Forward, reload, redirect, or submit a POST | Not recovered; POST bodies are not replayed | `shouldRecover`; `src/content/guard.js`: `submit` |
| Change History API state or a fragment | Observed; current URL tracking is updated without reversing application state | `src/background/service-worker.js`: `observeSameDocument` |
| Select Same origin or Home URL | Explicitly permits selected navigation in the source; these relax the default link policy | `src/shared/core.js`: `decide` |
| Protect an unpinned working page | Same link policy through a manual override | `makeSnapshot`; worker `UI_TAB` |
| Create a solo dashboard | Adopts the live page, protects it, and sets up a separate browsing destination | `src/background/workspaces.js`: `makeSolo` |
| Open a saved workspace | Uses known live bindings or opens missing saved URLs; arranges actual Chrome windows | `src/background/workspaces.js`: `openWorkspace` |
| Open an extra native tab in a reserved dashboard window | Supported tabs move intact outside; sign-in/browser-owned/ambiguous exceptions can remain | `observeNewTab`, `processCandidate`; `src/background/router.js`: `relocateTab` |

## Findings and priorities

1. **Positioning drift — corrected.** README, manifest description, store listing, single-purpose text, and welcome/website copy now lead with pinned-tab protection. Separate destinations and workspaces remain visible extensions of that purpose.
2. **Navigation coverage gap — open, highest product priority.** The implementation protects selected link actions, while the desired behavior includes any action that changes the address bar. Document observation already exists, but observation and URL reload recovery do not preserve the original document or unsaved memory. Investigate each navigation path with real Chrome fixtures before choosing stronger interception or recovery behavior. Measure source document identity and unsaved state, not just restored URL equality.
3. **Installed-browser evidence — open.** Unit and rendered UI checks pass, but the managed browser does not load the extension service worker. Real pinned-tab navigation, SPA behavior, authentication, window movement, and permission changes remain acceptance gaps.
4. **Relaxed modes need clear expectations.** Same origin, Home URL, optional hash handling, pauses, and site exclusions intentionally allow some navigation. Describe these as choices the user makes, rather than silently implying complete protection.
5. **Persistent workspace identity differs from pinned-tab protection.** Pinning is an automatic trigger; saved workspaces can protect unpinned tabs. Saved definitions survive restart, but live bindings may not. Explicit reopening may create fresh pages.

## Recommended GitHub About metadata

Description:

> Chrome extension that protects pinned tabs from link navigation, opens destinations elsewhere, and turns working pages into protected dashboard workspaces.

Topics:

`chrome-extension`, `pinned-tabs`, `tab-protection`, `navigation-guard`, `tab-management`, `window-management`, `workspaces`, `productivity`, `manifest-v3`, `javascript`, `privacy`

This describes current behavior. A claim that every navigation away is prevented requires resolving the coverage and installed-browser findings above.

## Evidence limits

This is a source-based product and positioning audit, not a new installed-browser pass. The previously verified checks cover 229 unit tests and 61 rendered UI checks with explicit Chrome API fixtures. This change updates copy and metadata files; it does not expand navigation enforcement. GitHub About editing remains blocked by the available connector/CLI capabilities, so the proposed metadata is recorded here for application by an owner or a capable integration.
