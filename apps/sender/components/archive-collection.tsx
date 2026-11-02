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
import { ArchiveIcon } from "lucide-react";
import { useTransition } from "react";

import { archiveCollectionAction } from "@/app/(member)/collections/actions";

/** Archive, never delete: gifts already sent from the collection still need it. */
export function ArchiveCollection({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  function archive() {
    start(async () => {
      const result = await archiveCollectionAction(id);
      if (result.ok) toast.success(`${name} archived`);
      else toast.error(result.message);
    });
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={pending}>
          <ArchiveIcon /> Archive
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            No one in your company can send it any more. People who already received a gift from it can still choose theirs.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={archive}>Archive</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
