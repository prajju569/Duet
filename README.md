# Duet 🎧

A private room for two. You chat in real time **and** listen to the same YouTube song at the same moment. If either of you presses play, pause, seek or skip, it happens on both phones.

- **One room, two people.** Share a link or a 6-letter code. A third person can't get in.
- **Music in sync.** Search YouTube, tap a song, and it starts for both of you. Whoever pressed last is in control.
- **Shared queue.** Both of you can add songs, and each one shows whose pick it was ("Prajwal's pick").
- **Favourites.** Heart a song and you can play it again with one tap.
- **Audio-first.** You see big album art, not the music video.
- **Chat.** Typing indicator, seen ticks (✓✓), and long-press or double-tap a message to react. **Swipe a message right to reply** (on a computer, right-click → ↩). A **↓ arrow** jumps back to the newest message and shows how many you missed. Every song change posts a note in the chat ("🎵 Prajwal played Kesariya").
- **Presence.** See whether the other person is online, offline or listening now. If one of you leaves, the music keeps playing for the other. When you come back, you rejoin at the right spot.
- **Looks.** Dark and warm. The background colour follows the current song's thumbnail. Built for phones first.

---

## Setup (about 20 minutes, no coding)

You'll create three free accounts: **Supabase** (database and login), **Google Cloud** (YouTube search) and **Vercel** (hosting). You also need a **GitHub** account that holds this code.

### Step 1: Create the Supabase project

1. Go to <https://supabase.com>, sign up and click **New project**. Choose any name and a strong database password, and pick the region closest to you (for India, **Mumbai**).
2. Wait about 2 minutes for it to finish setting up.
3. In the left sidebar, open **SQL Editor** and click **New query**.
4. In this repo, open `supabase/migrations/20260925000000_duet_init.sql`. Copy **all** of it, paste it into the editor and click **Run**. You should see "Success. No rows returned".
   This one file creates all the tables, the security rules (only the two people in a room can read or write it) and the realtime settings.
5. Go to **Project Settings → API** (or click the **Connect** button at the top). Copy these two values into a note:
   - **Project URL**, which looks like `https://abcd1234.supabase.co`
   - **anon public** key (it may be called the **publishable** key), a long string

> **Duet v5 (delete rooms):** after deploying, run `supabase/migrations/20261003000000_leave_room.sql`. Until then the Delete option stays hidden.
>
> **Duet v4 (last seen, polls, pins, search, send later, countdown, mute/pin/archive rooms…):** after deploying, run `supabase/migrations/20261002000000_chat_extras.sql`. Until then those features simply stay hidden. It also switches on the database's minute timer (pg_cron) that delivers "Send later" messages even when both phones are off.
>
> **Duet v3 (private Duet IDs + richer rooms list):** after deploying, run `supabase/migrations/20261001000000_privacy_rooms.sql`. It hides everyone's Duet ID from other people (only you can see yours) and makes the rooms list show photos, voice notes and 💌 dedications properly.
>
> **Duet v2 (stickers, photos, voice notes, lyrics, Our Songs, history, autoplay, themes, scheduled songs, notifications…):** run `supabase/migrations/20260930000000_duet_v2.sql`. Until it's run, those features simply stay hidden. For notifications also add `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` in Vercel (see `.env.example`) and redeploy.
>
> **Rooms list + rename:** run `supabase/migrations/20260929000000_rooms_home.sql`.
>
> **Invite links:** run `supabase/migrations/20260928000000_invites.sql`, and make sure Vercel has `SUPABASE_SERVICE_ROLE_KEY` (the Supabase integration adds it).
>
> **Duet ID + 4-digit PIN login:** also run `supabase/migrations/20260927000000_pin_login.sql`, and add a `PIN_PEPPER` env var in Vercel (any 32+ random characters) before anyone creates a PIN.
>
> **Already set up before replies existed?** Run `supabase/migrations/20260926000000_message_replies.sql` in the SQL Editor once. It's safe to run twice.

