import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import type { AppSettings } from "@r2-manager/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/toaster";
import { PageHeader } from "@/components/layout/page-header";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { notifyError } from "@/lib/notify";

const MB = 1024 * 1024;

type SizeKey = "maxUploadSizeBytes" | "maxBulkDownloadBytes" | "maxPreviewSizeBytes" | "maxEditorSizeBytes";
type CountKey = "defaultShareExpiryHours" | "defaultShareMaxDownloads";
type FormKey = SizeKey | CountKey;
type FormState = Record<FormKey, string>;

interface FieldSpec {
  key: FormKey;
  label: string;
  description: string;
  unit: string;
  /** Blank means "no limit" for share defaults; size limits are always required. */
  optional?: boolean;
}

const SECTIONS: { title: string; description: string; fields: FieldSpec[] }[] = [
  {
    title: "Transfers",
    description: "Caps on what goes in and out in one go.",
    fields: [
      { key: "maxUploadSizeBytes", label: "Max upload size", description: "Largest single file anyone can upload.", unit: "MB" },
      { key: "maxBulkDownloadBytes", label: "Max bulk download", description: "Largest total a multi-file zip download may reach.", unit: "MB" },
    ],
  },
  {
    title: "Preview and editing",
    description: "Files above these sizes fall back to a download.",
    fields: [
      { key: "maxPreviewSizeBytes", label: "Max preview size", description: "Largest file shown in the preview panel.", unit: "MB" },
      { key: "maxEditorSizeBytes", label: "Max editor size", description: "Largest text file the in-browser editor opens.", unit: "MB" },
    ],
  },
  {
    title: "Share link defaults",
    description: "Prefilled when someone creates a share link. They can still change them per link.",
    fields: [
      { key: "defaultShareExpiryHours", label: "Expires after", description: "Leave blank for links that don't expire.", unit: "hours", optional: true },
      { key: "defaultShareMaxDownloads", label: "Download limit", description: "Leave blank for unlimited downloads.", unit: "downloads", optional: true },
    ],
  },
];

const SIZE_KEYS: SizeKey[] = ["maxUploadSizeBytes", "maxBulkDownloadBytes", "maxPreviewSizeBytes", "maxEditorSizeBytes"];

function toForm(s: AppSettings): FormState {
  const mb = (bytes: number) => String(Number((bytes / MB).toFixed(2)));
  return {
    maxUploadSizeBytes: mb(s.maxUploadSizeBytes),
    maxBulkDownloadBytes: mb(s.maxBulkDownloadBytes),
    maxPreviewSizeBytes: mb(s.maxPreviewSizeBytes),
    maxEditorSizeBytes: mb(s.maxEditorSizeBytes),
    defaultShareExpiryHours: s.defaultShareExpiryHours ? String(s.defaultShareExpiryHours) : "",
    defaultShareMaxDownloads: s.defaultShareMaxDownloads ? String(s.defaultShareMaxDownloads) : "",
  };
}

function validate(form: FormState): Partial<Record<FormKey, string>> {
  const errors: Partial<Record<FormKey, string>> = {};
  for (const key of SIZE_KEYS) {
    const value = Number(form[key]);
    if (!form[key].trim() || !Number.isFinite(value) || Math.round(value * MB) < 1) errors[key] = "Enter a size above zero.";
  }
  for (const key of ["defaultShareExpiryHours", "defaultShareMaxDownloads"] as const) {
    if (form[key].trim() && !/^[1-9]\d*$/.test(form[key].trim())) errors[key] = "Enter a whole number above zero, or leave it blank.";
  }
  return errors;
}

/** ADMIN-02: administrator-configurable limits. */
export function AdminSettingsPage() {
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({ queryKey: ["admin", "settings"], queryFn: api.getSettings });

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Settings" description="Limits that apply to everyone. Changes take effect on the next request." />
      {isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
      {error && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlert />
            </EmptyMedia>
            <EmptyTitle>Couldn't load settings</EmptyTitle>
            <EmptyDescription>{error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      )}
      {/* Keyed on the fetch time, so the form starts from the saved values again after every save or refetch. */}
      {data && <SettingsForm key={dataUpdatedAt} initial={data} />}
    </div>
  );
}

function SettingsForm({ initial }: { initial: AppSettings }) {
  const qc = useQueryClient();
  const [saved] = useState(() => toForm(initial));
  const [form, setForm] = useState(saved);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);

  const errors = validate(form);
  const dirty = (Object.keys(form) as FormKey[]).some((k) => form[k] !== saved[k]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    try {
      await api.updateSettings({
        maxUploadSizeBytes: Math.round(Number(form.maxUploadSizeBytes) * MB),
        maxBulkDownloadBytes: Math.round(Number(form.maxBulkDownloadBytes) * MB),
        maxPreviewSizeBytes: Math.round(Number(form.maxPreviewSizeBytes) * MB),
        maxEditorSizeBytes: Math.round(Number(form.maxEditorSizeBytes) * MB),
        defaultShareExpiryHours: form.defaultShareExpiryHours.trim() ? Number(form.defaultShareExpiryHours) : null,
        defaultShareMaxDownloads: form.defaultShareMaxDownloads.trim() ? Number(form.defaultShareMaxDownloads) : null,
      });
      toast.add({ status: "success", title: "Settings saved" });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "settings"] }),
        // The read-only copy other screens use (the share dialog's defaults).
        qc.invalidateQueries({ queryKey: ["settings"] }),
      ]);
    } catch (err) {
      notifyError("Couldn't save settings", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-6 sm:grid-cols-2">
              {section.fields.map((f) => {
                const error = showErrors ? errors[f.key] : undefined;
                const isSize = SIZE_KEYS.includes(f.key as SizeKey);
                const bytes = Math.round(Number(form[f.key]) * MB);
                return (
                  <Field key={f.key} data-invalid={!!error || undefined}>
                    <FieldLabel htmlFor={f.key}>{f.label}</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id={f.key}
                        inputMode={isSize ? "decimal" : "numeric"}
                        value={form[f.key]}
                        placeholder={f.optional ? "No limit" : undefined}
                        aria-invalid={!!error || undefined}
                        onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        className="tabular-nums"
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>{f.unit}</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                    {error ? (
                      <FieldError>{error}</FieldError>
                    ) : (
                      <FieldDescription>
                        {f.description}
                        {/* Echo big values back in the largest sensible unit, e.g. "5120 MB" reads as "5.0 GB". */}
                        {isSize && bytes >= 1024 * MB && ` Currently ${formatBytes(bytes)}.`}
                      </FieldDescription>
                    )}
                  </Field>
                );
              })}
            </FieldGroup>
          </CardContent>
        </Card>
      ))}

      {/* Only shown with unsaved changes, floating like the file browser's bulk bar. The save toast confirms. */}
      {dirty && (
        <div className="sticky bottom-4 flex items-center gap-2 rounded-xl bg-popover p-2 pl-4 text-popover-foreground shadow-lg ring-1 ring-foreground/10 transition-[opacity,translate] duration-200 ease-out-strong starting:opacity-0 motion-safe:starting:translate-y-2">
          <p className="mr-auto text-sm" aria-live="polite">
            You have unsaved changes.
          </p>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setForm(saved);
              setShowErrors(false);
            }}
          >
            Reset
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}
