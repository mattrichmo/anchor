# Anchor 2.0 — installed-browser acceptance gate

Record the UTC date, browser/version, OS, extension build/hash and result for every item. The E2E runner writes its attempted browser, startup phase, version when available, and pass/fail/skip counts to `docs/browser-test-results.json`. A managed-policy block is `NOT RUN`, never a pass. Use a permitted test profile with fixtures before personal dashboards; do not weaken enterprise policy or browser security settings to run a test.

| Check | Pass condition | Result |
|---|---|---|
| Load/upgrade/reconnect | No extension errors; connected badge after webpage refresh | NOT RUN |
| Pin already-open page | After acknowledged ready, link/Enter opens exactly one destination; original JS marker, input and scroll remain | NOT RUN |
| Pin immediately then click | Characterize transition; do not assert atomic immunity; check readiness/preflight behavior | NOT RUN |
| Iframe `_top` and hash | From `/frame?case=other`, a `_top` `#section` link branches against the top URL and preserves its document token/input; when the top URL matches the resolved target, the hash stays in that document | NOT RUN |
| Iframe `_parent` | A direct-child `_parent` link and opt-in GET form do not replace the top page; a nested `_parent` link remains in its immediate parent frame | NOT RUN |
| Unpin/disabled/native regression | Original trusted native page interactions remain usable | NOT RUN |
| Three routing choices | Correct tab/window placement; no existing browsing tab overwritten | NOT RUN |
| Focus choices | Follow vs stay, including minimized destination, actual macOS window manager | NOT RUN |
| Solo action | Existing tab moved, no deliberate reload; exploration leaves reserved window | NOT RUN |
| Grid and other layouts | Only selected anchor pages arranged; usable dimensions/readback; other tabs untouched | NOT RUN |
| Simultaneous branches | Four anchors route to one shared destination window and four separate tabs | NOT RUN |
| Native extra tab | Cmd/Ctrl/middle/blank target moves original tab; no duplicate or navigation replay | NOT RUN |
| Forms/download/auth | POST happens once natively; downloads native; pause enables sign-in; auth exceptions reasonable | NOT RUN |
| SPA route coverage | Eligible anchor click branches before the SPA handler; standalone `pushState` updates the observed URL while retaining the same document token and unsaved input | NOT RUN |
| Address-bar navigation | Type a URL in Chrome's actual address bar with recovery enabled. Record whether recovery opens a branch and reloads the saved URL; compare document token and unsaved input before/after. URL recovery does not preserve in-memory page state | NOT RUN |
| Same-URL pending recovery | The E2E fixture issues a second navigation from the first recovery branch event and checks Chrome's `pendingUrl`. If the post-create interval cannot be observed, record `SKIP`; the separate manual address-bar check remains required | NOT RUN |
| Unsupported routes | JS-only buttons and standalone history changes match the documented coverage limits; no dangerous rollback | NOT RUN |
| Pause and arrange | Pause a live workspace, arrange its open pages, then confirm the pause deadline remains active and a normal link stays native until Resume or expiry; verify document token and unsaved input before/after arrange | NOT RUN |
| Closed/moved pages | Close never resurrects; deliberate drag releases; release/delete never closes/reloads | NOT RUN |
| Workspace definitions | Save/edit/import/export valid; selected live pages preserved; missing pages only open explicitly | NOT RUN |
| Worker suspend/restart | Let Chrome suspend the worker naturally, then trigger a protected action; session state survives. The E2E termination case uses DevTools to terminate the real service-worker target and observes its next start, without clearing extension storage | NOT RUN |
| Browser/extension restart | Missing live bindings handled honestly; no silent claim of memory restoration | NOT RUN |
| Display removal/scaling | Fallback and geometry warnings; no continuous snapback/off-screen enforcement | NOT RUN |
| Permission changes | Grant optional display access through the workspace UI's real user gesture, verify display metadata, revoke it in Chrome's extension permissions, and verify metadata access disappears with the current-display fallback. E2E revocation is skipped when the isolated profile has no grant; it does not add a grant programmatically | NOT RUN |
| Accessibility | Keyboard navigation, zoom, scrollable popup, focus, reduced motion and screen reader labels | NOT RUN |
| Real dashboards | Test chosen apps without unsaved important work; record exact URLs redacted and observed limits | NOT RUN |

Use the local fixture server and `examples/workspace-local-demo.json` for repeatable early checks. The fixture records a per-document token and has an unsaved input so checks can distinguish same-document URL changes from reloads. Browser-bar `Page.navigate` coverage in E2E is a controlled CDP typed-navigation simulation; it is not evidence of a toolbar interaction or proof that recovery preserves page memory. Standalone `pushState` is observed, not reversed. Do not mark an item passed merely because a mocked test covers its controller.
