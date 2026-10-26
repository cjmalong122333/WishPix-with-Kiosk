# WishPix build progress

Last updated: 2026-10-27

| Step | What | Status |
|---|---|---|
| 1 | Server, database, live connection | Done |
| 2 | Kiosk display and child speech page | Done |
| 3 | Teacher login, system check, dashboard, Session Setup | Done |
| 4 | Safety filter + Moderation Center | **Next** |
| 5 | Live Session, Print Management, Kiosk Management (hardware simulated) | To do |
| 6 | Activity Logs, Analytics, Reports, Settings (English/Filipino) | To do |

## Notes for the next session

- Step 4 starts in `server/src/safety.js`, which still allows everything. Sessions already save
  the safety level (strict / standard / custom) and the teacher's blocked and allowed words.
- Blocked requests should appear in the Moderation Center (Keep Blocked / Override), and the
  Moderation menu item should show a badge with the pending count.
- Research Evaluation Report contents are not decided yet; keep it as "Coming soon".
- Designs come from Figma screenshots the user sent (the Figma tool hit its plan limit).
- Free images: Pollinations.ai, 1 image per 45 seconds per IP; the server waits and retries.
- Phone mic needs the Cloudflare quick tunnel; its URL changes every run and goes in
  `server/.env` as `PUBLIC_URL`.
- This folder has its own git repo (branch `main`). Steps 1–3 are saved in the first
  checkpoint commit. It is local only: there is no GitHub remote.

To continue, tell Claude: **"continue WishPix step 4"**.
