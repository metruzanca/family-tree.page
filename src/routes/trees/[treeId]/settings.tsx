import { For, Show, createEffect, createSignal } from "solid-js";
import { A, createAsync, useNavigate, useParams, useSearchParams, revalidate } from "@solidjs/router";
import { Copy, Download, KeyRound, Link2, LogOut, Mail, Plus, RotateCw, Settings, Share2, Shield, ShieldAlert, Trash2, Unlink, Users } from "lucide-solid";
import {
  approveTreeDeletion,
  cancelTreeDeletionRequest,
  clearMemberPerson,
  createInvite,
  leaveTree,
  removeMember,
  requestTreeDeletion,
  resendInvite,
  revokeInvite,
  updateMemberRole,
  updateTree,
  type CreatedInvite,
  type InviteView,
} from "~/api/trees-server";
import {
  getMyTrees,
  getPendingDeletionTrees,
  getTreeGraph,
  getTreeMembers as membersQuery,
  getTreeOverview as overviewQuery,
  getTreeInvites as invitesQuery,
  getTreeShareLinks as shareLinksQuery,
  getTreeApiTokens as apiTokensQuery,
  requireUserPage,
} from "~/api";
import {
  createTreeShareLink,
  revokeTreeShareLink,
  type CreatedTreeShareLink,
  type TreeShareLinkView,
} from "~/api/share-server";
import {
  createTreeApiToken,
  revokeTreeApiToken,
  type ApiTokenView,
  type CreatedApiToken,
} from "~/api/api-tokens-server";
import {
  API_SCOPES,
  DEFAULT_API_SCOPES,
  scopeLabel,
  type ApiScope,
} from "~/lib/api";
import type { LivingVisibility } from "~/lib/share";
import type { TreeRole } from "~/server/guards";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { AppHeader } from "~/components/app/AppHeader";
import { Avatar } from "~/components/ui/Avatar";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { Field } from "~/components/ui/Field";
import { IconButton } from "~/components/ui/icon-button";
import { Modal } from "~/components/ui/Modal";
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
    overviewQuery(params.treeId);
    membersQuery(params.treeId);
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
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.tab === "danger" ? "danger" : "tree";
  const user = createAsync(() => requireUserPage());
  const overview = createAsync(() => overviewQuery(params.treeId));
  const members = createAsync(() => membersQuery(params.treeId));
  const invites = createAsync(() =>
    overview()?.role === "owner" ? invitesQuery(params.treeId) : Promise.resolve([]),
  );
  const shareLinks = createAsync(() =>
    overview()?.role === "owner"
      ? shareLinksQuery(params.treeId)
      : Promise.resolve([] as TreeShareLinkView[]),
  );
  const apiTokens = createAsync(() =>
    overview()?.role === "owner"
      ? apiTokensQuery(params.treeId)
      : Promise.resolve([] as ApiTokenView[]),
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
  const [shareLabel, setShareLabel] = createSignal("");
  const [shareLiving, setShareLiving] = createSignal<LivingVisibility>("name");
  const [shareMedia, setShareMedia] = createSignal(false);
  const [shareExpiry, setShareExpiry] = createSignal("30");
  const [creatingShare, setCreatingShare] = createSignal(false);
  const [createdShare, setCreatedShare] = createSignal<CreatedTreeShareLink | null>(null);
  const [shareRows, setShareRows] = createSignal<TreeShareLinkView[] | null>(null);
  const [apiName, setApiName] = createSignal("");
  const [apiExpiry, setApiExpiry] = createSignal("90");
  const [apiScopes, setApiScopes] = createSignal<ApiScope[]>([...DEFAULT_API_SCOPES]);
  const [creatingApi, setCreatingApi] = createSignal(false);
  const [createdApi, setCreatedApi] = createSignal<CreatedApiToken | null>(null);
  const [apiRows, setApiRows] = createSignal<ApiTokenView[] | null>(null);

  createEffect(() => {
    const rows = invites();
    if (rows) setInviteRows(rows);
  });

  createEffect(() => {
    const rows = shareLinks();
    if (rows) setShareRows(rows);
  });

  createEffect(() => {
    const rows = apiTokens();
    if (rows) setApiRows(rows);
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
    | { kind: "revoke"; inviteId: string }
    | { kind: "revoke-share"; linkId: string }
    | { kind: "revoke-api"; tokenId: string }
    | null
  >(null);
  const [pending, setPending] = createSignal(false);
  const [deleteOpen, setDeleteOpen] = createSignal(false);
  const [deleteName, setDeleteName] = createSignal("");
  const [deletePending, setDeletePending] = createSignal(false);
  const [approveOpen, setApproveOpen] = createSignal(false);
  const [approvalPending, setApprovalPending] = createSignal(false);
  const [cancelPending, setCancelPending] = createSignal(false);

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

  async function unlinkMemberPerson(userId: string, name: string) {
    const result = await attemptAction(() =>
      clearMemberPerson({ treeId: params.treeId, userId }),
    );
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate([membersQuery.key, getTreeGraph.key]);
    toast.show(`${name} is no longer linked to a person.`, "success");
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

  async function copyShareLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.show("Share link copied.", "success");
    } catch {
      window.prompt("Copy this share link", url);
    }
  }

  function toggleApiScope(scope: ApiScope, checked: boolean) {
    setApiScopes(current =>
      checked
        ? [...new Set([...current, scope])]
        : current.filter(value => value !== scope),
    );
  }

  async function copyApiToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      toast.show("API token copied.", "success");
    } catch {
      window.prompt("Copy this API token", token);
    }
  }

  async function createApiToken() {
    if (creatingApi()) return;
    if (!apiScopes().length) {
      toast.show("Choose at least one scope.", "error");
      return;
    }
    setCreatingApi(true);
    const result = await attemptAction(() =>
      createTreeApiToken({
        treeId: params.treeId,
        name: apiName().trim() || "API token",
        expiresInDays: apiExpiry() === "never" ? null : Number(apiExpiry()),
        scopes: apiScopes(),
      }),
    );
    setCreatingApi(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setCreatedApi(result.data);
    setApiRows(rows => [result.data, ...(rows ?? [])]);
    setApiName("");
    setApiExpiry("90");
    setApiScopes([...DEFAULT_API_SCOPES]);
    await revalidate(apiTokensQuery.key);
    toast.show("API token created.", "success");
  }

  async function createShare() {
    if (creatingShare()) return;
    setCreatingShare(true);
    const expiresInDays = shareExpiry() === "never" ? null : Number(shareExpiry());
    const result = await attemptAction(() =>
      createTreeShareLink({
        treeId: params.treeId,
        label: shareLabel().trim() || null,
        livingVisibility: shareLiving(),
        includeMedia: shareMedia(),
        expiresInDays,
      }),
    );
    setCreatingShare(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setCreatedShare(result.data);
    setShareRows(rows => [result.data, ...(rows ?? [])]);
    setShareLabel("");
    await revalidate(shareLinksQuery.key);
    toast.show("Share link created.", "success");
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
        await revalidate([getMyTrees.key, getPendingDeletionTrees.key]);
        track("tree_left");
        toast.show("You left the tree.", "success");
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
      } else if (action.kind === "revoke-api") {
        const result = await attemptAction(() =>
          revokeTreeApiToken({ treeId: params.treeId, tokenId: action.tokenId }),
        );
        if (!result.ok) return toast.show(result.error, "error");
        setApiRows(rows =>
          rows?.map(row =>
            row.id === action.tokenId ? { ...row, revokedAt: new Date() } : row,
          ) ?? rows,
        );
        if (createdApi()?.id === action.tokenId) setCreatedApi(null);
        await revalidate(apiTokensQuery.key);
        toast.show("API token revoked.", "success");
      } else if (action.kind === "revoke-share") {
        const result = await attemptAction(() =>
          revokeTreeShareLink({ treeId: params.treeId, linkId: action.linkId }),
        );
        if (!result.ok) return toast.show(result.error, "error");
        setShareRows(rows =>
          rows?.map(row =>
            row.id === action.linkId ? { ...row, revokedAt: new Date() } : row,
          ) ?? rows,
        );
        if (createdShare()?.id === action.linkId) setCreatedShare(null);
        await revalidate(shareLinksQuery.key);
        toast.show("Share link revoked.", "success");
      }
      setConfirm(null);
    } finally {
      setPending(false);
    }
  }

  const owners = () => (members() ?? []).filter(member => member.role === "owner");
  const approvedIds = () =>
    new Set(overview()?.deletionRequest?.approvals.map(approval => approval.userId) ?? []);
  const ownersAwaiting = () => owners().filter(owner => !approvedIds().has(owner.userId));
  const isOnlyOwner = () => Boolean(members()) && owners().length === 1;
  const deleteNameMatches = () => deleteName().trim() === (overview()?.tree.name ?? "");

  function ownerCountLabel(count: number) {
    return count === 1 ? "1 owner" : `${count} owners`;
  }

  async function submitDeleteRequest(event: SubmitEvent) {
    event.preventDefault();
    if (deletePending() || !deleteNameMatches()) return;
    setDeletePending(true);
    const result = await attemptAction(() =>
      requestTreeDeletion({
        treeId: params.treeId,
        confirmationName: deleteName(),
      }),
    );
    setDeletePending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setDeleteOpen(false);
    setDeleteName("");
    await revalidate([
      overviewQuery.key,
      membersQuery.key,
      getMyTrees.key,
      getPendingDeletionTrees.key,
    ]);
    if (result.data.scheduled) {
      track("tree_deleted");
      toast.show(
        "Tree scheduled for deletion. You can restore it from Your trees for 30 days.",
        "success",
      );
      navigate("/trees");
      return;
    }
    track("tree_deletion_requested");
    const waiting = ownerCountLabel(result.data.ownersAwaiting);
    toast.show(
      result.data.emailsSent > 0
        ? `Deletion requested. We emailed the other owners. Waiting on ${waiting}.`
        : `Deletion requested. Waiting on ${waiting} to approve.`,
      "success",
    );
  }

  async function approveDeletion() {
    if (approvalPending()) return;
    setApprovalPending(true);
    const result = await attemptAction(() => approveTreeDeletion(params.treeId));
    setApprovalPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setApproveOpen(false);
    await revalidate([
      overviewQuery.key,
      getMyTrees.key,
      getPendingDeletionTrees.key,
    ]);
    if (result.data.scheduled) {
      track("tree_deleted");
      toast.show(
        "Every owner approved. The tree can be restored from Your trees for 30 days.",
        "success",
      );
      navigate("/trees");
      return;
    }
    toast.show(
      `Approval recorded. Waiting on ${ownerCountLabel(result.data.ownersAwaiting)}.`,
      "success",
    );
  }

  async function cancelDeletionRequest() {
    if (cancelPending()) return;
    setCancelPending(true);
    const result = await attemptAction(() => cancelTreeDeletionRequest(params.treeId));
    setCancelPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate([overviewQuery.key]);
    toast.show("Deletion request cancelled. The tree is unchanged.", "success");
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

            <Tabs defaultValue={defaultTab} class="gap-5">
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
                  <TabsTrigger value="sharing" data-testid="tree-settings-tab-sharing">
                    <Share2 />
                    Sharing
                  </TabsTrigger>
                </Show>
                <TabsTrigger value="danger" data-testid="tree-settings-tab-danger">
                  <ShieldAlert />
                  Danger
                </TabsTrigger>
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
                            <p class="truncate text-xs text-muted-foreground">
                              <Show
                                when={member.personName}
                                fallback="Not linked to a person in the tree"
                              >
                                Linked to {member.personName}
                              </Show>
                            </p>
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
                            <Show when={member.personId}>
                              <IconButton
                                label={`Unlink ${member.displayName} from ${member.personName}`}
                                variant="ghost"
                                size="icon-sm"
                                onClick={() =>
                                  unlinkMemberPerson(member.userId, member.displayName)
                                }
                              >
                                <Unlink />
                              </IconButton>
                            </Show>
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

                <TabsContent value="sharing">
                  <SectionCard
                    title="Public share links"
                    description="Create a read-only link anyone can open without an account. Living people default to names only, and media is off."
                  >
                    <div class="grid gap-3 sm:grid-cols-2 sm:items-end">
                      <Field label="Label" for="share-label" hint="Only you see this.">
                        <input
                          id="share-label"
                          class="input"
                          maxlength={80}
                          placeholder="Cousins in Ohio"
                          value={shareLabel()}
                          onInput={event => setShareLabel(event.currentTarget.value)}
                          data-testid="share-create-label"
                        />
                      </Field>
                      <Field label="Living people" for="share-living">
                        <select
                          id="share-living"
                          class="input"
                          value={shareLiving()}
                          onChange={event =>
                            setShareLiving(event.currentTarget.value as LivingVisibility)
                          }
                          data-testid="share-create-living"
                        >
                          <option value="hidden">Hide living people</option>
                          <option value="name">Names only</option>
                          <option value="full">Full details</option>
                        </select>
                      </Field>
                      <Field label="Expires" for="share-expiry">
                        <select
                          id="share-expiry"
                          class="input"
                          value={shareExpiry()}
                          onChange={event => setShareExpiry(event.currentTarget.value)}
                          data-testid="share-create-expiry"
                        >
                          <option value="1">In 1 day</option>
                          <option value="7">In 7 days</option>
                          <option value="30">In 30 days</option>
                          <option value="90">In 90 days</option>
                          <option value="never">Never</option>
                        </select>
                      </Field>
                      <label class="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-sm">
                        <input
                          type="checkbox"
                          class="size-4 accent-primary"
                          checked={shareMedia()}
                          onChange={event => setShareMedia(event.currentTarget.checked)}
                          data-testid="share-create-media"
                        />
                        Include photos as thumbnails
                      </label>
                      <div class="sm:col-span-2">
                        <Button
                          type="button"
                          onClick={createShare}
                          disabled={creatingShare()}
                          data-testid="share-create-submit"
                        >
                          <Plus />
                          {creatingShare() ? "Creating…" : "Create share link"}
                        </Button>
                      </div>
                    </div>

                    <Show when={createdShare()}>
                      {created => (
                        <div
                          class="mt-5 rounded-xl border border-primary/25 bg-accent/50 p-3"
                          data-testid="share-created"
                        >
                          <p class="text-xs font-semibold text-primary">
                            Copy this link now. It is not shown again.
                          </p>
                          <div class="mt-2 flex flex-wrap gap-2">
                            <input
                              readonly
                              class="input min-w-0 flex-1 font-mono text-xs"
                              value={created().url}
                              data-testid="share-created-url"
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => copyShareLink(created().url)}
                              data-testid="share-created-copy"
                            >
                              <Copy size={14} />
                              Copy
                            </Button>
                          </div>
                        </div>
                      )}
                    </Show>

                    <div class="mt-6">
                      <h3 class="field-label">Active and past links</h3>
                      <Show
                        when={shareRows()?.length}
                        fallback={
                          <p
                            class="mt-2 rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
                            data-testid="share-links-empty"
                          >
                            No share links yet.
                          </p>
                        }
                      >
                        <div class="mt-2 space-y-1" data-testid="share-links-list">
                          <For each={shareRows()}>
                            {link => (
                              <div
                                class="flex flex-wrap items-center gap-3 rounded-xl px-2 py-2 text-sm transition hover:bg-accent/50"
                                data-testid={`share-link-row-${link.id}`}
                              >
                                <Share2 size={15} class="text-muted-foreground" />
                                <div class="min-w-0 flex-1">
                                  <p class="font-medium">{link.label}</p>
                                  <p class="text-xs text-muted-foreground">
                                    {shareLivingLabel(link.livingVisibility)} ·{" "}
                                    {link.includeMedia ? "Photos on" : "No photos"} ·{" "}
                                    {shareStatus(link)} · {formatRelative(link.createdAt)}
                                  </p>
                                </div>
                                <Show when={!link.revokedAt && linkStatusActive(link)}>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    class="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() =>
                                      setConfirm({ kind: "revoke-share", linkId: link.id })
                                    }
                                    data-testid={`share-link-revoke-${link.id}`}
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

                  <div class="mt-5">
                    <SectionCard
                      title="Developer API"
                      description="Read-only tokens for scripts, notebooks, and other tools. A token can read this entire tree, including living relatives. Only owners can create one."
                    >
                      <div class="grid gap-3 sm:grid-cols-2 sm:items-end">
                        <Field label="Token name" for="api-name" hint="Only you see this.">
                          <input
                            id="api-name"
                            class="input"
                            maxlength={80}
                            placeholder="Research notebook"
                            value={apiName()}
                            onInput={event => setApiName(event.currentTarget.value)}
                            data-testid="api-token-name"
                          />
                        </Field>
                        <Field label="Expires" for="api-expiry">
                          <select
                            id="api-expiry"
                            class="input"
                            value={apiExpiry()}
                            onChange={event => setApiExpiry(event.currentTarget.value)}
                            data-testid="api-token-expiry"
                          >
                            <option value="30">In 30 days</option>
                            <option value="90">In 90 days</option>
                            <option value="365">In 1 year</option>
                            <option value="never">Never</option>
                          </select>
                        </Field>
                        <div class="sm:col-span-2">
                          <p class="field-label mb-2">Scopes</p>
                          <div class="grid gap-2 sm:grid-cols-2">
                            <For each={API_SCOPES}>
                              {scope => (
                                <label class="flex items-start gap-2.5 rounded-xl border border-border px-3 py-2.5 text-sm">
                                  <input
                                    type="checkbox"
                                    class="mt-0.5 size-4 accent-primary"
                                    checked={apiScopes().includes(scope.value)}
                                    onChange={event =>
                                      toggleApiScope(scope.value, event.currentTarget.checked)
                                    }
                                    data-testid={`api-token-scope-${scope.value}`}
                                  />
                                  <span>
                                    <span class="block font-medium">{scope.label}</span>
                                    <span class="mt-0.5 block text-xs text-muted-foreground">
                                      {scope.description}
                                    </span>
                                  </span>
                                </label>
                              )}
                            </For>
                          </div>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 sm:col-span-2">
                          <Button
                            type="button"
                            onClick={createApiToken}
                            disabled={creatingApi()}
                            data-testid="api-token-create"
                          >
                            <KeyRound size={15} />
                            {creatingApi() ? "Creating…" : "Create token"}
                          </Button>
                          <A
                            href="/docs/api"
                            target="_blank"
                            rel="noreferrer"
                            class={buttonVariants({ variant: "secondary", size: "sm" })}
                            data-testid="api-docs-link"
                          >
                            API docs
                          </A>
                          <A
                            href="/api/v1/openapi.json"
                            target="_blank"
                            rel="noreferrer"
                            class={buttonVariants({ variant: "secondary", size: "sm" })}
                            data-testid="api-openapi-link"
                          >
                            OpenAPI spec
                          </A>
                        </div>
                      </div>

                      <Show when={createdApi()}>
                        {created => (
                          <div
                            class="mt-5 rounded-xl border border-primary/25 bg-accent/50 p-3"
                            data-testid="api-token-created"
                          >
                            <p class="text-xs font-semibold text-primary">
                              Copy this token now. It is not shown again.
                            </p>
                            <div class="mt-2 flex flex-wrap gap-2">
                              <input
                                readonly
                                class="input min-w-0 flex-1 font-mono text-xs"
                                value={created().token}
                                data-testid="api-token-created-value"
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => copyApiToken(created().token)}
                                data-testid="api-token-created-copy"
                              >
                                <Copy size={14} />
                                Copy
                              </Button>
                            </div>
                          </div>
                        )}
                      </Show>

                      <div class="mt-6">
                        <h3 class="field-label">Active and past tokens</h3>
                        <Show
                          when={apiRows()?.length}
                          fallback={
                            <p
                              class="mt-2 rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
                              data-testid="api-tokens-empty"
                            >
                              No API tokens yet.
                            </p>
                          }
                        >
                          <div class="mt-2 space-y-1" data-testid="api-token-list">
                            <For each={apiRows()}>
                              {token => (
                                <div
                                  class="flex flex-wrap items-center gap-3 rounded-xl px-2 py-2 text-sm transition hover:bg-accent/50"
                                  data-testid={`api-token-row-${token.id}`}
                                >
                                  <KeyRound size={15} class="text-muted-foreground" />
                                  <div class="min-w-0 flex-1">
                                    <p class="font-medium">{token.name}</p>
                                    <p class="text-xs text-muted-foreground">
                                      {token.tokenPrefix}… ·{" "}
                                      {token.scopes.map(scopeLabel).join(", ")}
                                    </p>
                                    <p class="text-xs text-muted-foreground">
                                      {apiTokenStatus(token)}
                                      <Show when={token.lastUsedAt}>
                                        {" "}
                                        · used {formatRelative(token.lastUsedAt)}
                                      </Show>
                                      <Show when={token.expiresAt}>
                                        {" "}
                                        · expires {formatRelative(token.expiresAt)}
                                      </Show>
                                    </p>
                                  </div>
                                  <Show when={!token.revokedAt}>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      class="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      onClick={() =>
                                        setConfirm({ kind: "revoke-api", tokenId: token.id })
                                      }
                                      data-testid={`api-token-revoke-${token.id}`}
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
                  </div>
                </TabsContent>

                <TabsContent value="danger">
                  <div class="space-y-5" data-testid="tree-danger-tab">
                    <div class="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3.5">
                      <div class="flex items-start gap-3">
                        <span class="mt-0.5 shrink-0 text-destructive">
                          <ShieldAlert size={18} />
                        </span>
                        <div>
                          <p class="text-sm font-semibold text-destructive">
                            Actions here affect everyone in the tree.
                          </p>
                          <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
                            Leaving removes only your access. Deleting locks the tree for every
                            member, emails them, and erases it after 30 days.
                          </p>
                        </div>
                      </div>
                    </div>

                    <SectionCard
                      title="Leave this tree"
                      description="Your access ends, but the tree and everything in it stays for the other members."
                    >
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => setConfirm({ kind: "leave" })}
                        data-testid="tree-danger-leave-button"
                      >
                        <LogOut />
                        Leave this tree
                      </Button>
                      <p class="mt-3 text-xs leading-relaxed text-muted-foreground">
                        {isOnlyOwner()
                          ? "You are the only owner. Promote another member to owner before leaving."
                          : "You can only rejoin later with a new invite."}
                      </p>
                    </SectionCard>

                    <Show when={isOwner()}>
                      <SectionCard
                        title="Delete this tree"
                        description="Deleting is deliberately slow. It takes the exact tree name, every owner, and a 30 day wait."
                      >
                        <Show
                          when={overview()?.deletionRequest}
                          fallback={
                            <div data-testid="tree-deletion-idle">
                              <ul class="space-y-2 text-xs leading-relaxed text-muted-foreground">
                                <li class="flex gap-2">
                                  <span class="font-semibold text-foreground">1.</span>
                                  You type the exact tree name.
                                </li>
                                <li class="flex gap-2">
                                  <span class="font-semibold text-foreground">2.</span>
                                  {isOnlyOwner()
                                    ? "As the only owner, your confirmation schedules the deletion."
                                    : "Every current owner must approve. One refusal stops it."}
                                </li>
                                <li class="flex gap-2">
                                  <span class="font-semibold text-foreground">3.</span>
                                  The tree is locked and kept for 30 days. Any owner can restore it
                                  from Your trees until then.
                                </li>
                              </ul>
                              <div class="mt-4 flex flex-wrap gap-2">
                                <a
                                  href="/api/account/export?media=1"
                                  download="family-tree-export-with-files.zip"
                                  class={buttonVariants({ variant: "secondary", size: "sm" })}
                                  data-testid="tree-deletion-export"
                                >
                                  <Download />
                                  Download a copy first
                                </a>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  type="button"
                                  onClick={() => {
                                    setDeleteName("");
                                    setDeleteOpen(true);
                                  }}
                                  data-testid="tree-danger-delete-button"
                                >
                                  <Trash2 />
                                  Request deletion
                                </Button>
                              </div>
                              <Show when={isOnlyOwner()}>
                                <p class="mt-3 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                                  You are the only owner of this tree. Requesting deletion schedules
                                  it straight away, but it stays restorable for 30 days.
                                </p>
                              </Show>
                            </div>
                          }
                        >
                          {request => (
                            <div
                              class="rounded-xl border border-destructive/30 bg-destructive/5 p-3.5"
                              data-testid="tree-deletion-request-card"
                            >
                              <p class="text-sm font-semibold text-destructive">
                                Deletion requested {formatRelative(request().createdAt)}
                              </p>
                              <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {request().requestedByName} asked to delete this tree. Every
                                current owner must approve. The request expires{" "}
                                {formatRelative(request().expiresAt)} and nothing happens if it
                                lapses.
                              </p>

                              <ul class="mt-3 divide-y divide-border border-y border-border">
                                <For each={owners()}>
                                  {owner => (
                                    <li
                                      class="flex items-center gap-3 py-2.5"
                                      data-testid={`tree-deletion-owner-row-${owner.userId}`}
                                    >
                                      <Avatar name={owner.displayName} size={30} />
                                      <div class="min-w-0 flex-1">
                                        <p class="truncate text-sm font-medium">
                                          {owner.displayName}
                                          <Show when={owner.userId === currentUser().id}>
                                            <span class="ml-1.5 text-xs font-normal text-muted-foreground">
                                              you
                                            </span>
                                          </Show>
                                        </p>
                                        <p class="truncate text-xs text-muted-foreground">
                                          {owner.email}
                                        </p>
                                      </div>
                                      <Show
                                        when={approvedIds().has(owner.userId)}
                                        fallback={
                                          <Badge variant="secondary" class="uppercase tracking-wide">
                                            Waiting
                                          </Badge>
                                        }
                                      >
                                        <Badge class="bg-primary/10 uppercase tracking-wide text-primary">
                                          Approved
                                        </Badge>
                                      </Show>
                                    </li>
                                  )}
                                </For>
                              </ul>

                              <div class="mt-3 flex flex-wrap gap-2">
                                <Show when={!approvedIds().has(currentUser().id)}>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    type="button"
                                    onClick={() => setApproveOpen(true)}
                                    data-testid="tree-deletion-approve-button"
                                  >
                                    Approve deletion
                                  </Button>
                                </Show>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  type="button"
                                  disabled={cancelPending()}
                                  onClick={() => void cancelDeletionRequest()}
                                  data-testid="tree-deletion-cancel-request-button"
                                >
                                  {cancelPending() ? "Cancelling…" : "Cancel request"}
                                </Button>
                              </div>
                              <Show when={ownersAwaiting().length > 0}>
                                <p class="mt-2 text-xs text-muted-foreground">
                                  Waiting on {ownerCountLabel(ownersAwaiting().length)}.
                                </p>
                              </Show>
                            </div>
                          )}
                        </Show>
                      </SectionCard>
                    </Show>
                  </div>
                </TabsContent>
              </Show>
            </Tabs>

          </main>

          <Modal
            open={deleteOpen()}
            onClose={() => {
              setDeleteOpen(false);
              setDeleteName("");
            }}
            title={`Delete ${overview()?.tree.name ?? "this tree"}?`}
            description="This starts the deletion process. Nothing is erased yet."
            testId="tree-delete-dialog"
          >
            <form class="space-y-4" onSubmit={submitDeleteRequest}>
              <div class="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
                <p class="font-semibold text-destructive">
                  {overview()?.tree.name ?? "This tree"} has{" "}
                  {overview()?.peopleCount ?? 0} people and{" "}
                  {overview()?.memberCount ?? 0} members.
                </p>
                <p class="mt-1.5">
                  {isOnlyOwner()
                    ? "You are the only owner, so confirming schedules the deletion. It stays restorable for 30 days."
                    : "Every owner must approve before anything is scheduled. If one owner does not approve, the tree is untouched."}
                </p>
                <p class="mt-1.5">
                  Once scheduled, the tree is locked, and any owner can restore it from Your trees
                  during the 30 day grace period.
                </p>
              </div>
              <Field
                label="Tree name"
                for="tree-delete-name"
                hint={`Type ${overview()?.tree.name ?? "the tree name"} exactly to continue.`}
              >
                <input
                  id="tree-delete-name"
                  class="input"
                  autocomplete="off"
                  value={deleteName()}
                  onInput={event => setDeleteName(event.currentTarget.value)}
                  data-testid="tree-delete-name-input"
                  required
                />
              </Field>
              <div class="flex flex-wrap justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteName("");
                  }}
                  data-testid="tree-delete-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={deletePending() || !deleteNameMatches()}
                  data-testid="tree-delete-submit"
                >
                  {deletePending()
                    ? "Working…"
                    : isOnlyOwner()
                      ? "Schedule deletion"
                      : "Request deletion"}
                </Button>
              </div>
            </form>
          </Modal>

          <ConfirmDialog
            open={approveOpen()}
            onClose={() => setApproveOpen(false)}
            title="Approve deleting this tree?"
            message="This is your approval. When every owner approves, the tree is locked and permanently erased in 30 days. Any owner can restore it before then."
            confirmLabel="Approve deletion"
            danger
            pending={approvalPending()}
            testId="tree-deletion-approve-dialog"
            onConfirm={() => void approveDeletion()}
          />

          <ConfirmDialog
            open={Boolean(confirm())}
            onClose={() => setConfirm(null)}
            title={confirmTitle(confirm())}
            message={confirmMessage(confirm(), overview()?.tree.name ?? "this tree")}
            confirmLabel={confirmLabel(confirm())}
            danger={
              confirm()?.kind === "remove" ||
              confirm()?.kind === "revoke-share" ||
              confirm()?.kind === "revoke-api"
            }
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

