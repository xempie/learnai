/**
 * Static UI configuration. Not content - these are fixed product choices that
 * would be the same on an empty database.
 *
 * Anything that describes a topic, a user, or an organisation belongs in
 * PostgreSQL and must be fetched, never hard-coded.
 */

/** Preset avatars. No photo uploads in V1, so a learner picks a colour. */
export const AVATAR_PRESETS = [
  { id: "spark", hue: 245, label: "Indigo Spark" },
  { id: "reef", hue: 190, label: "Reef Teal" },
  { id: "bloom", hue: 320, label: "Bloom Pink" },
  { id: "moss", hue: 140, label: "Moss Green" },
  { id: "dusk", hue: 265, label: "Dusk Violet" },
  { id: "ember", hue: 20, label: "Ember" },
  { id: "sea", hue: 210, label: "Deep Sea" },
  { id: "plum", hue: 290, label: "Plum" },
] as const;

export type AvatarPresetId = (typeof AVATAR_PRESETS)[number]["id"];

/** Maps a stored avatar key back to its colour. Falls back to the first preset. */
export function avatarHue(key: string | null | undefined): number {
  return AVATAR_PRESETS.find((p) => p.id === key)?.hue ?? AVATAR_PRESETS[0].hue;
}

/** Must match the check constraint on users.age_range. Under 16 is rejected. */
export const AGE_RANGES = ["16-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;

export type AgeRange = (typeof AGE_RANGES)[number];

export const PERSONAS = [
  { value: "student", label: "Student" },
  { value: "academic", label: "Academic" },
  { value: "professional", label: "Professional" },
  { value: "manager", label: "Manager" },
  { value: "elderly", label: "Lifelong learner" },
  { value: "other", label: "Other" },
] as const;

export const SKILL_LEVELS = [
  { value: "basic", label: "Basic", hint: "New to AI" },
  { value: "intermediate", label: "Intermediate", hint: "Use it sometimes" },
  { value: "advanced", label: "Advanced", hint: "Daily user" },
] as const;
