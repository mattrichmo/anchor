# Anchor 2.0 architecture

**Protect → Route → Arrange.** Chrome's pin state is a trigger, not a saved anchor identity. Implemented as Manifest V3 JavaScript ES modules with no runtime dependencies.

## Modules and ownership

| Module | Responsibilities |
|---|---|
| `shared/core.js` | Settings validation, origin/URL checks, pure navigation decisions, branch placement, conservative recovery eligibility. |
| `shared/workspace-model.js` | Workspace/library schema, safe IDs, URL rules, pure layout bounds, conservative native-relocation exclusions. |
| `content/guard.js` | Isolated document-start capture of eligible trusted links and optional simple GET forms. No injected main-world router monkey patches or page-message bridge. |
| `background/state.js` | Local preferences, per-tab session records, per-source queue, revisioned document-specific readiness publication. |
| `background/branches.js` | Per-gesture reservation, confirmed tab IDs and unknown-result behavior. No URL-level dedupe. |
| `background/workspace-state.js` | Validated local definitions, serialized session runtime mutations, destination/workspace queues, move and creation journals. |
| `background/router.js` | Same-window/new-window/shared-window branching; explicit destination validation; existing-tab relocation; bounded source provenance. |
| `background/workspaces.js` | Adoption, live bindings, reservation membership, layouts, pause/release/delete, display discovery and native extra-tab policy. |
| `background/service-worker.js` | Synchronous event registration, trusted request dispatch, live tab/document revalidation, public UI actions, lifecycle integration. |
| `ui/*` | Popup, settings and workspace editor. UI cannot supply a trusted content sender identity. |

## Data model

Local preferences keep the existing schema 1. Local workspace library is a separate schema 1 under `workspaces`: `{schemaVersion:1,items:Workspace[]}`. Maximum 20 definitions. Each definition contains a stable ID, name, layout, outside-window destination, focus/reservation preferences, display ID, gap and one to four `{id,label,url,mode}` anchor definitions. Browser IDs are never exported as durable identities. Reserved object-prototype names and `default` cannot be imported as identities.

Session `workspaceRuntime` contains live runs/anchor→tab bindings, reserved-window membership, explicitly selected browsing destinations, bounded branch→source references, move tokens, candidate tabs, and pending creation operations. Existing per-tab records carry policy overrides, saved home, known document guards, readiness/revision, recovery state and bounded gesture IDs. Runtime URLs represent navigation/protection context, not a durable history database.

`beforeWorkspace` preserves pre-adoption tab choices. Release restores those choices, so an automatically protected pinned tab can remain protected after workspace release. It does not alter the browser pin state.

## Link execution

1. The content guard synchronously classifies the real event. Known native cases are left native; a supported protected intent is cancelled before typical page/router handlers.
2. The service worker independently reads the current tab and active frame document. It never trusts a content-provided tab ID or cached pin value as authoritative.
3. A per-source lane reserves the intent before calling the destination router.
4. Routing either creates a tab in the current window, creates a new normal window, or serializes access to the workspace's designated browsing window. Existing browsing tabs are never overwritten. A reserved source window cannot route a branch back into itself.
5. A confirmed result records the new tab and local source relationship. Uncertain creation never falls back to navigating the source or blindly repeating the side effect.

The live browser and extension storage do not share an atomic transaction. Journals reduce duplicates; they are not an exactly-once guarantee. An interrupted workspace/destination operation is visible for manual acknowledgement after checking open windows.

## Native tab results

The guard leaves modifiers and native new-context targets untouched. A separate `tabs.onCreated`/`onUpdated` observer considers supported extra tabs created inside reserved windows. It moves the original tab object via `tabs.move` or `windows.create({tabId})`, retaining the original browser navigation context rather than replaying a URL/form body. Ambiguous blank tabs wait for a knowable URL. Likely login routes and browser-owned pages are left in place with a notice. These are conservative heuristics, not universal authentication detection.

One consumed move token suppresses release for an extension-generated `onAttached`. A later user drag is not swallowed by the entire TTL. Deliberately dragged-in unrelated tabs are not bounced back. A closed tab only removes runtime membership; it is never recreated by an event listener.

## Workspace execution and layout

The editor saves definitions separately from execution. Open validates geometry before any creates/moves, checks for duplicate live-tab adoption, reuses known bindings, adopts selected live tabs after URL revalidation, and opens missing saved URLs only under explicit Open intent. Arrange-only rejects missing pages.

Selected pages move together into a dedicated collection, or each moves to its own normal window for tiling. Unrelated tabs are not moved or closed. Layout calls normalize window state before setting bounds, then read actual bounds back. Window manager deviations are reported instead of triggering an endless correction loop. Current-display coordinates come from the extension editor; optional display permission supplies named monitor work areas and fallback on monitor removal. Minimum requested cell size is 480×320.

Native Chrome split controls are not included. Four windows are not four panes. No iframes, captured-tab streaming, frame-header stripping or alternate browser shell is used.

## Concurrency and recovery

UI mutations are serialized so release/delete/reset cannot race an active open. Definitions have their own write lane. Session runtime mutation is clone→persist→publish under one write lane, avoiding concurrent lost updates across sources. Link routing remains concurrent across unrelated sources; shared destination creation is serialized by workspace key. `storage.session` survives worker suspension but not all browser/extension lifecycle boundaries. A restart invalidating bindings does not cause automatic URL-based ownership guessing.

## Health and temporal boundary

Stable snapshots receive monotonically increasing per-tab policy revisions. A green-ready `ON` badge requires an acknowledgement from the current top document, the current build and the latest revision. Subframe acknowledgements cannot certify the top page. Initial/missing receivers show connecting/unavailable instead of a false green state. The guard rejects older or wrong-document snapshots and refreshes on pointer/focus/Enter signals.

This does not provide a synchronous pin-state read inside a webpage event. A native click arriving before a formerly unprotected page learns it became pinned can still escape. Known-protected disconnected clicks are cancelled with a notice. The UI and documentation require a connected page, and tests separate this claim from impossible total navigation immunity.

## Testing boundaries

Pure schema/layout and actual worker modules are exercised with explicit Chrome mocks. Real browser DOM/UI scripts are rendered on about:blank with mocks. The installed extension suite separately exercises real Chrome APIs in an allowed temporary profile. See TEST-REPORT; do not combine these layers into an installed-browser pass claim.
