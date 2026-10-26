# WishPix (capstone simulator)

Children speak an idea on a phone, the laptop generates a picture with a free AI
(Pollinations.ai, no key needed) and the kiosk screen shows it as a print preview.
The teacher controls sessions from the Teacher App.

## Run

```bash
npm run install:all
npm run dev
```

Then open on the laptop:

| Page | URL |
|---|---|
| Kiosk screen | http://localhost:5173/kiosk |
| Teacher (dev panel for now) | http://localhost:5173/teacher |
| Child page | scan the QR code on the kiosk |

The test teacher account is in `server/src/seed-data.js`.

## Phone microphone

Phones only allow the microphone on `https` links. On plain Wi-Fi (`http://192.168…`)
the child page shows a text box instead. For voice, run a free Cloudflare quick tunnel
(no account needed) and put its URL in `server/.env`:

```
PUBLIC_URL=https://<your-tunnel>.trycloudflare.com
```

## Notes

- The free image service allows one picture every 45 seconds; the server waits and retries.
- Data is stored in `server/data/` (SQLite database and generated images).
- Set `LAN_IP` in `server/.env` if the QR code shows the wrong Wi-Fi address.
