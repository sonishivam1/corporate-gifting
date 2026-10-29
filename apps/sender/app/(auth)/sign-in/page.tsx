import { AuthCard } from "@gifting/ui/components/auth-card";
import type { Metadata } from "next";
import Link from "next/link";

import { getSignInMode } from "@/lib/api";

import { HostedSignInForm } from "./hosted-sign-in-form";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Gifting" };

/** Only paths inside this app may be returned to after sign-in. */
function safeReturnTo(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  return path && path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

const NOTICES: Record<string, string> = {
  verified: "Your email is verified. Sign in to continue.",
  "sign-in-failed": "Sign-in didn't complete. Try again.",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
  const returnTo = safeReturnTo(params.returnTo);
  // The commerce platform decides: our password form, or its own sign-in page.
  if ((await getSignInMode()) === "hosted") {
    return (
      <AuthCard title="Sign in to Gifting" description="Send gifts people will actually want.">
        <HostedSignInForm returnTo={returnTo} notice={notice} />
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Sign in to Gifting"
      description="Send gifts people will actually want."
      footer={
        <p>
          New to Gifting?{" "}
          <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      <SignInForm returnTo={returnTo} notice={notice} />
    </AuthCard>
  );
}
