"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@gifting/ui/components/alert-dialog";
import { Button } from "@gifting/ui/components/button";
import { toast } from "@gifting/ui/lib/toast";
import { CheckIcon } from "lucide-react";
import { useTransition } from "react";

import { decideAction } from "@/app/(member)/campaigns/actions";

export function DecisionButtons({ campaignId, approveLabel }: { campaignId: string; approveLabel: string }) {
  const [pending, startTransition] = useTransition();

  const decide = (decision: "approve" | "decline") =>
    startTransition(async () => {
      const result = await decideAction(campaignId, decision);
      if (!result.ok) toast.error(result.message);
      else toast.success(decision === "approve" ? "Approved. The gifts are on their way." : "Declined. Nothing was held.");
    });

  return (
    <div className="flex gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" disabled={pending}>
            Decline
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this campaign?</AlertDialogTitle>
            <AlertDialogDescription>Every gift in it is cancelled. Nothing was held, so the budget doesn&apos;t change.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => decide("decline")}>Decline</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Button disabled={pending} onClick={() => decide("approve")}>
        <CheckIcon /> {approveLabel}
      </Button>
    </div>
  );
}
