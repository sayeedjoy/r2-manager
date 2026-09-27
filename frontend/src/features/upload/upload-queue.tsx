import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { uploadFile } from "./multipart-client";

export interface QueuedUpload {
  id: string;
  fileName: string;
  bucket: string;
  key: string;
  loaded: number;
  total: number;
  status: "uploading" | "done" | "error" | "canceled";
  error?: string;
}

interface UploadQueueContextValue {
  uploads: QueuedUpload[];
  enqueue: (file: File, bucket: string, key: string, onDone: () => void) => void;
  cancel: (id: string) => void;
  dismiss: (id: string) => void;
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<QueuedUpload[]>([]);
  const handles = useRef(new Map<string, ReturnType<typeof uploadFile>>());

  const enqueue = useCallback((file: File, bucket: string, key: string, onDone: () => void) => {
    const id = crypto.randomUUID();
    setUploads((prev) => [...prev, { id, fileName: file.name, bucket, key, loaded: 0, total: file.size, status: "uploading" }]);

    const handle = uploadFile(file, { bucket, key, onConflict: "rename" }, (p) => {
      setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, loaded: p.loaded, total: p.total } : u)));
    });
    handles.current.set(id, handle);

    handle.promise
      .then(() => {
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: "done" } : u)));
        onDone();
      })
      .catch((err) => {
        setUploads((prev) =>
          prev.map((u) => (u.id === id ? { ...u, status: u.status === "canceled" ? "canceled" : "error", error: err?.message } : u)),
        );
      })
      .finally(() => handles.current.delete(id));
  }, []);

  const cancel = useCallback((id: string) => {
    handles.current.get(id)?.cancel();
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: "canceled" } : u)));
  }, []);

  const dismiss = useCallback((id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  return (
    <UploadQueueContext.Provider value={{ uploads, enqueue, cancel, dismiss }}>{children}</UploadQueueContext.Provider>
  );
}

export function useUploadQueue() {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error("useUploadQueue must be used within UploadQueueProvider");
  return ctx;
}
