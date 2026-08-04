import { handler, ok, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";
import { getPreferences, setPreferences } from "@/lib/notifications";
import { notificationPreferencesSchema } from "@/lib/schemas/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The three toggles. A user who never opens settings has no row at all, so both
 * verbs materialise the defaults (everything on) rather than 404ing.
 */
function serialise(prefs: {
  newContent: boolean;
  commentReplies: boolean;
  cohortMilestones: boolean;
}) {
  return {
    new_content: prefs.newContent,
    comment_replies: prefs.commentReplies,
    cohort_milestones: prefs.cohortMilestones,
  };
}

export const GET = handler(async () => {
  const user = await requireAuth();
  return ok(serialise(await getPreferences(user.id)));
});

/** PUT is a partial update: omitted toggles keep their current value. */
export const PUT = handler(async (req: Request) => {
  const user = await requireAuth();
  const input = await parseBody(req, notificationPreferencesSchema);

  const next = await setPreferences(user.id, {
    newContent: input.new_content,
    commentReplies: input.comment_replies,
    cohortMilestones: input.cohort_milestones,
  });

  return ok(serialise(next));
});
