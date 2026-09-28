import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { usesPasswordLogin } from "@r2-manager/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { AuthLayout } from "@/components/auth/auth-layout";
import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { validateNewPassword } from "@/lib/password";
import { PasswordInput } from "@/components/auth/password-input";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { api } from "@/lib/api";

/**
 * First run: registers the first administrator. The server only accepts this while no admin exists, then closes
 * it for good; later accounts are added under Admin > Users.
 */
export function SetupPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: status, isLoading } = useAuthStatus();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading || !status) return null;
  if (!status.setupRequired) return <Navigate to={usesPasswordLogin(status.authMode) ? "/login" : "/"} replace />;

  // In "access" and "both" modes the email is whatever Cloudflare Access signed this browser in as.
  const askEmail = status.authMode === "password";
  const askPassword = usesPasswordLogin(status.authMode);
  const passwordErrors = askPassword ? validateNewPassword(password, confirm) : {};
  const invalid =
    !displayName.trim() ||
    (askEmail && !email.trim()) ||
    Object.keys(passwordErrors).length > 0 ||
    (status.setupTokenRequired && !setupToken);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (invalid) {
      setShowErrors(true);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.setup({
        displayName: displayName.trim(),
        email: askEmail ? email.trim() : undefined,
        password: askPassword ? password : undefined,
        setupToken: status!.setupTokenRequired ? setupToken : undefined,
      });
      qc.clear();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create the admin account"
      description={
        askEmail
          ? "Welcome. This first account manages everything else: users, settings and email delivery."
          : "Welcome. You'll be the administrator, signed in as your Cloudflare Access email."
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <FieldGroup>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor="setup-name">Your name</FieldLabel>
            <Input
              id="setup-name"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              aria-invalid={(showErrors && !displayName.trim()) || undefined}
              autoFocus
            />
          </Field>
          {askEmail && (
            <Field>
              <FieldLabel htmlFor="setup-email">Email</FieldLabel>
              <Input
                id="setup-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={(showErrors && !email.trim()) || undefined}
              />
              <FieldDescription>You'll sign in with this, and password reset links go here.</FieldDescription>
            </Field>
          )}
          {askPassword && (
            <NewPasswordFields
              idPrefix="setup"
              password={password}
              confirm={confirm}
              onPasswordChange={setPassword}
              onConfirmChange={setConfirm}
              errors={showErrors ? passwordErrors : undefined}
            />
          )}
          {status.setupTokenRequired && (
            <Field>
              <FieldLabel htmlFor="setup-token">Setup token</FieldLabel>
              <PasswordInput
                id="setup-token"
                autoComplete="off"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                aria-invalid={(showErrors && !setupToken) || undefined}
              />
              <FieldDescription>The SETUP_TOKEN value from this deployment's environment.</FieldDescription>
            </Field>
          )}
          <Button type="submit" disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            Create account
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
