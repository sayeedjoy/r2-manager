import { z } from "zod";

export const objectMetadataSchema = z.object({
  bucket: z.string(),
  key: z.string(),
  size: z.number().nonnegative(),
  etag: z.string(),
  lastModified: z.string().datetime(),
  contentType: z.string().optional(),
  contentDisposition: z.string().optional(),
  cacheControl: z.string().optional(),
  contentLanguage: z.string().optional(),
  customMetadata: z.record(z.string()).default({}),
});
export type ObjectMetadata = z.infer<typeof objectMetadataSchema>;

export const updateMetadataSchema = z.object({
  bucket: z.string().min(1),
  key: z.string().min(1),
  ifMatch: z.string().min(1),
  contentType: z.string().max(255).optional(),
  contentDisposition: z.string().max(255).optional(),
  cacheControl: z.string().max(255).optional(),
  contentLanguage: z.string().max(64).optional(),
  customMetadata: z.record(z.string().max(1024)).optional(),
});
export type UpdateMetadataRequest = z.infer<typeof updateMetadataSchema>;
