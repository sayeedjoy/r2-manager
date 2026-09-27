import { z } from "zod";

export const createShareSchema = z.object({
  bucket: z.string().min(1),
  key: z.string().min(1),
  password: z.string().min(4).max(200).optional(),
  expiresAt: z.string().datetime().optional(),
  maxDownloads: z.number().int().positive().max(1_000_000).optional(),
  deliveryMode: z.enum(["stream", "redirect"]).default("stream"),
  inlinePreview: z.boolean().default(false),
});
export type CreateShareRequest = z.infer<typeof createShareSchema>;

export const shareSchema = z.object({
  id: z.string(),
  bucket: z.string(),
  key: z.string(),
  hasPassword: z.boolean(),
  expiresAt: z.string().datetime().nullable(),
  maxDownloads: z.number().int().nullable(),
  reservedDownloads: z.number().int(),
  revokedAt: z.string().datetime().nullable(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  deliveryMode: z.enum(["stream", "redirect"]),
  inlinePreview: z.boolean(),
  // Only present in the response to the create call; the raw token is never stored, so it can't be shown again later.
  url: z.string().nullable(),
});
export type Share = z.infer<typeof shareSchema>;

export const redeemShareSchema = z.object({
  password: z.string().max(200).optional(),
});
