# Anchor 2.0 — installed-browser acceptance

Recorded **5 October 2026** on macOS 15.2 arm64 with Google Chrome for Testing **143.0.7499.4**. The tested checkout was `129a0b40ab2f2c0583f08bad5a1c365eb1c185ee`; Anchor **2.0.0**, runtime tree SHA-256 `137346309e1d8529ab856513c986c34a68a724a498328131ca8c31db7768c0fe`. The unpacked extension was loaded from `extension/` in a temporary profile. All installed-extension fixture checks used `http://127.0.0.1:8765`; no personal account data was opened.

The final automated installed-extension run used a fresh headless Chromium profile and is recorded in [browser-test-results.json](browser-test-results.json): **56 passed, 0 failed, 2 skipped**. A headed run on the same OS/browser passed 55, failed the worker-target identity assertion, and skipped the same two cases. The worker test was corrected to verify that the original target disappears, then a runtime request succeeds and a worker is visible. That corrected test passed in the final headless run. The UI screenshot test passed in both browser modes.

| Check | Result |
|---|---|
| Load/upgrade/reconnect | **PARTIAL.** The unpacked 2.0.0 extension loaded enabled from `extension/`; its `chrome://extensions` card showed no Errors section and the initial worker console had no messages. Automated popup connectivity passed. During later manual navigation work, the popup remained at “Checking this tab… / Connecting to Chrome”; extension reload/update recovery was not completed. |
| Pin already-open page | **PASS.** Installed E2E and a manual fixture click each branched once after connection; the source stayed on the same document with its unsaved input intact. Enter-key branching also passed in E2E. |
| Pin immediately then click | **NOT RUN.** The asynchronous pin/readiness interval remains uncharacterized manually. |
| Iframe `_top`, fragments, and `_parent` | **PASS (installed E2E).** Different-document `_top` fragments and direct-child `_parent` targets branched; a matching top-document fragment stayed native; nested `_parent` and frame-local links stayed within their frame. |
| Unpin/disabled/native regression | **PASS (installed E2E).** Unpin, manual protection on an unpinned tab, master disable, and native same-origin navigation behaved as expected. |
| Three routing choices | **PASS (installed E2E).** Current-window branching, a new Chrome window, and a shared browsing window were exercised without replacing the source or the first branch. |
| Focus choices | **PARTIAL.** Follow/stay preferences and active-tab results passed in E2E. macOS window focus with minimized/background windows was not manually checked. |
| Solo action | **PASS (installed E2E).** A live page moved without reload; exploration opened outside its reserved window. |
| Grid/layout and window placement | **PARTIAL.** A real four-window workspace adopted live pages and preserved document state. Physical bounds, monitor scaling, and visual placement of the arranged windows were not inspected. |
| Simultaneous branches | **PARTIAL.** Two branches shared the designated browsing window without replacing each other; four simultaneous link branches into one destination window were not run. |
| Native extra tab | **PASS (installed E2E).** Command-click, middle-click, `target=_blank`, download behavior, and reserved-window relocation passed on macOS Chrome. |
| Forms/download/auth | **PARTIAL.** GET submitter overrides, one native POST, password GET exclusion, and downloads passed. A real authentication flow was not tested. |
| SPA route coverage | **PASS (installed E2E).** Eligible anchor links branched before the router; unprotected trusted SPA clicks and `pushState` remained native and retained the live document. |
| Actual address-bar navigation | **FAIL — acceptance not met.** With recovery enabled and the local source pinned, I entered a fixture URL in Chrome’s actual address bar. Chrome emitted `transitionType: typed` with `from_address_bar`, but the pinned page navigated instead of returning to its saved URL in a separate branch; the unsaved field was lost. This is separate from the passing CDP typed-navigation simulation in E2E. The popup also showed “Connecting to Chrome” during later manual attempts, so address-bar recovery and readiness need a headed retest after a fix. |
| Same-URL pending recovery race | **SKIP — unresolved.** E2E could not observe a post-create pending interval before recovery committed. No equivalent manual post-create same-URL race was reproduced. The skip is not a pass; manual investigation remains required. |
| Back/Forward, reload, redirect, and script navigation | **PARTIAL.** HTTP redirect branching, JavaScript-only native navigation, and `pushState` observation passed E2E. Actual Back/Forward and reload behavior on the pinned source were not manually checked. |
| Pause and arrange | **PASS (installed E2E).** Arrange-only preserved a five-minute workspace pause and live document state; native navigation remained available while paused. |
| Closed/moved pages | **NOT RUN manually.** Remove-and-readd binding, failed move followed by manual drag, and close/release behavior need live interaction checks. |
| Workspace definitions | **PARTIAL.** Installed E2E saved/opened a four-page workspace through the extension worker, reused bindings, and released without reload. Delayed Save/Open UI, remove-and-readd, and failed-move/manual-drag flows were not verified with the installed workspace UI. |
| Worker suspend/restart | **PASS (final headless installed E2E).** The real service-worker target was closed and disappeared; a subsequent runtime request returned the saved manual-protection and preference state, and a worker target was visible again. Natural Chrome suspension was not tested. |
| Browser/extension restart | **NOT RUN.** Extension reload/update and browser restart were not tested. |
| Display removal/scaling and permission changes | **PARTIAL.** Display state was reported without granting optional access. Revocation was **SKIPPED** because `system.display` was not granted in the isolated profile; physical monitor removal/scaling was not tested. |
| Accessibility | **NOT RUN manually.** Keyboard navigation coverage exists for Enter and modifier clicks; zoom, full focus order, reduced motion, and screen-reader behavior remain. |
| Real dashboards | **NOT RUN.** Only the fictional local fixture was used. |

Fixture evidence: [protected source with unsaved input](acceptance-screenshots/protected-source.png) and [connected protection popup](acceptance-screenshots/connected-protection-popup.png). The screenshots contain only local fictional data.

### Error and environment notes

The initial installed extension card showed no extension Errors section; the initial service-worker console was empty. A later DevTools diagnostic snippet entered during investigation had a syntax error in the diagnostic itself. No extension-source runtime error was observed. The headed E2E run did not complete the final worker identity assertion; the corrected termination check passed in headless Chromium. The detailed per-case outcomes and skip reasons are in [browser-test-results.json](browser-test-results.json).
