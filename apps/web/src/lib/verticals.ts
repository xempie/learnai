import type { Vertical } from "@/lib/sample-data";

/** Display order + labels for the six verticals (§3.1 enum). */
export const VERTICALS: Vertical[] = ["general", "teaching", "learning", "marketing", "management", "health"];

export const VERTICAL_LABELS: Record<Vertical, string> = {
  general: "General",
  teaching: "Teaching",
  learning: "Learning",
  marketing: "Marketing",
  management: "Management",
  health: "Health",
};

export function verticalLabel(vertical: Vertical): string {
  return VERTICAL_LABELS[vertical];
}
