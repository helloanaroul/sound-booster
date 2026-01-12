# Sound Booster — Documentation

Overview
--------
This extension uses the Web Audio API in a content script to create a processing chain (low-shelf for bass, high-shelf for treble, and a master gain node) and connects media elements (`audio`, `video`) on the page to that chain.

Files
- `popup.html` — popup UI
- `popup.css` — popup styles
- `popup.js` — popup logic; reads/writes storage, sends messages to the content script
- `content.js` — content script injected into pages; applies Web Audio processing
- `manifest.json` — extension manifest (v2)

Development notes
-----------------
- Messaging: popup uses `sendMessageToTab()` and `getActiveTab()` to support both `browser` (Promise) and `chrome` (callback) APIs.
- Storage: `getStorage()`/`setStorage()` helpers abstract `browser.storage.local` vs `chrome.storage.local`.
- Per-site settings: volume gain is stored using the page origin as a key; a fallback `__global__` key is used when no tab URL is available.

How to contribute
-----------------
1. Fork repo and create a topic branch.
2. Run manual tests by loading the unpacked extension and testing various sites.
3. Keep changes small and add unit tests where practical.

Notes & TODOs
- Consider migrating to Manifest V3 for modern browsers.
- Add automated tests and CI (eslint, format, unit tests).
