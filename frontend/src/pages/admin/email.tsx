import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MailWarning, Send, TriangleAlert } from "lucide-react";
import { SMTP_PRESETS, type SmtpProvider, type SmtpSettings } from "@r2-manager/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader } from "@/components/layout/page-header";
import { PasswordInput } from "@/components/auth/password-input";
import { toast } from "@/components/toaster";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/notify";

const PROVIDERS: { value: SmtpProvider; label: string }[] = [
  { value: "gmail", label: "Gmail" },
  { value: "brevo", label: "Brevo" },
  { value: "custom", label: "Other SMTP" },
];

/** Where each provider's credentials come from; the most common reason a first test fails. */
const PROVIDER_HELP: Record<SmtpProvider, { username: string; password: string; note: string }> = {
  gmail: {
    username: "Your full Gmail or Google Workspace address.",
    password:
      "A 16-character app password, not your Google password. Create one under Google Account > Security > App passwords (needs 2-Step Verification).",
    note: "Gmail sends as the signed-in account, so use that address (or a verified alias) as the sender.",
  },
  brevo: {
    username: "Your SMTP login from Brevo > SMTP & API > SMTP (looks like 1a2b3c@smtp-brevo.com).",
    password: "An SMTP key generated on that same page, not your Brevo account password.",
    note: "The sender address must be a sender or domain you've verified in Brevo.",
  },
  custom: {
    username: "Leave blank if your relay doesn't need authentication.",
    password: "Leave blank to keep the saved password.",
    note: "Port 465 uses TLS from the start; 587 upgrades with STARTTLS, which the app then requires.",
  },
};

interface FormState {
  enabled: boolean;
  provider: SmtpProvider;
  host: string;
  port: string;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

function toForm(s: SmtpSettings): FormState {
  return { ...s, port: String(s.port), password: "" };
}

/** Outgoing email for password reset and invites. Configured here (stored in Postgres), not in env vars. */
export function AdminEmailPage() {
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["admin", "smtp"],
    queryFn: api.getSmtp,
  });

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Email delivery" description="Used to send password reset links and invites." />
      {isLoading && <Skeleton className="h-96 rounded-xl" />}
      {error && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlert />
            </EmptyMedia>
            <EmptyTitle>Couldn't load email settings</EmptyTitle>
            <EmptyDescription>{error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      )}
      {data && <SmtpForm key={dataUpdatedAt} initial={data} />}
      {data?.enabled && <TestEmailCard />}
    </div>
  );
}

