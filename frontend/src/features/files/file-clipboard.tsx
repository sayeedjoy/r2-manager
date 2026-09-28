/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, type ReactNode } from "react";
import type { ObjectEntry } from "@r2-manager/shared";
import type { TransferMode } from "./transfer";

/** Files and folders copied (Ctrl+C) or cut (Ctrl+X) in the browser, waiting to be pasted into another folder. */
export interface FileClipboard {
  mode: TransferMode;
  bucket: string;
  entries: ObjectEntry[];
}

type FileClipboardContextValue = [FileClipboard | null, (next: FileClipboard | null) => void];

const FileClipboardContext = createContext<FileClipboardContextValue | null>(null);

/** Lives above the router so a copy survives navigating to the destination folder or bucket. */
export function FileClipboardProvider({ children }: { children: ReactNode }) {
  const value = useState<FileClipboard | null>(null);
  return <FileClipboardContext.Provider value={value}>{children}</FileClipboardContext.Provider>;
}

export function useFileClipboard(): FileClipboardContextValue {
  const ctx = useContext(FileClipboardContext);
  if (!ctx) throw new Error("useFileClipboard must be used within FileClipboardProvider");
  return ctx;
}
