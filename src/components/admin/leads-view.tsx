"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Mail } from "lucide-react";
import { api } from "@/lib/api-client";
import {
  BTN_SECONDARY,
  CARD,
  Chip,
  EmptyState,
  ErrorBox,
  FIELD,
  LABEL,
  PageHeader,
  PrivacyNote,
  SectionCard,
  Skeleton,
  SkeletonRows,
  Suppressed,
  TD,
  TEXTAREA,
  TH,
  errorMessage,
  formatDate,
  num,
  useAsync,
} from "./admin-ui";

/* ============ API shapes (snake_case, straight from /api/v1/admin/leads*) ============ */

export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "closed";

const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "converted", "closed"];

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  closed: "Closed",
};

const SERVICE_LABEL: Record<string, string> = {
  workshop: "Workshop",
  advisory: "Advisory",
  pilot_sprint: "Pilot sprint",
  training: "Training",
  team_platform: "Team platform",
  other: "Other",
};

interface Lead {
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
  status: LeadStatus;
  notes: string | null;
  qualified_at: string | null;
  created_at: string;
}

interface LeadListResponse {
  data: Lead[];
  next_cursor: string | null;
}

interface LeadMetrics {
  by_status: Record<LeadStatus, number>;
  qualified_by_month: { month: string; count: number }[];
}

interface OrganizationRow {
  id: string;
  name: string;
  type: string | null;
  suppressed: boolean;
  member_count: number | null;
  active_7d: number | null;
  enrolled_learners: number | null;
  episodes_completed: number | null;
}

interface OrganizationResponse {
  range: { from: string; to: string };
  min_cell_size: number;
  suppressed_count: number;
  data: OrganizationRow[];
}

const LIST_LIMIT = 50;

function orgLabel(lead: Lead): string {
  return lead.org_name ?? lead.org_domain ?? "-";
}

function serviceLabel(value: string): string {
  return SERVICE_LABEL[value] ?? value;
}