function SmtpForm({ initial }: { initial: SmtpSettings }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => toForm(initial));
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const port = Number(form.port);
  const errors = {
    host: form.enabled && !form.host.trim() ? "Enter the SMTP server's host name." : undefined,
    port: !Number.isInteger(port) || port < 1 || port > 65535 ? "Enter a port between 1 and 65535." : undefined,
    fromEmail:
      form.enabled && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.fromEmail.trim()) ? "Enter a valid email address." : undefined,
  };
  const help = PROVIDER_HELP[form.provider];

  function chooseProvider(provider: SmtpProvider) {
    setForm((prev) => ({
      ...prev,
      provider,
      ...(provider !== "custom"
        ? {
            ...SMTP_PRESETS[provider],
            port: String(SMTP_PRESETS[provider].port),
          }
        : {}),
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (Object.values(errors).some(Boolean)) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    try {
      await api.updateSmtp({
        enabled: form.enabled,
        provider: form.provider,
        host: form.host.trim(),
        port,
        secure: form.secure,
        username: form.username.trim(),
        password: form.password || undefined,
        fromEmail: form.fromEmail.trim(),
        fromName: form.fromName.trim(),
      });
      toast.add({ status: "success", title: "Email settings saved" });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "smtp"] }),
        // The sign-in page's "Forgot password?" link and the user dialog's invite option depend on this.
        qc.invalidateQueries({ queryKey: ["auth-status"] }),
      ]);
    } catch (err) {
      notifyError("Couldn't save email settings", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>SMTP server</CardTitle>
          <CardDescription>Gmail and Brevo fill in the server details for you.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <FieldLabel htmlFor="smtp-enabled">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Send email</FieldTitle>
                  <FieldDescription>When off, "Forgot password?" is hidden and admins set passwords by hand.</FieldDescription>
                </FieldContent>
                <Switch id="smtp-enabled" checked={form.enabled} onCheckedChange={(checked) => set("enabled", checked)} />
              </Field>
            </FieldLabel>

            {!form.enabled && initial.enabled && (
              <Alert>
                <MailWarning />
                <AlertDescription>Saving with this off stops password reset emails and invites.</AlertDescription>
              </Alert>
            )}

            <FieldSeparator />

            <Field>
              <FieldLabel>Provider</FieldLabel>
              <ToggleGroup
                variant="outline"
                spacing={0}
                aria-label="Email provider"
                value={[form.provider]}
                onValueChange={(value) => value[0] && chooseProvider(value[0] as SmtpProvider)}
              >
                {PROVIDERS.map((p) => (
                  <ToggleGroupItem key={p.value} value={p.value}>
                    {p.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>{help.note}</FieldDescription>
            </Field>

            {form.provider === "custom" && (
              <div className="grid gap-6 sm:grid-cols-[1fr_8rem]">
                <Field data-invalid={(showErrors && !!errors.host) || undefined}>
                  <FieldLabel htmlFor="smtp-host">Host</FieldLabel>
                  <Input
                    id="smtp-host"
                    value={form.host}
                    onChange={(e) => set("host", e.target.value)}
                    placeholder="smtp.example.com"
                    autoComplete="off"
                    aria-invalid={(showErrors && !!errors.host) || undefined}
                  />
                  {showErrors && errors.host && <FieldDescription className="text-destructive">{errors.host}</FieldDescription>}
                </Field>
                <Field data-invalid={(showErrors && !!errors.port) || undefined}>
                  <FieldLabel htmlFor="smtp-port">Port</FieldLabel>
                  <Input
                    id="smtp-port"
                    inputMode="numeric"
                    value={form.port}
                    onChange={(e) => set("port", e.target.value)}
                    className="tabular-nums"
                    aria-invalid={(showErrors && !!errors.port) || undefined}
                  />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel>Encryption</FieldLabel>
                  <ToggleGroup
                    variant="outline"
                    spacing={0}
                    aria-label="Encryption"
                    value={[form.secure ? "tls" : "starttls"]}
                    onValueChange={(value) => value[0] && set("secure", value[0] === "tls")}
                  >
                    <ToggleGroupItem value="tls">TLS (port 465)</ToggleGroupItem>
                    <ToggleGroupItem value="starttls">STARTTLS (port 587)</ToggleGroupItem>
                  </ToggleGroup>
                </Field>
              </div>
            )}
            {form.provider !== "custom" && (
              <p className="text-sm text-muted-foreground">
                Connects to <span className="font-mono text-foreground">{form.host}</span> on port{" "}
                <span className="font-mono text-foreground">{form.port}</span> with {form.secure ? "TLS" : "STARTTLS"}.
              </p>
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="smtp-username">Username</FieldLabel>
                <Input
                  id="smtp-username"
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                  autoComplete="off"
                />
                <FieldDescription>{help.username}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-password">Password</FieldLabel>
                <PasswordInput
                  id="smtp-password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder={initial.passwordSet ? "Saved. Type to replace it" : undefined}
                  autoComplete="new-password"
                />
                <FieldDescription>{help.password}</FieldDescription>
              </Field>
            </div>

            <FieldSeparator />

            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={(showErrors && !!errors.fromEmail) || undefined}>
                <FieldLabel htmlFor="smtp-from-email">Sender address</FieldLabel>
                <Input
                  id="smtp-from-email"
                  type="email"
                  value={form.fromEmail}
                  onChange={(e) => set("fromEmail", e.target.value)}
                  placeholder="no-reply@example.com"
                  autoComplete="off"
                  aria-invalid={(showErrors && !!errors.fromEmail) || undefined}
                />
                {showErrors && errors.fromEmail ? (
                  <FieldDescription className="text-destructive">{errors.fromEmail}</FieldDescription>
                ) : (
                  <FieldDescription>Emails come from this address.</FieldDescription>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-from-name">Sender name</FieldLabel>
                <Input
                  id="smtp-from-name"
                  value={form.fromName}
                  onChange={(e) => set("fromName", e.target.value)}
                  placeholder="R2 Manager"
                />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            Save
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function TestEmailCard() {
  const { data: me } = useMe();
  const [to, setTo] = useState(me?.identity ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      await api.sendTestEmail(to.trim());
      setResult({
        ok: true,
        message: `Sent to ${to.trim()}. Check that inbox (and its spam folder).`,
      });
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "Sending failed",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send a test email</CardTitle>
        <CardDescription>Uses the saved settings. Save any changes above first.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="smtp-test-to" className="sr-only">
              Send to
            </label>
            <Input id="smtp-test-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} className="sm:max-w-xs" />
            <Button type="submit" variant="outline" disabled={busy || !to.trim()}>
              {busy ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
              Send test
            </Button>
          </div>
          {result && (
            <Alert variant={result.ok ? "default" : "destructive"}>
              {result.ok ? <Send /> : <TriangleAlert />}
              <AlertTitle>{result.ok ? "Test email sent" : "Couldn't send"}</AlertTitle>
              <AlertDescription className="break-words">{result.message}</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
