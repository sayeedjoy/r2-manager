import { z } from "zod";

export const listObjectsQuerySchema = z.object({
  bucket: z.string().min(1),
  prefix: z.string().default(""),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
export type ListObjectsQuery = z.infer<typeof listObjectsQuerySchema>;

export const objectEntrySchema = z.object({
  key: z.string(),
  type: z.enum(["file", "folder"]),
  size: z.number().nonnegative().optional(),
  lastModified: z.string().datetime().optional(),
  etag: z.string().optional(),
  contentType: z.string().optional(),
});
export type ObjectEntry = z.infer<typeof objectEntrySchema>;

export const listObjectsResponseSchema = z.object({
  bucket: z.string(),
  prefix: z.string(),
  entries: z.array(objectEntrySchema),
  cursor: z.string().nullable(),
  truncated: z.boolean(),
});
export type ListObjectsResponse = z.infer<typeof listObjectsResponseSchema>;
