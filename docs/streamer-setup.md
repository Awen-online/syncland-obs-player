# How to add Sync.Land to your stream

A quick walkthrough — takes about 5 minutes.

## Prerequisites

- An account at [sync.land](https://sync.land) (free)
- OBS Studio 28 or later (works on Windows, Mac, Linux)

## 1. Generate a Personal Access Token

- Log in at [sync.land](https://sync.land)
- Go to **Account → Access tokens**
- Click **Generate new token**, give it a name (e.g. "OBS on my laptop"), and copy the value
- Tokens grant read-only access to your playlists and per-track license clearance — don't share

## 2. Add as an OBS Custom Browser Dock

The dock is the control panel — this is where you pick a playlist and hit play.

- In OBS: **Docks → Custom Browser Docks**
- Click **+** to add a new dock
- Fill in:
  - **Dock Name:** Sync.Land Player
  - **URL:** `https://sync.land/dock/`
- Click **Apply**
- OBS shows the dock as a panel — drag it wherever fits your layout
- In the dock, paste your PAT and click **Connect**
- Pick a playlist and hit **Play**

## 3. Add as a Browser Source (optional — for the on-air attribution)

The browser source is the overlay layer that shows the "Music: {artist} — via Sync.Land" credit on your scene. This is what satisfies the SLFS-v1 attribution requirement.

- On your OBS scene: **Sources → + → Browser**
- Fill in:
  - **URL:** `https://sync.land/dock/?mode=overlay&token=YOUR_PAT`
    - The `token` param is your PAT — the overlay needs it to fetch the current track's attribution string
    - **Alternatively:** if you'd rather not put the PAT in the source URL, just add the browser source and paste the token once in the dock; the overlay will read from the same browser's localStorage
  - **Width:** 1920 (or your canvas width)
  - **Height:** 300 (adjust to fit)
- Click **OK**, then drag/resize the overlay layer to sit wherever you want the credit to appear
- The overlay is transparent — only the attribution card shows on stream

## 4. Verify on stream

- Start streaming
- Play a track from the dock
- Watch the overlay on your scene — the attribution string should appear when a track starts and fade when it ends

That's it. Every play is logged to your Sync.Land account for the license audit trail (visible at **Account → Streaming activity**, coming soon).

## Troubleshooting

**Dock says "That token didn't work" —** the token was pasted with extra whitespace or is revoked. Regenerate at [sync.land/account/tokens/](https://sync.land/account/tokens/).

**Overlay doesn't appear on stream —** the browser source might be behind another layer. Move it above your webcam / game capture in the Sources list.

**Track is blocked with "artist_paused" —** the artist has paused licensing for that specific track. Skip to the next.

**"Stub mode" appears in the footer —** you're on the pre-release build. Real API endpoints are coming; nothing to do.

## Support

Bugs or feedback: [GitHub Issues](https://github.com/Awen-online/syncland-obs-player/issues) or email `info@sync.land`.
