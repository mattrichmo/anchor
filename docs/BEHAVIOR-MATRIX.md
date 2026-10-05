# Anchor 2.0 behavior matrix

| Action/context | Default or chosen behavior | Boundary |
|---|---|---|
| Ordinary eligible link in connected pinned tab | New tab in same window | Destination/focus are configurable. |
| Manually protected unpinned tab | Same policy as pinned | Independent of pin layout. |
| New window per link | One normal Chrome window per eligible link | Native already-new-window gestures remain browser-owned. |
| My browsing window | New tab in selected/recreated destination | Reuses window, never overwrites an existing tab. |
| Four simultaneous sources in one workspace | Shared destination creation serialized | Storage/API acknowledgement is not an atomic transaction. |
| Same-origin mode | Identical scheme/host/port stays native | Not all subdomains. |
| Home URL mode | Exact saved home stays native | Fragment-only defaults remain native. |
| Fragment-only links | Native | Optional setting to branch. |
| Cmd/Ctrl/middle click; target=_blank | Native at event layer | Supported resulting tabs in reserved windows may move intact. |
| Shift-click creates separate native window | Native window | Not automatically adopted or commandeered. |
| Download/mail/tel/editable content | Native | No forced branch. |
| POST and password/file forms | Native, never replayed | Not a state-change firewall. |
| Simple GET form | Native by default | Opt-in; no password/file controls; submitter and replacement query preserved. |
| Link-driven SPA | Guarded when eligible before router handler | No universal control over earlier handlers/custom buttons. |
| JS-only location/history/button route | Not universally intercepted | History observed, not blindly rolled back. |
| Same-frame iframe link | Native | Eligible `_top` escapes can branch with site access. |
| Address bar/bookmark | Native by default | Experimental selected recovery off by default, including missed same-tab links/start-page navigations; reload cannot recover memory. |
| Solo dashboard action | Adopts live page; moves only when needed | Manual protection, no deliberate reload. |
| One-window workspace | Chosen pages together in normal Chrome tabs | Only active tab visible; no tiled compositor. |
| 2×2 / columns / rows / focus | Real top-level Chrome window arrangement | OS may adjust requested bounds. |
| Extra native tab in reserved window | Move original tab to configured outside destination | Transient extra tab, auth/internal exceptions, no replay. |
| New blank/unknown tab | Wait for knowable destination | May remain, not guessed. |
| Likely sign-in/internal tab | Left in place with notice | Heuristic, pause proactively for maintenance. |
| Deliberately dragged-in extra tab | Left in place | Not kiosk enforcement. |
| User drags anchor out | Release membership, do not snap back | Prior automatic pinned protection may still apply. |
| Open workspace | Reuse known live bindings, reopen missing saved URLs | Explicit action only; no URL-based adoption guessing. |
| Arrange open pages | Move/resize existing bound pages | Refuses missing anchors, never resurrects. |
| Pause workspace | Suspend link policy and native relocation for five minutes | Does not undo already-open branches. |
| Release/delete/reset | Restore earlier protection/remove reservations | Does not close, reload, merge or unpin pages. |
| Close anchor/window | Clean runtime ownership | No auto-restore loop. |
| Return to source | Focus known still-live source | No URL guessing/reopen of closed source. |
| Working copy | Open current URL at chosen destination | Not a clone of unsaved memory. |
| Unknown create result | Cancel intercepted source navigation; show uncertainty | Check windows/acknowledge before retry. |
| Reloaded extension/invalid connection | Known protected clicks held with notice | Refresh webpage; atomic pin-transition immunity not promised. |
