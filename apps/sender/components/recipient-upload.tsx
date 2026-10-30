"use client";

import { MAX_UPLOAD_ROWS, parseRecipientCsv, type ParsedUpload, type RecipientImportView, UPLOAD_TEMPLATE, uploadRowName } from "@gifting/domain";
import { Alert, AlertDescription, AlertTitle } from "@gifting/ui/components/alert";
import { Button } from "@gifting/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@gifting/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@gifting/ui/components/field";
import { Input } from "@gifting/ui/components/input";
import { ScrollArea } from "@gifting/ui/components/scroll-area";
import { Spinner } from "@gifting/ui/components/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gifting/ui/components/table";
import { toast } from "@gifting/ui/lib/toast";
import { CircleAlertIcon, DownloadIcon, UploadIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { importRecipientsAction } from "@/app/(member)/campaigns/actions";
import { plural } from "@/lib/format";

const PREVIEW_ROWS = 5;
const SHOWN_PROBLEMS = 20;

/**
 * "Upload a list" on the recipients step (plan: recipient-upload.md). The
 * file is read here, in the browser, for an instant preview; only the valid
 * rows go to the API, which adds them to the company's directory.
 */
export function RecipientUpload({ onImported }: { onImported: (result: RecipientImportView) => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<{ name: string; parsed: ParsedUpload } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const tooMany = (file?.parsed.rows.length ?? 0) > MAX_UPLOAD_ROWS;
  const ready = file && !tooMany ? file.parsed.rows.length : 0;

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setFile(null);
      setError(null);
    }
  }

  async function choose(chosen: File | undefined) {
    setError(null);
    if (!chosen) return setFile(null);
    if (!/\.csv$/i.test(chosen.name)) {
      setFile(null);
      return setError("Choose a .csv file. In Excel or Google Sheets, use Save as or Download as CSV.");
    }
    setFile({ name: chosen.name, parsed: parseRecipientCsv(await chosen.text()) });
  }

  function confirm() {
    if (!file || !ready) return;
    startSaving(async () => {
      const result = await importRecipientsAction({ rows: file.parsed.rows });
      if (!result.ok) return setError(result.message);
      onImported(result.data);
      const { added, existing } = result.data;
      toast.success(`${plural(added + existing, "person", "people")} added to this campaign`, {
        description: existing ? `${added} new in your directory, ${existing} already there.` : `${added} new in your directory.`,
      });
      reset(false);
    });
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(UPLOAD_TEMPLATE)}`;

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UploadIcon /> Upload a list
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload a list of recipients</DialogTitle>
          <DialogDescription>
            A CSV file with an email column, and first and last names if you have them. Everyone joins your company&apos;s directory and
            is added to this campaign.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Button asChild variant="link" size="sm" className="justify-self-start px-0">
            <a href={templateHref} download="recipients-template.csv">
              <DownloadIcon /> Download the template
            </a>
          </Button>
          <Field>
            <FieldLabel htmlFor="recipient-file">File</FieldLabel>
            <Input id="recipient-file" type="file" accept=".csv,text/csv" onChange={(e) => void choose(e.target.files?.[0])} />
            <FieldDescription>Up to {MAX_UPLOAD_ROWS} people. Excel and Google Sheets can save as CSV.</FieldDescription>
          </Field>

          {file ? <UploadPreview parsed={file.parsed} /> : null}

          {error ? (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>That didn&apos;t work</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => reset(false)}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!ready || saving}>
            {saving ? <Spinner /> : null}
            {ready ? `Add ${plural(ready, "person", "people")}` : "Add people"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadPreview({ parsed }: { parsed: ParsedUpload }) {
  const { rows, problems } = parsed;
  return (
    <div className="grid gap-3">
      <p className="text-sm" aria-live="polite">
        <span className="font-medium">{plural(rows.length, "person", "people")} ready</span>
        {problems.length ? <span className="text-muted-foreground"> · {plural(problems.length, "line")} skipped</span> : null}
      </p>
      {rows.length ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, PREVIEW_ROWS).map((r) => (
                <TableRow key={r.email}>
                  <TableCell>{uploadRowName(r)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.email}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length > PREVIEW_ROWS ? (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">and {plural(rows.length - PREVIEW_ROWS, "more")}</p>
          ) : null}
        </div>
      ) : null}
      {problems.length ? (
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>{plural(problems.length, "line")} won&apos;t be added</AlertTitle>
          <AlertDescription>
            <ScrollArea className="max-h-32 w-full">
              <ul className="grid gap-0.5 text-xs">
                {problems.slice(0, SHOWN_PROBLEMS).map((p, i) => (
                  <li key={i}>
                    {p.line > 1 ? `Line ${p.line}: ` : ""}
                    {p.message}
                  </li>
                ))}
                {problems.length > SHOWN_PROBLEMS ? <li>and {problems.length - SHOWN_PROBLEMS} more</li> : null}
              </ul>
            </ScrollArea>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
