import { AuthCard } from "@gifting/ui/components/auth-card";
import { Button } from "@gifting/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { apiPost } from "@/lib/api";

import { ResendForm } from "../register/check-email/resend-form";

export const metadata: Metadata = { title: "Verify your email · Gifting" };

/** The link in the verification email lands here; the token is checked once. */
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  await connection();
  const token = (await searchParams).token;
  const result = typeof token === "string" && token.length > 0 ? await apiPost("/v1/auth/verify-email", { token }) : null;

  if (result?.ok) {
    return (
      <AuthCard title="Your email is verified" description="Your account is ready. Sign in to start sending gifts.">
        <Button asChild size="lg" className="w-full">
          <Link href="/sign-in?notice=verified">Sign in</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="This link didn't work" description={result && !result.ok && result.code === "unavailable" ? result.message : "It may have expired or already been used. Send yourself a new one."}>
      <ResendForm askForEmail />
    </AuthCard>
  );
}
