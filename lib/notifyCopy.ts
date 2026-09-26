/**
 * Every push Duet sends, written to be fun. Each kind has 3 versions and one is
 * picked at random, so the same buzz never reads the same twice in a row.
 * Real chat messages are never rewritten — only the things around them.
 */
import { gameInfo, type GameKind } from "./games/types";

export type Copy = { title: string; body: string };
type Rand = () => number;

export function pick<T>(options: T[], rand: Rand = Math.random): T {
  return options[Math.floor(rand() * options.length) % options.length];
}

const quote = (s: string, max = 60) => {
  const t = s.replace(/\s+/g, " ").trim();
  return `“${t.length > max ? t.slice(0, max - 1) + "…" : t}”`;
};

/** Hour of the day in India (the app's home). */
export function istHour(now = new Date()): number {
  return Math.floor(((now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440) / 60);
}
const istTime = (now: Date) => {
  const m = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export const copy = {
  photo: (n: string, r?: Rand): Copy =>
    pick(
      [
        { title: `📷 ${n}`, body: `${n} sent a photo. Worth a thousand words, so you're very behind on replies.` },
        { title: `📷 ${n}`, body: `${n} sent a photo. It's either food, a view, or proof they weren't lying.` },
        { title: `📷 ${n}`, body: `New photo from ${n}. Zoom in responsibly.` },
      ],
      r,
    ),
  voice: (n: string, r?: Rand): Copy =>
    pick(
      [
        { title: `🎤 ${n}`, body: `${n} sent a voice note. Check the volume before you're in a meeting.` },
        { title: `🎤 ${n}`, body: `${n} sent a voice note. Too lazy to type, too important to ignore.` },
        { title: `🎤 ${n}`, body: `Voice note from ${n}. It's like a podcast, but only for you.` },
      ],
      r,
    ),
  sticker: (n: string, s: string, r?: Rand): Copy =>
    pick(
      [
        { title: `${s} ${n}`, body: `${n} sent ${s}. A whole paragraph, compressed.` },
        { title: `${s} ${n}`, body: `${n} replied with ${s}. Words were considered and rejected.` },
        { title: `${s} ${n}`, body: `${s} from ${n}. Translation available on request.` },
      ],
      r,
    ),
  poll: (n: string, q: string, r?: Rand): Copy =>
    pick(
      [
        { title: `📊 ${n} needs a decision`, body: `${quote(q)} — a democracy of two, and you're the swing vote.` },
        { title: `📊 ${n} started a poll`, body: `${quote(q)} — your vote counts. Like, 50% counts.` },
        { title: `📊 Vote needed`, body: `${n} asks: ${quote(q)} Polls close when you stop ignoring this.` },
      ],
      r,
    ),
  dedication: (n: string, song: string, r?: Rand): Copy =>
    pick(
      [
        { title: `💌 ${n} dedicated a song to you`, body: `${quote(song)} — no pressure, but it's about you.` },
        { title: `💌 A song from ${n}`, body: `${quote(song)}. Play it. Pretend you're in a movie.` },
        { title: `💌 ${n} sent you ${quote(song, 40)}`, body: `Some people send flowers. ${n} sends bangers.` },
      ],
      r,
    ),
  nudge: (n: string, r?: Rand, now = new Date()): Copy => {
    const h = istHour(now);
    if (h >= 0 && h < 5)
      return pick(
        [
          { title: `💭 ${n}`, body: `${n} is thinking of you at ${istTime(now)}. Go to sleep. Both of you.` },
          { title: `💭 ${n}`, body: `${n} is up at ${istTime(now)} thinking about you. Very romantic. Very sleep-deprived.` },
          { title: `💭 ${n}`, body: `It's ${istTime(now)} and you're on ${n}'s mind. The mind should be asleep.` },
        ],
        r,
      );
    return pick(
      [
        { title: `💭 ${n}`, body: `${n} is thinking of you. Nothing specific. Just vibes.` },
        { title: `💭 ${n}`, body: `You popped into ${n}'s head. Rent-free, as usual.` },
        { title: `💭 ${n}`, body: `${n} thought of you. That's it. That's the notification.` },
      ],
      r,
    );
  },
  miss: (n: string, r?: Rand): Copy =>
    pick(
      [
        { title: `🥹 ${n}`, body: `${n} misses you. Symptoms include staring at this app.` },
        { title: `🥹 ${n}`, body: `${n} is missing you. Please return yourself at your earliest convenience.` },
        { title: `🥹 ${n}`, body: `Distance: too much. ${n}: not a fan.` },
      ],
      r,
    ),
  listen: (n: string, song: string | null, r?: Rand): Copy =>
    song
      ? pick(
          [
            { title: `🎧 ${n}`, body: `${n} is playing ${quote(song)}. It's a duet — they can't do it alone.` },
            { title: `🎧 ${n}`, body: `${n} pressed play on ${quote(song)}. Your ears are the missing half.` },
            { title: `🎧 ${n} wants to listen together`, body: `${quote(song)} is on. Headphones on, world off.` },
          ],
          r,
        )
      : pick(
          [
            { title: `🎧 ${n}`, body: `${n} wants to listen together. It's called Duet for a reason.` },
            { title: `🎧 ${n}`, body: `${n} is holding the aux. Come supervise.` },
            { title: `🎧 ${n}`, body: `${n} wants a listening date. Dress code: headphones.` },
          ],
          r,
        ),
  gameInvite: (n: string, kind: GameKind, r?: Rand): Copy => {
    const g = gameInfo(kind);
    const special: Partial<Record<GameKind, string>> = {
      chess: `${n} challenged you to chess. Bold. Prove them wrong.`,
      ludo: `${n} wants to play Ludo. Relationships have ended over less.`,
      tod: `Truth or Dare with ${n}. Choose carefully — both are traps.`,
      ttt: `${n} wants a round of Tic-Tac-Toe. 30 seconds. Loser buys chai.`,
      connect4: `${n} wants Connect Four. Four in a row, zero mercy.`,
      wyr: `${n} has questions. Would you rather answer now or answer now?`,
      mlt: `${n} wants to settle who's more likely to… Spoiler: it's you.`,
    };
    return pick(
      [
        { title: `${g.emoji} ${g.name}`, body: special[kind] ?? `${n} started ${g.name}.` },
        { title: `${g.emoji} ${n} started ${g.name}`, body: `Your move. Or forfeit and live with it.` },
        { title: `${g.emoji} Game on`, body: `${n} is waiting in ${g.name}. Stretch those thumbs.` },
      ],
      r,
    );
  },
  yourTurn: (n: string, kind: GameKind, r?: Rand): Copy => {
    const g = gameInfo(kind);
    return pick(
      [
        { title: `${g.emoji} Your move`, body: `${n} is pretending not to wait. (${g.name})` },
        {
          title: `${g.emoji} Your turn in ${g.name}`,
          body: kind === "ludo" ? `The dice won't roll itself. We checked.` : `${n} made their move. The board is judging you.`,
        },
        { title: `${g.emoji} ${n} played`, body: `Your turn in ${g.name}. No rush. (There's a little rush.)` },
      ],
      r,
    );
  },
  gameOver: (n: string, kind: GameKind, outcome: "won" | "lost" | "draw", r?: Rand): Copy => {
    const g = gameInfo(kind);
    // outcome is from the reader's point of view
    if (outcome === "won")
      return pick(
        [
          { title: `🏆 You won ${g.name}!`, body: `${n} has requested a recount.` },
          { title: `🏆 Victory`, body: `You beat ${n} at ${g.name}. Screenshot it before they ask for a rematch.` },
          { title: `🏆 You won ${g.name}`, body: `${n} says it was luck. It wasn't. (It might have been.)` },
        ],
        r,
      );
    if (outcome === "lost")
      return pick(
        [
          { title: `${g.emoji} ${n} won ${g.name}`, body: `Rematch available. Dignity sold separately.` },
          { title: `${g.emoji} ${n} wins`, body: `${n} beat you at ${g.name}. Expect to hear about it. Forever.` },
          { title: `${g.emoji} Game over`, body: `${n} won ${g.name}. Tap for a rematch and a comeback story.` },
        ],
        r,
      );
    return pick(
      [
        { title: `🤝 It's a draw`, body: `${g.name} with ${n} ended even. Perfectly balanced, as all couples should be.` },
        { title: `🤝 Draw`, body: `Nobody won ${g.name}. Nobody lost. Nobody's happy. Rematch?` },
        { title: `🤝 ${g.name}: draw`, body: `You and ${n} are equally good. Or equally bad. Rematch to find out.` },
      ],
      r,
    );
  },
  reaction: (n: string, emoji: string, text: string, r?: Rand): Copy =>
    emoji === "💃" || emoji === "🕺"
      ? pick(
          [
            { title: `${emoji} ${n}`, body: `${n} is dancing to your message ${quote(text, 40)}. Literally.` },
            { title: `${emoji} ${n}`, body: `Your message ${quote(text, 40)} made ${n} dance. Bollywood called.` },
            { title: `${emoji} ${n}`, body: `${n} reacted ${emoji} to ${quote(text, 40)}. Choreography pending.` },
          ],
          r,
        )
      : pick(
          [
            { title: `${emoji} ${n}`, body: `${n} reacted ${emoji} to ${quote(text, 50)}` },
            { title: `${emoji} ${n}`, body: `${quote(text, 50)} got a ${emoji} from ${n}. Critics agree.` },
            { title: `${emoji} ${n}`, body: `${n} left a ${emoji} on ${quote(text, 50)}. High praise.` },
          ],
          r,
        ),
  scheduled: (n: string, text: string, r?: Rand): Copy =>
    pick(
      [
        { title: `⏰ From past-${n}`, body: text },
        { title: `⏰ ${n} planned this`, body: text },
        { title: `⏰ A message ${n} wrote earlier`, body: text },
      ],
      r,
    ),
  joined: (n: string, r?: Rand): Copy =>
    pick(
      [
        { title: `🎉 ${n} joined your room`, body: `It's officially a duet now, not a solo.` },
        { title: `🎉 ${n} is in!`, body: `Your room just went from 1 to 2. Say hi before it gets awkward.` },
        { title: `🎉 ${n} joined Duet`, body: `Pick a song. First impressions matter.` },
      ],
      r,
    ),
  quiet: (n: string, days: number, r?: Rand): Copy =>
    pick(
      [
        { title: `🦗 ${n}`, body: `It's been ${days} days. The room has started echoing.` },
        { title: `🦗 Hello?`, body: `Your chat with ${n} is so quiet the crickets filed a complaint.` },
        { title: `🦗 ${days} days of silence`, body: `${n} is probably fine. Probably. Say hi to confirm.` },
      ],
      r,
    ),
  countdown: (label: string, daysLeft: number, r?: Rand): Copy => {
    const what = label.trim() || "the big day";
    if (daysLeft === 0)
      return pick(
        [
          { title: `🎉 It's today: ${what}`, body: `The countdown has counted down. Go go go.` },
          { title: `🎉 ${what} — today!`, body: `All that waiting paid off. Enjoy it.` },
          { title: `🎉 Today's the day`, body: `${what}. No more countdown, only memories.` },
        ],
        r,
      );
    const d = `${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
    return pick(
      [
        { title: `📅 ${d} to ${what}`, body: `Start packing. Or start pretending to.` },
        { title: `📅 ${what}: ${d} left`, body: `Time flies. Especially when you check the countdown every hour.` },
        { title: `📅 Only ${d}`, body: `${what} is almost here. Act normal.` },
      ],
      r,
    );
  },
  milestone: (n: string, days: number, r?: Rand): Copy => {
    const span = days % 365 === 0 ? `${days / 365} year${days === 365 ? "" : "s"}` : `${days} days`;
    return pick(
      [
        { title: `🎂 ${span} on Duet`, body: `You and ${n}: longer than most gym memberships.` },
        { title: `🎂 ${span} together on Duet`, body: `Happy Duet-versary with ${n}. Play your song.` },
        { title: `🎂 ${span} with ${n}`, body: `Stronger than the Wi-Fi. Celebrate with a song.` },
      ],
      r,
    );
  },
};

/** Days after a room starts that deserve a little celebration. */
export const MILESTONE_DAYS = [7, 30, 50, 100, 200, 365, 500, 730, 1000, 1095];