function shareLivingLabel(visibility: LivingVisibility) {
  if (visibility === "hidden") return "Living hidden";
  if (visibility === "full") return "Living full details";
  return "Living names only";
}

function linkStatusActive(link: { revokedAt: Date | null; expiresAt: Date | null }) {
  if (link.revokedAt) return false;
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

function shareStatus(link: {
  revokedAt: Date | null;
  expiresAt: Date | null;
  lastAccessedAt: Date | null;
}) {
  if (link.revokedAt) return "Revoked";
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return "Expired";
  if (link.expiresAt) return `Expires ${formatRelative(link.expiresAt)}`;
  return "No expiry";
}

function confirmTitle(action: { kind: string } | null) {
  if (!action) return "";
  if (action.kind === "remove") return "Remove this member?";
  if (action.kind === "leave") return "Leave this tree?";
  if (action.kind === "revoke-share") return "Revoke this share link?";
  if (action.kind === "revoke-api") return "Revoke this API token?";
  return "Revoke this invite?";
}

function confirmLabel(action: { kind: string } | null) {
  if (!action) return "Confirm";
  if (action.kind === "remove") return "Remove member";
  if (action.kind === "leave") return "Leave tree";
  if (action.kind === "revoke-share") return "Revoke link";
  if (action.kind === "revoke-api") return "Revoke token";
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
  if (action.kind === "revoke-share") {
    return "Anyone with this link will lose access immediately. You can create a new link at any time.";
  }
  if (action.kind === "revoke-api") {
    return "Any script or app using this token will start receiving 401 responses immediately. This cannot be undone.";
  }
  return "Anyone using this link will no longer be able to join.";
}

function apiTokenStatus(token: ApiTokenView) {
  if (token.revokedAt) return "Revoked";
  if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) {
    return "Expired";
  }
  return "Active";
}
