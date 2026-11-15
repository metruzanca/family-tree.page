import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { createAsync, useNavigate, useParams, revalidate } from "@solidjs/router";
import {
  Copy,
  Link2,
  LogOut,
  Plus,
  Settings,
  Shield,
  Trash2,
  Users,
} from "lucide-solid";
import {
  createInvite,
  deleteTree,
  getTreeInvites,
  getTreeMembers,
  getTreeOverview,
  leaveTree,
  removeMember,
  revokeInvite,
  updateMemberRole,
  updateTree,
} from "~/api/trees-server";
import { getMyTrees, getTreeGraph, getTreeMembers as membersQuery, getTreeOverview as overviewQuery, getTreeInvites as invitesQuery, requireUserPage } from "~/api";
import type { TreeRole } from "~/server/guards";
import { AppHeader } from "~/components/app/AppHeader";
import { Avatar } from "~/components/ui/Avatar";
import { Button, IconButton } from "~/components/ui/Button";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { Field } from "~/components/ui/Field";
import { LoadingScreen } from "~/components/ui/Loading";
import { useToast } from "~/components/ui/Toast";
import { formatDate, formatRelative, roleLabel } from "~/lib/format";

export const route = {
  preload: ({ params }: { params: { treeId: string } }) => {
    requireUserPage();
    getTreeOverview(params.treeId);
    getTreeMembers(params.treeId);
  },
};

