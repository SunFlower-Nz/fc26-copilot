# EA FC26 SBC API Reference (FUT Pilot)

Undocumented internal API used by the FUT Web App. Base URL is captured at runtime, e.g. `https://utas.mob.aem.ea.com/ut/game/fc26`.

All requests require headers:
- `X-UT-SID`
- `X-UT-PHISHING-TOKEN`
- `Content-Type: application/json`

## Read endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/sbs/sets` | Categories and SBC sets |
| GET | `/sbs/setId/{setId}/challenges` | Challenges in a set |
| GET | `/sbs/challenge` | All active challenges (flat list) |
| GET | `/sbs/challenge/{challengeId}` | Challenge details + eligibility requirements |
| GET | `/sbs/challenge/{challengeId}/squad` | Current squad draft for a challenge |

## Write endpoints

| Method | Path | Purpose |
|--------|------|---------|
| PUT | `/sbs/challenge/{challengeId}/squad` | Set squad players by slot index |
| PUT | `/sbs/challenge/{challengeId}` | Submit completed challenge |

### PUT squad body

```json
{
  "players": [
    { "index": 0, "itemData": { "id": 123456789, "dream": false } },
    { "index": 1, "itemData": { "id": 0, "dream": false } }
  ]
}
```

- `id` is the **item instance id** from club/unassigned (`itemData.id`), not `assetId`.
- `id: 0` means empty slot.
- Send all slot indices (typically 0–10 for 11-a-side, or fewer for upgrade challenges).

### PUT submit body

```json
{
  "challengeId": 42
}
```

Optional `setId` when required by the challenge context.

## Validation

After PUT squad, re-fetch `GET /sbs/challenge/{challengeId}` and inspect:
- `status` / `completed` flags
- `elgReq` satisfaction (when exposed)
- Squad response may include chemistry and rating fields

FUT Pilot uses EA response as source of truth when local chemistry estimate differs.

## Rate limiting

Use `sbc_read` and `sbc_write` throttle buckets (see `shared/constants.js`).

## Notes

- Submit is **irreversible** — players are consumed.
- Loan players and concept (`dream: true`) players cannot be submitted.
- Players in active squads may block submission until removed from lineup.
- API paths may change on EA patches — update `content/page-inject.js` only.
