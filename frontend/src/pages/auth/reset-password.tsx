import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CircleAlert, CircleCheck, Link2Off } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { AuthLayout } from "@/components/auth/auth-layout";
import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { validateNewPassword } from "@/lib/password";
import { api } from "@/lib/api";

/** Reset and invite links carry their token in the URL fragment (#token=...), which never reaches the server's logs. */
function readLinkParams(): { token: string | null; invite: boolean } {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return { token: params.get("token"), invite: params.get("invite") === "1" };
}

/** Where emailed password reset and invite links land. */
export function ResetPasswordPage() {
  const [{ token, invite }] = useState(readLinkParams);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  // Take the token out of the address bar so it doesn't linger in history or end up in a screenshot.
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const errors = validateNewPassword(password, confirm);
  const title = invite ? "Set your password" : "Choose a new password";

  if (!token) {
    return (
      <AuthLayout title={title}>
        <Empty className="p-0 md:p-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Link2Off />
            </EmptyMedia>
            <EmptyTitle>This link is incomplete</EmptyTitle>
            <EmptyDescription>Open the link from your email again, or ask for a new one.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" render={<Link to="/forgot-password" />}>
              Get a new link
            </Button>
          </EmptyContent>
        </Empty>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title={invite ? "You're all set" : "Password changed"}>
        <FieldGroup>
          <Alert>
            <CircleCheck />
            <AlertDescription>
              {invite ? "Your password is set." : "Your password was changed and you were signed out everywhere else."} Sign in
              with it now.
            </AlertDescription>
          </Alert>
          <Button render={<Link to="/login" replace />}>Sign in</Button>
        </FieldGroup>
      </AuthLayout>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.resetPassword(token!, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't set the password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={title}
      description={invite ? "Choose a password to finish setting up your account." : undefined}
      footer={
        <Link to="/login" className="underline-offset-4 hover:text-foreground hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <FieldGroup>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>
                {error}
                {/expired|invalid/i.test(error) && (
                  <>
                    {" "}
                    <Link to="/forgot-password">Get a new link</Link>.
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}
          <NewPasswordFields
            idPrefix="reset"
            label="New password"
            password={password}
            confirm={confirm}
            onPasswordChange={setPassword}
            onConfirmChange={setConfirm}
            errors={showErrors ? errors : undefined}
            autoFocus
          />
          <Button type="submit" disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            {invite ? "Set password" : "Change password"}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