export default function TreeSettingsPage() {
  return (
    <Show when={true} fallback={<LoadingScreen />}>
      <TreeSettingsInner />
    </Show>
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
  const [creatingInvite, setCreatingInvite] = createSignal(false);
  const [createdInvite, setCreatedInvite] = createSignal<string | null>(null);
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
  const randomInvite = createMemo(() => createdInvite());

  async function saveTree(event: SubmitEvent) {
    event.preventDefault();
    if (saving()) return;
    setSaving(true);
    const result = await updateTree({
      treeId: params.treeId,
      name: name(),
      description: description(),
    });
    setSaving(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate([overviewQuery.key, getMyTrees.key, getTreeGraph.key]);
    toast.show("Tree settings saved.", "success");
  }

  async function changeRole(userId: string, role: TreeRole) {
    const result = await updateMemberRole({ treeId: params.treeId, userId, role });
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate([membersQuery.key, overviewQuery.key, getMyTrees.key]);
    toast.show("Member role updated.", "success");
  }

  async function createNewInvite() {
    if (creatingInvite()) return;
    setCreatingInvite(true);
    const result = await createInvite({
      treeId: params.treeId,
      role: inviteRole(),
      expiresInDays: inviteDays(),
    });
    setCreatingInvite(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setCreatedInvite(result.data.url);
    await revalidate(invitesQuery.key);
    toast.show("Invite link created. Copy it now.", "success");
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
        const result = await removeMember({ treeId: params.treeId, userId: action.userId });
        if (!result.ok) return toast.show(result.error, "error");
        await revalidate([membersQuery.key, overviewQuery.key]);
        toast.show("Member removed.", "success");
      } else if (action.kind === "leave") {
        const result = await leaveTree(params.treeId);
        if (!result.ok) return toast.show(result.error, "error");
        toast.show("You left the tree.", "success");
        navigate("/trees");
        return;
      } else if (action.kind === "delete") {
        const result = await deleteTree(params.treeId);
        if (!result.ok) return toast.show(result.error, "error");
        toast.show("Tree deleted.", "success");
        navigate("/trees");
        return;
      } else if (action.kind === "revoke") {
        const result = await revokeInvite({ treeId: params.treeId, inviteId: action.inviteId });
        if (!result.ok) return toast.show(result.error, "error");
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
            <div class="mb-8 flex items-end justify-between gap-4">
              <div>
                <p class="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-moss">
                  Tree settings
                </p>
                <h1 class="font-display text-4xl tracking-tight">{overview()?.tree.name}</h1>
                <p class="mt-2 text-sm text-muted">
                  {overview()?.peopleCount ?? 0} people · {overview()?.memberCount ?? 0} members ·{" "}
                  <span class="badge">{roleLabel(overview()?.role ?? "viewer")}</span>
                </p>
              </div>
            </div>

            <div class="space-y-5">
              <SettingsCard icon={<Settings size={18} />} title="The tree" description="Name and description shown to everyone in this tree.">
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
              </SettingsCard>

              <SettingsCard
                icon={<Users size={18} />}
                title="Members"
                description="Everyone with access to this tree. Editors can add people and files."
              >
                <div class="space-y-1">
                  <For each={members()}>
                    {member => (
                      <div class="flex flex-wrap items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-moss/5">
                        <Avatar name={member.displayName} size={38} />
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm font-semibold">
                            {member.displayName}
                            <Show when={member.userId === currentUser().id}>
                              <span class="ml-1.5 text-xs font-normal text-muted">you</span>
                            </Show>
                          </p>
                          <p class="truncate text-xs text-muted">{member.email}</p>
                        </div>
                        <Show
                          when={isOwner() && member.userId !== currentUser().id}
                          fallback={
                            <span class="badge">{roleLabel(member.role)}</span>
                          }
                        >
                          <select
                            class="input !w-auto !py-1.5 text-xs"
                            value={member.role}
                            onChange={event => changeRole(member.userId, event.currentTarget.value as TreeRole)}
                          >
                            <option value="owner">Owner</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <IconButton
                            label={`Remove ${member.displayName}`}
                            class="text-danger"
                            onClick={() =>
                              setConfirm({ kind: "remove", userId: member.userId, name: member.displayName })
                            }
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </SettingsCard>

              <Show when={isOwner()}>
                <SettingsCard
                  icon={<Link2 size={18} />}
                  title="Invites"
                  description="Share a link with someone you trust. Links are single-use and expire."
                >
                  <div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <Field label="Role" for="invite-role">
                      <select
                        id="invite-role"
                        class="input"
                        value={inviteRole()}
                        onChange={event => setInviteRole(event.currentTarget.value as TreeRole)}
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                        <option value="owner">Owner</option>
                      </select>
                    </Field>
                    <Field label="Expires" for="invite-days">
                      <select
                        id="invite-days"
                        class="input"
                        value={String(inviteDays())}
                        onChange={event => setInviteDays(Number(event.currentTarget.value))}
                      >
                        <option value="1">In 1 day</option>
                        <option value="7">In 7 days</option>
                        <option value="30">In 30 days</option>
                      </select>
                    </Field>
                    <Button type="button" onClick={createNewInvite} disabled={creatingInvite()}>
                      <Plus size={15} />
                      {creatingInvite() ? "Creating…" : "Create link"}
                    </Button>
                  </div>

                  <Show when={randomInvite()}>
                    {url => (
                      <div class="mt-4 rounded-2xl border border-moss/25 bg-moss-soft p-3">
                        <p class="mb-2 text-xs font-semibold text-moss">
                          Copy this link now. It will not be shown again.
                        </p>
                        <div class="flex gap-2">
                          <input class="input text-xs" readonly value={url()} onFocus={event => event.currentTarget.select()} />
                          <Button type="button" size="sm" variant="secondary" onClick={() => copyInvite(url())}>
                            <Copy size={14} />
                            Copy
                          </Button>
                        </div>
                      </div>
                    )}
                  </Show>

                  <div class="mt-5">
                    <h3 class="label mb-2">Recent invites</h3>
                    <Show
                      when={invites()?.length}
                      fallback={<p class="text-xs text-muted">No invites created yet.</p>}
                    >
                      <div class="space-y-1">
                        <For each={invites()}>
                          {invite => (
                            <div class="flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-moss/5">
                              <Shield size={15} class="text-muted" />
                              <div class="min-w-0 flex-1">
                                <p class="font-medium">{roleLabel(invite.role)} invite</p>
                                <p class="text-[0.7rem] text-muted">
                                  {inviteStatus(invite)} · {formatRelative(invite.createdAt)}
                                </p>
                              </div>
                              <Show when={inviteStatus(invite) === "Pending"}>
                                <button
                                  type="button"
                                  class="btn btn-ghost btn-sm text-danger"
                                  onClick={() => setConfirm({ kind: "revoke", inviteId: invite.id })}
                                >
                                  Revoke
                                </button>
                              </Show>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                </SettingsCard>
              </Show>

              <SettingsCard
                icon={<LogOut size={18} />}
                title="Leave or delete"
                description="Leaving removes your access. Deleting removes the whole tree for everyone."
              >
                <div class="flex flex-wrap gap-2">
                  <Button variant="secondary" type="button" onClick={() => setConfirm({ kind: "leave" })}>
                    <LogOut size={15} />
                    Leave this tree
                  </Button>
                  <Show when={isOwner()}>
                    <Button variant="danger" type="button" onClick={() => setConfirm({ kind: "delete" })}>
                      <Trash2 size={15} />
                      Delete tree
                    </Button>
                  </Show>
                </div>
                <p class="mt-3 text-xs leading-relaxed text-muted">
                  If you are the only owner, promote another member to owner before leaving.
                </p>
              </SettingsCard>
            </div>
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

function SettingsCard(props: {
  icon: any;
  title: string;
  description: string;
  children: any;
}) {
  return (
    <section class="paper-card p-5 sm:p-6">
      <div class="mb-4 flex items-start gap-3">
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-moss-soft text-moss">
          {props.icon}
        </span>
        <div>
          <h2 class="font-display text-xl tracking-tight">{props.title}</h2>
          <p class="mt-0.5 text-xs leading-relaxed text-muted">{props.description}</p>
        </div>
      </div>
      {props.children}
    </section>
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
