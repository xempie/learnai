import type { Metadata } from "next";
import { ReviewConsole } from "@/app/admin/review/review-console";
import { getContentSources, getCurrentReviewer, getReviewQueue } from "@/lib/data-source";

export const metadata: Metadata = {
  title: "Review queue · Learn AI Admin",
};

/**
 * `/admin/review` — LEARN_AI_V1_BUILD_SPEC.md §5.5 reviewer console, in
 * full, against sample data. Server component does the data fetch; every
 * interaction (queue navigation, editing, approve/changes/reject, the
 * elapsed-time timers, keyboard shortcuts) lives in `ReviewConsole`
 * because none of it can run on the server.
 */
export default async function AdminReviewPage() {
  const [queue, sources, reviewer] = await Promise.all([getReviewQueue(), getContentSources(), getCurrentReviewer()]);

  return <ReviewConsole initialQueue={queue} sources={sources} reviewer={reviewer} />;
}
