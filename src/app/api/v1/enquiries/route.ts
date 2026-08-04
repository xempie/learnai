import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, organizationDomains } from "@/db/schema";
import { clientIp, handler, ok, parseBody, rateLimit } from "@/lib/api";
import { audit } from "@/lib/audit";
import { sendLeadNotificationEmail } from "@/lib/email";
import { classifyEnquiry } from "@/lib/leads";
import { enquirySchema } from "@/lib/schemas/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/enquiries — public. The "Talk to us about your team" route.
 * No auth: a buyer must never need an account to start a sales conversation.
 */
export const POST = handler(async (req: Request) => {
  rateLimit(`enquiry-ip:${clientIp(req)}`, 3, 60_000);

  const body = await parseBody(req, enquirySchema);
  const { isTeam, orgDomain } = classifyEnquiry({
    serviceInterest: body.service_interest,
    email: body.email,
    teamSize: body.team_size ?? null,
  });

  let orgId: string | null = null;
  if (orgDomain) {
    const match = await db.query.organizationDomains.findFirst({
      where: eq(organizationDomains.domain, orgDomain),
      columns: { orgId: true },
    });
    orgId = match?.orgId ?? null;
  }

  const [lead] = await db
    .insert(leads)
    .values({
      name: body.name,
      email: body.email,
      orgDomain,
      orgName: body.org_name ?? null,
      orgId,
      serviceInterest: body.service_interest,
      teamSize: body.team_size ?? null,
      message: body.message ?? null,
      isTeam,
    })
    .returning({ id: leads.id });

  await audit({
    action: "lead.created",
    entityType: "lead",
    entityId: lead!.id,
    metadata: { service: body.service_interest, is_team: isTeam },
    ipAddress: clientIp(req),
  });

  // Best-effort: a failed alert must never fail the enquiry.
  void sendLeadNotificationEmail({
    name: body.name,
    email: body.email,
    orgName: body.org_name ?? null,
    service: body.service_interest,
    teamSize: body.team_size ?? null,
    message: body.message ?? null,
    isTeam,
  });

  return ok({ id: lead!.id, is_team: isTeam }, 201);
});
