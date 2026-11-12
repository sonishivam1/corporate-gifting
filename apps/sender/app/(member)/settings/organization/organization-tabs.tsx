"use client";

import { type CompanyMembersView, type InvitationView, inviteInput, type MemberRole, teamInput } from "@gifting/domain";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@gifting/ui/components/alert-dialog";
import { Badge } from "@gifting/ui/components/badge";
import { Button } from "@gifting/ui/components/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@gifting/ui/components/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@gifting/ui/components/empty";
import { Field, FieldDescription, FieldLabel } from "@gifting/ui/components/field";
import { Input } from "@gifting/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@gifting/ui/components/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gifting/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@gifting/ui/components/tabs";
import { toast } from "@gifting/ui/lib/toast";
import { MailIcon, PencilIcon, PlusIcon, RotateCwIcon, UserPlusIcon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { isCompanyRole, ROLE_HINT, ROLE_LABEL, roleLabel } from "@/lib/roles";

import {
  addRoleAction,
  createTeamAction,
  inviteAction,
  removeMemberAction,
  removeRoleAction,
  renameTeamAction,
  resendInvitationAction,
  revokeInvitationAction,
} from "../actions";
import type { ActionResult } from "../../campaigns/actions";

type Member = CompanyMembersView["members"][number];
type Teams = CompanyMembersView["teams"];

/** Runs a server action and says how it went. Returns true when it worked. */
async function run<T>(action: Promise<ActionResult<T>>, success: string): Promise<boolean> {
  const result = await action;
  if (result.ok) toast.success(success);
  else toast.error(result.message);
  return result.ok;
}

export function OrganizationTabs({
  selfId,
  company,
  invitations,
  canManageMembers,
  canManageTeams,
}: {
  selfId: string;
  company: CompanyMembersView;
  invitations: InvitationView[];
  canManageMembers: boolean;
  canManageTeams: boolean;
}) {
  return (
    <Tabs defaultValue="members">
      <TabsList>
        <TabsTrigger value="members">People ({company.members.length})</TabsTrigger>
        <TabsTrigger value="teams">Teams ({company.teams.length})</TabsTrigger>
        {canManageMembers ? <TabsTrigger value="invitations">Invitations ({invitations.length})</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="members" className="pt-4">
        <MembersTab selfId={selfId} company={company} canManage={canManageMembers} />
      </TabsContent>
      <TabsContent value="teams" className="pt-4">
        <TeamsTab teams={company.teams} members={company.members} canManage={canManageTeams} />
      </TabsContent>
      {canManageMembers ? (
        <TabsContent value="invitations" className="pt-4">
          <InvitationsTab invitations={invitations} teams={company.teams} grantable={company.grantable} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

function MembersTab({ selfId, company, canManage }: { selfId: string; company: CompanyMembersView; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const teamNames = new Map(company.teams.map((t) => [t.key, t.name]));
  const showEmails = company.members.some((m) => m.email);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          {showEmails ? <TableHead>Email</TableHead> : null}
          <TableHead>Roles</TableHead>
          {canManage ? <TableHead className="text-right">Manage</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody aria-busy={pending}>
        {company.members.map((member) => {
          const self = member.id === selfId;
          const mayChange = canManage && !self;
          const mayRemove = mayChange && member.memberships.every((m) => company.grantable.includes(m.role));
          return (
            <TableRow key={member.id}>
              <TableCell className="font-medium">
                {member.name}
                {self ? <span className="text-muted-foreground"> (you)</span> : null}
              </TableCell>
              {showEmails ? <TableCell className="text-muted-foreground">{member.email ?? "–"}</TableCell> : null}
              <TableCell>
                <div className="flex flex-wrap gap-1.5">
                  {member.memberships.map((m) => {
                    const label = roleLabel(m, teamNames);
                    return (
                      <Badge key={`${m.role}:${m.teamKey ?? ""}`} variant={isCompanyRole(m.role) ? "default" : "secondary"} className="gap-1">
                        {label}
                        {mayChange && company.grantable.includes(m.role) ? (
                          <button
                            type="button"
                            className="rounded-sm opacity-70 hover:opacity-100 disabled:opacity-40"
                            aria-label={`Take away ${label} from ${member.name}`}
                            disabled={pending}
                            onClick={() => startTransition(async () => void (await run(removeRoleAction(member.id, m), `${member.name} is no longer ${label}.`)))}
                          >
                            <XIcon className="size-3" />
                          </button>
                        ) : null}
                      </Badge>
                    );
                  })}
                </div>
              </TableCell>
              {canManage ? (
                <TableCell className="text-right">
                  {mayChange ? (
                    <div className="flex justify-end gap-2">
                      <AddRoleDialog member={member} teams={company.teams} grantable={company.grantable} />
                      {mayRemove ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" disabled={pending}>
                              Remove
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove {member.name} from the company?</AlertDialogTitle>
                              <AlertDialogDescription>
                                They lose every role here and can no longer send or approve gifts. Their account stays, and the gifts they sent are kept.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep them</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => startTransition(async () => void (await run(removeMemberAction(member.id), `${member.name} was removed.`)))}
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : null}
                    </div>
                  ) : null}
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Role and, for a team role, the team: the fields both "Add role" and "Invite" use. */
function RoleFields({ teams, grantable, role, setRole, teamKey, setTeamKey }: {
  teams: Teams;
  grantable: MemberRole[];
  role: MemberRole;
  setRole: (role: MemberRole) => void;
  teamKey: string;
  setTeamKey: (key: string) => void;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="role">Role</FieldLabel>
        <NativeSelect id="role" className="w-full" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
          {grantable.map((r) => (
            <NativeSelectOption key={r} value={r}>
              {ROLE_LABEL[r]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldDescription>{ROLE_HINT[role]}.</FieldDescription>
      </Field>
      {isCompanyRole(role) ? null : (
        <Field>
          <FieldLabel htmlFor="team">Team</FieldLabel>
          <NativeSelect id="team" className="w-full" value={teamKey} onChange={(e) => setTeamKey(e.target.value)}>
            {teams.map((t) => (
              <NativeSelectOption key={t.key} value={t.key}>
                {t.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
    </>
  );
}

/** The roles a manager may give, sender first: the one people need most. */
const byUse = (grantable: MemberRole[]) => [...grantable].sort((a, b) => ["sender", "approver", "admin", "owner"].indexOf(a) - ["sender", "approver", "admin", "owner"].indexOf(b));

function AddRoleDialog({ member, teams, grantable }: { member: Member; teams: Teams; grantable: MemberRole[] }) {
  const roles = byUse(grantable);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<MemberRole>(roles[0] ?? "sender");
  const [teamKey, setTeamKey] = useState(teams[0]?.key ?? "");
  const [pending, startTransition] = useTransition();
  const label = roleLabel({ role, teamKey: isCompanyRole(role) ? null : teamKey }, new Map(teams.map((t) => [t.key, t.name])));

  const save = () =>
    startTransition(async () => {
      const ok = await run(addRoleAction(member.id, { role, teamKey: isCompanyRole(role) ? null : teamKey }), `${member.name} is now ${label}.`);
      if (ok) setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PlusIcon /> Role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Give {member.name} a role</DialogTitle>
          <DialogDescription>Owners and admins hold their role on every team; approvers and senders on one.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <RoleFields teams={teams} grantable={roles} role={role} setRole={setRole} teamKey={teamKey} setTeamKey={setTeamKey} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={save} disabled={pending}>
            Give role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamsTab({ teams, members, canManage }: { teams: Teams; members: Member[]; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const countOf = (key: string) => members.filter((m) => m.memberships.some((x) => x.teamKey === key)).length;

  const create = (form: FormData) => {
    const parsed = teamInput.safeParse({ name: form.get("name") });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Enter a team name.");
    setError(null);
    startTransition(async () => void (await run(createTeamAction(parsed.data.name), `${parsed.data.name} team created.`)));
  };

  return (
    <div className="grid gap-6">
      {canManage ? (
        <form action={create} className="flex max-w-lg flex-wrap items-end gap-2">
          <Field className="min-w-48 flex-1" data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="team-name">New team</FieldLabel>
            <Input id="team-name" name="name" placeholder="Customer Success" maxLength={80} disabled={pending} aria-invalid={Boolean(error)} />
            {error ? <FieldDescription className="text-destructive">{error}</FieldDescription> : null}
          </Field>
          <Button type="submit" disabled={pending}>
            <PlusIcon /> Create team
          </Button>
        </form>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team</TableHead>
            <TableHead>People with a team role</TableHead>
            {canManage ? <TableHead className="text-right">Manage</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.map((team) => (
            <TableRow key={team.key}>
              <TableCell className="font-medium">{team.name}</TableCell>
              <TableCell className="tabular-nums">{countOf(team.key)}</TableCell>
              {canManage ? (
                <TableCell className="text-right">
                  <RenameTeamDialog team={team} />
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RenameTeamDialog({ team }: { team: Teams[number] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(team.name);
  const [pending, startTransition] = useTransition();
  const parsed = teamInput.safeParse({ name });

  const save = () =>
    startTransition(async () => {
      if (!parsed.success) return;
      if (await run(renameTeamAction(team.key, parsed.data.name), `Renamed to ${parsed.data.name}.`)) setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Rename ${team.name}`}>
          <PencilIcon /> Rename
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename {team.name}</DialogTitle>
          <DialogDescription>Budgets, campaigns and roles stay with the team.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={`rename-${team.key}`}>Team name</FieldLabel>
          <Input id={`rename-${team.key}`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={save} disabled={pending || !parsed.success || parsed.data.name === team.name}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvitationsTab({ invitations, teams, grantable }: { invitations: InvitationView[]; teams: Teams; grantable: MemberRole[] }) {
  const roles = byUse(grantable);
  const [role, setRole] = useState<MemberRole>(roles[0] ?? "sender");
  const [teamKey, setTeamKey] = useState(teams[0]?.key ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const invite = (form: FormData) => {
    const parsed = inviteInput.safeParse({ email: form.get("email"), role, teamKey: isCompanyRole(role) ? null : teamKey });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
    setError(null);
    startTransition(async () => void (await run(inviteAction(parsed.data), `Invitation sent to ${parsed.data.email}.`)));
  };

  return (
    <div className="grid gap-6">
      <form action={invite} className="grid max-w-xl gap-4 rounded-xl border p-4">
        <div className="grid gap-1">
          <h2 className="font-semibold">Invite someone</h2>
          <p className="text-sm text-muted-foreground">They get an email with a link that works for 7 days. They sign in, or create an account, with that address to accept.</p>
        </div>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="invite-email">Work email</FieldLabel>
          <Input id="invite-email" name="email" type="email" autoComplete="off" placeholder="name@company.example" disabled={pending} aria-invalid={Boolean(error)} />
          {error ? <FieldDescription className="text-destructive">{error}</FieldDescription> : null}
        </Field>
        <RoleFields teams={teams} grantable={roles} role={role} setRole={setRole} teamKey={teamKey} setTeamKey={setTeamKey} />
        <div>
          <Button type="submit" disabled={pending}>
            <UserPlusIcon /> Send invitation
          </Button>
        </div>
      </form>

      {invitations.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Invited by</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody aria-busy={pending}>
            {invitations.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">{inv.email}</TableCell>
                <TableCell>{inv.teamName ? `${ROLE_LABEL[inv.role]} · ${inv.teamName}` : ROLE_LABEL[inv.role]}</TableCell>
                <TableCell className="text-muted-foreground">{inv.invitedByName}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(inv.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => startTransition(async () => void (await run(resendInvitationAction(inv.id), `A new link is on its way to ${inv.email}.`)))}
                    >
                      <RotateCwIcon /> Resend
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => startTransition(async () => void (await run(revokeInvitationAction(inv.id), "Invitation withdrawn.")))}
                    >
                      Withdraw
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <MailIcon className="size-6 text-muted-foreground" aria-hidden="true" />
            <EmptyTitle>No pending invitations</EmptyTitle>
            <EmptyDescription>Accepted invitations show up as people on the People tab.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
