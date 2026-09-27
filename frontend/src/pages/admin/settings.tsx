import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

/** ADMIN-02: administrator-configurable limits. */
export function AdminSettingsPage() {
  const { data } = useQuery({ queryKey: ["admin", "settings"], queryFn: api.getSettings });
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        maxUploadSizeBytes: String(data.maxUploadSizeBytes),
        maxPreviewSizeBytes: String(data.maxPreviewSizeBytes),
        maxEditorSizeBytes: String(data.maxEditorSizeBytes),
        defaultShareExpiryHours: data.defaultShareExpiryHours ? String(data.defaultShareExpiryHours) : "",
        defaultShareMaxDownloads: data.defaultShareMaxDownloads ? String(data.defaultShareMaxDownloads) : "",
      });
    }
  }, [data]);

  async function handleSave() {
    await api.updateSettings({
      maxUploadSizeBytes: Number(form.maxUploadSizeBytes),
      maxPreviewSizeBytes: Number(form.maxPreviewSizeBytes),
      maxEditorSizeBytes: Number(form.maxEditorSizeBytes),
      defaultShareExpiryHours: form.defaultShareExpiryHours ? Number(form.defaultShareExpiryHours) : null,
      defaultShareMaxDownloads: form.defaultShareMaxDownloads ? Number(form.defaultShareMaxDownloads) : null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const fields: { key: keyof typeof form; label: string }[] = [
    { key: "maxUploadSizeBytes", label: "Max upload size (bytes)" },
    { key: "maxPreviewSizeBytes", label: "Max preview size (bytes)" },
    { key: "maxEditorSizeBytes", label: "Max editor size (bytes)" },
    { key: "defaultShareExpiryHours", label: "Default share expiry (hours)" },
    { key: "defaultShareMaxDownloads", label: "Default share max downloads" },
  ];

  return (
    <div className="max-w-md space-y-4 p-6">
      <h1 className="text-lg font-medium">Settings</h1>
      {fields.map((f) => (
        <div key={f.key}>
          <Label htmlFor={f.key}>{f.label}</Label>
          <Input
            id={f.key}
            value={form[f.key] ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
          />
        </div>
      ))}
      <Button onClick={handleSave}>{saved ? "Saved" : "Save"}</Button>
    </div>
  );
}
