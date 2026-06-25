// Round F · scheduling exporter. Takes an approved post-pack (concept × platform)
// and produces:
//   • an .ics calendar file (RFC 5545) for Apple/Google/Outlook
//   • a CSV for Buffer / Later / Hootsuite bulk-upload
//
// The "best time to post" defaults are pulled from public platform-research
// medians (Sprout Social 2024, Hootsuite 2025). User can override per row.

export type Platform = "instagram" | "tiktok" | "youtube" | "linkedin" | "x" | "facebook" | "pinterest";

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn",
  x: "X (Twitter)", facebook: "Facebook", pinterest: "Pinterest",
};

/** Best-time-to-post medians (local time, weekday default). Source: public 2024-25 platform research. */
export const BEST_TIMES: Record<Platform, { hour: number; minute: number }[]> = {
  instagram: [{ hour: 8, minute: 0 }, { hour: 19, minute: 0 }],
  tiktok:    [{ hour: 9, minute: 0 }, { hour: 19, minute: 0 }],
  youtube:   [{ hour: 15, minute: 0 }],
  linkedin:  [{ hour: 7, minute: 30 }, { hour: 12, minute: 0 }],
  x:         [{ hour: 8, minute: 0 }, { hour: 18, minute: 0 }],
  facebook:  [{ hour: 9, minute: 0 }, { hour: 13, minute: 0 }],
  pinterest: [{ hour: 20, minute: 0 }],
};

export type PlannedPost = {
  /** Stable id — used as the ICS VEVENT UID. */
  id: string;
  /** Display title — used as the calendar summary. */
  title: string;
  /** ISO 8601 datetime, local-time-naive (no Z), used by both ICS + CSV. */
  scheduledAt: string;
  /** Which platform this post is for. */
  platform: Platform;
  /** Body of the post (caption + hashtags + CTA). */
  content: string;
  /** Optional outbound link. */
  link?: string;
  /** Optional MP4 path (for Buffer-style schedulers). */
  mediaPath?: string;
};

/** Render a Date as ICS-compliant "YYYYMMDDTHHMMSS" (local, floating).
 *  ICS supports floating local times when not suffixed with Z; pick that here
 *  so calendar apps respect the user's local timezone without translation. */
function icsLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    "T",
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join("");
}

/** Escape commas / semicolons / newlines per ICS TEXT property rules. */
function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function exportIcs(posts: PlannedPost[], calName = "LaunchFoundry posts"): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LaunchFoundry//Lite//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(calName)}`,
  ];
  for (const p of posts) {
    const start = new Date(p.scheduledAt);
    const end = new Date(start.getTime() + 30 * 60 * 1000); // 30-min blocks
    lines.push(
      "BEGIN:VEVENT",
      `UID:${p.id}@launchfoundry.local`,
      `DTSTAMP:${icsLocalDate(new Date())}`,
      `DTSTART:${icsLocalDate(start)}`,
      `DTEND:${icsLocalDate(end)}`,
      `SUMMARY:${icsEscape(`[${PLATFORM_LABEL[p.platform]}] ${p.title}`)}`,
      `DESCRIPTION:${icsEscape(p.content + (p.link ? `\n\n${p.link}` : ""))}`,
      ...(p.link ? [`URL:${p.link}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  // ICS line length max ≈ 75 chars per RFC; many calendars tolerate longer, so
  // we skip folding for simplicity. Use CRLF per spec.
  return lines.join("\r\n") + "\r\n";
}

/** Buffer/Later-compatible CSV. Columns chosen to be a sensible superset that
 *  both readers understand; Later uses "Date" + "Caption" + "Link", Buffer
 *  uses "Profile" + "Scheduled at" + "Update text". */
export function exportCsv(posts: PlannedPost[]): string {
  const header = ["profile", "scheduled_at", "caption", "link", "media", "platform"];
  const rows = [header.join(",")];
  for (const p of posts) {
    rows.push([
      csvCell(PLATFORM_LABEL[p.platform]),
      csvCell(p.scheduledAt),
      csvCell(p.content),
      csvCell(p.link ?? ""),
      csvCell(p.mediaPath ?? ""),
      csvCell(p.platform),
    ].join(","));
  }
  return rows.join("\n") + "\n";
}

function csvCell(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Trigger a download of the given text content as a file. */
export function downloadFile(filename: string, text: string, mime = "text/plain"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Schedule synthesis ─────────────────────────────────────────────────────
// Given a list of (concept, platform) pairs + a cadence + a start date, build
// a PlannedPost[] by rotating through each (concept, platform) and assigning
// the next-available best-time slot.

export type Cadence = "daily" | "every-other-day" | "mwf" | "weekly";

/** Generate posts. We iterate (concept × platform) in order, one per cadence-tick,
 *  picking the best-time slot for that platform on each tick's date. */
export function generateSchedule(args: {
  concepts: { id: string; title: string; caption: string; link?: string; mediaPath?: string }[];
  platforms: Platform[];
  cadence: Cadence;
  startDate: Date;
}): PlannedPost[] {
  const { concepts, platforms, cadence, startDate } = args;
  if (concepts.length === 0 || platforms.length === 0) return [];

  const stepDays: Record<Cadence, (i: number) => number> = {
    "daily": i => i,
    "every-other-day": i => i * 2,
    "mwf": i => {
      // 0 → Mon, 1 → Wed, 2 → Fri, 3 → next Mon …
      const dayOfWeek = i % 3;
      const week = Math.floor(i / 3);
      return week * 7 + [0, 2, 4][dayOfWeek]!;
    },
    "weekly": i => i * 7,
  };
  const stepFn = stepDays[cadence];

  const posts: PlannedPost[] = [];
  let tick = 0;
  for (const c of concepts) {
    for (const platform of platforms) {
      const dayOffset = stepFn(tick);
      const date = new Date(startDate);
      date.setDate(date.getDate() + dayOffset);
      // Pick the first best-time slot for the platform; could be smarter
      // by rotating multi-slot platforms but one is enough for v1.
      const slot = BEST_TIMES[platform][0]!;
      date.setHours(slot.hour, slot.minute, 0, 0);

      posts.push({
        id: `${c.id}-${platform}-${tick}`,
        title: c.title,
        scheduledAt: localIsoString(date),
        platform,
        content: c.caption,
        link: c.link,
        mediaPath: c.mediaPath,
      });
      tick++;
    }
  }
  return posts;
}

/** Date → "YYYY-MM-DDTHH:mm:ss" (no timezone marker). */
function localIsoString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