### Step 2: Make login emails work on phones (recommended)

By default, a login link only works in the same browser that asked for it. On phones, the email app often opens links in a different browser, so the link fails. This step fixes that and also adds a 6-digit code as a backup.

1. In Supabase, go to **Authentication → Email Templates → Magic Link**.
2. Replace the message body with:

   ```html
   <h2>Your Duet login</h2>
   <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">Tap here to sign in</a></p>
   <p>Or type this code in the app: <b>{{ .Token }}</b></p>
   ```
3. Click **Save**.

> Supabase's built-in email sender only sends a few emails per hour. That's fine for two people. If you ever hit the limit, add your own SMTP under **Project Settings → Authentication → SMTP**. Brevo and Resend both have free tiers.

### Step 3: Get a YouTube API key

1. Go to <https://console.cloud.google.com>, sign in and create a **New Project** (any name, for example "Duet").
2. Search the top bar for **YouTube Data API v3**, open it and click **Enable**.
3. Go to **APIs & Services → Credentials → Create credentials → API key**. Copy the key.
4. Optional but smart: click the key, and under **API restrictions** choose **Restrict key → YouTube Data API v3**, then save.

> The free quota is about **100 searches a day**, which is plenty for two people. Playing songs doesn't use any quota; only searching does. The app only searches when you press Enter, not on every letter you type.

### Step 4: Deploy on Vercel

1. Push this code to a GitHub repo, if it isn't there already.
2. Go to <https://vercel.com>, sign in with GitHub, click **Add New → Project** and import the repo.
3. Before you click Deploy, open **Environment Variables** and add these three:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | the Project URL from Step 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon or publishable key from Step 1 |
   | `NEXT_PUBLIC_YT_API_KEY` | the YouTube key from Step 3 |

4. Click **Deploy**. When it finishes, copy your site address, for example `https://duet-yourname.vercel.app`.

> Your YouTube key only ever runs on the server (inside `/api/search`), so it is never sent to the browser.

### Step 5: Tell Supabase your site address

1. In Supabase, go to **Authentication → URL Configuration**.
2. Set **Site URL** to your Vercel address, for example `https://duet-yourname.vercel.app`.
3. Under **Redirect URLs**, add:
   - `https://duet-yourname.vercel.app/**`
   - `http://localhost:3000/**` (only needed if you run it on your own computer)
4. Save.

### Step 6: Use it

1. Open your site on your phone and enter your email. Tap the link in the email, or type the 6-digit code.
2. Enter your first name. It's shown on your picks.
3. Tap **Create a new room** — type their name and tap **Share on WhatsApp**.
4. They tap the link, pick a **Duet ID** and a **4-digit PIN**, and they're in your room — no email, no sign-up. Their Duet ID + PIN also works on any other phone.
5. Each of you taps **Tap to join the music** once. Browsers need one tap before they're allowed to play sound.
6. Tap the mini player to open it, go to **Search**, find a song and tap it. It plays for both of you. 🎶

**Tip:** on your phone, use **Share → Add to Home Screen** and Duet opens like an app.

---

## Good to know

- **On iPhone, the first song may need one tap on the video.** iPhones sometimes block a video from starting unless you tap the video itself. If that happens, Duet shows "Tap the video once to start sound". After that one tap, everything syncs as normal.
- **Locking your phone pauses the music.** iOS and Android stop web videos when the screen locks. Keep Duet open on screen. When you come back, it jumps back into sync automatically.
- **Songs that can't be embedded get skipped.** Some labels block their videos from playing outside YouTube. Duet shows a note and moves to the next song for both of you.
- **YouTube ads can knock you out of sync briefly.** Ads can play on one phone but not the other. Duet checks every 5 seconds and pulls you back into sync once the ad ends.

---

## Everything in Duet

**Music** — synced play/pause/seek/skip · shared queue with drag-to-reorder · search or paste a YouTube link · Library: your favourites, *Our Songs* (shared playlist) and *History* (plays + first played) · autoplay from songs you've both played when the queue runs out · synced lyrics (LRCLIB) · your own volume · album-art only, no video.

