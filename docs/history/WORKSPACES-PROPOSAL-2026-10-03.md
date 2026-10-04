> Historical planning input, superseded by this package’s implementation documentation and tests. Not a current release-status report.

# Anchor — Workspaces and Window Isolation

Review date: 3 October 2026

Status: **Design proposal and source review, not an implemented release.** The supplied extension ZIP has not been modified. Window routing, reserved dashboard windows and workspace layouts remain proposed features.

## Product direction

**Keep your place. Explore somewhere else.**

Expand Anchor from protecting individual page links to keeping a small set of working pages separate from exploratory browsing. Do not become a general-purpose tab manager or a new browser by accident.

Three independent choices:

1. Protection: which eligible navigations should leave the source page untouched?
2. Destination: where should those links open?
3. Layout: where should protected pages be displayed?

Treat Chrome's pin state as one automatic protection trigger, not the permanent identity of a saved anchor.

## Source reviewed

Archive: `anchor-1.0.0-complete.zip`

SHA-256: `65535a568c3710bae1a85da2b95a69ea06a23f3800c4e842bc28d130c7ef61c4`

The source extracted from the archive was compared with the latest same-name attachment; no source differences were found.

### Confirmed current behavior

- `src/background/branches.js`: `openBranch()` calls `chrome.tabs.create` with `windowId: tab.windowId`. The destination is always a new tab in the source window. There is no separate-window destination implementation.
- `src/shared/core.js`: settings include mode, foreground/background, nearby/end placement, optional hash/GET behavior and optional recovery. They do not include a window destination or workspace layout.
- `src/content/guard.js:70–86`: modifier clicks, downloads and native targets are intentionally excluded. This is reasonable for the existing tab utility but does not enforce a reserved-window contract.
- `src/background/state.js:7–13`: operations are serialized by source tab. A shared destination window would need its own coordination lane; four different source tabs cannot independently create the shared window safely.
- `src/background/service-worker.js:185–226`: navigation recovery is limited; History API events are observed, not rolled back. Do not market a complete navigation veto or restoration of unsaved application memory.
- `src/background/state.js:56–65`: the badge is based on the policy snapshot. Sending state and updating the badge use `Promise.allSettled`; a failed content-script delivery does not prevent an ON badge. The popup separately probes connectivity. A stronger readiness model is needed before a stronger guarantee.

### Reproduced timing edge case

`src/content/guard.js:82–84` returns immediately when an existing local snapshot says an eligible click should remain native. Therefore, a click arriving after Chrome's pinned state changes but before the content script receives its new snapshot can bypass service-worker revalidation.

A controlled test ran the actual shipped core and guard scripts with mocked DOM and Chrome APIs:

| Case | Click prevented | Worker open request |
|---|---:|---:|
| Live tab is now pinned, old content snapshot remains unprotected | No | 0 |
| Same click after delivering the new protected snapshot | Yes | 1 |

This demonstrates the control-flow gap. It does **not** measure its timing or frequency in installed Chrome. Chrome's event delivery and asynchronous messaging do not provide an atomic, synchronous pin-state read inside a webpage click handler.

Proposed response: revisioned state snapshots, document-bound acknowledgements, explicit pending/ready/unavailable states, pin-transition regression tests, and conservative handling of known-protected but temporarily disconnected contexts. Do not promise an impossible zero-race guarantee or degrade every ordinary unprotected click into synthetic replay.

## Existing test evidence

The supplied Node test suite was rerun during this review: **119 passed, 0 failed**. These include pure policy tests and mocked worker tests, not installed-extension acceptance.

The existing release report separately records 33 browser-rendered UI/DOM checks with mocked Chrome APIs, and an installed-extension test attempt blocked before execution. Those 33 UI checks were not rerun during this review. No live macOS extension test is claimed.

## Proposed next release: window destinations and reserved windows

### Destination choices

- New tab in the current window: preserve the current default.
- New window for each eligible link: explicitly available for users who prefer it.
- New tab in a designated browsing window: recommended for dashboard workflows.

Keep focus behavior separate: follow the opened page or remain on the source. Reusing a browsing **window** must not overwrite one of its existing tabs. Reusing a single preview tab is a different, potentially destructive behavior and should not be the default.

### Solo window

An explicit action moves the existing selected tab into a dedicated window rather than reloading its URL. The source becomes manually protected independently of pin state. The ordinary browser window remains the browsing destination.

Start with normal Chrome windows. Offer compact popup windows only after platform and accessibility testing, including the ability to pause or release protection without a toolbar.

### Dashboard window

Explicitly reserve a window for selected anchors. Ordinary branches go to its browsing destination. Additional anchors can only be added through a clear user action.

For newly created non-anchor tabs inside the reserved window, evaluate moving the already-created tab to the designated browsing window. Do not close/recreate it from its URL or replay a request body. Tab-created events are observational: a transient extra tab may appear. Authentication dialogs, browser-owned pages and uncertain cases need exceptions or a visible limitation, not blind interference.

The extension must never move unrelated windows, fight an explicit release action, continually reopen closed windows, or silently commandeer a random last-focused window.

## Proposed later release: saved layouts

### 2×2 implementation

Use four real top-level Chrome windows arranged in a grid. Each contains its assigned anchor. Send ordinary branch links to the separate browsing window.

