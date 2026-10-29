"use client";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@gifting/ui/components/alert";
import { Button } from "@gifting/ui/components/button";
import { CircleAlertIcon } from "lucide-react";

// Server errors reach the browser without their message in production, so this stays generic.
export default function PageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Alert variant="destructive" className="mt-8">
      <CircleAlertIcon />
      <AlertTitle>This page couldn&apos;t load</AlertTitle>
      <AlertDescription>The Gifting API or the database didn&apos;t answer. Check that both are running, then try again.</AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline" onClick={reset}>
          Try again
        </Button>
      </AlertAction>
    </Alert>
  );
}
