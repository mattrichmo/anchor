# Anchor 2.0 — installed-browser acceptance gate

Record browser version, OS, extension build/hash and result for every item. Run in a permitted test profile with fixtures before personal dashboards. Never weaken enterprise policy to run a test.

| Check | Pass condition | Result |
|---|---|---|
| Load/upgrade/reconnect | No extension errors; connected badge after webpage refresh | NOT RUN |
| Pin already-open page | After acknowledged ready, link/Enter opens exactly one destination; original JS marker, input and scroll remain | NOT RUN |
| Pin immediately then click | Characterize transition; do not assert atomic immunity; check readiness/preflight behavior | NOT RUN |
| Unpin/disabled/native regression | Original trusted native page interactions remain usable | NOT RUN |
| Three routing choices | Correct tab/window placement; no existing browsing tab overwritten | NOT RUN |
| Focus choices | Follow vs stay, including minimized destination, actual macOS window manager | NOT RUN |
| Solo action | Existing tab moved, no deliberate reload; exploration leaves reserved window | NOT RUN |
| Grid and other layouts | Only selected anchor pages arranged; usable dimensions/readback; other tabs untouched | NOT RUN |
| Simultaneous branches | Four anchors route to one shared destination window and four separate tabs | NOT RUN |
| Native extra tab | Cmd/Ctrl/middle/blank target moves original tab; no duplicate or navigation replay | NOT RUN |
| Forms/download/auth | POST happens once natively; downloads native; pause enables sign-in; auth exceptions reasonable | NOT RUN |
| Unsupported routes | JS-only/buttons/address bar limitations match copy; no dangerous rollback | NOT RUN |
| Closed/moved pages | Close never resurrects; deliberate drag releases; release/delete never closes/reloads | NOT RUN |
| Workspace definitions | Save/edit/import/export valid; selected live pages preserved; missing pages only open explicitly | NOT RUN |
| Worker suspend/restart | Session survives worker termination; pending unknown operations visible, not retried blindly | NOT RUN |
| Browser/extension restart | Missing live bindings handled honestly; no silent claim of memory restoration | NOT RUN |
| Display removal/scaling | Fallback and geometry warnings; no continuous snapback/off-screen enforcement | NOT RUN |
| Denied permissions | No false green protection; display permission optional; clear reconnect guidance | NOT RUN |
| Accessibility | Keyboard navigation, zoom, scrollable popup, focus, reduced motion and screen reader labels | NOT RUN |
| Real dashboards | Test chosen apps without unsaved important work; record exact URLs redacted and observed limits | NOT RUN |

Use the local fixture server and `examples/workspace-local-demo.json` for repeatable early checks. Do not mark an item passed merely because a mocked test covers its controller.
