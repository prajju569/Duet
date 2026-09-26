/**
 * Your name is public (your partner sees it); your Duet ID is half of your login.
 * If the ID is just your name, anyone who knows you only has to guess 4 digits.
 */
const squash = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function idLooksLikeName(id: string, name: string | null | undefined) {
  const i = squash(id);
  const n = squash(name);
  if (!i || n.length < 3) return false;
  return i.includes(n) || n.includes(i);
}

export const ID_NAME_MSG = "Keep your Duet ID different from your name — your name is public, your Duet ID is your secret login.";
