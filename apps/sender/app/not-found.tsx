import { Button } from "@gifting/ui/components/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@gifting/ui/components/empty";
import Link from "next/link";

export default function NotFound() {
  return (
    <Empty className="mt-8">
      <EmptyHeader>
        <EmptyTitle>Not found</EmptyTitle>
        <EmptyDescription>It may belong to another team, or it no longer exists.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <Link href="/campaigns">All campaigns</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