export function LeadsView() {
  const [statusFilter, setStatusFilter] = useState<"" | LeadStatus>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [notesBusyId, setNotesBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const list = useAsync<LeadListResponse>(`leads|${statusFilter}`, () =>
    api.get<LeadListResponse>("/admin/leads", {
      status: statusFilter || undefined,
      limit: LIST_LIMIT,
    }),
  );
  const metrics = useAsync<LeadMetrics>("leads-metrics", () =>
    api.get<LeadMetrics>("/admin/leads/metrics"),
  );
  const orgs = useAsync<OrganizationResponse>("warm-orgs", () =>
    api.get<OrganizationResponse>("/admin/analytics/organizations"),
  );

  const rows = list.data?.data ?? [];

  const qualifiedThisMonth =
    metrics.data?.qualified_by_month[metrics.data.qualified_by_month.length - 1]?.count ?? 0;
  const openLeads = metrics.data
    ? metrics.data.by_status.new + metrics.data.by_status.contacted
    : 0;
  const teamEnquiries = rows.filter((l) => l.is_team).length;

  const kpiCards = [
    {
      key: "qualified",
      label: "Qualified this month",
      value: qualifiedThisMonth,
      caption: "Leads that first reached 'qualified' in the current calendar month",
      loading: metrics.loading,
    },
    {
      key: "open",
      label: "Open leads",
      value: openLeads,
      caption: "Status new or contacted, across every lead",
      loading: metrics.loading,
    },
    {
      key: "team",
      label: "Team enquiries",
      value: teamEnquiries,
      caption: "is_team, within the currently loaded list",
      loading: list.loading,
    },
  ];

  const topOrgs = useMemo(() => {
    const data = orgs.data?.data ?? [];
    return [...data]
      .sort((a, b) => (b.active_7d ?? -1) - (a.active_7d ?? -1))
      .slice(0, 10);
  }, [orgs.data]);

  function toggleExpanded(lead: Lead) {
    setExpandedId((current) => (current === lead.id ? null : lead.id));
    setNotesDrafts((prev) =>
      prev[lead.id] !== undefined ? prev : { ...prev, [lead.id]: lead.notes ?? "" },
    );
  }

  async function updateStatus(lead: Lead, next: LeadStatus) {
    if (!list.data || next === lead.status) return;
    const previous = list.data;
    const optimistic = previous.data.map((l) => (l.id === lead.id ? { ...l, status: next } : l));
    list.set({ ...previous, data: optimistic });
    setStatusBusyId(lead.id);
    setActionError("");
    try {
      const updated = await api.patch<Lead>(`/admin/leads/${lead.id}`, { status: next });
      list.set({ ...previous, data: optimistic.map((l) => (l.id === lead.id ? updated : l)) });
      metrics.reload();
    } catch (err) {
      list.set(previous);
      setActionError(errorMessage(err));
    } finally {
      setStatusBusyId(null);
    }
  }

  async function saveNotes(lead: Lead) {
    if (!list.data) return;
    const draft = notesDrafts[lead.id] ?? "";
    setNotesBusyId(lead.id);
    setActionError("");
    try {
      const updated = await api.patch<Lead>(`/admin/leads/${lead.id}`, { notes: draft });
      const previous = list.data;
      list.set({
        ...previous,
        data: previous.data.map((l) => (l.id === lead.id ? updated : l)),
      });
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setNotesBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leads"
        description="Enquiries from the services funnel. Qualify what's real, then work it - this is not a CRM replacement."
      />

      {actionError && <ErrorBox message={actionError} />}

      {/* ===== KPI row ===== */}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpiCards.map((card) => (
          <div key={card.key} className={`${CARD} p-4`}>
            <dt className="text-sm font-semibold text-ink-muted">{card.label}</dt>
            <dd className="mt-1 font-display text-2xl font-bold tabular-nums sm:text-3xl">
              {card.loading ? <Skeleton className="h-8 w-16" /> : num(card.value)}
            </dd>
            <p className="mt-1 text-xs text-ink-faint">{card.caption}</p>
          </div>
        ))}
      </dl>

      {/* ===== Filter ===== */}
      <div className="max-w-56">
        <label htmlFor="lead-status-filter" className={LABEL}>
          Status
        </label>
        <select
          id="lead-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | LeadStatus)}
          className={`${FIELD} mt-1.5`}
        >
          <option value="">All</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {/* ===== Table ===== */}
      {list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <div className={`${CARD} p-4`}>
          <SkeletonRows rows={6} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No leads yet."
          hint="Enquiries submitted through the services funnel will appear here."
        />
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full min-w-240 border-collapse text-sm">
            <caption className="sr-only">{rows.length} leads</caption>
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  <span className="sr-only">Expand</span>
                </th>
                <th scope="col" className={TH}>
                  Created
                </th>
                <th scope="col" className={TH}>
                  Name / Email
                </th>
                <th scope="col" className={TH}>
                  Organisation
                </th>
                <th scope="col" className={TH}>
                  Service
                </th>
                <th scope="col" className={TH}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => {
                const expanded = expandedId === lead.id;
                const statusBusy = statusBusyId === lead.id;
                const notesBusy = notesBusyId === lead.id;
                return (
                  <Fragment key={lead.id}>
                    <tr>
                      <td className={TD}>
                        <button
                          type="button"
                          onClick={() => toggleExpanded(lead)}
                          aria-expanded={expanded}
                          aria-label={expanded ? "Collapse row" : "Expand row"}
                          className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-band hover:text-ink"
                        >
                          {expanded ? (
                            <ChevronDown className="size-4" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="size-4" aria-hidden="true" />
                          )}
                        </button>
                      </td>
                      <td className={`${TD} whitespace-nowrap text-ink-muted`}>
                        {formatDate(lead.created_at)}
                      </td>
                      <td className={TD}>
                        <span className="block font-medium text-ink">{lead.name}</span>
                        <a
                          href={`mailto:${lead.email}`}
                          className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary-strong underline-offset-2 hover:underline"
                        >
                          <Mail className="size-3" aria-hidden="true" />
                          {lead.email}
                        </a>
                      </td>
                      <td className={TD}>
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {orgLabel(lead)}
                          {lead.is_team && <Chip tone="primary">TEAM</Chip>}
                        </span>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        {serviceLabel(lead.service_interest)}
                      </td>
                      <td className={TD}>
                        <select
                          aria-label={`Status for ${lead.name}`}
                          value={lead.status}
                          disabled={statusBusy}
                          onChange={(e) => void updateStatus(lead, e.target.value as LeadStatus)}
                          className={`${FIELD} h-10 w-36`}
                        >
                          {LEAD_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td className={`${TD} bg-band/40`} colSpan={6}>
                          <div className="flex flex-col gap-4 py-2">
                            <div>
                              <p className={LABEL}>Message</p>
                              <p className="mt-1.5 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                                {lead.message ?? "No message."}
                              </p>
                            </div>
                            <div>
                              <label htmlFor={`notes-${lead.id}`} className={LABEL}>
                                Internal notes
                              </label>
                              <textarea
                                id={`notes-${lead.id}`}
                                value={notesDrafts[lead.id] ?? ""}
                                onChange={(e) =>
                                  setNotesDrafts((prev) => ({
                                    ...prev,
                                    [lead.id]: e.target.value,
                                  }))
                                }
                                rows={3}
                                placeholder="Not visible to the lead."
                                className={`${TEXTAREA} mt-1.5 max-w-2xl`}
                              />
                              <div className="mt-2">
                                <button
                                  type="button"
                                  onClick={() => void saveNotes(lead)}
                                  disabled={notesBusy}
                                  className={BTN_SECONDARY}
                                >
                                  {notesBusy ? "Saving..." : "Save"}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== Warm organisations ===== */}
      <SectionCard
        id="warm-orgs"
        title="Warm organisations"
        description="Top 10 organisations by active learners in the last 7 days."
      >
        {orgs.error ? (
          <ErrorBox message={orgs.error} onRetry={orgs.reload} />
        ) : orgs.loading ? (
          <SkeletonRows rows={4} />
        ) : topOrgs.length === 0 ? (
          <EmptyState title="No organisations yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-120 border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Organisation
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Members
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Active (7d)
                  </th>
                </tr>
              </thead>
              <tbody>
                {topOrgs.map((org) => (
                  <tr key={org.id}>
                    <td className={`${TD} font-medium`}>{org.name}</td>
                    {org.suppressed ? (
                      <td className={`${TD} text-right`} colSpan={2}>
                        <Suppressed />
                      </td>
                    ) : (
                      <>
                        <td className={`${TD} text-right tabular-nums`}>
                          {num(org.member_count ?? 0)}
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {num(org.active_7d ?? 0)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PrivacyNote>
          Aggregate engagement only — flag for outreach, then judge by hand.
        </PrivacyNote>
      </SectionCard>
    </div>
  );
}
