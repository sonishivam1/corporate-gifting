import { AuthCard } from "@gifting/ui/components/auth-card";
import type { Metadata } from "next";
import Link from "next/link";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Gifting" };

/** Only paths inside this app may be returned to after sign-in. */
function safeReturnTo(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  return path && path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

const NOTICES: Record<string, string> = {
  verified: "Your email is verified. Sign in to continue.",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
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
      <SignInForm returnTo={safeReturnTo(params.returnTo)} notice={notice} />
    </AuthCard>
  );
}
