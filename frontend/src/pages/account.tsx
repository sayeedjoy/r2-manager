import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Check, Copy, Download, Laptop, LogOut, ShieldCheck, ShieldOff, Smartphone, TriangleAlert } from "lucide-react";
import { usesPasswordLogin } from "@r2-manager/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/layout/page-header";
import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { validateNewPassword } from "@/lib/password";
import { PasswordInput } from "@/components/auth/password-input";
import { RelativeTime } from "@/components/relative-time";
import { toast } from "@/components/toaster";
import { useConfirm } from "@/components/confirm-dialog";
import { useMe } from "@/hooks/use-me";
import { api, type Me } from "@/lib/api";
import { notifyError } from "@/lib/notify";

/** The signed-in user's own sign-in settings: password, two-factor authentication and active sessions. */
export function AccountPage() {
  const { data: me } = useMe();
  if (!me) return null;
  const passwordLogin = usesPasswordLogin(me.authMode);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Account and security" description={`Signed in as ${me.identity}`} />
      {!passwordLogin && (
        <Alert>
          <ShieldCheck />
          <AlertTitle>Sign-in is managed by Cloudflare Access</AlertTitle>
          <AlertDescription>Your password and two-factor settings live with your identity provider, not here.</AlertDescription>
        </Alert>
      )}
      {passwordLogin && (
        <>
          <ChangePasswordCard />
          <TwoFactorCard me={me} />
          <SessionsCard />
        </>
      )}
    </div>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const errors = validateNewPassword(password, confirm);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!current || Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, password);
      toast.add({
        status: "success",
        title: "Password changed",
        description: "Your other sessions were signed out.",
      });
      setCurrent("");
      setPassword("");
      setConfirm("");
      setShowErrors(false);
      void qc.invalidateQueries({ queryKey: ["account", "sessions"] });
    } catch (err) {
      notifyError("Couldn't change your password", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Changing it signs you out on every other device.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} noValidate className="contents">
        <CardContent>
          <FieldGroup className="max-w-sm">
            {/* Lets password managers file the new password under the right account. */}
            <input type="text" autoComplete="username" value="" readOnly hidden />
            <Field data-invalid={(showErrors && !current) || undefined}>
              <FieldLabel htmlFor="current-password">Current password</FieldLabel>
              <PasswordInput
                id="current-password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                aria-invalid={(showErrors && !current) || undefined}
              />
            </Field>
            <NewPasswordFields
              idPrefix="new"
              label="New password"
              password={password}
              confirm={confirm}
              onPasswordChange={setPassword}
              onConfirmChange={setConfirm}
              errors={showErrors ? errors : undefined}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            Change password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function TwoFactorCard({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<"setup" | "disable" | "regenerate" | null>(null);
  const refreshMe = () => qc.invalidateQueries({ queryKey: ["me"] });
  const lowOnCodes = me.twoFactorEnabled && me.recoveryCodesRemaining <= 3;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Two-factor authentication
          {me.twoFactorEnabled ? <Badge>On</Badge> : <Badge variant="outline">Off</Badge>}
        </CardTitle>
        <CardDescription>
          {me.twoFactorEnabled
            ? "Signing in asks for a code from your authenticator app as well as your password."
            : "Protect your account with a code from an authenticator app (1Password, Google Authenticator, Authy…) on top of your password."}
        </CardDescription>
        <CardAction>
          {me.twoFactorEnabled ? (
            <Button variant="outline" onClick={() => setDialog("disable")}>
              <ShieldOff data-icon="inline-start" />
              Turn off
            </Button>
          ) : (
            <Button onClick={() => setDialog("setup")}>
              <ShieldCheck data-icon="inline-start" />
              Set up
            </Button>
          )}
        </CardAction>
      </CardHeader>
      {me.twoFactorEnabled && (
        <CardContent>
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>Recovery codes</ItemTitle>
              <ItemDescription>
                {me.recoveryCodesRemaining} of 10 left. Each gets you in once if you lose your phone.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant={lowOnCodes ? "default" : "outline"} size="sm" onClick={() => setDialog("regenerate")}>
                Get new codes
              </Button>
            </ItemActions>
          </Item>
        </CardContent>
      )}

      {dialog === "setup" && <TotpSetupDialog account={me.identity} onClose={() => setDialog(null)} onEnabled={refreshMe} />}
      {dialog === "disable" && <DisableTotpDialog onClose={() => setDialog(null)} onDisabled={refreshMe} />}
      {dialog === "regenerate" && <RegenerateCodesDialog onClose={() => setDialog(null)} onDone={refreshMe} />}
    </Card>
  );
}

function CodeInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  return (
    <InputOTP
      id={id}
      maxLength={6}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      value={value}
      onChange={onChange}
    >
      <InputOTPGroup className="*:data-[slot=input-otp-slot]:size-10 *:data-[slot=input-otp-slot]:text-base">
        {Array.from({ length: 6 }, (_, i) => (
          <InputOTPSlot key={i} index={i} aria-invalid={invalid || undefined} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}

/** Enrollment: scan the QR code, prove it works with one code, then save the recovery codes. */
function TotpSetupDialog({ account, onClose, onEnabled }: { account: string; onClose: () => void; onEnabled: () => void }) {
  const setup = useQuery({
    queryKey: ["account", "totp-setup"],
    queryFn: api.startTotpSetup,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.enableTotp(code);
      setRecoveryCodes(res.recoveryCodes);
      onEnabled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  if (recoveryCodes) {
    return (
      <RecoveryCodesDialog codes={recoveryCodes} account={account} title="Two-factor authentication is on" onClose={onClose} />
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleVerify} className="contents">
          <DialogHeader>
            <DialogTitle>Set up two-factor authentication</DialogTitle>
            <DialogDescription>Scan this with your authenticator app, then enter the 6-digit code it shows.</DialogDescription>
          </DialogHeader>
          {setup.isLoading && <Skeleton className="mx-auto size-48 rounded-lg" />}
          {setup.error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>{setup.error.message}</AlertDescription>
            </Alert>
          )}
          {setup.data && (
            <FieldGroup>
              {/* White backing keeps the code scannable in dark mode. */}
              <div className="mx-auto rounded-lg bg-white p-3 ring-1 ring-foreground/10">
                <QRCodeSVG value={setup.data.otpauthUrl} size={176} marginSize={0} title="QR code for your authenticator app" />
              </div>
              <Field>
                <FieldLabel>Can't scan it? Enter this key instead</FieldLabel>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all">
                    {setup.data.secret.replace(/(.{4})/g, "$1 ").trim()}
                  </code>
                  <CopyButton text={setup.data.secret} label="Copy key" />
                </div>
              </Field>
              <Field className="items-center" data-invalid={!!error || undefined}>
                <FieldLabel htmlFor="totp-setup-code" className="self-start">
                  Code from the app
                </FieldLabel>
                <CodeInput id="totp-setup-code" value={code} onChange={setCode} invalid={!!error} />
                {error && <FieldDescription className="self-start text-destructive">{error}</FieldDescription>}
              </Field>
            </FieldGroup>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose>
            <Button type="submit" disabled={busy || !setup.data || code.length !== 6}>
              {busy && <Spinner data-icon="inline-start" />}
              Turn on
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecoveryCodesDialog({
  codes,
  account,
  title,
  onClose,
}: {
  codes: string[];
  account: string;
  title: string;
  onClose: () => void;
}) {
  function download() {
    const text = `R2 Manager recovery codes for ${account}\nEach code works once.\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "r2-manager-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    // Closing only through the button, so the codes aren't dismissed by a stray click before they're saved.
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Save these recovery codes somewhere safe, like a password manager. If you lose your phone, each one signs you in once.
            This is the only time they're shown.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-muted p-4 font-mono text-sm tabular-nums">
          {codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <CopyButton text={codes.join("\n")} label="Copy" showLabel />
          <Button variant="outline" size="sm" onClick={download}>
            <Download data-icon="inline-start" />
            Download
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>I've saved them</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisableTotpDialog({ onClose, onDisabled }: { onClose: () => void; onDisabled: () => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.disableTotp(password, code);
      toast.add({
        status: "success",
        title: "Two-factor authentication is off",
      });
      onDisabled();
      onClose();
    } catch (err) {
      notifyError("Couldn't turn off two-factor authentication", err);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Turn off two-factor authentication?</DialogTitle>
            <DialogDescription>Your password alone will get into your account. Confirm with both.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="disable-password">Password</FieldLabel>
              <PasswordInput
                id="disable-password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="disable-code">Code from your authenticator app</FieldLabel>
              <CodeInput id="disable-code" value={code} onChange={setCode} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose>
            <Button type="submit" variant="destructive" disabled={busy || !password || code.length !== 6}>
              {busy && <Spinner data-icon="inline-start" />}
              Turn off
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RegenerateCodesDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { data: me } = useMe();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await api.regenerateRecoveryCodes(password);
      setCodes(res.recoveryCodes);
      onDone();
    } catch (err) {
      notifyError("Couldn't create new codes", err);
    } finally {
      setBusy(false);
    }
  }

  if (codes)
    return <RecoveryCodesDialog codes={codes} account={me?.identity ?? ""} title="New recovery codes" onClose={onClose} />;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Get new recovery codes?</DialogTitle>
            <DialogDescription>Your current codes stop working as soon as the new ones are made.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="regen-password">Password</FieldLabel>
            <PasswordInput
              id="regen-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose>
            <Button type="submit" disabled={busy || !password}>
              {busy && <Spinner data-icon="inline-start" />}
              Get new codes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CopyButton({ text, label, showLabel }: { text: string; label: string; showLabel?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notifyError("Couldn't copy to the clipboard");
    }
  }
  const Icon = copied ? Check : Copy;
  return showLabel ? (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      <Icon data-icon="inline-start" />
      {copied ? "Copied" : label}
    </Button>
  ) : (
    <Button type="button" variant="outline" size="icon-sm" aria-label={label} onClick={copy}>
      <Icon />
    </Button>
  );
}

/** "Chrome on Windows" from a user agent string. Rough on purpose: it only has to be recognizable. */
function describeUserAgent(ua: string | null): {
  label: string;
  mobile: boolean;
} {
  if (!ua) return { label: "Unknown device", mobile: false };
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return {
    label: os ? `${browser} on ${os}` : browser,
    mobile: /Mobi|iPhone|Android/.test(ua),
  };
}

function SessionsCard() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading } = useQuery({
    queryKey: ["account", "sessions"],
    queryFn: api.listSessions,
  });
  const sessions = data?.sessions ?? [];
  const others = sessions.filter((s) => !s.current).length;

  async function revokeOthers() {
    const ok = await confirm({
      title: "Sign out everywhere else?",
      description: `${others} other ${others === 1 ? "session" : "sessions"} will need to sign in again.`,
      confirmLabel: "Sign out others",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.revokeOtherSessions();
      toast.add({ status: "success", title: "Signed out of other sessions" });
    } catch (err) {
      notifyError("Couldn't sign out other sessions", err);
    }
    void qc.invalidateQueries({ queryKey: ["account", "sessions"] });
  }

  async function revoke(id: string) {
    try {
      await api.revokeSession(id);
    } catch (err) {
      notifyError("Couldn't sign out that session", err);
    }
    void qc.invalidateQueries({ queryKey: ["account", "sessions"] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where you're signed in</CardTitle>
        <CardDescription>Sessions end after a day without activity, and after a week at most.</CardDescription>
        {others > 0 && (
          <CardAction>
            <Button variant="outline" onClick={revokeOthers}>
              <LogOut data-icon="inline-start" />
              Sign out others
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : (
          <ItemGroup className="gap-2">
            {sessions.map((s) => {
              const device = describeUserAgent(s.userAgent);
              const Icon = device.mobile ? Smartphone : Laptop;
              return (
                <Item key={s.id} variant="outline" size="sm">
                  <ItemMedia variant="icon">
                    <Icon />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>
                      {device.label}
                      {s.current && <Badge variant="secondary">This device</Badge>}
                    </ItemTitle>
                    <ItemDescription>
                      {s.ip && s.ip !== "unknown" ? `${s.ip} · ` : ""}
                      {s.current ? "Active now" : <RelativeTime value={s.lastSeenAt} prefix="Active" />}
                    </ItemDescription>
                  </ItemContent>
                  {!s.current && (
                    <ItemActions>
                      <Button variant="ghost" size="sm" onClick={() => revoke(s.id)}>
                        Sign out
                      </Button>
                    </ItemActions>
                  )}
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
