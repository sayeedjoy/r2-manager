import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** MAIL-04: inbox listing. Attachment preview/download reuses the same content viewer as ordinary files. */
export function InboxPage() {
  const { data, isLoading } = useQuery({ queryKey: ["mail", "messages"], queryFn: api.listMailMessages });

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-medium">Inbox</h1>
      {isLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
      {data && data.messages.length === 0 && <div className="text-sm text-muted-foreground">No messages yet.</div>}
      {data && data.messages.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sender</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.messages.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell>{m.sender}</TableCell>
                <TableCell>{m.recipient}</TableCell>
                <TableCell>{m.subject ?? "—"}</TableCell>
                <TableCell>{new Date(m.receivedAt).toLocaleString()}</TableCell>
                <TableCell>{m.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
