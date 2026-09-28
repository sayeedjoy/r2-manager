import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** Where Basic Auth sign-out lands. It sits outside AppShell so it makes no API calls that would reopen the login prompt. */
export function SignedOutPage() {
  return (
    <main className="flex min-h-svh">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LogOut />
          </EmptyMedia>
          <EmptyTitle>You're signed out</EmptyTitle>
          <EmptyDescription>Your browser will ask for your username and password when you sign back in.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<a href="/" />}>Sign in again</Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
