# Sync.Land OBS Player

DMCA-safe music player for OBS Studio. Authenticate with your Sync.Land account, play your licensed playlists on stream, and get per-track license verification with an automatic attribution overlay.

Runs as either:
- an **OBS Custom Browser Dock** (a panel inside OBS you use to control playback), or
- an **OBS Browser Source** (a transparent overlay layer on your scene that shows the "now playing" attribution)

## Why this exists

Streamers on Twitch and YouTube Live constantly get their VODs muted or claimed for using unlicensed music. Sync.Land licenses independent music under the [Sync.Land Free Sync License (SLFS-v1)](https://sync.land/free-sync-license/), which explicitly permits creator-scale live-stream use with attribution. This player is the tool that turns those licenses into practice: your playlist plays on stream, the required attribution string shows on air, and every play is logged for the license audit trail.

## How it works

1. Streamer generates a Personal Access Token (PAT) at `sync.land/account/tokens/`
2. Streamer pastes the PAT into the player and picks one of their saved playlists
3. Player fetches per-track license clearance from Sync.Land before each track plays
4. Player streams the audio via a short-lived signed URL from Sync.Land's S3
5. Player renders the required attribution string as an overlay (browser-source mode)
6. Each play is logged to Sync.Land's analytics for the licensing audit trail

## Add to OBS

**As a Custom Browser Dock** (control panel):
1. In OBS: **Docks** → **Custom Browser Docks**
2. Add a new dock:
   - **Dock Name:** Sync.Land Player
   - **URL:** `https://sync.land/dock/`
3. Apply — the player appears as a panel you can drag into any OBS layout

**As a Browser Source** (attribution overlay on your scene):
1. In OBS: **Sources** → **+** → **Browser**
2. Configure:
   - **URL:** `https://sync.land/dock/?mode=overlay&token=<your-PAT>`
   - **Width:** 1920
   - **Height:** 300 (or wherever you want the attribution row)
   - **Custom CSS:** leave blank (the app renders its own transparent background)
3. Place on your scene wherever the attribution should appear

You'll use both together: the dock to control what plays, the browser source to show the attribution on stream.

## Developer setup

```bash
git clone https://github.com/Awen-online/syncland-obs-player.git
cd syncland-obs-player
npm install
npm run dev
```

Dev server runs on `http://localhost:5173`. Point it at a real Sync.Land backend by setting `VITE_SYNCLAND_API` in a `.env.local` file (defaults to `https://sync.land/wp-json/FML/v1`).

### Build

```bash
npm run build
```

Static bundle emits to `dist/`. Deploy that directory to `sync.land/dock/` (or any HTTPS location — OBS Browser Sources accept any HTTPS URL).

## API endpoints hit

All hit the Sync.Land REST API under `/wp-json/FML/v1/streamer/*`. Full spec: [docs/api.md](docs/api.md).

- `GET /streamer/me` — sanity-check the PAT
- `GET /streamer/playlists` — list the streamer's saved playlists
- `GET /streamer/track/{song_id}/clearance` — per-track license check + signed stream URL + attribution string
- `POST /streamer/track/{song_id}/played` — log a play event

## Licensing model

Every track played through this player is deemed to be issued under the **Sync.Land Free Sync License, version SLFS-v1.0-2026-07-11** for the streamer's use, in the "user-generated content on ad-supported platforms" clause (Section 2 of SLFS-v1). Attribution is required and rendered automatically. Full license text: <https://sync.land/free-sync-license/>.

If the streamer has upgraded to a **Commercial Sync** license for specific tracks, the player's clearance response tells it so and it renders no attribution requirement for those tracks.

## Roadmap

- **v0.1** — PAT auth, playlist load, per-track clearance, attribution overlay (this scaffold)
- **v0.2** — OAuth2 / PKCE auth flow (replaces PAT for smoother connection)
- **v0.3** — Real-time view-cap counter (dock warns when a track approaches SLFS-v1 view cap and offers upgrade)
- **v0.4** — Multi-playlist queue and cross-playlist shuffle
- **v0.5** — Streamlabs OBS + XSplit compatibility layer (should just work — both accept the same browser URL, but tested)
- **v1.0** — Public release, integration marketing

## License

MIT. See [LICENSE](LICENSE). The Sync.Land brand, music catalog, and API access are governed separately by Sync.Land's [Terms of Use](https://sync.land/terms-and-conditions/) and [Free Sync License](https://sync.land/free-sync-license/).

## Related

- [Sync.Land](https://sync.land) — the music licensing marketplace this player streams from
- [Awen-online/sync.land](https://github.com/Awen-online/sync.land) — Sync.Land's public Catalyst-submission repo (API spec, license docs, marketplace open-core)
- [Awen-online/awen-client](https://github.com/Awen-online/awen-client) — Awen's cross-site client plugin (analytics ingestion this player writes to)
