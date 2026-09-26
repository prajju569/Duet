/** Ask, then delete the room from my list (and for good if I was the last one in it). */
export async function confirmAndDeleteRoom(roomId: string, roomName: string, partnerName: string | null): Promise<"deleted" | "left" | null> {
  const msg = partnerName
    ? `Delete “${roomName}”?\n\nYou'll leave it and it disappears from your rooms. ${partnerName} keeps the chat, but nobody new can join. When they delete it too, everything is erased.`
    : `Delete “${roomName}”?\n\nThe room, its chat and songs are erased for good.`;
  if (!window.confirm(msg)) return null;
  const res = await fetch("/api/rooms/leave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    window.alert(json.error ?? "Couldn't delete the room — try again.");
    return null;
  }
  return json.result;
}
