# Chrome Web Store privacy and permissions — Anchor 2.0

## Single purpose

Protect pinned and chosen working tabs from eligible link navigation by opening destinations separately, with optional saved dashboard workspaces and window arrangement.

## Permission justifications

| Permission | Implementation-based justification |
|---|---|
| `storage` | Save local user preferences/workspace definitions and temporary document/tab/window bindings, readiness state and bounded operation/source journals. No cloud database or tracking. |
| `scripting` | Reconnect/inject the packaged isolated guard into already-open permitted webpages on installation/update or explicit reconnect. No remote scripts. |
| `contextMenus` | Toolbar/page/link actions for protection, dashboard creation, source return, workspace access and explicit pause/open-here. |
| `alarms` | Resume temporary five-minute protection pauses despite service-worker suspension. |
| `webNavigation` | Validate active frame/document identity, observe policy/readiness changes, and implement optional conservative address-bar/bookmark/link/start-page URL recovery. It is not a universal navigation blocking API. |
| `http://*/*`, `https://*/*` host access | Read eligible link targets and relevant navigation context on arbitrary pages the user pins/protects; inject at document start and enumerate supported open-page titles/URLs for explicit workspace selection. No collection/transmission of general page content. Broad automatic protection would not work from only a one-time activeTab grant. Explain the powerful site-access warning plainly. |
| optional `system.display` | Requested only from a user click to choose another display. Reads monitor IDs/names/work areas for dashboard window tiling; no capture or recording. |

The build does not request generic `tabs`, `history`, `cookies`, `debugger`, `webRequest`, `tabCapture`, `desktopCapture` or incognito access. Used tab/window API methods require no invented generic `windows` manifest permission. HTTP/HTTPS host access supplies matching tab metadata.

## Remote code declaration

No remote code. All runtime JavaScript, CSS and icons ship in the ZIP. No eval, remote library loader, network SDK, fetched executable configuration, remote WASM or hosted application frame.

## Data disclosure guidance for the owner

The developer receives no extension telemetry, browsing history, form payload or workspace data. There is no developer-side collection/transfer endpoint. Local processing includes eligible destinations, current protection/navigation context and explicit saved home URLs. Optional GET forms send their non-password/non-file values through the normal browser destination but do not persist them. Session-only IDs/journals are local; exports are user-requested files and may contain private paths or URL tokens.

Use the exact current dashboard definitions when answering its data-use questions. Do not describe “no data collected by the developer” as “the extension never reads a URL.” The owner must personally review any limited-use/no-sale/no-creditworthiness certifications and verify the hosted privacy page. No legal certification or consent has been accepted on the owner's behalf.

`docs/PRIVACY.md` and `website/privacy.html` contain the corresponding policy. Host it and enter the real HTTPS URL; `listing.json` deliberately has null hosted URLs until they actually exist.

References checked 2026-10-03: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy and https://developer.chrome.com/docs/webstore/prepare
