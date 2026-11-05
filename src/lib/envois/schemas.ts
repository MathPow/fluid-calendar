import { z } from "zod";

const hour = z.number().int().min(0).max(24);

export const CreateCampaignInput = z.object({
  name: z.string().trim().min(1).max(200),
  accountId: z.string().min(1),
  fromName: z.string().trim().max(200).optional(),
  footer: z.string().max(2000).optional(),
  csv: z.string().min(1),
});

export const PatchCampaignInput = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  fromName: z.string().trim().max(200).nullable().optional(),
  footer: z.string().max(2000).optional(),
  dailyLimit: z.number().int().min(1).max(500).optional(),
  sendFromHour: hour.optional(),
  sendUntilHour: hour.optional(),
  weekdaysOnly: z.boolean().optional(),
});

export const CampaignAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("pause") }),
  z.object({
    action: z.literal("test"),
    recipientId: z.string().optional(),
    to: z.string().email().optional(),
  }),
  z.object({
    action: z.literal("select"),
    selected: z.boolean(),
    onlyFlagged: z.boolean().optional(),
  }),
]);

export const PatchRecipientInput = z.object({
  email: z.string().email().optional(),
  subject: z.string().trim().min(1).max(500).optional(),
  body: z.string().trim().min(1).optional(),
  selected: z.boolean().optional(),
  reviewed: z.literal(true).optional(),
  requeue: z.literal(true).optional(),
});

export const AddExclusionInput = z.object({ email: z.string().email() });
