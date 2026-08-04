import type { leads } from "@/db/schema";

type LeadRow = typeof leads.$inferSelect;

export interface SerialisedLead {
  id: string;
  name: string;
  email: string;
  org_domain: string | null;
  org_name: string | null;
  service_interest: string;
  team_size: number | null;
  message: string | null;
  is_team: boolean;
  source: string;
  status: string;
  notes: string | null;
  qualified_at: string | null;
  created_at: string;
}

/** The one place a lead row becomes wire JSON - used by both admin lead routes. */
export function serialiseLead(row: LeadRow): SerialisedLead {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    org_domain: row.orgDomain,
    org_name: row.orgName,
    service_interest: row.serviceInterest,
    team_size: row.teamSize,
    message: row.message,
    is_team: row.isTeam,
    source: row.source,
    status: row.status,
    notes: row.notes,
    qualified_at: row.qualifiedAt ? row.qualifiedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
  };
}
