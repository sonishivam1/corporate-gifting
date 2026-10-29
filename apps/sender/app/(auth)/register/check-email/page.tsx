import { AuthCard } from "@gifting/ui/components/auth-card";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { ResendForm } from "./resend-form";

export const metadata: Metadata = { title: "Check your email · Gifting" };

export default async function CheckEmailPage() {
  const email = (await cookies()).get("gifting_pending_email")?.value;
  return (
    <AuthCard
      title="Check your email"
      description={
        <>
          We sent a verification link to {email ? <span className="font-medium text-foreground">{email}</span> : "your email address"}. It works for one hour.
        </>
      }
      footer={
        <p>
          Verified already?{" "}
          <Link href="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <p className="mb-4 text-center text-sm text-muted-foreground">Can&rsquo;t find it? Check your spam folder, or send a new one.</p>
      <ResendForm askForEmail={!email} />
    </AuthCard>
  );
}
