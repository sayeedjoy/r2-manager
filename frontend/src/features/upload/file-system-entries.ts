export interface DroppedFile {
  file: File;
  /** Path relative to the dropped/selected root, preserving the folder hierarchy (XFER-02). */
  relativePath: string;
}

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file(success: (file: File) => void, error?: (err: unknown) => void): void;
  createReader?(): { readEntries(success: (entries: FileSystemEntryLike[]) => void, error?: (err: unknown) => void): void };
}

function readAllEntries(reader: ReturnType<NonNullable<FileSystemEntryLike["createReader"]>>): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntryLike[] = [];
    function readBatch() {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(all);
          return;
        }
        all.push(...entries);
        readBatch(); // readEntries only returns a batch at a time; keep calling until empty
      }, reject);
    }
    readBatch();
  });
}

async function walkEntry(entry: FileSystemEntryLike, prefix: string, out: DroppedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    out.push({ file, relativePath: `${prefix}${entry.name}` });
  } else if (entry.isDirectory && entry.createReader) {
    const entries = await readAllEntries(entry.createReader());
    for (const child of entries) {
      await walkEntry(child, `${prefix}${entry.name}/`, out);
    }
  }
}

/** XFER-02: recursively walks dropped folders via the (non-standard but widely supported) webkitGetAsEntry API. */
export async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<DroppedFile[]> {
  const items = Array.from(dataTransfer.items);
  const hasEntrySupport = items.length > 0 && typeof items[0]?.webkitGetAsEntry === "function";

  if (!hasEntrySupport) {
    return Array.from(dataTransfer.files).map((file) => ({ file, relativePath: file.name }));
  }

  const out: DroppedFile[] = [];
  await Promise.all(
    items.map(async (item) => {
      const entry = item.webkitGetAsEntry?.() as FileSystemEntryLike | null;
      if (entry) await walkEntry(entry, "", out);
    }),
  );
  return out;
}

/** From an <input webkitdirectory> selection, which already exposes webkitRelativePath per file. */
export function filesFromFileList(fileList: FileList): DroppedFile[] {
  return Array.from(fileList).map((file) => ({
    file,
    relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}
