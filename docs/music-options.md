# Background music: what's possible (decision needed)

**The ask:** music keeps playing when you switch apps and stops when the screen turns off, free, with no Premium accounts.

## The hard facts about YouTube
- **Browsers:** mobile browsers pause web video when you leave the app. We can't override that from a website.
- **YouTube's developer rules:**
  - They forbid a player that plays while it isn't on screen ("background player").
  - They forbid separating the audio from the video.
  - Premium doesn't change this for third-party apps.
- **Also in the rules (it affects Duet today):**
  - The embedded player must be at least **200×200px**.
  - Nothing may be **drawn over it**.
  - Duet currently covers the video with the album art (the "audio only" look you asked for) and shows a 56px mini player.
  - Realistic risk for a small app: Google suspends the YouTube search key, or YouTube blocks the embed. Legal action is unlikely.

→ **With YouTube, background play is not possible in a way that follows the rules.** Tricks exist (audio-extraction servers, modified players), but they break YouTube's terms and break often. I haven't built any of them.

## Options
| Option | Catalog (Bollywood / Kannada) | Background play | Cost | Legal | Effort |
|---|---|---|---|---|---|
| **A. Stay on YouTube (foreground)** | ✅ everything | ❌ | free | ✅ if we show the video player at ≥200px | small |
| **B. Add Audius as a 2nd source** | ❌ mostly indie | ✅ | free | ✅ official free API | medium |
| **C. JioSaavn partnership** | ✅ best for India | ✅ | revenue share / deal | ✅ once signed (their API is partners-only) | business deal + medium build |
| D. Unofficial JioSaavn / YouTube audio | ✅ | ✅ | free | ❌ against their terms, can break anytime | medium |
| E. Spotify / Apple Music SDKs | ✅ | ✅ | ❌ each user needs Premium | ✅ | medium |
| F. Native app (Play Store) with YouTube | ✅ | ❌ same YouTube rules | free | ❌ for background | large |

## Recommendation
1. **Now:** keep YouTube, and make coming back seamless (instant re-sync when you reopen Duet; the partner sees you're "away").
2. **Decide** whether to make the player compliant: show the real video in the expanded player at ≥200px, and keep the mini bar compact (hiding the video, or 200px).
3. **Growth path:** pitch **JioSaavn** for a partner API. It's the only route to free, legal, mainstream Indian music that plays in the background. It fits Duet ("listen together" drives streams for them), and it's a marketing and business conversation, not a coding problem.
