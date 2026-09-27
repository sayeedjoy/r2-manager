import { z } from "zod";

export const createUploadSchema = z.object({
  bucket: z.string().min(1),
  key: z.string().min(1),
  size: z.number().int().positive(),
  contentType: z.string().min(1).max(255).optional(),
  onConflict: z.enum(["fail", "overwrite", "rename"]).default("fail"),
});
export type CreateUploadRequest = z.infer<typeof createUploadSchema>;

export const createUploadResponseSchema = z.object({
  uploadId: z.string(),
  bucket: z.string(),
  key: z.string(),
  partSize: z.number().int().positive(),
  totalParts: z.number().int().positive(),
});
export type CreateUploadResponse = z.infer<typeof createUploadResponseSchema>;

export const signPartSchema = z.object({
  uploadId: z.string().min(1),
  partNumber: z.number().int().min(1).max(10000),
});

export const signPartResponseSchema = z.object({
  url: z.string().url(),
  partNumber: z.number().int(),
  expiresAt: z.string().datetime(),
});

export const completedPartSchema = z.object({
  partNumber: z.number().int().min(1),
  etag: z.string().min(1),
});

export const completeUploadSchema = z.object({
  uploadId: z.string().min(1),
  parts: z.array(completedPartSchema).min(1),
});

export const abortUploadSchema = z.object({
  uploadId: z.string().min(1),
});

export const directUploadSchema = z.object({
  bucket: z.string().min(1),
  key: z.string().min(1),
  contentType: z.string().min(1).max(255).optional(),
  onConflict: z.enum(["fail", "overwrite", "rename"]).default("fail"),
});
