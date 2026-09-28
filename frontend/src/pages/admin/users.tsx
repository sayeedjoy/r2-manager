import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  Plus,
  ShieldOff,
  Trash2,
  TriangleAlert,
  UserPen,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { ROLES, usesPasswordLogin, type Role, type UserRecord } from "@r2-manager/shared";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { TableCard, TableSkeleton } from "@/components/layout/table-card";
import { useConfirm } from "@/components/confirm-dialog";
import { api } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { notifyError } from "@/lib/notify";
import { useBuckets } from "@/hooks/use-listing";
import { useMe } from "@/hooks/use-me";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { validateNewPassword } from "@/lib/password";
import { toast } from "@/components/toaster";

type Grant = UserRecord["grants"][number];

const ROLE_DETAILS: Record<Role, string> = {
  admin: "Everything, including users, settings and the audit log. Grants don't apply.",
  editor: "Upload, edit, move, delete and share within their granted buckets, and read mail.",
  viewer: "Browse, preview and download within their granted buckets.",
};

function initials(name: string): string {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Admin user management: identities, roles, and bucket/prefix grants (AUTH-06). */
export function AdminUsersPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: me } = useMe();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["admin", "users"], queryFn: api.listUsers });
  const { data: authStatus } = useAuthStatus();
  const [editing, setEditing] = useState<UserRecord | "new" | null>(null);
  const [managingAccess, setManagingAccess] = useState<UserRecord | null>(null);
  const [settingPassword, setSettingPassword] = useState<UserRecord | null>(null);
  const passwordLogin = !!me && usesPasswordLogin(me.authMode);

  const users = data?.users ?? [];
  const disabledCount = users.filter((u) => u.status === "disabled").length;

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
  }

  async function handleDisable(user: UserRecord) {
    const ok = await confirm({
      title: `Disable ${user.identity}?`,
      description: "They lose access immediately. Their audit history is kept.",
      confirmLabel: "Disable",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.disableUser(user.id);
    } catch (err) {
      notifyError("Couldn't disable the user", err);
    }
    refresh();
  }

  async function handleSendReset(user: UserRecord) {
    try {
      const res = await api.sendUserPasswordReset(user.id);
      toast.add({
        status: "success",
        title: res.purpose === "invite" ? "Invite sent" : "Reset link sent",
        description: `Emailed to ${user.identity}.`,
      });
    } catch (err) {
      notifyError("Couldn't send the email", err);
    }
  }

  async function handleDisableTotp(user: UserRecord) {
    const ok = await confirm({
      title: `Turn off two-factor authentication for ${user.identity}?`,
      description:
        "Only do this if they've lost their authenticator and recovery codes. Their password alone signs them in until they set it up again.",
      confirmLabel: "Turn off",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.disableUserTotp(user.id);
      toast.add({ status: "success", title: "Two-factor authentication turned off" });
    } catch (err) {
      notifyError("Couldn't turn off two-factor authentication", err);
    }
    refresh();
  }

  let content;
  if (isLoading) {
    content = (
      <TableCard>
        <TableSkeleton rows={4} />
      </TableCard>
    );
  } else if (error) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Couldn't load users</EmptyTitle>
          <EmptyDescription>{error.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else if (users.length === 0) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle>No users</EmptyTitle>
          <EmptyDescription>Add the people who should be able to sign in.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = (
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Access</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={u.status === "disabled" ? "text-muted-foreground" : undefined}>
                <TableCell className="w-full max-w-0 sm:w-auto sm:max-w-72">
                  <div className="flex items-center gap-3">
                    <Avatar size="sm">
                      <AvatarFallback>{initials(u.displayName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {u.displayName}
                        {u.id === me?.id && <span className="font-normal text-muted-foreground"> (you)</span>}
                      </span>
                      {u.identity !== u.displayName && <span className="truncate text-xs text-muted-foreground">{u.identity}</span>}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "default" : "outline"} className="capitalize">
                    {u.role}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <AccessSummary user={u} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant={u.status === "active" ? "secondary" : "destructive"} className="capitalize">
                      {u.status}
                    </Badge>
                    {passwordLogin && u.status === "active" && !u.hasPassword && <Badge variant="outline">No password yet</Badge>}
                    {u.twoFactorEnabled && <Badge variant="outline">2FA</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.identity}`} />}>
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => setEditing(u)}>
                          <UserPen />
                          Edit name and role
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setManagingAccess(u)} disabled={u.role === "admin"}>
                          <KeyRound />
                          Manage access
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      {/* Your own password and 2FA live under Account and security, behind a password check. */}
                      {passwordLogin && u.id !== me?.id && (
                        <DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setSettingPassword(u)}>
                            <LockKeyhole />
                            Set password
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSendReset(u)}
                            disabled={!authStatus?.passwordResetAvailable || u.status !== "active"}
                          >
                            <Mail />
                            {u.hasPassword ? "Email reset link" : "Email invite"}
                          </DropdownMenuItem>
                          {u.twoFactorEnabled && (
                            <DropdownMenuItem variant="destructive" onClick={() => handleDisableTotp(u)}>
                              <ShieldOff />
                              Turn off 2FA
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuGroup>
                      )}
                      {/* Hidden for yourself so an admin can't lock themselves out. */}
                      {u.status === "active" && u.id !== me?.id && (
                        <DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => handleDisable(u)}>
                            <UserX />
                            Disable
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Users"
        description={
          data
            ? `${pluralize(users.length, "user")}${disabledCount > 0 ? ` · ${disabledCount} disabled` : ""}. Roles set what people can do; grants set where.`
            : "Roles set what people can do; grants set where."
        }
        actions={
          <Button onClick={() => setEditing("new")}>
            <UserPlus data-icon="inline-start" />
            Add user
          </Button>
        }
      />

      {content}

      {editing && (
        <UserDialog
          user={editing === "new" ? null : editing}
          existing={users}
          passwordLogin={passwordLogin}
          canInvite={!!authStatus?.passwordResetAvailable}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {settingPassword && (
        <SetPasswordDialog
          user={settingPassword}
          onClose={() => setSettingPassword(null)}
          onSaved={() => {
            setSettingPassword(null);
            refresh();
          }}
        />
      )}

      {managingAccess && (
        <GrantsDialog
          user={managingAccess}
          onClose={() => setManagingAccess(null)}
          onSaved={() => {
            setManagingAccess(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AccessSummary({ user }: { user: UserRecord }) {
  if (user.role === "admin") return <span className="text-muted-foreground">All buckets</span>;
  if (user.grants.length === 0) return <span className="text-muted-foreground">No access yet</span>;

  const shown = user.grants.slice(0, 2);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((g) => (
        <Badge key={`${g.bucket}/${g.prefix}`} variant="outline" className="font-mono font-normal">
          {g.bucket}/{g.prefix}
        </Badge>
      ))}
      {user.grants.length > shown.length && <span className="text-xs text-muted-foreground">+{user.grants.length - shown.length} more</span>}
    </div>
  );
}

/**
 * Adds a user or edits one's name and role. The server's upsert replaces grants wholesale, so an existing user's
 * grants are sent back unchanged. Re-adding an identity used to wipe their access.
 */
function UserDialog({
  user,
  existing,
  passwordLogin,
  canInvite,
  onClose,
  onSaved,
}: {
  user: UserRecord | null;
  existing: UserRecord[];
  /** The app runs its own sign-in, so a new user needs a password or an invite. */
  passwordLogin: boolean;
  /** SMTP is set up, so an invite email can be sent. */
  canInvite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [identity, setIdentity] = useState(user?.identity ?? "");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "viewer");
  const [signIn, setSignIn] = useState<"invite" | "password">(canInvite ? "invite" : "password");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);

  const normalizedIdentity = identity.trim().toLowerCase();
  const match = user ?? existing.find((u) => u.identity === normalizedIdentity);
  // Only brand-new accounts get sign-in options here; existing ones use "Set password" or "Email reset link".
  const askSignIn = passwordLogin && !match;
  const passwordErrors = askSignIn && signIn === "password" ? validateNewPassword(password, confirm) : {};

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!identity.trim() || !displayName.trim()) return;
    if (Object.keys(passwordErrors).length > 0) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    try {
      await api.upsertUser({
        identity: normalizedIdentity,
        displayName: displayName.trim(),
        role,
        grants: match?.grants ?? [],
        password: askSignIn && signIn === "password" ? password : undefined,
        sendInvite: askSignIn && signIn === "invite" ? true : undefined,
      });
      if (askSignIn && signIn === "invite") {
        toast.add({ status: "success", title: "Invite sent", description: `Emailed to ${normalizedIdentity}.` });
      }
      onSaved();
    } catch (err) {
      notifyError("Couldn't save the user", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <form onSubmit={handleSubmit} className="contents" noValidate>
          <DialogHeader>
            <DialogTitle>{user ? "Edit user" : "Add user"}</DialogTitle>
            <DialogDescription>
              {user ? user.identity : "They can sign in once they're added. Grant bucket access afterwards."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {!user && (
              <Field>
                <FieldLabel htmlFor="user-identity">Email</FieldLabel>
                <Input
                  id="user-identity"
                  type="email"
                  value={identity}
                  onChange={(e) => {
                    setIdentity(e.target.value);
                    // Start from the existing user's role so re-adding them doesn't quietly change it.
                    const found = existing.find((u) => u.identity === e.target.value.trim().toLowerCase());
                    if (found) {
                      setRole(found.role);
                      setDisplayName((current) => current || found.displayName);
                    }
                  }}
                  placeholder="name@company.com"
                  autoComplete="off"
                  autoFocus
                />
                <FieldDescription>
                  {match
                    ? "This user already exists. Saving updates their name and role and keeps their access."
                    : passwordLogin
                      ? "They sign in with this email."
                      : "The email they sign in to Cloudflare Access with."}
                </FieldDescription>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="user-display-name">Display name</FieldLabel>
              <Input id="user-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="off" />
            </Field>
            <FieldSet>
              <FieldLegend variant="label">Role</FieldLegend>
              <RadioGroup value={role} onValueChange={(value) => setRole(value as Role)}>
                {ROLES.map((r) => (
                  <FieldLabel key={r} htmlFor={`role-${r}`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle className="capitalize">{r}</FieldTitle>
                        <FieldDescription>{ROLE_DETAILS[r]}</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={r} id={`role-${r}`} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </FieldSet>
            {askSignIn && (
              <FieldSet>
                <FieldLegend variant="label">How they'll sign in</FieldLegend>
                <RadioGroup value={signIn} onValueChange={(value) => setSignIn(value as "invite" | "password")}>
                  <FieldLabel htmlFor="signin-invite">
                    <Field orientation="horizontal" data-disabled={!canInvite || undefined}>
                      <FieldContent>
                        <FieldTitle>Email an invite</FieldTitle>
                        <FieldDescription>
                          {canInvite
                            ? "They get a link to choose their own password. It expires in 3 days."
                            : "Set up email delivery first, under Admin > Email delivery."}
                        </FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value="invite" id="signin-invite" disabled={!canInvite} />
                    </Field>
                  </FieldLabel>
                  <FieldLabel htmlFor="signin-password">
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>Set a password now</FieldTitle>
                        <FieldDescription>Share it with them yourself. They can change it under Account and security.</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value="password" id="signin-password" />
                    </Field>
                  </FieldLabel>
                </RadioGroup>
              </FieldSet>
            )}
            {askSignIn && signIn === "password" && (
              <NewPasswordFields
                idPrefix="user"
                password={password}
                confirm={confirm}
                onPasswordChange={setPassword}
                onConfirmChange={setConfirm}
                errors={showErrors ? passwordErrors : undefined}
              />
            )}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose>
            <Button type="submit" disabled={busy || !identity.trim() || !displayName.trim()}>
              {busy && <Spinner data-icon="inline-start" />}
              {user ? "Save" : "Add user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GrantsDialog({ user, onClose, onSaved }: { user: UserRecord; onClose: () => void; onSaved: () => void }) {
  const { data: bucketsData } = useBuckets();
  const buckets = bucketsData?.buckets ?? [];
  const [grants, setGrants] = useState<Grant[]>(user.grants);
  const [busy, setBusy] = useState(false);

  function updateGrant(index: number, patch: Partial<Grant>) {
    setGrants((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.upsertUser({
        identity: user.identity,
        displayName: user.displayName,
        role: user.role,
        grants: grants.filter((g) => g.bucket.trim()),
      });
      onSaved();
    } catch (err) {
      notifyError("Couldn't save access", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSave} className="contents">
          <DialogHeader>
            <DialogTitle>Manage access</DialogTitle>
            <DialogDescription>
              Buckets and folders {user.displayName} can reach as {user.role === "editor" ? "an editor" : "a viewer"}. Leave the
              folder blank to grant the whole bucket.
            </DialogDescription>
          </DialogHeader>

          <div className="no-scrollbar -mx-4 flex max-h-[60svh] flex-col gap-2 overflow-y-auto px-4">
            {grants.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No access yet. Add a bucket or folder below.
              </p>
            )}
            {grants.map((g, i) => (
              <div key={i} className="flex items-center gap-2">
                <NativeSelect
                  aria-label="Bucket"
                  className="w-28 shrink-0 sm:w-40"
                  value={g.bucket}
                  onChange={(e) => updateGrant(i, { bucket: e.target.value })}
                >
                  {/* Keep a grant for a bucket that's no longer configured visible instead of silently switching it. */}
                  {!buckets.includes(g.bucket) && <NativeSelectOption value={g.bucket}>{g.bucket || "Choose…"}</NativeSelectOption>}
                  {buckets.map((b) => (
                    <NativeSelectOption key={b} value={b}>
                      {b}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Input
                  aria-label="Folder"
                  placeholder="Whole bucket"
                  value={g.prefix}
                  onChange={(e) => updateGrant(i, { prefix: e.target.value })}
                  className="flex-1 font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove access to ${g.bucket}/${g.prefix}`}
                  onClick={() => setGrants((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setGrants((prev) => [...prev, { bucket: buckets[0] ?? "", prefix: "" }])}
            >
              <Plus data-icon="inline-start" />
              Add access
            </Button>
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              Save access
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Sets a user's password by hand (e.g. when email isn't set up) and signs them out everywhere. */
function SetPasswordDialog({ user, onClose, onSaved }: { user: UserRecord; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors = validateNewPassword(password, confirm);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    try {
      await api.setUserPassword(user.id, password);
      toast.add({ status: "success", title: "Password set", description: `${user.displayName} was signed out everywhere.` });
      onSaved();
    } catch (err) {
      notifyError("Couldn't set the password", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="contents" noValidate>
          <DialogHeader>
            <DialogTitle>Set password</DialogTitle>
            <DialogDescription>
              For {user.identity}. They're signed out everywhere and sign in with this next. Share it with them securely.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <NewPasswordFields
              idPrefix="admin-set"
              label="New password"
              password={password}
              confirm={confirm}
              onPasswordChange={setPassword}
              onConfirmChange={setConfirm}
              errors={showErrors ? errors : undefined}
              autoFocus
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              Set password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
