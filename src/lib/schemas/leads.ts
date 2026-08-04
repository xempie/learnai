import { z } from "zod";
import { SERVICE_INTERESTS } from "@/lib/leads";

export const enquirySchema = z.object({
  name: z.string().trim().min(2, "Please tell us your name.").max(80),
  email: z.email("Enter a valid email address.").trim().toLowerCase().max(254),
  org_name: z.string().trim().max(120).optional(),
  service_interest: z.enum(SERVICE_INTERESTS),
  team_size: z.coerce.number().int().min(1).max(100_000).optional(),
  message: z.string().trim().max(4000).optional(),
});

export const leadPatchSchema = z
  .object({
    status: z.enum(["new", "contacted", "qualified", "converted", "closed"]).optional(),
    notes: z.string().trim().max(8000).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.notes !== undefined, {
    message: "Nothing to update.",
  });
