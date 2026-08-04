"use client";

import { useState } from "react";
import { Info, Plus, Ticket } from "lucide-react";
import { api } from "@/lib/api-client";
import { ConfirmDialog } from "./confirm-dialog";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  Chip,
  EmptyState,
  ErrorBox,
  FIELD,
  LABEL,
  PageHeader,
  SectionCard,
  SkeletonRows,
  TD,
  TH,
  errorMessage,
  formatDate,
  num,
  useAsync,
} from "./admin-ui";

/* ============ API shapes (GET /api/v1/admin/coupons) ============ */

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  currency: string;
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
  topic_id: string | null;
  org_id: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  per_user_limit: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface CouponListResponse {
  data: Coupon[];
  stripe_enabled: boolean;
}

/** "2026-08-10T09:00" from a datetime-local input → ISO-8601, or undefined. */
function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function discountLabel(coupon: Coupon): string {
  if (coupon.discount_type === "percent") return `${num(coupon.discount_value)}% off`;
  return `${coupon.currency} ${(coupon.discount_value / 100).toFixed(2)} off`;
}

export function CouponsView() {
  const list = useAsync<CouponListResponse>("coupons", () =>
    api.get<CouponListResponse>("/admin/coupons"),
  );

  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<Coupon | null>(null);

  /* ---- create form ---- */
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [currency, setCurrency] = useState("AUD");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [perUserLimit, setPerUserLimit] = useState("1");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const rows = list.data?.data ?? [];
  const stripeEnabled = list.data?.stripe_enabled ?? false;

  async function mutate(id: string, work: () => Promise<string>) {
    setBusyId(id);
    setActionError("");
    setMessage("");
    try {
      setMessage(await work());
      list.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function createCoupon() {
    const value = Number(discountValue);
    if (!code.trim()) {
      setFormError("A code is required.");
      return;
    }
    if (!Number.isInteger(value) || value <= 0) {
      setFormError("The discount value must be a whole number greater than zero.");
      return;
    }
    if (discountType === "percent" && value > 100) {
      setFormError("Percentage discounts must be between 1 and 100.");
      return;
    }
    setCreating(true);
    setFormError("");
    try {
      await api.post("/admin/coupons", {
        code: code.trim().toUpperCase(),
        description: description.trim() === "" ? undefined : description.trim(),
        discountType,
        discountValue: value,
        currency: currency.trim().toUpperCase(),
        maxRedemptions: maxRedemptions === "" ? null : Number(maxRedemptions),
        perUserLimit: Number(perUserLimit) || 1,
        startsAt: toIso(startsAt) ?? null,
        expiresAt: toIso(expiresAt) ?? null,
      });
      setMessage(
        stripeEnabled
          ? `Created "${code.trim().toUpperCase()}" and its matching Stripe promotion code.`
          : `Created "${code.trim().toUpperCase()}". Stripe is not configured, so this code exists locally only for now.`,
      );
      setCode("");
      setDescription("");
      setDiscountValue("10");
      setMaxRedemptions("");
      setPerUserLimit("1");
      setStartsAt("");
      setExpiresAt("");
      setShowForm(false);
      list.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  function toggleActive(coupon: Coupon) {
    void mutate(coupon.id, async () => {
      await api.patch(`/admin/coupons/${coupon.id}`, { isActive: !coupon.is_active });
      return `"${coupon.code}" is now ${coupon.is_active ? "inactive" : "active"}.`;
    });
  }

  function confirmDeactivate() {
    const coupon = pendingDeactivate;
    setPendingDeactivate(null);
    if (!coupon) return;
    void mutate(coupon.id, async () => {
      const result = await api.delete<{ message?: string }>(`/admin/coupons/${coupon.id}`);
      return result.message
        ? `"${coupon.code}": ${result.message}`
        : `"${coupon.code}" deactivated.`;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Coupons"
        description="Discount codes for checkout. The discount type and value are fixed once a code exists - changing them under codes people already hold would change the price they were promised."
      >
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          aria-expanded={showForm}
          className={BTN_PRIMARY}
        >
          <Plus className="size-5" aria-hidden="true" />
          New coupon
        </button>
      </PageHeader>

      {!list.loading && !stripeEnabled && (
        <p className="flex items-start gap-2 rounded-md border border-streak/30 bg-streak-soft px-3 py-2.5 text-sm leading-relaxed text-streak">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Stripe is not configured on this environment. Codes created here are stored locally and
          are mirrored into Stripe the first time one is used at checkout - so a new code will not
          appear in the Stripe dashboard yet.
        </p>
      )}

      <p role="status" aria-live="polite" className="min-h-6 text-sm font-semibold text-success">
        {message}
      </p>

      {actionError && <ErrorBox message={actionError} />}

      {/* ===== New coupon ===== */}
      {showForm && (
        <SectionCard id="new-coupon" title="New coupon">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="coupon-code" className={LABEL}>
                Code <span className="text-danger">*</span>
              </label>
              <input
                id="coupon-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="LAUNCH50"
                className={`${FIELD} mt-1.5 font-mono`}
              />
              <p className="mt-1 text-xs text-ink-faint">
                Stored uppercase. Learners type this at checkout.
              </p>
            </div>
            <div>
              <label htmlFor="coupon-desc" className={LABEL}>
                Description
              </label>
              <input
                id="coupon-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Launch promo"
                className={`${FIELD} mt-1.5`}
              />
            </div>
            <div>
              <label htmlFor="coupon-type" className={LABEL}>
                Discount type
              </label>
              <select
                id="coupon-type"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed")}
                className={`${FIELD} mt-1.5`}
              >
                <option value="percent">Percentage off</option>
                <option value="fixed">Fixed amount off</option>
              </select>
            </div>
            <div>
              <label htmlFor="coupon-value" className={LABEL}>
                {discountType === "percent" ? "Percentage (1-100)" : "Amount in cents"}
              </label>
              <input
                id="coupon-value"
                type="number"
                min={1}
                max={discountType === "percent" ? 100 : undefined}
                step={1}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                aria-describedby="coupon-value-hint"
                className={`${FIELD} mt-1.5`}
              />
              <p id="coupon-value-hint" className="mt-1 text-xs text-ink-faint">
                {discountType === "percent"
                  ? "50 means half price."
                  : "1500 means 15.00 off, in the currency below."}
              </p>
            </div>
            <div>
              <label htmlFor="coupon-currency" className={LABEL}>
                Currency
              </label>
              <input
                id="coupon-currency"
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                className={`${FIELD} mt-1.5 max-w-32`}
              />
            </div>
            <div>
              <label htmlFor="coupon-max" className={LABEL}>
                Max redemptions
              </label>
              <input
                id="coupon-max"
                type="number"
                min={1}
                step={1}
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder="Unlimited"
                className={`${FIELD} mt-1.5`}
              />
            </div>
            <div>
              <label htmlFor="coupon-per-user" className={LABEL}>
                Per-user limit
              </label>
              <input
                id="coupon-per-user"
                type="number"
                min={1}
                step={1}
                value={perUserLimit}
                onChange={(e) => setPerUserLimit(e.target.value)}
                className={`${FIELD} mt-1.5`}
              />
            </div>
            <div>
              <label htmlFor="coupon-starts" className={LABEL}>
                Starts
              </label>
              <input
                id="coupon-starts"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={`${FIELD} mt-1.5`}
              />
            </div>
            <div>
              <label htmlFor="coupon-expires" className={LABEL}>
                Expires
              </label>
              <input
                id="coupon-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                aria-describedby="coupon-expires-hint"
                className={`${FIELD} mt-1.5`}
              />
              <p id="coupon-expires-hint" className="mt-1 text-xs text-ink-faint">
                Must be in the future. Leave empty for no expiry.
              </p>
            </div>
          </div>

          {formError && <ErrorBox message={formError} className="mt-4" />}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void createCoupon()}
              disabled={creating}
              className={BTN_PRIMARY}
            >
              {creating ? "Creating..." : "Create coupon"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormError("");
              }}
              className={BTN_SECONDARY}
            >
              Cancel
            </button>
          </div>
        </SectionCard>
      )}

      {/* ===== Table ===== */}
      {list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <div className={`${CARD} p-4`}>
          <SkeletonRows rows={5} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No coupons yet."
          hint="Create one above to run a launch promo or a partner discount."
        />
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full min-w-280 border-collapse text-sm">
            <caption className="sr-only">{rows.length} coupons</caption>
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Code
                </th>
                <th scope="col" className={TH}>
                  Description
                </th>
                <th scope="col" className={TH}>
                  Discount
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Redemptions
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Per user
                </th>
                <th scope="col" className={TH}>
                  Starts
                </th>
                <th scope="col" className={TH}>
                  Expires
                </th>
                <th scope="col" className={TH}>
                  Stripe
                </th>
                <th scope="col" className={TH}>
                  Active
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((coupon) => {
                const busy = busyId === coupon.id;
                const exhausted =
                  coupon.max_redemptions !== null &&
                  coupon.redemption_count >= coupon.max_redemptions;
                return (
                  <tr key={coupon.id}>
                    <td className={`${TD} font-mono font-semibold`}>
                      <span className="inline-flex items-center gap-2">
                        <Ticket className="size-4 text-ink-faint" aria-hidden="true" />
                        {coupon.code}
                      </span>
                    </td>
                    <td className={`${TD} max-w-64 text-ink-muted`}>
                      {coupon.description ?? "-"}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>{discountLabel(coupon)}</td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {num(coupon.redemption_count)}
                      {coupon.max_redemptions === null
                        ? " / unlimited"
                        : ` / ${num(coupon.max_redemptions)}`}
                      {exhausted && (
                        <span className="ml-2 inline-flex">
                          <Chip tone="danger">Fully redeemed</Chip>
                        </span>
                      )}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {num(coupon.per_user_limit)}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-ink-muted`}>
                      {coupon.starts_at ? formatDate(coupon.starts_at) : "Immediately"}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-ink-muted`}>
                      {coupon.expires_at ? formatDate(coupon.expires_at) : "No expiry"}
                    </td>
                    <td className={TD}>
                      {coupon.stripe_promotion_code_id ? (
                        <Chip tone="success">Linked</Chip>
                      ) : (
                        <Chip>Local only</Chip>
                      )}
                    </td>
                    <td className={TD}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={coupon.is_active}
                        aria-label={`${coupon.code} active`}
                        disabled={busy}
                        onClick={() => toggleActive(coupon)}
                        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
                          coupon.is_active ? "bg-primary" : "bg-line-strong"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`absolute top-1 size-6 rounded-full bg-white shadow-sm transition-transform ${
                            coupon.is_active ? "translate-x-7" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className={TD}>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={busy || !coupon.is_active}
                          onClick={() => setPendingDeactivate(coupon)}
                          className={BTN_SECONDARY}
                        >
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-start gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-xs leading-relaxed text-ink-faint">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Coupons are never hard-deleted. Redemption rows are the billing record for money that was
        discounted, so a used code is deactivated and kept. Every change is written to the audit
        log.
      </p>

      <ConfirmDialog
        open={pendingDeactivate !== null}
        title="Deactivate this coupon?"
        description={
          <>
            <strong className="text-ink">{pendingDeactivate?.code}</strong> stops working at
            checkout immediately. It is kept, not deleted, because{" "}
            {num(pendingDeactivate?.redemption_count ?? 0)} redemption
            {pendingDeactivate?.redemption_count === 1 ? "" : "s"} must stay reconcilable against
            the billing record.
          </>
        }
        confirmLabel="Deactivate coupon"
        destructive
        onConfirm={confirmDeactivate}
        onCancel={() => setPendingDeactivate(null)}
      />
    </div>
  );
}
