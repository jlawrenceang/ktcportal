// Shared serving-lane helpers — the weekly per-line queue number (separate from
// the permanent JO number). Used by both checker stations (desktop + app) and the
// queue table so the lane order + tag are computed identically everywhere.
//
// Priority lane is served AHEAD of the regular queue, then re-X-ray. Each lane
// numbers from 1 independently, so fold the lane rank in front of the number for
// the sort (mirrors the original AppChecker logic).

// Structural subset of ServingNumber — the columns the lane helpers need, so a
// caller that selects only service_line/serving_no/vacated_at (no week_start)
// still satisfies it.
export type ServingLike = { service_line: string; serving_no: number; vacated_at: string | null }

const LANE_RANK: Record<string, number> = { priority: 0, rexray: 2 }
const LANE_TAG: Record<string, string> = { priority: 'P', rexray: 'R' }

/** The one currently-active (non-vacated) serving row, or null. */
export function activeServing(serving: ServingLike[] | null | undefined): ServingLike | null {
  return serving?.find((s) => !s.vacated_at) ?? null
}

/** Numeric sort key: priority lane first, then regular queue, then re-X-ray; by
 *  number within a lane. Orders with no active serving sort last (Infinity). */
export function servingKey(serving: ServingLike[] | null | undefined): number {
  const s = activeServing(serving)
  return s ? (LANE_RANK[s.service_line] ?? 1) * 1_000_000 + s.serving_no : Infinity
}

/** Lane-tagged display: P-1 (priority), R-1 (re-X-ray), #1 (regular queue), or null. */
export function servingTag(serving: ServingLike[] | null | undefined): string | null {
  const s = activeServing(serving)
  if (!s) return null
  return LANE_TAG[s.service_line] ? `${LANE_TAG[s.service_line]}-${s.serving_no}` : `#${s.serving_no}`
}
