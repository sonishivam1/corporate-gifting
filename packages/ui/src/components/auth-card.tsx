import type { ReactNode } from "react";

import { Wordmark } from "@gifting/ui/components/app-shell";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@gifting/ui/components/card";

/** The frame for register, sign-in and email pages: the wordmark over one card. */
function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-muted px-4 py-12">
      <Wordmark />
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="font-heading text-xl">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        {children ? <CardContent>{children}</CardContent> : null}
        {footer ? <CardFooter className="justify-center text-center text-sm text-muted-foreground">{footer}</CardFooter> : null}
      </Card>
    </main>
  );
}

export { AuthCard };
