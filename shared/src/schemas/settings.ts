import { z } from "zod";
import { ROLES } from "../roles";

export const userGrantSchema = z.object({
  bucket: z.string().min(1),
  prefix: z.string().default(""),
});

export const userSchema = z.object({
  id: z.string(),
  identity: z.string(),
  displayName: z.string(),
  role: z.enum(ROLES),
  status: z.enum(["active", "disabled"]),
  grants: z.array(userGrantSchema),
  createdAt: z.string().datetime(),
});
export type UserRecord = z.infer<typeof userSchema>;

export const upsertUserSchema = z.object({
  identity: z.string().min(1),
  displayName: z.string().min(1),
  role: z.enum(ROLES),
  grants: z.array(userGrantSchema).default([]),
});

export const appSettingsSchema = z.object({
  maxUploadSizeBytes: z.number().int().positive(),
  allowedUploadTypes: z.array(z.string()).nullable(),
  maxPreviewSizeBytes: z.number().int().positive(),
  maxEditorSizeBytes: z.number().int().positive(),
  defaultShareExpiryHours: z.number().int().positive().nullable(),
  defaultShareMaxDownloads: z.number().int().positive().nullable(),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;
