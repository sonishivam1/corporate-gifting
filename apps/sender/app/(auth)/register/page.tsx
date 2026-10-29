import { AuthCard } from "@gifting/ui/components/auth-card";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSignInMode } from "@/lib/api";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create your account · Gifting" };

export default async function RegisterPage() {
  // On a platform with its own sign-in page, accounts are created there.
  if ((await getSignInMode()) === "hosted") redirect("/sign-in");
  return (
    <AuthCard
      title="Create your account"
      description="Start sending gifts in minutes."
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
