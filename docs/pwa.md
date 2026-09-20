# Clinic Assistant PWA

Clinic Assistant uses Next.js `app/manifest.ts`, a small service worker, PNG app icons and Apple home-screen metadata. Installation opens the voice workspace in a standalone window. The phone layout has bottom navigation and safe-area padding.

## Install

- Chrome or Edge: use **Install app** when the browser offers installation, or its installation menu.
- iPhone or iPad: open in Safari, tap Share, then **Add to Home Screen**. The app offers these instructions on iOS.
- The install control disappears in standalone mode. Browser installation eligibility controls whether its native prompt is available.

Use HTTPS for phone testing. `http://localhost` and `http://127.0.0.1` work on the development computer, but an HTTP LAN IP is not a secure origin for service workers or microphone access. No deployment was made for this change.

## Offline behavior

Only `/offline.html` and public app icons are cached. API responses, auth callbacks, authenticated HTML, credentials, appointment data and transcripts are not stored in the service-worker cache. They continue to use the network. A page reload while offline shows the reconnect screen, and the open workspace displays an offline status banner.

The worker uses a versioned public cache and deletes only its own older public caches. It does not force-reload or end an active voice call when an update arrives. When changing the offline assets, bump the cache version in `public/sw.js`.

## Verify

Run `npx playwright test e2e/workspace-pwa.spec.ts` with the local server running. The test checks manifest and icons, worker control, cache contents, offline navigation, API network-only behavior and recovery.

Reply language defaults to English on a fresh page. The dropdown affects both typed and voice replies, independently of the spoken input language. During a call, changing it updates the Realtime session instructions for subsequent responses; an already-playing response can finish in the old language.

Implementation reference: [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps).
