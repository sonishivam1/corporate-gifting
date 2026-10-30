"use client";

import type { SubmitResultView } from "@gifting/domain";
import { Button } from "@gifting/ui/components/button";
import { Card, CardContent } from "@gifting/ui/components/card";
import { QrCode } from "@gifting/ui/components/qr-code";
import { toast } from "@gifting/ui/lib/toast";
import { CheckIcon, ClockIcon, CopyIcon, DownloadIcon } from "lucide-react";
import Link from "next/link";

import { money, plural, shortDate } from "@/lib/format";

function downloadLinks(links: SubmitResultView["links"], campaignId: string) {
  const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = ["recipient,link", ...links.map((l) => `${quote(l.recipientName)},${quote(l.url)}`)].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `gift-links-${campaignId}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export function Done({
  result,
  sendAt,
  channels,
  approverNames,
  onAnother,
}: {
  result: SubmitResultView;
  sendAt: string | null;
  channels: string;
  approverNames: string[];
  onAnother: () => void;
}) {
  const waiting = result.outcome === "pending_approval";
  const heading = waiting
    ? "Sent for approval"
    : result.outcome === "scheduled" && sendAt
      ? `${plural(result.gifts, "gift")} scheduled for ${shortDate(sendAt)}`
      : `${plural(result.gifts, "gift")} ${result.gifts === 1 ? "is" : "are"} on the way`;
  const first = result.links[0];

  return (
    <Card className="mx-auto mt-4 max-w-2xl">
      <CardContent className="grid gap-6 p-2 sm:p-4">
        <div
          className={
            waiting
              ? "flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
              : "flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground"
          }
        >
          {waiting ? <ClockIcon /> : <CheckIcon />}
        </div>
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold">{heading}</h1>
          <p className="text-muted-foreground">
            {waiting
              ? `${approverNames.join(" or ") || "An approver"} has a request to approve ${money(result.totalCents)}. The gifts go out as soon as it's approved.`
              : `Recipients hear from you by ${channels.toLowerCase()}. Opens and choices show up on the campaign page.`}
          </p>
        </div>

        {first ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="grid content-start gap-2">
              <h2 className="font-medium">Gift links</h2>
              <p className="text-sm text-muted-foreground">
                Each person has their own link. This is the only time you&apos;ll see them: we keep only a hash.
                {waiting ? " They work once the campaign is approved." : ""}
              </p>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2">
                <code className="min-w-0 flex-1 truncate text-xs">{first.url}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(first.url).then(() => toast.success(`Copied ${first.recipientName}'s link.`))}
                >
                  <CopyIcon /> Copy
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">For {first.recipientName}</span>
              <Button variant="outline" className="w-fit" onClick={() => downloadLinks(result.links, result.campaignId)}>
                <DownloadIcon /> Download all {plural(result.links.length, "link")} (CSV)
              </Button>
            </div>
            <div className="grid justify-items-center gap-1">
              <QrCode value={first.url} label={`QR code for ${first.recipientName}'s gift link`} />
              <span className="text-xs text-muted-foreground">{first.recipientName}</span>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/campaigns/${result.campaignId}`}>Track this campaign</Link>
          </Button>
          <Button variant="ghost" onClick={onAnother}>
            Send another
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
