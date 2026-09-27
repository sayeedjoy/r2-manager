import { z } from "zod";

export const conflictPolicySchema = z.enum(["fail", "overwrite", "rename"]).default("fail");

export const createFolderSchema = z.object({
  bucket: z.string().min(1),
  key: z.string().min(1),
});

export const renameObjectSchema = z.object({
  bucket: z.string().min(1),
  key: z.string().min(1),
  newName: z.string().min(1),
  onConflict: conflictPolicySchema,
});

export const copyObjectSchema = z.object({
  sourceBucket: z.string().min(1),
  sourceKey: z.string().min(1),
  destBucket: z.string().min(1),
  destKey: z.string().min(1),
  onConflict: conflictPolicySchema,
});

export const moveObjectSchema = copyObjectSchema;

export const deleteObjectsSchema = z.object({
  bucket: z.string().min(1),
  keys: z.array(z.string().min(1)).min(1).max(1000),
});

export const treeOperationSchema = z.object({
  op: z.enum(["copy", "move", "delete"]),
  sourceBucket: z.string().min(1),
  sourcePrefix: z.string().min(1),
  destBucket: z.string().min(1).optional(),
  destPrefix: z.string().optional(),
  onConflict: conflictPolicySchema,
  cursor: z.string().optional(),
  batchSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type TreeOperationRequest = z.infer<typeof treeOperationSchema>;

export const treeOperationResultItemSchema = z.object({
  key: z.string(),
  status: z.enum(["ok", "failed", "skipped"]),
  reason: z.string().optional(),
});

export const treeOperationResponseSchema = z.object({
  cursor: z.string().nullable(),
  done: z.boolean(),
  processed: z.array(treeOperationResultItemSchema),
});
export type TreeOperationResponse = z.infer<typeof treeOperationResponseSchema>;
