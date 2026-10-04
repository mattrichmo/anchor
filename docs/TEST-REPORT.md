# Anchor 2.0.0 — build and acceptance report

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
