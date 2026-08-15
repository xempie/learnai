/**
 * Parses the draft agent's kind=video output shape (§5.3: "Sections with
 * timestamps") — lines of the form `**M:SS** description text.` — into
 * structured cues. Used both for the timestamped script list under the
 * player and to drive the simulated caption track's cycling text.
 */
export interface VideoCue {
  timeS: number;
  text: string;
}

const CUE_LINE = /^\*\*(\d+):(\d{2})\*\*\s*(.+)$/;

export function parseVideoScript(bodyMd: string): VideoCue[] {
  const cues: VideoCue[] = [];
  for (const rawLine of bodyMd.split("\n")) {
    const line = rawLine.trim();
    const match = CUE_LINE.exec(line);
    if (!match) continue;
    const [, minutes, seconds, text] = match;
    cues.push({ timeS: Number(minutes) * 60 + Number(seconds), text: text ?? "" });
  }
  return cues.sort((a, b) => a.timeS - b.timeS);
}

/** The cue whose timestamp is current as of `currentS` (last one not in the future). */
export function activeCue(cues: VideoCue[], currentS: number): VideoCue | null {
  let active: VideoCue | null = null;
  for (const cue of cues) {
    if (cue.timeS <= currentS) active = cue;
    else break;
  }
  return active ?? cues[0] ?? null;
}
