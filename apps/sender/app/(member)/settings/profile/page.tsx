import { Badge } from "@gifting/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@gifting/ui/components/card";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCompanyMembers, getMe, getWorkspace } from "@/lib/api";
import { roleLabel } from "@/lib/roles";

import { NameForm } from "./name-form";

export const metadata: Metadata = { title: "My profile · Gifting" };

/** The signed-in person: their name (editable when the commerce platform allows it here), email, and roles in this company. */
export default async function ProfilePage() {
  const result = await getMe();
  if (result.kind !== "account") redirect("/sign-in");
  const { me } = result;
  const [workspace, company] = await Promise.all([getWorkspace(), getCompanyMembers()]);
  const teamNames = new Map(company.teams.map((t) => [t.key, t.name]));
  const mine = company.members.find((m) => m.id === workspace.user.id)?.memberships ?? [];

  return (
    <div className="grid max-w-2xl gap-6 pt-4">
      <section className="grid gap-1">
        <h1 className="text-3xl font-semibold">My profile</h1>
        <p className="text-muted-foreground">How you appear to your company, and what you can do in it.</p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Your name</CardTitle>
          <CardDescription>
            {me.canEditName ? "Shown to your company and on the gifts you send." : "Your name is managed in your company's commerce platform, not here."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NameForm firstName={me.firstName ?? ""} lastName={me.lastName ?? ""} email={me.email} editable={Boolean(me.canEditName)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your roles in {workspace.company.name}</CardTitle>
          <CardDescription>Owners and admins of the company can change them.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {mine.length ? (
            mine.map((m) => (
              <Badge key={`${m.role}:${m.teamKey ?? ""}`} variant="secondary">
                {roleLabel(m, teamNames)}
              </Badge>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No roles in this company.</p>
          )}
        </CardContent>
      </Card>

      {workspace.companies.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Your companies</CardTitle>
            <CardDescription>Switch between them at the top of the dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {workspace.companies.map((c) => (
              <Badge key={c.key} variant={c.key === workspace.company.key ? "default" : "outline"}>
                {c.name}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
