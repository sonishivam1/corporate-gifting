import type { InvitationPreview } from "@gifting/domain";
import { AuthCard } from "@gifting/ui/components/auth-card";
import { Button } from "@gifting/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { ApiCallError, getInvitationPreview, getMe } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/roles";

import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Invitation · Gifting", referrer: "no-referrer" };

/**
 * An invitation link (ADR 0017). Anyone with the link sees the company, role
 * and team; accepting needs the signed-in account whose email it was sent to.
 * Signed-out visitors sign in (or create an account) and come back here.
 */
export default async function InvitationPage({ params }: PageProps<"/invitations/[token]">) {
  await connection();
  const { token } = await params;
  const me = await getMe();
  const preview: InvitationPreview | ApiCallError = await getInvitationPreview(token).catch((err: unknown) => {
    if (err instanceof ApiCallError) return err;
    throw err;
  });

  if (preview instanceof ApiCallError) {
    return (
      <AuthCard
        title={preview.status === 404 || preview.status === 400 ? "This invitation can't be used" : "Gifting is unavailable"}
        description={
          preview.status === 404 || preview.status === 400
            ? "It has expired, was withdrawn, or was already used. Ask the person who invited you to send a new one."
            : "We can't reach Gifting right now. Try again in a minute."
        }
        footer={
          <Link href="/" className="font-medium text-primary underline-offset-4 hover:underline">
            Go to Gifting
          </Link>
        }
      />
    );
  }

  const role = ROLE_LABEL[preview.role];
  const where = preview.teamName ? `the ${preview.teamName} team at ${preview.companyName}` : preview.companyName;
  const description = `You're invited to join ${where} as ${/^[AEIOU]/.test(role) ? "an" : "a"} ${role.toLowerCase()}.`;
  const returnTo = `/invitations/${encodeURIComponent(token)}`;

  if (me.kind !== "account") {
    return (
      <AuthCard
        title={`Join ${preview.companyName} on Gifting`}
        description={description}
        footer={<p>Sign in, or create an account, with the email address the invitation was sent to.</p>}
      >
        <div className="grid gap-2">
          <Button asChild>
            <Link href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>Sign in to accept</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/register">Create an account</Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">New here? After you verify your email, open the invitation link again to accept.</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={`Join ${preview.companyName} on Gifting`} description={description}>
      <AcceptForm token={token} email={me.me.email} />
    </AuthCard>
  );
}
