import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@r2-manager/shared";

export interface NewPasswordErrors {
  password?: string;
  confirm?: string;
}

/** Mirrors the server's passwordSchema, plus the confirmation match only the form can check. */
export function validateNewPassword(password: string, confirm: string): NewPasswordErrors {
  const errors: NewPasswordErrors = {};
  if (password.length < PASSWORD_MIN_LENGTH) errors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  else if (password.length > PASSWORD_MAX_LENGTH) errors.password = `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  if (confirm !== password) errors.confirm = "The passwords don't match.";
  return errors;
}
