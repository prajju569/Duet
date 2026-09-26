import { shuffled } from "./types";

export const WYR: [string, string][] = [
  ["Late-night drive with music", "Sunrise walk with chai"],
  ["Beach holiday", "Mountain holiday"],
  ["Cook dinner together", "Order in and watch a movie"],
  ["Road trip with no plan", "Perfectly planned trip"],
  ["Know my thoughts for a day", "Relive our best day again"],
  ["Rain date indoors", "Picnic under the sun"],
  ["Sing a duet on stage", "Dance together at a wedding"],
  ["Surprise gifts", "Surprise dates"],
  ["Long voice notes", "Long texts"],
  ["Morning cuddles", "Midnight talks"],
  ["Live in Goa", "Live in the hills"],
  ["Never have to sleep", "Never have to eat"],
  ["Street food crawl", "Fancy fine dining"],
  ["Matching outfits", "Matching tattoos"],
  ["Pause time for a day", "Fast-forward to our next meet"],
  ["A pet dog", "A pet cat"],
  ["Watch a horror movie", "Watch a rom-com"],
  ["Plan the date", "Be surprised by the date"],
  ["Only listen to old songs", "Only listen to new songs"],
  ["Big wedding", "Small wedding"],
  ["Travel the world together", "Build a dream home together"],
  ["Be famous together", "Be rich but unknown"],
  ["Get a handwritten letter", "Get a surprise call"],
  ["Stay up all night talking", "Wake up early for a sunrise"],
  ["Home-made gift", "Bought gift"],
  ["Concert together", "Cricket match together"],
  ["Share one playlist forever", "Share one dessert forever"],
  ["Know how our story ends", "Be surprised"],
  ["Weekend with no phones", "Weekend binge-watching"],
  ["Slow dance in the kitchen", "Karaoke in the car"],
  ["Our song on repeat", "A new song every day"],
  ["Be able to fly", "Be able to teleport to each other"],
  ["Coffee date", "Ice-cream date"],
  ["Plan our dream trip", "Take a spontaneous one"],
  ["Stargazing", "City lights at night"],
];

export const MLT: string[] = [
  "cry at a movie",
  "fall asleep first on a call",
  "forget an important date",
  "plan a surprise",
  "get lost even with Google Maps",
  "eat the last piece",
  "say sorry first after a fight",
  "spend all the money on food",
  "become famous",
  "start a dance party",
  "text back instantly",
  "overthink a message",
  "adopt a pet on impulse",
  "wake up late",
  "cry at our wedding",
  "win an argument",
  "get hangry",
  "sing loudly in the shower",
  "fall for a scam call",
  "remember every song lyric",
  "plan the next trip",
  "laugh at their own joke",
  "get jealous",
  "stalk an ex's profile 👀",
  "fall in love again with the same song",
  "forget where they kept the keys",
  "send a meme at 3 AM",
  "say 'I love you' first",
  "become a morning person",
  "binge a whole series in a day",
];

export const TRUTHS: string[] = [
  "What was your first impression of me?",
  "When did you realise you liked me?",
  "What's one thing I do that always makes you smile?",
  "What's your favourite memory of us?",
  "What song makes you think of me?",
  "What's something you've never told me?",
  "What's the silliest thing that made you jealous?",
  "What's your favourite photo of me?",
  "What would you change about our first date?",
  "What's one thing you want us to do this year?",
  "What's my most annoying habit? (Be kind 😅)",
  "What did you dream about recently?",
  "What's the best gift you've ever received?",
  "What's your guilty-pleasure song?",
  "What's a small thing I did that you still remember?",
  "When did you last cry, and why?",
  "What's one fear you have about us?",
  "What's your favourite thing about my voice?",
  "What would our perfect day look like?",
  "What's one thing you love about yourself?",
  "Which of my messages have you re-read the most?",
  "What's the most romantic thing you've imagined us doing?",
  "What's something you want me to know about your day today?",
  "What nickname would you secretly like me to call you?",
  "What's a habit of mine you've picked up?",
];

export const DARES: string[] = [
  "Send a voice note singing 10 seconds of our song 🎤",
  "Send the most unflattering selfie you can take right now 📸",
  "Write me a 4-line poem in 60 seconds ✍️",
  "Dedicate a song to me with a note 💌",
  "Send a voice note saying 'I love you' in 3 different accents",
  "Describe me using only emojis",
  "Send a photo of what's in front of you right now",
  "Change your phone wallpaper to a photo of us for a day",
  "Send a voice note of your best laugh",
  "Share the last photo in your gallery (no skipping! 😄)",
  "Play the next song and dance to it for 20 seconds (voice note proof)",
  "Text me 5 things you like about me — fast!",
  "Send a voice note doing your best impression of me",
  "Plan our next date in 3 messages",
  "Send a 🥹 and 💭 at the same time",
  "Tell me a secret you've never told anyone",
  "Send a selfie with your cutest pose",
  "Say something sweet in your mother tongue (voice note)",
  "Share the song you'd walk down the aisle to",
  "Draw me on paper in 30 seconds and send a photo",
];

// ── Would You Rather / Most Likely To: both answer secretly, then reveal ──
export type AskState = {
  players: [string, string];
  deck: number[];
  i: number;
  answers: Record<string, number | string>; // wyr: 0/1 · mlt: the userId picked
  matches: number;
  rounds: number;
};

export function newAsk(players: [string, string], size: number): AskState {
  return { players, deck: shuffled(size), i: 0, answers: {}, matches: 0, rounds: 0 };
}

export const bothAnswered = (s: AskState) => s.players.every((p) => p in s.answers);

export function answer(s: AskState, me: string, value: number | string): AskState {
  if (bothAnswered(s)) return s;
  const answers = { ...s.answers, [me]: value };
  const done = s.players.every((p) => p in answers);
  const match = done && answers[s.players[0]] === answers[s.players[1]];
  return { ...s, answers, rounds: s.rounds + (done ? 1 : 0), matches: s.matches + (match ? 1 : 0) };
}

export function nextQuestion(s: AskState): AskState {
  const i = s.i + 1;
  return { ...s, i: i % s.deck.length, answers: {}, deck: i >= s.deck.length ? shuffled(s.deck.length) : s.deck };
}

// ── Truth or Dare: take turns ──
export type TodState = {
  players: [string, string];
  turn: 0 | 1;
  pick: "truth" | "dare" | null;
  prompt: number | null;
  truths: number[];
  dares: number[];
  it: number;
  id: number;
  played: number;
};

export function newTod(players: [string, string]): TodState {
  return { players, turn: 0, pick: null, prompt: null, truths: shuffled(TRUTHS.length), dares: shuffled(DARES.length), it: 0, id: 0, played: 0 };
}

export function pickTod(s: TodState, pick: "truth" | "dare"): TodState {
  if (pick === "truth") return { ...s, pick, prompt: s.truths[s.it % s.truths.length], it: s.it + 1 };
  return { ...s, pick, prompt: s.dares[s.id % s.dares.length], id: s.id + 1 };
}

export function doneTod(s: TodState): TodState {
  return { ...s, pick: null, prompt: null, turn: s.turn === 0 ? 1 : 0, played: s.played + 1 };
}
