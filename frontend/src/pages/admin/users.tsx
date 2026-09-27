import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";

/** Admin user management: identities, roles, and bucket/prefix grants (AUTH-06). */
export function AdminUsersPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "users"], queryFn: api.listUsers });
  const [identity, setIdentity] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("viewer");

  async function handleAdd() {
    if (!identity.trim() || !displayName.trim()) return;
    await api.upsertUser({ identity: identity.trim(), displayName: displayName.trim(), role, grants: [] });
    setIdentity("");
    setDisplayName("");
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
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
          <NativeSelect id="role" value={role} onChange={(e) => setRole(e.target.value)}>
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.users.map((u: any) => (
            <TableRow key={u.id}>
              <TableCell>{u.identity}</TableCell>
              <TableCell>{u.displayName}</TableCell>
              <TableCell>{u.role}</TableCell>
              <TableCell>{u.status}</TableCell>
              <TableCell>
                {u.grants.length === 0 ? "(admin / none)" : u.grants.map((g: any) => `${g.bucket}/${g.prefix}`).join(", ")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
