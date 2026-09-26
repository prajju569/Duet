"use client";

import { answer, bothAnswered, DARES, doneTod, MLT, nextQuestion, pickTod, TRUTHS, WYR, type AskState, type TodState } from "@/lib/games/party";
import type { BoardProps } from "./GameSheet";

export function WouldYouRather({ state, meId, names, meIdx, commit }: BoardProps<AskState>) {
  const q = WYR[state.deck[state.i]];
  const other = state.players[meIdx === 0 ? 1 : 0];
  const mine = state.answers[meId];
  const revealed = bothAnswered(state);
  const theirs = state.answers[other];
  return (
    <Card rounds={state.rounds} matches={state.matches}>
      <div className="text-sm tracking-wide text-cream/50 uppercase">Would you rather…</div>
      <div className="mt-4 grid w-full gap-3">
        {q.map((opt, i) => {
          const picked = mine === i;
          const theyPicked = revealed && theirs === i;
          return (
            <button
              key={i}
              disabled={mine !== undefined}
              onClick={() => commit(answer(state, meId, i), "active")}
              className={`relative rounded-2xl px-5 py-5 text-left text-lg font-semibold ring-1 transition active:scale-[0.98] ${
                picked ? "bg-rose-300/25 ring-rose-200/70" : "bg-white/6 ring-white/10"
              }`}
            >
              {opt}
              <span className="mt-1 block text-xs font-normal text-cream/60">
                {picked && "You"}
                {picked && theyPicked && " + "}
                {theyPicked && names[meIdx === 0 ? 1 : 0]}
              </span>
            </button>
          );
        })}
      </div>
      <Reveal
        waiting={mine !== undefined && !revealed}
        revealed={revealed}
        match={revealed && mine === theirs}
        otherName={names[meIdx === 0 ? 1 : 0]}
        onNext={() => commit(nextQuestion(state), "active")}
      />
    </Card>
  );
}

export function MostLikelyTo({ state, meId, names, meIdx, commit }: BoardProps<AskState>) {
  const q = MLT[state.deck[state.i]];
  const other = state.players[meIdx === 0 ? 1 : 0];
  const mine = state.answers[meId];
  const revealed = bothAnswered(state);
  const theirs = state.answers[other];
  const label = (uid: string | number | undefined) => (uid === meId ? "You" : uid === other ? names[meIdx === 0 ? 1 : 0] : "");
  return (
    <Card rounds={state.rounds} matches={state.matches}>
      <div className="text-sm tracking-wide text-cream/50 uppercase">Who&apos;s more likely to…</div>
      <div className="mt-2 text-center font-display text-3xl leading-tight italic">{q}?</div>
      <div className="mt-5 grid w-full grid-cols-2 gap-3">
        {[meId, other].map((uid) => (
          <button
            key={uid}
            disabled={mine !== undefined}
            onClick={() => commit(answer(state, meId, uid), "active")}
            className={`rounded-2xl py-6 text-lg font-semibold ring-1 active:scale-[0.98] ${mine === uid ? "bg-rose-300/25 ring-rose-200/70" : "bg-white/6 ring-white/10"}`}
          >
            {uid === meId ? "🙋 Me" : `👉 ${names[meIdx === 0 ? 1 : 0]}`}
          </button>
        ))}
      </div>
      {revealed && (
        <p className="mt-3 text-center text-sm text-cream/70">
          You said <b>{label(mine)}</b> · {names[meIdx === 0 ? 1 : 0]} said <b>{theirs === meId ? "you" : theirs === other ? "themselves" : ""}</b>
        </p>
      )}
      <Reveal
        waiting={mine !== undefined && !revealed}
        revealed={revealed}
        match={revealed && mine === theirs}
        otherName={names[meIdx === 0 ? 1 : 0]}
        onNext={() => commit(nextQuestion(state), "active")}
      />
    </Card>
  );
}

export function TruthOrDare({ state, meIdx, names, commit }: BoardProps<TodState>) {
  const myTurn = state.turn === meIdx;
  const who = myTurn ? "You" : names[meIdx === 0 ? 1 : 0];
  const text = state.pick === "truth" ? TRUTHS[state.prompt ?? 0] : state.pick === "dare" ? DARES[state.prompt ?? 0] : null;
  return (
    <Card rounds={state.played} matches={null}>
      <div className="text-sm tracking-wide text-cream/50 uppercase">{myTurn ? "Your turn" : `${who}'s turn`}</div>
      {!state.pick ? (
        myTurn ? (
          <div className="mt-5 grid w-full grid-cols-2 gap-3">
            <button onClick={() => commit(pickTod(state, "truth"), "active")} className="rounded-2xl bg-sky-400/20 py-8 text-2xl font-semibold ring-1 ring-sky-200/30 active:scale-95">
              🤫 Truth
            </button>
            <button onClick={() => commit(pickTod(state, "dare"), "active")} className="rounded-2xl bg-rose-400/20 py-8 text-2xl font-semibold ring-1 ring-rose-200/30 active:scale-95">
              🔥 Dare
            </button>
          </div>
        ) : (
          <p className="mt-6 text-center text-cream/60">{who} is choosing truth or dare…</p>
        )
      ) : (
        <>
          <div className="mt-3 text-xs font-semibold tracking-wide text-rose-200 uppercase">{state.pick === "truth" ? "🤫 Truth" : "🔥 Dare"}</div>
          <div className="mt-2 text-center font-display text-2xl leading-snug italic">{text}</div>
          <p className="mt-3 text-center text-xs text-cream/50">{myTurn ? "Answer in the chat 💬 then tap Done" : `Waiting for ${who} to answer in the chat…`}</p>
          {myTurn && (
            <div className="mt-4 flex gap-2">
              <button onClick={() => commit(pickTod({ ...state }, state.pick!), "active")} className="rounded-full bg-white/8 px-4 py-2 text-sm ring-1 ring-white/10">
                Skip this one
              </button>
              <button onClick={() => commit(doneTod(state), "active")} className="rounded-full bg-cream px-5 py-2 text-sm font-semibold text-ink">
                Done ✓
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Card({ children, rounds, matches }: { children: React.ReactNode; rounds: number; matches: number | null }) {
  return (
    <div className="flex w-full max-w-md flex-col items-center px-2">
      <div className="mb-3 text-xs text-cream/45">{matches === null ? `${rounds} played` : `💞 ${matches} / ${rounds} matched`}</div>
      {children}
    </div>
  );
}

function Reveal({ waiting, revealed, match, otherName, onNext }: { waiting: boolean; revealed: boolean; match: boolean; otherName: string; onNext: () => void }) {
  if (waiting) return <p className="mt-5 text-sm text-cream/55">Waiting for {otherName} to answer… 🤫</p>;
  if (!revealed) return <p className="mt-5 text-xs text-cream/40">Answers stay secret until you both pick</p>;
  return (
    <div className="mt-5 flex flex-col items-center">
      <div className="animate-pop text-2xl">{match ? "💞 You matched!" : "😄 Different answers!"}</div>
      <button onClick={onNext} className="mt-3 rounded-full bg-cream px-6 py-2 font-semibold text-ink active:scale-95">
        Next question →
      </button>
    </div>
  );
}
