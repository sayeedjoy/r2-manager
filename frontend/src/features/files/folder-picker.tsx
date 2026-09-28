import { useState, type KeyboardEvent } from "react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Folder, FolderPlus } from "lucide-react"
import {
  baseName,
  InvalidKeyError,
  normalizeFolderKey,
  parentPrefix,
} from "@r2-manager/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"

interface FolderPickerProps {
  bucket: string
  prefix: string
  onPrefixChange: (prefix: string) => void
  /** Folder keys that can't be opened - the folders being moved, so nothing lands inside itself. */
  blockedKeys?: ReadonlySet<string>
  disabled?: boolean
}

/** Deeper than this, the leading folders collapse into "…" so the path stays on one line. */
const MAX_VISIBLE_SEGMENTS = 2

/**
 * FILE-04/FILE-05: browse a bucket's folders to pick a move/copy destination.
 * The folder that is open is the destination; clicking a row opens it. Only
 * folders are listed, and a folder can be created in place (FILE-02).
 */
export function FolderPicker({
  bucket,
  prefix,
  onPrefixChange,
  blockedKeys,
  disabled,
}: FolderPickerProps) {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const query = useInfiniteQuery({
    queryKey: ["folder-picker", bucket, prefix],
    queryFn: ({ pageParam }) =>
      api.listObjects({ bucket, prefix, cursor: pageParam, limit: 1000 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.truncated ? (last.cursor ?? undefined) : undefined,
    enabled: !!bucket,
  })

  const folders = (query.data?.pages.flatMap((page) => page.entries) ?? [])
    .filter((entry) => entry.type === "folder" && entry.key !== prefix)
    .sort((a, b) =>
      baseName(a.key).localeCompare(baseName(b.key), undefined, {
        numeric: true,
      })
    )

  const segments = prefix
    .split("/")
    .filter(Boolean)
    .map((name, i, all) => ({
      name,
      prefix: all.slice(0, i + 1).join("/") + "/",
    }))
  const hiddenCount = Math.max(0, segments.length - MAX_VISIBLE_SEGMENTS)
  const visible = segments.slice(hiddenCount)

  function open(next: string) {
    setCreating(false)
    setNewName("")
    setCreateError(null)
    onPrefixChange(next)
  }

  async function createFolder() {
    const name = newName.trim()
    if (!name) return
    let key: string
    try {
      key = normalizeFolderKey(`${prefix}${name}`)
    } catch (err) {
      setCreateError(
        err instanceof InvalidKeyError
          ? err.message
          : "That folder name isn't valid."
      )
      return
    }
    setCreateBusy(true)
    setCreateError(null)
    try {
      await api.createFolder(bucket, key.slice(0, -1))
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Couldn't create the folder."
      )
      return
    } finally {
      setCreateBusy(false)
    }
    void queryClient.invalidateQueries({
      queryKey: ["folder-picker", bucket, prefix],
    })
    void queryClient.invalidateQueries({
      queryKey: ["listing", bucket, prefix],
    })
    open(key)
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // This sits inside the move/copy form: Enter must create the folder, not submit the move.
    if (event.key === "Enter") {
      event.preventDefault()
      void createFolder()
    } else if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      setCreating(false)
      setNewName("")
      setCreateError(null)
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center gap-1 border-b bg-muted/40 px-1.5 py-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Up one folder"
          disabled={disabled || prefix === ""}
          onClick={() => open(parentPrefix(prefix))}
        >
          <ChevronLeft />
        </Button>

        <nav aria-label="Destination path" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-0.5 text-sm text-muted-foreground">
            <li className="min-w-0">
              <PathCrumb
                label={bucket}
                current={segments.length === 0}
                disabled={disabled}
                onClick={() => open("")}
              />
            </li>
            {hiddenCount > 0 && (
              <li className="flex shrink-0 items-center gap-0.5">
                <ChevronRight aria-hidden className="size-3.5 shrink-0" />
                <PathCrumb
                  label="…"
                  title={segments[hiddenCount - 1].prefix}
                  disabled={disabled}
                  onClick={() => open(segments[hiddenCount - 1].prefix)}
                />
              </li>
            )}
            {visible.map((segment, i) => (
              <li
                key={segment.prefix}
                className="flex min-w-0 items-center gap-0.5"
              >
                <ChevronRight aria-hidden className="size-3.5 shrink-0" />
                <PathCrumb
                  label={segment.name}
                  current={i === visible.length - 1}
                  disabled={disabled}
                  onClick={() => open(segment.prefix)}
                />
              </li>
            ))}
          </ol>
        </nav>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || creating}
          onClick={() => setCreating(true)}
        >
          <FolderPlus data-icon="inline-start" />
          New folder
        </Button>
      </div>

      <div
        className="h-56 overflow-y-auto p-1 sm:h-72 lg:h-[min(26rem,50dvh)]"
        aria-busy={query.isLoading}
      >
        {creating && (
          <div className="flex flex-col gap-1 p-1">
            <div className="flex items-center gap-1.5">
              <Folder
                aria-hidden
                className="ml-1.5 size-4 shrink-0 text-muted-foreground"
              />
              <Input
                autoFocus
                aria-label="New folder name"
                placeholder="Folder name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                disabled={createBusy}
                aria-invalid={!!createError}
                autoComplete="off"
                className="h-7"
              />
              <Button
                type="button"
                size="sm"
                disabled={createBusy || !newName.trim()}
                onClick={() => void createFolder()}
              >
                {createBusy && <Spinner data-icon="inline-start" />}
                Create
              </Button>
            </div>
            {createError && (
              <p className="pl-7 text-xs text-destructive">{createError}</p>
            )}
          </div>
        )}

        {query.isLoading && (
          <div className="flex h-full items-center justify-center">
            <Spinner className="text-muted-foreground" />
          </div>
        )}

        {query.isError && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {query.error instanceof Error
              ? query.error.message
              : "Couldn't load this folder."}
          </p>
        )}

        {query.isSuccess && folders.length === 0 && !creating && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No folders here. Items will go straight into this one.
          </p>
        )}

        {folders.length > 0 && (
          <ul>
            {folders.map((folder) => {
              const blocked = blockedKeys?.has(folder.key) ?? false
              return (
                <li key={folder.key}>
                  <button
                    type="button"
                    disabled={disabled || blocked}
                    title={
                      blocked ? "A folder can't go inside itself" : undefined
                    }
                    onClick={() => open(folder.key)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Folder
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {baseName(folder.key)}
                    </span>
                    <ChevronRight
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {query.hasNextPage && (
          <div className="p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={disabled || query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage && <Spinner data-icon="inline-start" />}
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function PathCrumb({
  label,
  title,
  current,
  disabled,
  onClick,
}: {
  label: string
  title?: string
  current?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  if (current) {
    return (
      <span
        aria-current="page"
        className="block min-w-0 truncate px-1 font-medium text-foreground"
      >
        {label}
      </span>
    )
  }
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="block min-w-0 truncate rounded px-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {label}
    </button>
  )
}
