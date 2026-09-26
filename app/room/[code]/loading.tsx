// Shown instantly while the room loads on the server — same shape as the real room,
// so nothing jumps when it arrives.
export default function RoomLoading() {
  const bubbles = [
    { mine: false, w: "w-40" },
    { mine: false, w: "w-56" },
    { mine: true, w: "w-44" },
    { mine: false, w: "w-32" },
    { mine: true, w: "w-52" },
    { mine: true, w: "w-28" },
  ];
  return (
    <div className="duet-bg vv-fixed overflow-clip text-cream" aria-busy="true" aria-label="Opening your room">
      <div className="relative z-10 flex h-full flex-col lg:flex-row">
        {/* top bar */}
        <div className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),10px)] pb-2.5 lg:hidden">
          <div className="size-[30px] animate-pulse rounded-full bg-white/10" />
          <div className="space-y-1.5">
            <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
            <div className="h-2.5 w-14 animate-pulse rounded bg-white/5" />
          </div>
        </div>
        {/* mini player (phone) / player column (desktop) */}
        <div className="mx-3 mb-1 flex items-center gap-3 rounded-2xl bg-black/35 p-2 ring-1 ring-white/10 lg:m-0 lg:h-full lg:w-[min(46%,620px)] lg:flex-col lg:rounded-none lg:bg-black/15 lg:p-8 lg:ring-0">
          <div className="size-14 animate-pulse rounded-xl bg-white/10 lg:aspect-square lg:size-auto lg:w-full lg:max-w-[380px] lg:rounded-[2rem]" />
          <div className="flex-1 space-y-2 lg:w-full lg:flex-none">
            <div className="h-3.5 w-32 animate-pulse rounded bg-white/10" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-white/5" />
          </div>
          <div className="size-10 animate-pulse rounded-full bg-white/10 lg:hidden" />
        </div>
        {/* chat */}
        <div className="flex min-h-0 flex-1 flex-col justify-end px-3 pb-[max(env(safe-area-inset-bottom),12px)] lg:px-6 lg:pb-5">
          <div className="space-y-2 pb-3">
            {bubbles.map((b, i) => (
              <div key={i} className={`flex ${b.mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`h-9 ${b.w} animate-pulse rounded-3xl ${b.mine ? "bg-rose-200/15" : "bg-white/8"}`}
                  style={{ animationDelay: `${i * 90}ms` }}
                />
              </div>
            ))}
          </div>
          <div className="h-11 animate-pulse rounded-3xl bg-white/8 ring-1 ring-white/10" />
        </div>
      </div>
    </div>
  );
}
