# Anchor hardening review — 5 October 2026

Four independent read-only engineering reviewers examined navigation, state/workspaces, security boundaries, and experience/test coverage. The parent reviewed their source evidence and consolidated overlapping findings. Review base: GitHub `main` at `aa210937eb6ad7b7268234264782c5bc37fe781f` (same source tree as local `94c59d2`).

This report describes work still needed. This commit updates documentation; it does not fix the runtime findings below. P1/P2/P3 denote engineering priority, not security severity or a claim of exploitation. The formal Codex Security scan workflow was unavailable because its required reference resources could not be read; these are ordinary source-based reviews with the reproduction limits stated per finding.

## Recommended order

1. Fix the three P1 correctness bugs: iframe top-page fragment navigation, workspace async editor identity, and anchor re-add reconciliation.
2. Repair the obsolete installed-browser assertions, then obtain a real permitted-Chrome acceptance run. Mocked tests cannot demonstrate protection of a live pinned document.
3. Fix move ownership, pause preservation, `_parent` targets, and recovery generation checks; add failure/delay regressions before changing navigation guarantees.
4. Investigate full URL-change coverage with fixtures that measure original document identity, unsaved fields, and history as well as the URL. Address-bar reload recovery must not be presented as preserving the original page.
5. Improve session-state restoration, form submission compatibility, and restrictive local UI network policy.

## Findings

### H1 — P1: iframe `_top` hash links can replace the protected page

