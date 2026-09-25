import { avatarColor } from "@/lib/format";

export function Avatar({
  userId,
  name,
  size = 28,
  online,
  className = "",
}: {
  userId: string | null | undefined;
  name: string;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full items-center justify-center rounded-full font-semibold text-ink"
        style={{ background: avatarColor(userId), fontSize: size * 0.44 }}
      >
        {initial}
      </span>
      {online !== undefined && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 rounded-full ring-2 ring-ink ${online ? "bg-emerald-400" : "bg-zinc-500"}`}
          style={{ width: size * 0.32, height: size * 0.32 }}
        />
      )}
    </span>
  );
}
