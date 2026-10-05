import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, FlaskConical } from "lucide-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { usesPasswordLogin, type AuthStatus } from "@r2-manager/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { AuthLayout } from "@/components/auth/auth-layout";
import { PasswordInput } from "@/components/auth/password-input";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { api } from "@/lib/api";
import { safeNextPath } from "@/lib/sign-out";

/** AUTH-02: email + password sign-in, then a 2FA code for accounts that have it on. */
export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: status, isLoading } = useAuthStatus();
  const [step, setStep] = useState<"password" | "mfa">("password");
  const next = safeNextPath(params.get("next"));

  if (isLoading) return null;
  if (status?.setupRequired) return <Navigate to="/setup" replace />;
  if (status && !usesPasswordLogin(status.authMode)) return <Navigate to="/" replace />;

  // Drop everything cached while signed out (notably the failed /me) so the app starts fresh.
  const finish = () => {
    qc.clear();
    navigate(next, { replace: true });
  };

  if (step === "mfa") {
    return <MfaStep onDone={finish} onRestart={() => setStep("password")} />;
  }

  return (
    <AuthLayout
      title="Sign in"
      description={
        status?.demoLogin
          ? "This is a read-only demo. Sign in with the demo account below."
          : "Use the email and password for your R2 Manager account."
      }
    >
      <PasswordStep
        signedOut={params.has("signedOut")}
        resetAvailable={!!status?.passwordResetAvailable}
        demoLogin={status?.demoLogin}
        onMfaRequired={() => setStep("mfa")}
        onDone={finish}
      />
    </AuthLayout>
  );
}

function PasswordStep({
  signedOut,
  resetAvailable,
  demoLogin,
  onMfaRequired,
  onDone,
}: {
  signedOut: boolean;
  resetAvailable: boolean;
  /** DEMO_MODE: the public demo account, shown above the form and filled in to start with. */
  demoLogin?: AuthStatus["demoLogin"];
  onMfaRequired: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState(demoLogin?.email ?? "");
  const [password, setPassword] = useState(demoLogin?.password ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { mfaRequired } = await api.login(email.trim(), password);
      if (mfaRequired) onMfaRequired();
      else onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in");
      setPassword(demoLogin?.password ?? "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        {signedOut && !error && (
          <Alert>
            <CircleCheck />
            <AlertDescription>You're signed out.</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {demoLogin && (
          <Alert>
            <FlaskConical />
            <AlertTitle>Demo account</AlertTitle>
            <AlertDescription>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3">
                <dt>Email</dt>
                <dd className="font-mono break-all text-foreground select-all">{demoLogin.email}</dd>
                <dt>Password</dt>
                <dd className="font-mono break-all text-foreground select-all">{demoLogin.password}</dd>
              </dl>
            </AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="login-email">Email</FieldLabel>
          <Input
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="login-password">Password</FieldLabel>
            {resetAvailable && (
              <Link
                to="/forgot-password"
                className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot password?
              </Link>
            )}
          </div>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {!resetAvailable && !demoLogin && (
            <FieldDescription>Forgot it? Ask an administrator to reset it for you.</FieldDescription>
          )}
        </Field>
        <Button type="submit" disabled={busy || !email.trim() || !password}>
          {busy && <Spinner data-icon="inline-start" />}
          Sign in
        </Button>
      </FieldGroup>
    </form>
  );
}

function MfaStep({ onDone, onRestart }: { onDone: () => void; onRestart: () => void }) {
  const [mode, setMode] = useState<"code" | "recovery">("code");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(body: { code: string } | { recoveryCode: string }) {
    setError(null);
    setBusy(true);
    try {
      await api.verifyLogin(body);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't verify the code");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === "code" && code.length === 6) void submit({ code });
    if (mode === "recovery" && recoveryCode.trim()) void submit({ recoveryCode: recoveryCode.trim() });
  }

  return (
    <AuthLayout
      title="Two-factor authentication"
      description={
        mode === "code"
          ? "Enter the 6-digit code from your authenticator app."
          : "Enter one of the recovery codes you saved when you turned on two-factor authentication. Each works once."
      }
      footer={
        <button type="button" className="underline-offset-4 hover:text-foreground hover:underline" onClick={onRestart}>
          Sign in as someone else
        </button>
      }
    >
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {mode === "code" ? (
            <Field className="items-center">
              <FieldLabel htmlFor="mfa-code" className="sr-only">
                Authentication code
              </FieldLabel>
              <InputOTP
                id="mfa-code"
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={setCode}
                // Submitting as soon as the sixth digit lands saves a click; the button still works too.
                onComplete={(value: string) => void submit({ code: value })}
                disabled={busy}
                autoFocus
              >
                <InputOTPGroup className="*:data-[slot=input-otp-slot]:size-10 *:data-[slot=input-otp-slot]:text-base">
                  {Array.from({ length: 6 }, (_, i) => (
                    <InputOTPSlot key={i} index={i} aria-invalid={!!error || undefined} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="mfa-recovery">Recovery code</FieldLabel>
              <Input
                id="mfa-recovery"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                placeholder="XXXXX-XXXXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="font-mono"
                autoFocus
              />
            </Field>
          )}
          <Button type="submit" disabled={busy || (mode === "code" ? code.length !== 6 : !recoveryCode.trim())}>
            {busy && <Spinner data-icon="inline-start" />}
            Verify
          </Button>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            onClick={() => {
              setMode(mode === "code" ? "recovery" : "code");
              setError(null);
            }}
          >
            {mode === "code" ? "Use a recovery code instead" : "Use your authenticator app instead"}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
