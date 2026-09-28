import { PASSWORD_MIN_LENGTH } from "@r2-manager/shared";
import type { NewPasswordErrors } from "@/lib/password";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { PasswordInput } from "./password-input";

interface NewPasswordFieldsProps {
  idPrefix: string;
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  /** Only shown after a submit attempt, so people aren't scolded while still typing. */
  errors?: NewPasswordErrors;
  label?: string;
  autoFocus?: boolean;
}

/** "New password" and "Confirm password", with the length rule spelled out up front. */
export function NewPasswordFields({
  idPrefix,
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  errors,
  label = "Password",
  autoFocus,
}: NewPasswordFieldsProps) {
  return (
    <>
      <Field data-invalid={!!errors?.password || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-password`}>{label}</FieldLabel>
        <PasswordInput
          id={`${idPrefix}-password`}
          autoComplete="new-password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          aria-invalid={!!errors?.password || undefined}
          autoFocus={autoFocus}
        />
        {errors?.password ? (
          <FieldError>{errors.password}</FieldError>
        ) : (
          <FieldDescription>At least {PASSWORD_MIN_LENGTH} characters. A few unrelated words make a strong one.</FieldDescription>
        )}
      </Field>
      <Field data-invalid={!!errors?.confirm || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-confirm`}>Confirm password</FieldLabel>
        <PasswordInput
          id={`${idPrefix}-confirm`}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
          aria-invalid={!!errors?.confirm || undefined}
        />
        {errors?.confirm && <FieldError>{errors.confirm}</FieldError>}
      </Field>
    </>
  );
}
