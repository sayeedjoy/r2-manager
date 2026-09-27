import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** PREV-01: minimal CSV parsing (no quoted-comma support) just for a readable preview table. */
function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .slice(0, 500) // NFR-06-style bound: preview loaded rows, don't try to render huge files
    .map((line) => line.split(","));
}

export function CsvTable({ text }: { text: string }) {
  const rows = parseCsv(text);
  if (rows.length === 0) return <div className="p-4 text-sm text-muted-foreground">Empty file.</div>;
  const [header, ...body] = rows;

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {header.map((cell, i) => (
              <TableHead key={i}>{cell}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {body.map((row, i) => (
            <TableRow key={i}>
              {row.map((cell, j) => (
                <TableCell key={j}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
