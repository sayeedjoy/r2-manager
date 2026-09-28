import type { ReactNode } from "react";
import { HardDrive } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthLayoutProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Small print under the card, e.g. a link back to sign-in. */
  footer?: ReactNode;
}

/** The centered card every signed-out screen (sign-in, setup, password reset) shares. */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4 md:p-8">
      <div className="flex items-center gap-2 font-semibold">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <HardDrive className="size-4" />
        </div>
        R2 Manager
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
    </main>
  );
}
