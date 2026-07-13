# Sync.Land Streamer API

Endpoints this player hits. All under `https://sync.land/wp-json/FML/v1/streamer/` and PAT-authenticated via `Authorization: Bearer <pat>`.

**Status:** v0.1 scaffold hits these against stubs in `src/api.js`. Toggle `stubMode = false` in `api.js` once these are live on production.

## GET `/streamer/me`

Sanity-check that the PAT is valid and identify the streamer.

**Response 200:**
```json
{
  "user_id": 8617,
  "display_name": "Creepzz",
  "artist_ids": [11732]
}
```

## GET `/streamer/playlists`

Return the streamer's saved playlists with their track lists.

**Response 200:**
```json
{
  "ok": true,
  "playlists": [
    { "id": 1, "name": "Chill / stream focus", "track_count": 12, "cover_url": "" }
  ],
  "tracks": {
    "1": [
      { "song_id": 11907, "title": "Island Vibe", "artist": "Creepzz feat. Kosi Sia" }
    ]
  }
}
```

## GET `/streamer/track/{song_id}/clearance`

Per-track license check. Called before every playback to make sure the track is still cleared for live-stream use.

**Response 200:**
```json
{
  "ok": true,
  "can_stream": true,
  "tier": "SLFS-v1",
  "tier_label": "Free Sync License",
  "attribution_required": true,
  "attribution_text": "Music: Creepzz — via Sync.Land — sync.land/song/island-vibe",
  "stream_url": "https://s3.us-east-005.dream.io/fml-songs/...signed.mp3?...",
  "reason_if_blocked": null,
  "song": {
    "id": 11907,
    "title": "Island Vibe",
    "artist": "Creepzz",
    "slug": "island-vibe"
  }
}
```

**Fields:**

- `can_stream` — hard gate. If false, player skips the track and shows the reason.
- `tier` — one of `SLFS-v1`, `commercial`, `custom`, `blocked`.
- `attribution_required` — if true, player renders `attribution_text` as an overlay whenever this track plays.
- `stream_url` — short-lived signed URL (24h from issuance). Player loads and plays from it.
- `reason_if_blocked` — enum: `artist_paused` (artist paused this specific song), `artist_removed` (song was removed from the catalog), `no_license` (streamer's PAT scope doesn't cover this song).

## POST `/streamer/track/{song_id}/played`

Log a playback event for the license audit trail.

**Request:**
```json
{ "seconds": 0 }
```

Sent at play-start (seconds=0) and optionally at fixed intervals for long tracks. Server records `stream_play` in the analytics table + optionally issues an `fml_license` CPT row tagged `use_context=live_stream`.

**Response 200:**
```json
{ "ok": true }
```

## Auth

All endpoints require `Authorization: Bearer <pat>`.

PATs are generated at `sync.land/account/tokens/`. Format: `sk_syncland_` followed by 40 URL-safe base64 chars. Read-only — the token can list playlists and check clearance, but cannot modify playlists, upload songs, or take any action that changes account state.

Revoke on the same page. Revoked tokens return `401 Unauthorized`.

## Errors

Standard REST semantics:

- `401` — no token / invalid token / revoked token
- `403` — token exists but doesn't have scope for that resource
- `404` — song / playlist not found
- `429` — rate-limited (default 100 req/min; configurable server-side)
- `5xx` — Sync.Land side; player shows a friendly error and retries with backoff
