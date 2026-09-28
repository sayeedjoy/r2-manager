import type { ObjectEntry } from "@r2-manager/shared"
import { baseName, joinKey, normalizeFolderKey } from "@r2-manager/shared"
import { api } from "@/lib/api"

export type TransferMode = "move" | "copy"

interface TransferOptions {
  mode: TransferMode
  sourceBucket: string
  entries: ObjectEntry[]
  destBucket: string
  destPrefix: string
  /** Called after each entry finishes, with how many are done so far. */
  onProgress?: (done: number) => void
}

/**
 * FILE-04/FILE-05: moves or copies files and folders into destBucket/destPrefix.
 * Name clashes get a numbered copy. Files go through objects/move|copy;
 * folders run as cursor-batched tree operations, which aren't atomic (NFR-09),
 * so a failure can leave earlier entries already transferred.
 */
export async function transferEntries({
  mode,
  sourceBucket,
  entries,
  destBucket,
  destPrefix,
  onProgress,
}: TransferOptions): Promise<void> {
  let done = 0
  for (const entry of entries) {
    if (entry.type === "folder") {
      const destFolderPrefix = normalizeFolderKey(
        joinKey(destPrefix, baseName(entry.key))
      )
      let cursor: string | undefined
      for (;;) {
        const result = await api.treeOp({
          op: mode,
          sourceBucket,
          sourcePrefix: entry.key,
          destBucket,
          destPrefix: destFolderPrefix,
          onConflict: "rename",
          cursor,
        })
        const failed = result.processed.find((p) => p.status === "failed")
        if (failed)
          throw new Error(`Failed on "${failed.key}": ${failed.reason}`)
        if (result.done) break
        cursor = result.cursor ?? undefined
      }
    } else {
      const destKey = joinKey(destPrefix, baseName(entry.key))
      const run = mode === "move" ? api.move : api.copy
      await run(sourceBucket, entry.key, destBucket, destKey, "rename")
    }
    onProgress?.(++done)
  }
}