**Evidence:** [guard.js](../src/content/guard.js#L97) compares the destination with iframe `location.href`, including the initial-state fragment exemption at line 101. [service-worker.js](../src/background/service-worker.js#L64) repeats the comparison using `sender.url`. The fragment exception is in [core.js](../src/shared/core.js#L106).

**Trigger/impact:** A protected `/dashboard` embeds `/frame`. A user clicks `<a target="_top" href="#section">` in the frame. Its destination is `/frame#section`; Anchor treats that as frame-local fragment navigation and lets it replace the top document when Chrome permits the top navigation. This bypasses a pathway Anchor already intends to guard. Unsaved top-page state may be lost.

**Validation:** Two reviewers independently confirmed the policy mismatch in a read-only Node reproduction: the iframe current URL returns `NATIVE`, while the protected top URL returns `BRANCH`. Installed-browser reproduction remains required.

**Fix/test:** Separate href resolution from target-context policy. Resolve href against the frame base URI, but evaluate top-target fragment exceptions against the live top-tab URL in both guard and worker. Test `_top` fragment links from a different iframe document, a matching document URL, initial unknown state, and preserved top document identity/unsaved state.

### H2 — P1: delayed workspace replies can open the wrong workspace or erase newer edits

**Evidence:** [workspaces.js UI](../src/ui/workspaces.js#L117) reads global `draft` and `adoptIds` after awaited save requests. Sidebar/New/fields remain available. [common.js](../src/ui/common.js#L14) prevents repeating the initiating button, but does not lock the related editor operations.

**Trigger/impact:** Open A, switch to B while Save(A) is pending, and the continuation sends Open(B). Editing a label during Save can also be overwritten by the returned saved definition, which clears `dirty`. A user can unexpectedly open/move different pages or lose unsaved workspace edits.

**Validation:** The experience reviewer executed the exact extracted `save`/`open` functions with deferred responses and message cloning. Observed Save(A) → Open(B), and a later label edit reverting with `dirty=false`.

**Fix/test:** Capture operation workspace ID, cloned definition, adoption IDs, browsing destination, and editor revision at action start. Open must use the captured identity. Lock related controls during mutations or reconcile replies against the editor generation while preserving newer edits. Test delayed Save/Open with selection changes, New, edits, imports, deletion, and competing actions.

### H3 — P1: removing and re-adding a live page can release its new binding

**Evidence:** [workspaces.js background](../src/background/workspaces.js#L28) adopts the tab under a new anchor identity. Cleanup at [line 98](../src/background/workspaces.js#L98) releases the old identity by tab ID. [releaseTab](../src/background/workspaces.js#L35) clears all bindings and protection for that tab, including the newly adopted identity. The manager allows same-workspace tabs to be selected at [UI line 43](../src/ui/workspaces.js#L43).

**Trigger/impact:** In a workspace, remove an anchor and add its still-open unpinned tab back as a new anchor, then Open & arrange. The operation succeeds but the page loses workspace protection and its runtime binding. Its window may still be reserved. Another Open can create a duplicate page.

**Validation:** State reviewer reproduced with the existing mock harness in memory: `workspaceId:null`, inactive protection, missing new binding, and a later duplicate creation. No repository files were changed by the reproduction.

**Fix/test:** Reconcile removed identities before adopting replacements, or transfer a live tab binding atomically with identity-specific cleanup. Preserve the prior protection snapshot. Assert one binding, continued protection/reserved membership, no reload, and no new creation on the next Open.

### H4 — P2: failed moves leave ownership tokens that swallow manual drags

**Evidence:** [workspaces.js](../src/background/workspaces.js#L61) creates a move lease before the browser call. [workspace-state.js](../src/background/workspace-state.js#L33) records only the tab and expiry; [consumeMove](../src/background/workspace-state.js#L49) consumes any matching lease. [onAttached](../src/background/workspaces.js#L199) then returns without reconciling the manual destination.

**Trigger/impact:** Make Solo fails before a window is created. The user drags that tab into an ordinary window within 15 seconds. The abandoned lease classifies the manual drag as extension-owned; the tab stays workspace-bound in an unreserved window.

**Validation:** State reviewer reproduced a definite `windows.create` failure followed by immediate manual attachment using the existing mock harness in memory.

**Fix/test:** Track operation identity and expected destination, clear ownership on definite failures, and reconcile uncertain moves against current browser state. Test failure-before-move plus immediate manual drag, delayed successful attachment, and unrelated manual destinations.

### H5 — P2: Arrange open pages silently ends a workspace pause

**Evidence:** [adopt](../src/background/workspaces.js#L30) resets each tab’s `pausedUntil`. [openWorkspace](../src/background/workspaces.js#L95) adopts existing pages even for arrange-only; [line 133](../src/background/workspaces.js#L133) resets the run pause.

**Trigger/impact:** Pause for authentication, then Arrange open pages. Protection and native extra-tab routing resume before the intended pause expires, although the user requested only arrangement.

**Validation:** Source-path confirmation; a delayed/authentication browser reproduction has not been run.

**Fix/test:** Preserve existing tab and workspace pause deadlines during arrange-only. Any resume should be explicit. Assert ordinary navigation and reserved-window behavior remain paused after arrangement until Resume or the original deadline.

### H6 — P2: `_parent` targets reaching the top page are treated as frame-local

**Evidence:** [guard.js](../src/content/guard.js#L49) permits only `_top` interception inside frames; GET-form filtering at [line 111](../src/content/guard.js#L111) also excludes `_parent`.

**Trigger/impact:** A direct-child iframe’s `_parent` link navigates the protected top page, but is left native. An opt-in GET form with `_parent` can also escape handling when it targets the protected top context.

**Validation:** Independently source-confirmed by navigation and boundary reviewers. Browser top-navigation restrictions still apply; this is a protection correctness gap, not a privilege bypass.

**Fix/test:** Resolve whether `_parent` actually reaches top using browsing-context identity, and apply the same rules to links and eligible forms. Test direct-child `_parent`, top-document `_parent` GET forms, nested iframe-local parents, and native POST handling.

### H7 — P2: recovery can overwrite a newer pending navigation to the same URL

**Evidence:** [service-worker.js](../src/background/service-worker.js#L290) rejects pending navigation only when its URL differs from the committed event. The rollback at [line 310](../src/background/service-worker.js#L310) can therefore proceed while a new same-URL navigation is pending.

**Trigger/impact:** During delayed destination creation, a user starts a second navigation to the identical destination. The old active document and equal URL can pass recovery’s checks; restoring the previous page then overrides the newer user request.

**Validation:** Source-confirmed. Existing tests cover a different pending URL, not this identical-URL case.

**Fix/test:** Reject rollback when any newer navigation is pending, or capture a navigation generation synchronously and require it to remain unchanged across awaited work. Extend the worker test so `afterCreate` sets `pendingUrl = details.url`; verify no rollback. Include identical-URL reload/re-navigation in permitted Chrome acceptance.

### H8 — P2: installed-browser tests still require obsolete popup wording

**Evidence:** [tests/e2e/run.py](../tests/e2e/run.py#L210) and [line 252](../tests/e2e/run.py#L252) wait for `This tab stays put.`; [popup.js](../src/ui/popup.js#L28) now renders `Link protection is on`.

**Impact/validation:** These two checks will fail even with a healthy installed extension once the current startup block is removed. This was confirmed by literal comparison; no new installed run is claimed.

**Fix/test:** Update assertions and prefer stable semantic state over marketing copy. Run the installed suite in a permitted Chrome profile and record executed cases, startup failures, browser version, and current date honestly.

### H9 — P2: empty GET-form submitter overrides are ignored

**Evidence:** [guard.js](../src/content/guard.js#L108) and [line 114](../src/content/guard.js#L114) use truthiness fallbacks for `formmethod` and `formaction`.

**Trigger/impact:** An explicitly empty submitter attribute differs from an absent attribute under native form rules. Empty `formmethod` can choose native GET over a parent POST; empty `formaction` targets the current document instead of the parent form’s other action. Anchor may skip eligible GET protection or open the wrong destination.

**Validation:** The parent verified native effective properties in a local Chromium about:blank DOM with a parent POST form and explicit empty overrides. `button.formMethod` was `get` while the guard fallback produced `post`; `button.formAction` was the current document while the guard selected the parent’s other action. No network submission or installed-extension reproduction was performed.

**Fix/test:** Preserve missing-versus-empty semantics and use effective native submission rules. Test empty/nonempty overrides, invalid methods, parent POST/GET, and no submitter.

## Additional resilience work

- Validate persisted session record/runtime shapes before restoring them. The stores are trusted extension storage; this addresses malformed or older state, not a demonstrated website attack. See [state.js](../src/background/state.js#L22) and [workspace-state.js](../src/background/workspace-state.js#L17).
- Reconcile runs/reserved membership with live tabs/windows on worker startup and preflight all selected pages before mutating the first workspace anchor.
- Consider `connect-src 'none'` and a suitable restrictive `default-src` for local-only extension UI, after checking required styles/images. Current sender checks, isolated worlds, URL validation, import schemas, and text rendering did not yield a demonstrated remote-code or data-exfiltration path in this review.
- Build a real Chrome coverage matrix for address-bar actions, SPA routes, redirects, Back/Forward, permission revocation, extension updates with existing pinned pages, and worker suspension. Preserve document identity and unsaved state in the acceptance assertions.

## Documentation correction and verification

README now leads with pinned-tab protection and explicitly maps navigation actions to current behavior. Its Arrange open pages instructions now explain refusal when any saved page is missing. All local README/report references and diff whitespace are checked before publication. Existing 229 unit and 61 rendered UI results are historical baseline evidence; they do not cover all newly reported issues. No new installed-extension pass or exhaustive security audit is claimed.
