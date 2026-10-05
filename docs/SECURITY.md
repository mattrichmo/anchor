# Anchor 2.0 safety and security notes

## Scope

Link branching and small protected workspaces; not a kiosk, read-only mode, sandbox, credential manager or data-loss-prevention product. Browsing/OS APIs remain authoritative. A URL rollback is not an application transaction rollback.

## Implemented controls

- Isolated-world capture script, no page-world API monkey patches, postMessage bridge or externally connectable command interface.
- Runtime sender ID, trusted internal UI path, Chrome-derived tab ID, frame/document lifecycle checks. Privileged workspace/control requests are unavailable to ordinary content senders.
- HTTP/HTTPS URL validation; no embedded URL credentials or privileged schemes in saved anchor URLs. Conservative Chrome Web Store exclusions.
- Strict workspace schema, bounded sizes, reserved prototype-like IDs rejected, unknown import fields discarded, distinct live-tab adoption enforced. Import validates before releasing live bindings.
- UI uses textContent/DOM creation for user/site strings; no HTML interpretation of imported labels.
- Local/temporary storage only, access restrictions established in state module, no cookies/history/debugger/capture permissions. Saved tab policies and runtime ownership are validated against live tabs/windows on worker startup; invalid long pauses are discarded, conflicting workspace window claims are released, and saved readiness is re-established against the current document.
- Extension UI uses restrictive local asset CSP with `default-src 'none'`, `connect-src 'none'` and `form-action 'none'`. Inline styling remains allowed for layout previews; scripts must be local assets.
- Bounded per-gesture journal, per-destination creation lanes, serialized UI mutations and session writes. Unknown results do not trigger blind creates or native source replay.
- Native tab relocation moves the original browser tab instead of closing/recreating it from its URL. No POST body replay. Auth-like/privileged/unknown paths have conservative exceptions.
- Revisioned document-specific guard acknowledgement; no green readiness solely from saved settings. Older snapshots/other documents rejected. A lost session revision can be reset only with a current document response naming the exact live guard and revision. Known protected disconnected clicks show a notice rather than navigating as fallback.
- Pending operations visible for owner acknowledgement after inspecting open windows. Manual acknowledgement does not prove an earlier create failed; retry may duplicate a previously completed-but-unconfirmed action.
- Window bounds validated before mutation; only selected/bound anchor windows arranged; no forced repeated repositioning, window resurrection or unsaved-state restoration claims.

## Residual risk and acceptance

Host access to arbitrary HTTP/HTTPS pages is powerful, even without external transmission. Review every source change before public distribution. Earlier page handlers, custom JS routing and some iframe/native/browser pathways can escape link capture. The pin-state transition is asynchronous. Native extra tabs can exist transiently or remain under exceptions; heuristics do not identify every authentication flow. Saving or sharing a home URL can disclose a token already embedded in it.

Service-worker/storage/browser operations are not one transaction. Pending journals constrain retries but cannot claim exactly-once side effects. Browser/extension restarts may drop session bindings; explicit Open can reopen saved URLs but not restore unsaved memory. Window manager focus/size behavior requires real OS testing.

The installed-extension suite could not run in this environment due to managed Chromium restrictions. No policy was bypassed. Tests with mocked APIs are useful evidence about code paths, not proof that a Mac/browser/real dashboard is safe. Complete the manual acceptance checklist before publishing.

Report issues to hello@mattrichmond.ca with version, browser/OS, steps, actual vs expected behavior and a redacted screenshot where useful. Do not send cookies, access tokens, passwords, confidential URL query strings or full workspace exports without reviewing them.
