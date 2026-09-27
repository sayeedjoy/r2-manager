import { Link } from "react-router-dom";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export function NotFoundPage() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileQuestion />
        </EmptyMedia>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>This address doesn't match anything in R2 Manager.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button render={<Link to="/" />}>Go to your files</Button>
      </EmptyContent>
    </Empty>
  );
}
