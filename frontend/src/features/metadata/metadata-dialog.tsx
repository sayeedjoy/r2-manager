import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName } from "@r2-manager/shared";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError } from "@/lib/api";

interface MetadataDialogProps {
  bucket: string;
  entry: ObjectEntry;
  onClose: () => void;
  onSaved: () => void;
}

/** META-01/02: view and edit HTTP + custom metadata, guarded by an If-Match ETag. */
export function MetadataDialog({ bucket, entry, onClose, onSaved }: MetadataDialogProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [etag, setEtag] = useState<string | null>(null);
  const [contentType, setContentType] = useState("");
  const [contentDisposition, setContentDisposition] = useState("");
  const [cacheControl, setCacheControl] = useState("");
  const [contentLanguage, setContentLanguage] = useState("");
  const [customMetadata, setCustomMetadata] = useState<{ key: string; value: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getMetadata(bucket, entry.key)
      .then((meta) => {
        if (cancelled) return;
        setEtag(meta.etag);
        setContentType(meta.contentType ?? "");
        setContentDisposition(meta.contentDisposition ?? "");
        setCacheControl(meta.cacheControl ?? "");
        setContentLanguage(meta.contentLanguage ?? "");
        setCustomMetadata(Object.entries(meta.customMetadata ?? {}).map(([key, value]) => ({ key, value: String(value) })));
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Failed to load metadata"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [bucket, entry.key]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!etag) return;
    setSaving(true);
    setError(null);
    setConflict(false);
    try {
      await api.updateMetadata({
        bucket,
        key: entry.key,
        ifMatch: etag,
        contentType: contentType || undefined,
        contentDisposition: contentDisposition || undefined,
        cacheControl: cacheControl || undefined,
        contentLanguage: contentLanguage || undefined,
        customMetadata: Object.fromEntries(customMetadata.filter((m) => m.key.trim()).map((m) => [m.key.trim(), m.value])),
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.body.error.code === "PRECONDITION_FAILED") setConflict(true);
      else setError(err instanceof Error ? err.message : "Failed to save metadata");
    } finally {
      setSaving(false);
    }
  }

  const headerFields = [
    { id: "meta-content-type", label: "Content-Type", value: contentType, set: setContentType, placeholder: "e.g. application/pdf" },
    { id: "meta-disposition", label: "Content-Disposition", value: contentDisposition, set: setContentDisposition, placeholder: "e.g. attachment" },
    { id: "meta-cache", label: "Cache-Control", value: cacheControl, set: setCacheControl, placeholder: "e.g. public, max-age=3600" },
    { id: "meta-language", label: "Content-Language", value: contentLanguage, set: setContentLanguage, placeholder: "e.g. en" },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSave} className="contents">
          <DialogHeader>
            <DialogTitle>Metadata</DialogTitle>
            <DialogDescription className="line-clamp-2 wrap-anywhere" title={baseName(entry.key)}>
              {baseName(entry.key)}
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading metadata">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          )}

          {conflict && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>This file changed</AlertTitle>
              <AlertDescription>Someone updated it after you opened this dialog. Close and reopen it to edit the latest version.</AlertDescription>
            </Alert>
          )}

          {!loading && !error && (
            <div className="flex max-h-[60svh] flex-col gap-6 overflow-y-auto">
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                {headerFields.map((f) => (
                  <Field key={f.id}>
                    <FieldLabel htmlFor={f.id}>{f.label}</FieldLabel>
                    <Input
                      id={f.id}
                      value={f.value}
                      placeholder={f.placeholder}
                      onChange={(e) => f.set(e.target.value)}
                      autoComplete="off"
                      className="font-mono text-xs"
                    />
                  </Field>
                ))}
              </FieldGroup>

              <FieldSet>
                <FieldLegend variant="label">Custom metadata</FieldLegend>
                <FieldDescription>Stored as x-amz-meta-* headers on the object.</FieldDescription>
                <div className="flex flex-col gap-2">
                  {customMetadata.map((m, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        aria-label="Key"
                        placeholder="key"
                        value={m.key}
                        className="font-mono text-xs"
                        onChange={(e) => setCustomMetadata((prev) => prev.map((row, j) => (j === i ? { ...row, key: e.target.value } : row)))}
                      />
                      <Input
                        aria-label="Value"
                        placeholder="value"
                        value={m.value}
                        className="font-mono text-xs"
                        onChange={(e) => setCustomMetadata((prev) => prev.map((row, j) => (j === i ? { ...row, value: e.target.value } : row)))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${m.key || "field"}`}
                        onClick={() => setCustomMetadata((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => setCustomMetadata((prev) => [...prev, { key: "", value: "" }])}
                  >
                    <Plus data-icon="inline-start" />
                    Add field
                  </Button>
                </div>
              </FieldSet>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Couldn't load or save metadata</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={saving} />}>Cancel</DialogClose>
            {!loading && !error && (
              <Button type="submit" disabled={saving || conflict}>
                {saving && <Spinner data-icon="inline-start" />}
                Save
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
