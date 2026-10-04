# Anchor roadmap after 2.0

## Implemented in this package

Separate browsing/window routing, local saved workspaces, real-window layouts, native-tab relocation with exceptions, pause/release, return-to-source, optional display discovery and protection-readiness hardening.

## Acceptance before public release

Run installed-browser tests and headed macOS acceptance; exercise real dashboard auth, form/download flows, window sizes/focus, permission revocation, browser restart, upgrade and concurrent actions. Improve any failures before expanding the advertised guarantee. The 2.0 handoff is not evidence that this gate passed.

## Useful later work, not implemented

- Explicit rebind-an-existing-page workflow for saved anchors after session reset, without automatic URL ownership guessing.
- Runtime-gated native two-pane Chrome split integration, if supported by the target browser. Do not extrapolate this into a four-tab compositor.
- Additional per-site compatibility fixtures, clearer API-specific failure details, accessibility testing with screen readers, optional compact window style after OS acceptance.
- Opt-in local health diagnostics that redact private URLs before export.
- Signed/public store distribution and hosted support after owner review.

Do not add remote accounts, AI, analytics, tab suspension, general bookmark management or a custom browser shell without a separate demonstrated need. A true arbitrary four-pane single-window browser is a separate product, not an iframe permission workaround.
