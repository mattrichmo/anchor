# Anchor 2.0 privacy policy

Prepared for Matt Richmond · Contact: hello@mattrichmond.ca · Version date: 3 October 2026.

Anchor has no account system, analytics SDK, advertising, remote code, telemetry endpoint or backend. It does not sell, transmit or share browsing information with its developer. All extension processing and storage are local to the browser profile.

## What is processed

Anchor reads the tab's pin state, eligible link destination, page/frame URL, and navigation context to decide where a link should open. The workspace editor lists supported open-page titles/addresses so the user can select pages. Optional simple GET protection serializes non-password/non-file fields for the browser destination; POST bodies are not intercepted/replayed or stored. Anchor does not scrape general page content or read cookie/password stores.

## What is stored locally

`chrome.storage.local` holds preferences, exact-origin rules and user-saved workspace definitions: name, page labels/home URLs, protection/routing choices, chosen display ID and spacing. A home URL can itself contain a private path or token; avoid saving one-time login or secret-bearing URLs.

`chrome.storage.session` holds current tab/window/document bindings, home/current navigation state used for protection, guard readiness, bounded gesture identifiers/results, source-tab references, reservations, pending-operation metadata and requested/actual layout bounds. Session storage is temporary and is not a durable browser-history database. No passwords, POST bodies, screenshots or screen recordings are stored.

Optional `system.display` access reads display names/IDs, sizes and usable work areas only when granted for choosing a monitor. It does not request screen recording or capture page pixels.

## Sharing, exports and visited sites

Settings/workspace exports are files you explicitly request and may include saved origins/home URLs. Review them before sending to another person. Export files already on disk are not removed by resetting the extension. Visited websites, Chrome, browser sync if separately configured by you, your OS and a future website host follow their own policies; Anchor does not prevent their ordinary network activity. Links opened by Anchor are normal browser requests to their destinations.

## Controls

Delete individual saved workspaces, import/export definitions, pause/release live workspaces, or reset local preferences/workspaces from Settings. Release/delete do not close browser pages. Removing the extension removes its browser-managed storage, not exported files or Chrome's ordinary history. Incognito is disabled in this build.

The public website files contain no analytics scripts. Hosting infrastructure may keep standard logs once the owner deploys it; the owner must disclose any chosen hosting/analytics changes. Optional support email is outside the extension and is governed by the sender/recipient's email services. Do not send credentials in a support report.

The owner must confirm this policy and host it at a real public URL before store submission. No public privacy URL or legal certification is fabricated by this package.
