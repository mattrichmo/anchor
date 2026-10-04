# Publish Anchor — owner checklist

## Already prepared in this package

- Manifest V3 runtime, identity/version/description, icons, popup, options and CSP.
- A clean runtime ZIP with `manifest.json` at the archive root.
- Detailed listing copy, machine-readable listing fields, single-purpose text and each permission justification.
- Privacy policy, help, public website/support files and reviewer instructions.
- Original 128px icon; 440×280 small promo; 1400×560 marquee; five recommended 1280×800 screenshots of the built UI with explicit fixture state, or an explicitly identified composition using it. See ASSETS.md.
- Architecture, security review, reproducible tests and precise known limitations.

## Owner steps that cannot be truthfully pre-filled

1. **Verify ownership details.** This package uses Matt Richmond and hello@mattrichmond.ca from the supplied project context. Confirm these are the publisher and support details you will use. Check the Anchor name/mark for conflicts; no trademark or domain clearance was performed.
2. **Test your target setup.** Use current stable Chrome on macOS and your actual dashboards before public distribution. The supplied acceptance report states only tests actually run.
3. **Host the website pages.** Deploy `website/` to your chosen HTTPS host. Enter the real homepage, support and privacy URLs in the dashboard. They are intentionally null in `listing.json`, not fabricated. The manifest has no fake homepage or store ID.
4. **Use your developer account.** Register or sign in to Chrome Web Store Developer Dashboard, complete current account/contact/security requirements and choose your real publisher/trader status. No fee amount or jurisdiction-specific legal choice is guessed here.
5. **Upload only** `anchor-2.0.0-chrome-store.zip`. Do not upload the complete source handoff ZIP. Check the rendered product name, version and icons before proceeding.
6. **Paste the listing and declarations.** Use `LISTING.md`, `PRIVACY-AND-PERMISSIONS.md` and `REVIEWER-INSTRUCTIONS.md`. Verify the offered category names in the current dashboard; use the closest productivity category.
7. **Upload assets.** The 128px icon is also in the ZIP. Use the small promo/marquee PNGs and the five images listed in listing.json (01, 05, 06, 02, 04). 03-advanced is an alternate, not a sixth simultaneous listing image. `source-*` images are supporting raw captures, not correctly sized store uploads.
8. **Choose availability and pricing.** A private/unlisted beta is a reasonable initial distribution option; no paid/free/trader/legal decision is accepted on your behalf. There is no billing implementation in this release.
9. **Personally review and certify.** Check the privacy URL, limited-use statements, required declarations and terms. This package does not assert your legal acceptance or guaranteed approval.
10. **Submit for review.** After approval, record the actual store item ID and URL. Add a real install button to the landing page, bump versions for later updates, and preserve release artifacts.

## Packaging check

```sh
npm run check
python tests/e2e/run.py
npm run package
```

Inspect the archive listing: the runtime ZIP must contain `manifest.json` at the root, alongside `background/`, `content/`, `shared/`, `ui/` and `icons/`. It must not include development tests, private keys, account secrets or publisher credentials.

Official requirements (checked 2026-10-03):
https://developer.chrome.com/docs/webstore/prepare
https://developer.chrome.com/docs/webstore/images
https://developer.chrome.com/docs/webstore/cws-dashboard-privacy

This is a submission package, not a store listing that is already published or approved.