This is **four windows arranged together**, not four live panes inside one Chrome window. Preserve window frames and OS behavior in product images and documentation. Save normalized cell geometry, ask which monitor to use, and read back actual bounds. Handle monitor removal and minimum-window-size failures without moving windows off-screen or endlessly correcting user drags.

### Native two-pane support

The Chrome Tabs documentation currently describes `chrome.tabs.createSplit()` and `splitWithTabId` as Chrome 155+ features. `createSplit()` accepts exactly two adjacent tabs with matching window, pinned and group state. Runtime-check availability; do not assume that documentation means the user's Chrome has the API. Do not extrapolate a two-tab API into a four-pane layout guarantee.

### True four-in-one-window view

There is no documented arbitrary four-tab compositor in the public Tabs API reviewed here. An iframe dashboard only works with embeddable pages; frame restrictions must not be removed to manufacture compatibility. A separate browser-shell application is a distinct product and security undertaking, not a small extension feature.

## Architecture

Separate these modules rather than making `openBranch()` responsible for everything:

- **Protection policy:** pure navigation classification, existing native exclusions, source rules and explicit overrides.
- **Destination router:** current-window tabs, new windows and designated browsing windows; validates target ownership and availability.
- **Reserved-window controller:** anchor membership, observed new tabs, bounded moves, ownership and release.
- **Workspace controller:** stable saved anchor/workspace IDs, idempotent open/reuse behavior and explicit restore actions.
- **Layout adapter:** normal Chrome window tiling now; native two-pane support behind capability detection; no promise of a universal iframe adapter.
- **Health and diagnostics:** document-specific guard readiness, failure state and limited local diagnostics with redacted URLs by default.

Persist definitions (chosen home URLs, policies and layout preferences) locally. Keep runtime tab/window/document bindings and operation journals in session storage. A saved URL is not a saved application session. Review saved/exported URLs for tokens or private paths; never collect credentials or record form bodies.

The existing per-gesture deduplication and uncertain-create behavior are worth preserving. Add per-workspace/destination serialization. When browser creation succeeds but acknowledgement is uncertain, do not blindly create another destination or navigate the source as a fallback. Chrome tab/window creation and extension storage are not one atomic transaction.

## Proposed UX

Keep the everyday popup small:

- Protection: All eligible links / Same origin / Home URL.
- Open links in: Current window / New window / My browsing window.
- Focus: Follow link / Stay here.
- Action: Make this a dashboard window.
- Secondary destination: Workspaces.

The workspace editor handles named anchor sets, monitor choice, layout, browsing destination, and open/rearrange/release actions. Use truthful labels such as “Links protected,” “Connecting,” “Needs site access,” “Page changed,” and “Paused.” “Protected” does not mean the application cannot change data, log out, refresh, navigate through unsupported script-only controls or be closed by the user.

## Workflows worth testing

1. Four-panel operations wall with investigation in a separate browsing window.
2. Triage source: keep a list of issues, orders or messages in place while opening detail pages separately.
3. Reference beside work: fixed documentation or a specification beside an editable project.
4. Inspect separately: open a working copy for navigation while leaving the original alone; do not claim a copy of unsaved memory.
5. Presentation view: keep a selected page visible while navigation is sent elsewhere; not a kiosk or data-loss prevention feature.
6. Named daily workspace: reuse known live anchors or ask before reopening saved URLs; do not silently duplicate every page on startup.
7. Login/maintenance escape: explicit temporary pause, preserve the intended home URL, then re-arm after user confirmation.
8. Return to source: track branch provenance locally and focus the original anchor without relying on URL matching.

## Acceptance gates

- Verify original document identity, scroll and a test field remain unchanged after protected links; checking URL equality alone is insufficient.
- Test ordinary click, Enter, Cmd/Ctrl-click, middle-click, Shift-click and `_blank` under each explicitly chosen window policy.
- Test pin-immediately-then-click, rapid unpin/pin, stale/out-of-order snapshots and guard acknowledgement.
- Four simultaneous anchors should produce one designated browsing window and the correct separate tabs.
- Exercise worker suspension, closed destinations, uncertain creation, duplicate events, tab drags and move-loop prevention.
- Test actual authentication, downloads and unsupported script-only navigation. No automatic POST replay or blind rollback.
- Test monitor removal, different scaling, minimum window sizes, focus, full-screen and compact-window controls on actual target operating systems.
- Test permission revocation, extension update, unsupported pages and reset/uninstall. Never claim readiness from settings alone.

Do not release the expanded behavior solely on the basis of the current mocked suite.

## Primary technical references

- Chrome Windows API: https://developer.chrome.com/docs/extensions/reference/api/windows
- Chrome Tabs API: https://developer.chrome.com/docs/extensions/reference/api/tabs
- Chrome display metadata: https://developer.chrome.com/docs/extensions/reference/api/system/display
- Chrome content scripts: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Chrome navigation events: https://developer.chrome.com/docs/extensions/reference/api/webNavigation
- CSP frame ancestors: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors
- X-Frame-Options: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options
- Electron WebContentsView, for a separate-app option only: https://www.electronjs.org/docs/latest/api/web-contents-view
- Electron security responsibilities: https://www.electronjs.org/docs/latest/tutorial/security
