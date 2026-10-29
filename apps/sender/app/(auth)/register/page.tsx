import { AuthCard } from "@gifting/ui/components/auth-card";
import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create your account · Gifting" };

export default function RegisterPage() {
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
