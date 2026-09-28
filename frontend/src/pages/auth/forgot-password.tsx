import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CircleAlert, MailCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { AuthLayout } from "@/components/auth/auth-layout";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { api } from "@/lib/api";

const backToSignIn = (
  <Link to="/login" className="underline-offset-4 hover:text-foreground hover:underline">
    Back to sign in
  </Link>
);

/** Asks for a reset link. The answer is the same whether or not the email has an account. */
export function ForgotPasswordPage() {
  const { data: status } = useAuthStatus();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the email");
    } finally {
      setBusy(false);
    }
  }

  if (status && !status.passwordResetAvailable) {
    return (
      <AuthLayout title="Reset your password" footer={backToSignIn}>
        <p className="text-sm text-muted-foreground">
          This deployment can't send email yet, so reset links aren't available. Ask an administrator to set a new password for
          you.
        </p>
      </AuthLayout>
    );
  }

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" footer={backToSignIn}>
        <Empty className="p-0 md:p-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MailCheck />
            </EmptyMedia>
            <EmptyTitle className="sr-only">Check your email</EmptyTitle>
            <EmptyDescription>
              If <span className="font-medium text-foreground">{sentTo}</span> has an account, a reset link is on its way. It
              expires in an hour. Check your spam folder if it doesn't arrive in a few minutes.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your account's email and we'll send you a link to choose a new password."
      footer={backToSignIn}
    >
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor="forgot-email">Email</FieldLabel>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Button type="submit" disabled={busy || !email.trim()}>
            {busy && <Spinner data-icon="inline-start" />}
            Send reset link
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
