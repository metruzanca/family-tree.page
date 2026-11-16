import { For, Show, createEffect, createSignal } from "solid-js";
import { A, createAsync, useNavigate, useParams, revalidate } from "@solidjs/router";
import { Copy, Link2, LogOut, Mail, Plus, RotateCw, Settings, Shield, Trash2, Users } from "lucide-solid";
import {
  createInvite,
  deleteTree,
  getTreeInvites,
  getTreeMembers,
  getTreeOverview,
  leaveTree,
  removeMember,
  resendInvite,
  revokeInvite,
  updateMemberRole,
  updateTree,
  type CreatedInvite,
  type InviteView,
} from "~/api/trees-server";
import {
  getMyTrees,
  getTreeGraph,
  getTreeMembers as membersQuery,
  getTreeOverview as overviewQuery,
  getTreeInvites as invitesQuery,
  requireUserPage,
} from "~/api";
import type { TreeRole } from "~/server/guards";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { AppHeader } from "~/components/app/AppHeader";
import { Avatar } from "~/components/ui/Avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { Field } from "~/components/ui/Field";
import { IconButton } from "~/components/ui/icon-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectPortal,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsTrigger,
} from "~/components/ui/tabs";
import { useToast } from "~/components/ui/Toast";
import { formatRelative, roleLabel } from "~/lib/format";
import { attemptAction } from "~/lib/action-result";
import { track } from "~/lib/analytics";

const roleOptions: { value: TreeRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
];

const expiryOptions = [
  { value: "1", label: "In 1 day" },
  { value: "7", label: "In 7 days" },
  { value: "30", label: "In 30 days" },
];

export const route = {
  preload: ({ params }: { params: { treeId: string } }) => {
    requireUserPage();
    getTreeOverview(params.treeId);
    getTreeMembers(params.treeId);
  },
};

export default function TreeSettingsPage() {
  return (
    <AppErrorBoundary
      title="We could not load tree settings"
      message="The tree may be temporarily unavailable. Try again in a moment."
      revalidateKeys={[
        requireUserPage.key,
        overviewQuery.key,
        membersQuery.key,
        invitesQuery.key,
      ]}
      back={{ href: "/trees", label: "Back to your trees" }}
    >
      <TreeSettingsInner />
    </AppErrorBoundary>
  );
}

