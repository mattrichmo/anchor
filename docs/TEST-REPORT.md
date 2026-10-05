# Anchor 2.0.0 — build and acceptance report

## 5 October 2026 — hardening implementation

H1–H9 from the [independent hardening review](HARDENING-REVIEW.md) are implemented. The follow-up also validates session tab/runtime records, reconciles live ownership on worker startup, bounds restored pause deadlines, repairs lost-revision guard handshakes, rejects conflicting reserved workspace claims, and preflights every selected page before adoption. The local extension UI now blocks network connections and native form submissions through CSP while preserving local asset rendering and JSON exports.

| Check | Result |
| --- | --- |
| Policy, schema/layout, navigation worker, workspace worker, session restoration | 247 passed, 0 failed (93 + 53 + 38 + 57 + 6) |
| Rendered popup/settings/navigation guard | 54 passed, 0 failed |
| Rendered workspace editor | 20 passed, 0 failed |
| Chromium shipped-CSP enforcement and local Blob export | 4 passed, 0 failed |
| `npm run check` — unit runner, generated extension, manifest/assets/JS validation | Passed |
| Installed extension on Chromium 151.0.7922.173 (Linux) | NOT RUN: browser launched, no extension service worker within 30 seconds; exit 2, zero cases |

The Node suites execute actual modules under mocked Chrome APIs. Rendered tests execute the actual UI and guard scripts using explicit API fixtures, about:blank documents, and synthetic origins fulfilled locally by Playwright for cross-origin iframe and effective-form-property checks. No external site requests or managed policy changes were used. This establishes the regression paths, not installed-extension privileges, browser event timing, OS window behavior, or safety of real dashboards. The installed attempt is recorded in [browser-test-results.json](browser-test-results.json); no managed policy was changed. A follow-up live diagnostic launch confirmed Chromium is already installed and emitted: **“Loading of unpacked extensions is disabled by the administrator.”** CDP reported no extension targets. The environment has `ExtensionInstallBlocklist=["*"]`; reinstalling Chromium does not establish an extension-enabled test environment.

This run used Node v24.19.0, Python 3.12.14, and Chromium 151.0.7922.173 on Linux.

New cases cover top-directed iframe fragments, direct and nested `_parent` targets, native unprotected frame interactions, empty/invalid/absent submitter overrides, same-URL pending recovery, exact guard revision reset, delayed Save/Open identity, replacement anchor bindings, definite move failure, pause preservation, malformed runtime restoration, shared-window ownership conflicts, and no-partial-adoption preflight.

## Earlier 5 October 2026 — navigation and experience review

The local checkout was reviewed against GitHub main at `df81dfc`. This section records the earlier review baseline; it is superseded by the hardening results above. No public store release is claimed.

| Check | Result |
| --- | --- |
| Unit policy, schema, layout, and worker checks | 229 passed, 0 failed |
| Rendered popup, settings, and content guard checks | 43 passed, 0 failed |
| Rendered workspace editor checks | 18 passed, 0 failed |
| Build, extension validation, README local links/images, and diff whitespace | Passed |
| Installed-extension startup (5 October navigation review) | Blocked: no service worker appeared; no E2E cases executed |

Unit suites were also executed individually to capture all case counts with the current Node runner. Rendered checks use explicit Chrome API fixtures; they verify DOM behavior and trusted gestures, not installed-extension or OS window behavior. The screenshots linked in the README were refreshed from these fixtures.

New regressions cover missed-link recovery, superseded commits, navigation during destination creation, pending second navigation, stale same-document observations, excluded forms, externally associated password fields, inherited form targets, re-enabling recovery without changing home or mode, preserving disabled controls after requests, closed-tab controls, and a new workspace’s unsaved status. The popup reports link protection precisely and provides a visible recovery re-enable control in every mode.

The following section records the original handoff. Its counts and environment details are historical; the JSON UI evidence now reflects the latest run.

## Original 3 October handoff

Date: **3 October 2026**. Status: **implemented beta handoff; automated local checks passed; installed-browser acceptance remains open.**

## Results actually obtained

| Layer | Result | What this establishes |
| --- | --- | --- |
| Node policy/schema/layout and worker/controller suites | **222 passed, 0 failed** | Actual pure functions and actual worker modules under explicitly mocked Chrome APIs. Not installed-browser evidence. |
| Browser-rendered popup/settings/guard checks | **38 passed, 0 failed** | Real shipped UI/guard JavaScript, real DOM and trusted browser gestures on about:blank, with explicit Chrome API fixtures. |
| Browser-rendered workspace editor checks | **17 passed, 0 failed** | Real workspace editor and schema, explicit mock browser/window state. No real OS window movement or actual dashboard access. |
| Build, manifest, module/HTML paths and runtime constraints | **Passed** | Manifest V3, build version, required/optional permissions, local assets/imports, JS syntax, no dynamic execution/network SDK calls. |
| Installed-extension E2E | **NOT RUN — blocked at startup** | The real suite attempted an unpacked installation but received no extension service worker. Exit code 2, zero executed browser cases. |
| macOS/Windows window manager, physical multiple monitors, real dashboards | **Not run** | No compatibility, authentication, focus/scaling or unsaved-data safety result is inferred from mocks. |