**Chat** — swipe to reply · long-press to react, ✏️ edit (24 h) or 🗑️ unsend · 😊 stickers · 📷 photos · 🎙️ voice notes (music softens while one plays) · 💬 share a moment ("Kesariya at 1:42" → tap to play from there) · 💌 dedicate a song with a note · typing, seen ticks · ❤️ emoji bursts on both screens.

**Chat like WhatsApp** — long-press menu (react, reply, copy, pin, edit, unsend) · search in chat · 📌 pinned message · 📊 polls · 🕛 send later (hold ➤) · drafts · "N unread messages" · tap to retry failed messages · big emoji · YouTube links become "▶ Play it together" cards · voice notes with waveform and 1.5×/2× · last seen / away / recording…

**Rooms** — pin, mute, mark unread, archive (⋯ on each room) · unread badge on the app icon · "Now playing" and 💌 dedications on the list.

**Us** — ⏳ countdown · 💬 question of the day · 🎧 "Invite to listen" · 💭 "thinking of you" nudge · 🎧 listening-together counter with milestones · 🎨 room themes · ⏰ scheduled songs (good night / good morning) · 🔔 push notifications for messages and nudges.

**Good to know:** notifications on iPhone need Duet added to the Home Screen (iOS 16.4+). Scheduled songs start only if Duet is open on at least one phone. Volume is controlled by the side buttons on iPhone.

## How the sync works (for the curious)

The room keeps a single shared playback state in the `playback_state` table:

```
{ videoId, isPlaying, positionSec, updatedAt (server clock), updatedBy }
```

1. **Every action** (play, pause, seek, skip) calls the `set_playback` database function, which stamps `updatedAt` with the **server's** clock. The new state is then sent to the other phone over a Supabase **Broadcast** channel. It is also delivered through Postgres Changes as a backup.
2. **Last action wins.** A phone only accepts a state whose `updatedAt` is at least as new as the one it already has. Both phones therefore settle on the same final state, even when you both tap at the same moment.
3. **Where should the song be right now?**
   `expected = positionSec + (now − updatedAt)` while playing. If the player is more than **1.0 s** away from that, it jumps to `expected`.
4. **Drift check** every **5 s** while playing.
5. **Clock correction.** When you join, and again whenever the app comes back to the foreground, each phone pings the server 5 times and uses the fastest round trip to work out how far its own clock is off (the same method NTP uses). That's why `now` above really means *server time*. A phone whose clock is 30 s wrong still syncs to within milliseconds. This case is covered by the end-to-end test.
6. **Skip and auto-next are safe to double-fire.** When a song ends, both phones ask to advance the queue. The `advance_queue` function only moves forward if the room is still on that song, so the queue advances exactly once.

## Project layout

```
app/
  page.tsx, HomeClient.tsx      Home: set your name, create or join a room
  login/                        Magic-link and 6-digit-code sign-in
  auth/callback/route.ts        Finishes the email login
  room/[code]/page.tsx          Joins the room (max 2), loads members
  api/search/route.ts           YouTube search (server-side, key stays secret)
components/room/
  RoomClient.tsx                Realtime channels: chat, presence, queue, playback
  PlayerPanel.tsx               Mini bar on phones, full player on desktop
  ChatPanel.tsx                 Bubbles, reactions, typing, seen ticks
hooks/usePlaybackSync.ts        The sync engine (YouTube IFrame API)
lib/sync.ts                     Pure sync maths (unit-tested in lib/sync.test.ts)
supabase/migrations/            Full SQL schema, RLS policies, RPCs, realtime
```

## Running it on your own computer (developers)

```bash
cp .env.example .env.local   # fill in the 3 values
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests for the sync logic
npm run lint                 # type-check
```

Tech: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Auth, Postgres + RLS, Realtime Broadcast/Presence/Postgres Changes) · YouTube IFrame Player API and Data API v3.
