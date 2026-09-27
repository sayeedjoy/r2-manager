import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

/** ADMIN-01: audit trail. */
export function AdminAuditPage() {
  const { data } = useQuery({ queryKey: ["admin", "audit"], queryFn: api.getAudit });

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-medium">Audit log</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>Correlation ID</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.events.map((e) => (
            <TableRow key={e.id}>
              <TableCell>{new Date(e.createdAt).toLocaleString()}</TableCell>
              <TableCell>{e.action}</TableCell>
              <TableCell>{e.target ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={e.outcome === "success" ? "default" : "destructive"}>{e.outcome}</Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">{e.correlationId}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
