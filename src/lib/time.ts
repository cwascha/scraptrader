// Chat timestamp formatting. Rendered client-side, so each party sees the
// time in their OWN timezone (correct for owner/buyer in different zones).
//   today            -> "2:34 PM"
//   this year        -> "Jul 15, 2:34 PM"
//   a previous year  -> "Jul 15, 2025, 2:34 PM"
export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const now = new Date();
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (d.toDateString() === now.toDateString()) return time;

  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${date}, ${time}`;
}
