// §6.1 warm-up schedule — 49 rows (day_index 1..49, week_index 1..7).
//
// Each week's §6.1 daily-volume RANGE is interpolated linearly across its 7
// days (day 1 of the week = the range minimum, day 7 = the range maximum).
// Week 7 has no range — §6.1 says "full" and the T02 controller decision
// fixes that at 150,000 — so every day in week 7 uses that constant.
//
// Segment jsonb per week, per the T02 controller decision:
//   weeks 1-2  { cohort_bucket: { lte: 1 } }
//   weeks 3-4  { cohort_bucket: { lte: 2 } }
//   week 5     { cohort_bucket: { lte: 4 }, include_repermissioned: true }
//   weeks 6-7  { all_active: true }
export interface WarmupWeekDefinition {
  weekIndex: number;
  minVolume: number;
  maxVolume: number | null; // null => flat maxVolume applies every day (week 7)
  flatVolume?: number;
  segment: Record<string, unknown>;
}

const WEEKS: readonly WarmupWeekDefinition[] = [
  { weekIndex: 1, minVolume: 500, maxVolume: 2000, segment: { cohort_bucket: { lte: 1 } } },
  { weekIndex: 2, minVolume: 3000, maxVolume: 8000, segment: { cohort_bucket: { lte: 1 } } },
  { weekIndex: 3, minVolume: 10000, maxVolume: 20000, segment: { cohort_bucket: { lte: 2 } } },
  { weekIndex: 4, minVolume: 25000, maxVolume: 40000, segment: { cohort_bucket: { lte: 2 } } },
  {
    weekIndex: 5,
    minVolume: 50000,
    maxVolume: 70000,
    segment: { cohort_bucket: { lte: 4 }, include_repermissioned: true },
  },
  { weekIndex: 6, minVolume: 85000, maxVolume: 100000, segment: { all_active: true } },
  {
    weekIndex: 7,
    minVolume: 150000,
    maxVolume: null,
    flatVolume: 150000,
    segment: { all_active: true },
  },
];

export interface WarmupScheduleRow {
  day_index: number;
  week_index: number;
  max_volume: number;
  segment: Record<string, unknown>;
}

export function buildWarmupSchedule(): WarmupScheduleRow[] {
  const rows: WarmupScheduleRow[] = [];
  let dayIndex = 0;
  for (const week of WEEKS) {
    for (let dayInWeek = 0; dayInWeek < 7; dayInWeek += 1) {
      dayIndex += 1;
      const volume =
        week.maxVolume === null
          ? (week.flatVolume ?? week.minVolume)
          : Math.round(week.minVolume + ((week.maxVolume - week.minVolume) * dayInWeek) / 6);
      rows.push({
        day_index: dayIndex,
        week_index: week.weekIndex,
        max_volume: volume,
        segment: week.segment,
      });
    }
  }
  return rows;
}