function TreeSettingsInner() {
  const params = useParams<{ treeId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const user = createAsync(() => requireUserPage());
  const overview = createAsync(() => getTreeOverview(params.treeId));
  const members = createAsync(() => getTreeMembers(params.treeId));
  const invites = createAsync(() =>
    overview()?.role === "owner" ? getTreeInvites(params.treeId) : Promise.resolve([]),
  );

  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [inviteRole, setInviteRole] = createSignal<TreeRole>("editor");
  const [inviteDays, setInviteDays] = createSignal(7);
  const [inviteMode, setInviteMode] = createSignal<"link" | "email">("link");
  const [inviteEmail, setInviteEmail] = createSignal("");
  const [creatingInvite, setCreatingInvite] = createSignal(false);
  const [createdInvite, setCreatedInvite] = createSignal<CreatedInvite | null>(null);
  const [resendingId, setResendingId] = createSignal<string | null>(null);
  const [inviteRows, setInviteRows] = createSignal<InviteView[] | null>(null);

  createEffect(() => {
    const rows = invites();
    if (rows) setInviteRows(rows);
  });

  function applyCreatedInvite(created: CreatedInvite) {
    const now = new Date();
    setInviteRows(rows => {
      const base = rows ?? [];
      const kept = created.email
        ? base.map(row =>
            row.email === created.email && !row.revokedAt && !row.acceptedAt
              ? { ...row, revokedAt: now }
              : row,
          )
        : base;
      return [
        {
          id: created.id,
          role: created.role,
          email: created.email,
          sentAt: created.emailSent ? now : null,
          createdAt: now,
          expiresAt: new Date(created.expiresAt),
          revokedAt: null,
          acceptedAt: null,
          acceptedBy: null,
        },
        ...kept,
      ];
    });
  }
  const [confirm, setConfirm] = createSignal<
    | { kind: "remove"; userId: string; name: string }
    | { kind: "leave" }
    | { kind: "delete" }
    | { kind: "revoke"; inviteId: string }
    | null
  >(null);
  const [pending, setPending] = createSignal(false);

  let hydrated = false;
  createEffect(() => {
    const current = overview();
    if (current && !hydrated) {
      hydrated = true;
      setName(current.tree.name);
      setDescription(current.tree.description ?? "");
    }
  });

  const isOwner = () => overview()?.role === "owner";
  const canEmailInvites = () => Boolean(user()?.emailVerified);

  async function saveTree(event: SubmitEvent) {
    event.preventDefault();
    if (saving()) return;
    setSaving(true);
    const result = await attemptAction(() =>
      updateTree({
        treeId: params.treeId,
        name: name(),
        description: description(),
      }),
    );
    setSaving(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate([overviewQuery.key, getMyTrees.key, getTreeGraph.key]);
    toast.show("Tree settings saved.", "success");
  }

  async function changeRole(userId: string, role: TreeRole) {
    const result = await attemptAction(() =>
      updateMemberRole({ treeId: params.treeId, userId, role }),
    );
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate([membersQuery.key, overviewQuery.key, getMyTrees.key]);
    toast.show("Member role updated.", "success");
  }

  async function createNewInvite() {
    if (creatingInvite()) return;
    const email = inviteMode() === "email" ? inviteEmail().trim() : null;
    if (inviteMode() === "email" && !email) {
      toast.show("Enter an email address for the invitation.", "error");
      return;
    }
    setCreatingInvite(true);
    const result = await attemptAction(() =>
      createInvite({
        treeId: params.treeId,
        role: inviteRole(),
        expiresInDays: inviteDays(),
        email,
      }),
    );
    setCreatingInvite(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setCreatedInvite(result.data);
    applyCreatedInvite(result.data);
    if (result.data.email) setInviteEmail("");
    await revalidate(invitesQuery.key);
    track("invite_created", {
      role: inviteRole(),
      delivery: result.data.email ? "email" : "link",
    });
    if (result.data.email && !result.data.emailSent && !result.data.emailSimulated) {
      toast.show(result.data.emailError ?? "The email could not be sent. Copy the link instead.", "error");
      return;
    }
    if (result.data.emailSimulated) {
      toast.show(
        "Invitation created. The email was printed to the server console instead of being sent.",
        "success",
      );
      return;
    }
    toast.show(
      result.data.email ? "Invitation sent." : "Invite link created. Copy it now.",
      "success",
    );
  }

  async function sendInviteAgain(inviteId: string) {
    if (resendingId()) return;
    setResendingId(inviteId);
    const result = await attemptAction(() =>
      resendInvite({ treeId: params.treeId, inviteId }),
    );
    setResendingId(null);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setCreatedInvite(result.data);
    applyCreatedInvite(result.data);
    await revalidate(invitesQuery.key);
    track("invite_created", { role: result.data.role, delivery: "email" });
    if (!result.data.emailSent && !result.data.emailSimulated) {
      toast.show(result.data.emailError ?? "The email could not be sent. Copy the link instead.", "error");
      return;
    }
    toast.show(
      result.data.emailSimulated
        ? "Invitation created. The email was printed to the server console."
        : "Invitation sent again.",
      "success",
    );
  }

  async function copyInvite(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.show("Invite link copied.", "success");
    } catch {
      window.prompt("Copy this invite link", url);
    }
  }

  async function runConfirm() {
    const action = confirm();
    if (!action) return;
    setPending(true);
    try {
      if (action.kind === "remove") {
        const result = await attemptAction(() =>
          removeMember({ treeId: params.treeId, userId: action.userId }),
        );
        if (!result.ok) return toast.show(result.error, "error");
        await revalidate([membersQuery.key, overviewQuery.key]);
        toast.show("Member removed.", "success");
      } else if (action.kind === "leave") {
        const result = await attemptAction(() => leaveTree(params.treeId));
        if (!result.ok) return toast.show(result.error, "error");
        await revalidate(getMyTrees.key);
        track("tree_left");
        toast.show("You left the tree.", "success");
        navigate("/trees");
        return;
      } else if (action.kind === "delete") {
        const result = await attemptAction(() => deleteTree(params.treeId));
        if (!result.ok) return toast.show(result.error, "error");
        await revalidate(getMyTrees.key);
        track("tree_deleted");
        toast.show("Tree deleted.", "success");
        navigate("/trees");
        return;
      } else if (action.kind === "revoke") {
        const result = await attemptAction(() =>
          revokeInvite({ treeId: params.treeId, inviteId: action.inviteId }),
        );
        if (!result.ok) return toast.show(result.error, "error");
        setInviteRows(rows =>
          rows?.map(row =>
            row.id === action.inviteId ? { ...row, revokedAt: new Date() } : row,
          ) ?? rows,
        );
        await revalidate(invitesQuery.key);
        toast.show("Invite revoked.", "success");
      }
      setConfirm(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <Show when={user()}>
      {currentUser => (
        <div class="page-shell min-h-[100dvh]">
          <AppHeader
            user={currentUser()}
            back={{ href: `/trees/${params.treeId}`, label: "Back to tree" }}
            center={overview()?.tree.name ?? "Tree settings"}
          />
          <main class="mx-auto max-w-4xl px-4 pb-20 pt-8 sm:px-6">
            <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p class="eyebrow mb-2">Tree settings</p>
                <h1 class="font-display text-4xl tracking-tight">{overview()?.tree.name}</h1>
                <p class="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    {overview()?.peopleCount ?? 0} people · {overview()?.memberCount ?? 0} members
                  </span>
                  <Badge variant="secondary" class="uppercase tracking-wide">
                    {roleLabel(overview()?.role ?? "viewer")}
                  </Badge>
                </p>
              </div>
            </div>

            <Tabs defaultValue="tree" class="gap-5">
              <TabsList class="max-w-full overflow-x-auto">
                <TabsIndicator />
                <TabsTrigger value="tree">
                  <Settings />
                  Tree
                </TabsTrigger>
                <TabsTrigger value="members">
                  <Users />
                  Members
                </TabsTrigger>
                <Show when={isOwner()}>
                  <TabsTrigger value="invites">
                    <Link2 />
                    Invites
                  </TabsTrigger>
                </Show>
              </TabsList>

              <TabsContent value="tree">
                <SectionCard
                  title="The tree"
                  description="Name and description shown to everyone in this tree."
                >
                  <form class="space-y-4" onSubmit={saveTree}>
                    <Field label="Tree name" for="settings-name">
                      <input
                        id="settings-name"
                        class="input"
                        value={name()}
                        onInput={event => setName(event.currentTarget.value)}
                        disabled={!isOwner()}
                        maxlength={80}
                        required
                      />
                    </Field>
                    <Field label="Description" for="settings-description">
                      <textarea
                        id="settings-description"
                        class="input min-h-20"
                        value={description()}
                        onInput={event => setDescription(event.currentTarget.value)}
                        disabled={!isOwner()}
                        maxlength={500}
                      />
                    </Field>
                    <Show when={isOwner()}>
                      <Button type="submit" disabled={saving()}>
                        {saving() ? "Saving…" : "Save changes"}
                      </Button>
                    </Show>
                  </form>
                </SectionCard>
              </TabsContent>

              <TabsContent value="members">
                <SectionCard
                  title="Members"
                  description="Everyone with access to this tree. Editors can add people and files."
                >
                  <div class="space-y-1">
                    <For each={members()}>
                      {member => (
                        <div class="flex flex-wrap items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-accent/50">
                          <Avatar name={member.displayName} size={38} />
                          <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-semibold">
                              {member.displayName}
                              <Show when={member.userId === currentUser().id}>
                                <span class="ml-1.5 text-xs font-normal text-muted-foreground">
                                  you
                                </span>
                              </Show>
                            </p>
                            <p class="truncate text-xs text-muted-foreground">{member.email}</p>
                          </div>
                          <Show
                            when={isOwner() && member.userId !== currentUser().id}
                            fallback={
                              <Badge variant="secondary" class="uppercase tracking-wide">
                                {roleLabel(member.role)}
                              </Badge>
                            }
                          >
                            <Select
                              options={roleOptions}
                              optionValue="value"
                              optionTextValue="label"
                              value={roleOptions.find(option => option.value === member.role)}
                              onChange={option => option && changeRole(member.userId, option.value)}
                              itemComponent={itemProps => (
                                <SelectItem item={itemProps.item}>
                                  {itemProps.item.rawValue.label}
                                </SelectItem>
                              )}
                            >
                              <SelectTrigger size="sm" class="w-32" aria-label="Member role">
                                <SelectValue<{ value: TreeRole; label: string }>>
                                  {state => state.selectedOption().label}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectPortal>
                                <SelectContent />
                              </SelectPortal>
                            </Select>
                            <IconButton
                              label={`Remove ${member.displayName}`}
                              variant="ghost"
                              size="icon-sm"
                              class="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() =>
                                setConfirm({
                                  kind: "remove",
                                  userId: member.userId,
                                  name: member.displayName,
                                })
                              }
                            >
                              <Trash2 />
                            </IconButton>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </SectionCard>
              </TabsContent>

              <Show when={isOwner()}>
                <TabsContent value="invites">
                  <SectionCard
                    title="Invites"
                    description="Share a single-use link, or send the invitation straight to someone's inbox."
                  >
                    <div class="inline-flex rounded-xl border border-border bg-background p-1">
                      <button
                        type="button"
                        aria-pressed={inviteMode() === "link"}
                        class={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          inviteMode() === "link"
                            ? "bg-accent text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => setInviteMode("link")}
                      >
                        Share a link
                      </button>
                      <button
                        type="button"
                        aria-pressed={inviteMode() === "email"}
                        class={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          inviteMode() === "email"
                            ? "bg-accent text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => setInviteMode("email")}
                      >
                        Send by email
                      </button>
                    </div>

                    <div class="mt-4 grid gap-3 sm:grid-cols-2 sm:items-end">
                      <Field label="Role" for="invite-role">
                        <Select
                          options={roleOptions}
                          optionValue="value"
                          optionTextValue="label"
                          value={roleOptions.find(option => option.value === inviteRole())}
                          onChange={option => option && setInviteRole(option.value)}
                          itemComponent={itemProps => (
                            <SelectItem item={itemProps.item}>
                              {itemProps.item.rawValue.label}
                            </SelectItem>
                          )}
                        >
                          <SelectTrigger id="invite-role" class="w-full" aria-label="Invite role">
                            <SelectValue<{ value: TreeRole; label: string }>>
                              {state => state.selectedOption().label}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectPortal>
                            <SelectContent />
                          </SelectPortal>
                        </Select>
                      </Field>
                      <Field label="Expires" for="invite-days">
                        <Select
                          options={expiryOptions}
                          optionValue="value"
                          optionTextValue="label"
                          value={expiryOptions.find(
                            option => option.value === String(inviteDays()),
                          )}
                          onChange={option => option && setInviteDays(Number(option.value))}
                          itemComponent={itemProps => (
                            <SelectItem item={itemProps.item}>
                              {itemProps.item.rawValue.label}
                            </SelectItem>
                          )}
                        >
                          <SelectTrigger id="invite-days" class="w-full" aria-label="Invite expiry">
                            <SelectValue<{ value: string; label: string }>>
                              {state => state.selectedOption().label}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectPortal>
                            <SelectContent />
                          </SelectPortal>
                        </Select>
                      </Field>

                      <Show when={inviteMode() === "email"}>
                        <Field
                          label="Email address"
                          for="invite-email"
                          class="sm:col-span-2"
                          hint={
                            canEmailInvites()
                              ? "The invitation link is emailed to this address. You can still copy it below."
                              : undefined
                          }
                        >
                          <input
                            id="invite-email"
                            type="email"
                            class="input"
                            placeholder="relative@example.com"
                            autocomplete="email"
                            value={inviteEmail()}
                            onInput={event => setInviteEmail(event.currentTarget.value)}
                            disabled={!canEmailInvites()}
                          />
                        </Field>
                        <Show when={!canEmailInvites()}>
                          <p class="rounded-xl border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground sm:col-span-2">
                            Confirm your own email address before sending invitations.{" "}
                            <A href="/settings" class="font-semibold text-primary underline decoration-primary/30 underline-offset-4">
                              Resend the verification link
                            </A>
                            .
                          </p>
                        </Show>
                      </Show>

                      <div class="sm:col-span-2">
                        <Button
                          type="button"
                          onClick={createNewInvite}
                          disabled={
                            creatingInvite() ||
                            (inviteMode() === "email" && !canEmailInvites())
                          }
                        >
                          <Show
                            when={inviteMode() === "email"}
                            fallback={<Plus />}
                          >
                            <Mail />
                          </Show>
                          {creatingInvite()
                            ? "Working…"
                            : inviteMode() === "email"
                              ? "Send invite"
                              : "Create link"}
                        </Button>
                      </div>
                    </div>

                    <Show when={createdInvite()}>
                      {invite => (
                        <div class="mt-4 rounded-2xl border border-primary/25 bg-accent p-3">
                          <p class="mb-2 text-xs font-semibold text-primary">
                            {invite().email
                              ? invite().emailSimulated
                                ? `Development mode: the email to ${invite().email} was printed to the server console. You can also share this link.`
                                : invite().emailSent
                                  ? `Emailed to ${invite().email}. You can also share this link directly.`
                                  : `We could not email ${invite().email}. Copy this link and send it yourself.`
                              : "Copy this link now. It will not be shown again."}
                          </p>
                          <div class="flex gap-2">
                            <input
                              class="input text-xs"
                              readonly
                              value={invite().url}
                              onFocus={event => event.currentTarget.select()}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => copyInvite(invite().url)}
                            >
                              <Copy />
                              Copy
                            </Button>
                          </div>
                        </div>
                      )}
                    </Show>

                    <div class="mt-5">
                      <h3 class="field-label mb-2">Recent invites</h3>
                      <Show
                        when={inviteRows()?.length}
                        fallback={
                          <p class="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                            No invites created yet.
                          </p>
                        }
                      >
                        <div class="space-y-1">
                          <For each={inviteRows()}>
                            {invite => (
                              <div class="flex flex-wrap items-center gap-3 rounded-xl px-2 py-2 text-sm transition hover:bg-accent/50">
                                <Show
                                  when={invite.email}
                                  fallback={<Shield size={15} class="text-muted-foreground" />}
                                >
                                  <Mail size={15} class="text-muted-foreground" />
                                </Show>
                                <div class="min-w-0 flex-1">
                                  <p class="font-medium">{roleLabel(invite.role)} invite</p>
                                  <Show when={invite.email}>
                                    <p class="truncate text-xs text-foreground">{invite.email}</p>
                                  </Show>
                                  <p class="text-xs text-muted-foreground">
                                    {inviteStatus(invite)} · {formatRelative(invite.createdAt)}
                                    <Show when={invite.email && invite.sentAt}>
                                      {" "}
                                      · emailed
                                    </Show>
                                  </p>
                                </div>
                                <Show when={inviteStatus(invite) === "Pending" && invite.email}>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={resendingId() === invite.id}
                                    onClick={() => sendInviteAgain(invite.id)}
                                  >
                                    <RotateCw />
                                    {resendingId() === invite.id ? "Sending…" : "Send again"}
                                  </Button>
                                </Show>
                                <Show when={inviteStatus(invite) === "Pending"}>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    class="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() =>
                                      setConfirm({ kind: "revoke", inviteId: invite.id })
                                    }
                                  >
                                    Revoke
                                  </Button>
                                </Show>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  </SectionCard>
                </TabsContent>
              </Show>
            </Tabs>

            <SectionCard
              class="mt-5"
              title="Leave or delete"
              description="Leaving removes your access. Deleting removes the whole tree for everyone."
            >
              <div class="flex flex-wrap gap-2">
                <Button variant="secondary" type="button" onClick={() => setConfirm({ kind: "leave" })}>
                  <LogOut />
                  Leave this tree
                </Button>
                <Show when={isOwner()}>
                  <Button variant="destructive" type="button" onClick={() => setConfirm({ kind: "delete" })}>
                    <Trash2 />
                    Delete tree
                  </Button>
                </Show>
              </div>
              <p class="mt-3 text-xs leading-relaxed text-muted-foreground">
                If you are the only owner, promote another member to owner before leaving.
              </p>
            </SectionCard>
          </main>

          <ConfirmDialog
            open={Boolean(confirm())}
            onClose={() => setConfirm(null)}
            title={confirmTitle(confirm())}
            message={confirmMessage(confirm(), overview()?.tree.name ?? "this tree")}
            confirmLabel={confirmLabel(confirm())}
            danger={confirm()?.kind === "delete" || confirm()?.kind === "remove"}
            pending={pending()}
            onConfirm={runConfirm}
          />
        </div>
      )}
    </Show>
  );
}

function SectionCard(props: {
  title: string;
  description: string;
  class?: string;
  children: any;
}) {
  return (
    <Card class={`gap-4 py-5 sm:py-6 ${props.class ?? ""}`}>
      <CardHeader class="gap-1 px-5 sm:px-6">
        <CardTitle class="font-display text-xl tracking-tight">{props.title}</CardTitle>
        <CardDescription class="text-xs leading-relaxed">{props.description}</CardDescription>
      </CardHeader>
      <CardContent class="px-5 sm:px-6">{props.children}</CardContent>
    </Card>
  );
}

function inviteStatus(invite: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}) {
  if (invite.revokedAt) return "Revoked";
  if (invite.acceptedAt) return "Used";
  if (new Date(invite.expiresAt).getTime() <= Date.now()) return "Expired";
  return "Pending";
}

function confirmTitle(action: { kind: string } | null) {
  if (!action) return "";
  if (action.kind === "remove") return "Remove this member?";
  if (action.kind === "leave") return "Leave this tree?";
  if (action.kind === "delete") return "Delete this tree?";
  return "Revoke this invite?";
}

function confirmLabel(action: { kind: string } | null) {
  if (!action) return "Confirm";
  if (action.kind === "remove") return "Remove member";
  if (action.kind === "leave") return "Leave tree";
  if (action.kind === "delete") return "Delete tree";
  return "Revoke invite";
}

function confirmMessage(action: { kind: string; name?: string } | null, treeName: string) {
  if (!action) return "";
  if (action.kind === "remove") {
    return `${action.name ?? "This person"} will lose access to ${treeName}. The people and files they added stay in the tree.`;
  }
  if (action.kind === "leave") {
    return `You will lose access to ${treeName}. You can only rejoin with a new invite.`;
  }
  if (action.kind === "delete") {
    return `${treeName}, everyone's connections, and all uploaded files will be permanently deleted. This cannot be undone.`;
  }
  return "Anyone using this link will no longer be able to join.";
}
