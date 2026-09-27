import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Role, UserRecord } from "@r2-manager/shared";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";

interface Grant {
  bucket: string;
  prefix: string;
}

/** Admin user management: identities, roles, and bucket/prefix grants (AUTH-06). */
export function AdminUsersPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "users"], queryFn: api.listUsers });
  const [identity, setIdentity] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [manageUser, setManageUser] = useState<UserRecord | null>(null);
  const confirm = useConfirm();

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
  }

  async function handleAdd() {
    if (!identity.trim() || !displayName.trim()) return;
    await api.upsertUser({ identity: identity.trim(), displayName: displayName.trim(), role, grants: [] });
    setIdentity("");
    setDisplayName("");
    refresh();
  }

  async function handleDisable(id: string, identity: string) {
    const ok = await confirm({
      title: `Disable ${identity}?`,
      description: "They lose access immediately. Their audit history is kept.",
      confirmLabel: "Disable",
      destructive: true,
    });
    if (!ok) return;
    await api.disableUser(id);
    refresh();
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-lg font-medium">Users</h1>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="identity">Identity (email / username)</Label>
          <Input id="identity" value={identity} onChange={(e) => setIdentity(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="role">Role</Label>
          <NativeSelect id="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </NativeSelect>
        </div>
        <Button onClick={handleAdd}>Add / update user</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Identity</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Grants</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.identity}</TableCell>
              <TableCell>{u.displayName}</TableCell>
              <TableCell>{u.role}</TableCell>
              <TableCell>
                <Badge variant={u.status === "active" ? "default" : "destructive"}>{u.status}</Badge>
              </TableCell>
              <TableCell>
                {u.role === "admin"
                  ? "(all configured buckets)"
                  : u.grants.length === 0
                    ? "—"
                    : u.grants.map((g: Grant) => `${g.bucket}/${g.prefix}`).join(", ")}
              </TableCell>
              <TableCell className="flex gap-1">
                <Button variant="ghost" size="icon" aria-label={`Manage grants for ${u.identity}`} onClick={() => setManageUser(u)}>
                  <Settings2 className="size-4" />
                </Button>
                {u.status === "active" && (
                  <Button variant="ghost" size="icon" aria-label={`Disable ${u.identity}`} onClick={() => handleDisable(u.id, u.identity)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {manageUser && (
        <GrantsDialog
          user={manageUser}
          onClose={() => setManageUser(null)}
          onSaved={() => {
            setManageUser(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function GrantsDialog({ user, onClose, onSaved }: { user: UserRecord; onClose: () => void; onSaved: () => void }) {
  const [grants, setGrants] = useState<Grant[]>(user.grants ?? []);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    try {
      await api.upsertUser({
        identity: user.identity,
        displayName: user.displayName,
        role: user.role,
        grants: grants.filter((g) => g.bucket.trim()),
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grants for {user.identity}</DialogTitle>
        </DialogHeader>

        {user.role === "admin" ? (
          <p className="text-sm text-muted-foreground">Admins have access to every configured bucket; grants don't apply.</p>
        ) : (
          <div className="space-y-2">
            {grants.map((g, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="bucket"
                  value={g.bucket}
                  onChange={(e) => setGrants((prev) => prev.map((row, j) => (j === i ? { ...row, bucket: e.target.value } : row)))}
                />
                <Input
                  placeholder="prefix (blank = whole bucket)"
                  value={g.prefix}
                  onChange={(e) => setGrants((prev) => prev.map((row, j) => (j === i ? { ...row, prefix: e.target.value } : row)))}
                />
                <Button variant="ghost" size="icon" aria-label="Remove grant" onClick={() => setGrants((prev) => prev.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setGrants((prev) => [...prev, { bucket: "", prefix: "" }])}>
              <Plus className="mr-1 size-4" /> Add grant
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {user.role !== "admin" && (
            <Button onClick={handleSave} disabled={busy}>
              Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