The ZIP integrity, packaging entries and recommended image dimensions are separately checked when creating the delivery. These structural checks do not replace live browser acceptance.

## Test environment and evidence

Node v22.16.0; Python 3.13.5; Playwright 1.57.0; Chromium 144.0.7559.96 on Linux.

- `unit-test-output.txt`: executed Node suite output.
- `check-output.txt`: final Node/build/static validation run.
- `ui-dom-test-results.json`: 38 actual-rendered popup/settings/guard cases, explicit mocks.
- `workspace-ui-test-results.json`: 17 actual-rendered workspace cases, explicit mocks.
- `browser-test-results.json`: installed startup timeout; `tests=[]`, `passed=0`, `failed=0`, status NOT_RUN.
- `BUILD-INFO.json`: runtime tree identity and entry count for this handoff.

Read-only environment inspection found managed Chromium `ExtensionInstallBlocklist=["*"]` and `URLBlocklist=["*"]`. The installed suite waited 30 seconds for a service worker and failed before tests could execute. No managed policy was changed or bypassed. about:blank rendering exercises UI/DOM without granting extension privileges. The optional agent-browser CLI was not available, so the installed Python Playwright tooling was used directly for those rendered checks.

## Coverage that matters in 2.0

Schema/import safety, prototype-like identities, HTTP/HTTPS boundaries, native exclusions, pure layout sizes across all presets, source-tab/destination queues, concurrent branches from four sources sharing one browsing window, window reuse without overwriting tabs, closed destinations, uncertain-create journals, manual acknowledgement, original-tab adoption and relocation, duplicate adoption rejection, unrelated-tab preservation, release/reset restoration, pause and auth/browser exceptions, manual drag vs consumed extension move, no closed-anchor resurrection, session rehydration, branch provenance, and current-document/version/revision readiness.

Rendered tests cover after-save editor rebinding, destination/focus independence, preserving a browsing destination created while an editor was open, four-page adoption selection, layout preview changes, removal/reordering, URL edits invalidating stale adoption, schema errors, text-not-HTML rendering, optional display interaction, pending-operation controls, 390/768/1280px layout behavior, keyboard/modifier link semantics and stale/wrong-document guard snapshot rejection.

Modelled document markers/scroll/input values in worker mocks demonstrate that the controller does not intentionally call URL reload paths; they are **not proof of live application memory preservation**. The separate real-browser suite asserts actual document markers and tab/window behavior when it can run in a permitted environment.

## Known boundaries, not waived by test counts

Pin-state delivery is asynchronous; revisioned acknowledgement and preflight refresh do not make a pin-and-immediate-click transition atomic. Known-protected disconnected links are held with a notice. Earlier page handlers and JavaScript-only controls can escape general link capture. Native tab creation is observed, not pre-vetoed, and auth/privileged/ambiguous cases can remain in a reserved window. This is not kiosk mode.

Workspace Open may partially complete if a browser API fails; existing pages remain open and pending operations are not blindly repeated. Storage and Chrome creation/move APIs are not one transaction. Release does not close/reload browser pages but prior pinned-tab defaults can still apply. Session binding loss after a browser/extension lifecycle change does not magically preserve application memory or identify an unbound page by URL.

2×2 layouts are **four real Chrome windows**. No arbitrary four-tab single-window compositor, iframe bypass, screen capture, native split-view integration or custom desktop browser is implemented. Experimental selected typed/bookmark recovery stays off by default and cannot restore unsaved state or replay POSTs safely.

## Required before public publication

Run `npm run test:e2e` in a permitted current Chromium profile and record actual outcomes. Run a headed pass on the user's target Chrome/macOS setup. Complete `MANUAL-ACCEPTANCE.md`, especially real authentication, window focus/bounds/scaling, multiple monitors, permission revocation, update/reconnect, native gestures and rapid pin transitions. Resolve failures before expanding product guarantees. Review/host the privacy site, verify publisher details and personally complete store certifications.

```sh
npm run check
python -m pip install -r tests/e2e/requirements.txt
python -m playwright install chromium
npm run test:ui
npm run test:e2e
npm run package
```

Do not report these as 277 installed-extension tests. They are **222 Node checks plus 55 rendered UI/DOM checks with mocked Chrome APIs**, and **zero executed installed-extension cases in this environment**.
