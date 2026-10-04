# Anchor 2.0 reviewer/test instructions

No login, subscription, external backend or API key is required. This package has not been submitted or approved. Local installed-browser acceptance remains a release gate.

1. Load the runtime ZIP/folder in a permitted current Chrome test profile. Open a normal HTTP/HTTPS page and pin its actual tab. Refresh if the page predates installation. Open the popup and verify a connected page; ordinary eligible links should branch without deliberately navigating the source.
2. Choose A new window for each link. Check an eligible link opens a normal separate window. Choose My browsing window and check consecutive links create separate tabs in the same destination window. Focus preference is independent.
3. Select Make dashboard window on a normal page. It becomes a saved solo workspace, adopting the existing tab. When other tabs existed in the source window they remain untouched and that window is selected for browsing.
4. In Workspaces, add two to four existing ordinary pages, choose 2×2 grid or side-by-side and Open & arrange. Verify actual separate Chrome windows, not embedded pages. One-window mode is ordinary multi-tab browsing. Saved home URLs are local and may be private; exports should be reviewed.
5. With reservation on, try a supported target=_blank/Cmd/Ctrl/middle-click link. Its native result may briefly appear and then move intact outside the dashboard. Likely sign-in/unsupported browser pages are exceptions; pause for authentication.
6. Pause/resume and Release workspace. Release restores previous tab choices without closing/reloading. Close an anchor: no automatic resurrection. Arrange open pages must not reopen it; explicit Open can reopen the saved home.
7. Test native exclusions: downloads, POST/password/file forms, protocol links and JavaScript-only controls. No universal navigation/firewall/unsaved-memory guarantee is made. Experimental recovery is off by default.
8. Optional Choose another display requests system.display from the user gesture. Ordinary single-display operation does not need that additional permission. Incognito is not supported.

For a reproducible developer fixture: from the full source handoff, `npm run demo`, then import `examples/workspace-local-demo.json` into a test profile. Importing replaces definitions only after confirmation and does not automatically open pages.

Real-browser automated coverage is in `tests/e2e/run.py`. Current executed/mock-vs-live status is in `docs/TEST-REPORT.md`. No managed policy should be disabled to make tests pass. Support: hello@mattrichmond.ca.
