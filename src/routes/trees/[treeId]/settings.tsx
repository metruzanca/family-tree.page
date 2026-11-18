import { For, Show, createEffect, createSignal } from "solid-js";
import { A, createAsync, useNavigate, useParams, useSearchParams, revalidate } from "@solidjs/router";
import { Copy, Download, KeyRound, Link2, LogOut, Mail, Plus, RotateCw, Settings, Share2, Shield, ShieldAlert, Trash2, Unlink, Upload, Users } from "lucide-solid";
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
import { formatRelative, roleKey } from "~/lib/format";
import { attemptAction } from "~/lib/action-result";
import { track } from "~/lib/analytics";
import { useI18n } from "~/i18n/LocaleProvider";
import { Trans } from "~/i18n/Trans";
import type { Locale, TranslationKey, TranslationParams } from "~/i18n";

type Translate = (key: TranslationKey, params?: TranslationParams) => string;

type InviteStatus = "pending" | "used" | "revoked" | "expired";

const inviteStatusKeys: Record<InviteStatus, TranslationKey> = {
  pending: "tree.invites.status.pending",
  used: "tree.invites.status.used",
  revoked: "tree.invites.status.revoked",
  expired: "tree.invites.status.expired",
};

const scopeLabels: Record<ApiScope, TranslationKey> = {
  "tree:read": "tree.settings.api.scope.tree.label",
  "people:read": "tree.settings.api.scope.people.label",
  "media:read": "tree.settings.api.scope.media.label",
  "changes:read": "tree.settings.api.scope.changes.label",
  "export:read": "tree.settings.api.scope.export.label",
};

const scopeDescriptions: Record<ApiScope, TranslationKey> = {
  "tree:read": "tree.settings.api.scope.tree.description",
  "people:read": "tree.settings.api.scope.people.description",
  "media:read": "tree.settings.api.scope.media.description",
  "changes:read": "tree.settings.api.scope.changes.description",
  "export:read": "tree.settings.api.scope.export.description",
};

export const route = {
  preload: ({ params }: { params: { treeId: string } }) => {
    requireUserPage();
    overviewQuery(params.treeId);
    membersQuery(params.treeId);
  },
};

export default function TreeSettingsPage() {
  const { t } = useI18n();
  return (
    <AppErrorBoundary
      title={t("tree.settings.error.title")}
      message={t("tree.error.unavailable")}
      revalidateKeys={[
        requireUserPage.key,
        overviewQuery.key,
        membersQuery.key,
        invitesQuery.key,
      ]}
      back={{ href: "/trees", label: t("notFound.back") }}
    >
      <TreeSettingsInner />
    </AppErrorBoundary>
  );
}

function TreeSettingsInner() {
  const params = useParams<{ treeId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { t, locale } = useI18n();

  const roleOptions = (): { value: TreeRole; label: string }[] =>
    (["owner", "editor", "viewer"] as TreeRole[]).map(value => ({
      value,
      label: t(roleKey(value)),
    }));

  const expiryOptions = (): { value: string; label: string }[] => [
    { value: "1", label: t("tree.settings.in1Day") },
    { value: "7", label: t("tree.settings.in7Days") },
    { value: "30", label: t("tree.settings.in30Days") },
  ];

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
  const canImport = () =>
    overview()?.role === "owner" || overview()?.role === "editor";
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
    toast.show(t("tree.settings.saved"), "success");
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
    toast.show(t("tree.members.roleUpdated"), "success");
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
    toast.show(t("tree.members.unlinked", { name }), "success");
  }

  async function createNewInvite() {
    if (creatingInvite()) return;
    const email = inviteMode() === "email" ? inviteEmail().trim() : null;
    if (inviteMode() === "email" && !email) {
      toast.show(t("tree.invites.emailRequired"), "error");
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
      toast.show(result.data.emailError ?? t("tree.invites.emailFailed"), "error");
      return;
    }
    if (result.data.emailSimulated) {
      toast.show(t("tree.invites.createdSimulated"), "success");
      return;
    }
    toast.show(
      result.data.email ? t("tree.invites.sent") : t("tree.invites.linkCreated"),
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
      toast.show(result.data.emailError ?? t("tree.invites.emailFailed"), "error");
      return;
    }
    toast.show(
      result.data.emailSimulated
        ? t("tree.invites.createdSimulatedShort")
        : t("tree.invites.resent"),
      "success",
    );
  }

  async function copyInvite(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.show(t("tree.invites.copied"), "success");
    } catch {
      window.prompt(t("tree.invites.copyPrompt"), url);
    }
  }

  async function copyShareLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.show(t("tree.settings.share.copied"), "success");
    } catch {
      window.prompt(t("tree.settings.share.copyPrompt"), url);
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
      toast.show(t("tree.settings.api.copied"), "success");
    } catch {
      window.prompt(t("tree.settings.api.copyPrompt"), token);
    }
  }

  async function createApiToken() {
    if (creatingApi()) return;
    if (!apiScopes().length) {
      toast.show(t("tree.settings.api.scopeRequired"), "error");
      return;
    }
    setCreatingApi(true);
    const result = await attemptAction(() =>
      createTreeApiToken({
        treeId: params.treeId,
        name: apiName().trim() || t("tree.settings.api.defaultName"),
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
    toast.show(t("tree.settings.api.created"), "success");
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
    toast.show(t("tree.settings.share.created"), "success");
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
        toast.show(t("tree.members.removed"), "success");
      } else if (action.kind === "leave") {
        const result = await attemptAction(() => leaveTree(params.treeId));
        if (!result.ok) return toast.show(result.error, "error");
        await revalidate([getMyTrees.key, getPendingDeletionTrees.key]);
        track("tree_left");
        toast.show(t("tree.settings.danger.left"), "success");
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
        toast.show(t("tree.invites.revoked"), "success");
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
        toast.show(t("tree.settings.api.revoked"), "success");
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
        toast.show(t("tree.settings.share.revoked"), "success");
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
    return t("tree.settings.ownerCount", { count });
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
      toast.show(t("tree.settings.danger.scheduled"), "success");
      navigate("/trees");
      return;
    }
    track("tree_deletion_requested");
    const waiting = ownerCountLabel(result.data.ownersAwaiting);
    toast.show(
      result.data.emailsSent > 0
        ? t("tree.settings.danger.requestedEmailed", { owners: waiting })
        : t("tree.settings.danger.requestedWaiting", { owners: waiting }),
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
      toast.show(t("tree.settings.danger.approvedAll"), "success");
      navigate("/trees");
      return;
    }
    toast.show(
      t("tree.settings.danger.approvalRecorded", {
        owners: ownerCountLabel(result.data.ownersAwaiting),
      }),
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
    toast.show(t("tree.settings.danger.cancelled"), "success");
  }

  return (
    <Show when={user()}>
      {currentUser => (
        <div class="page-shell min-h-[100dvh]">
          <AppHeader
            user={currentUser()}
            back={{ href: `/trees/${params.treeId}`, label: t("tree.backToTree") }}
            center={overview()?.tree.name ?? t("tree.settings.title")}
          />
          <main class="mx-auto max-w-4xl px-4 pb-20 pt-8 sm:px-6">
            <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p class="eyebrow mb-2">{t("tree.settings.title")}</p>
                <h1 class="font-display text-4xl tracking-tight">{overview()?.tree.name}</h1>
                <p class="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    {t("common.person", { count: overview()?.peopleCount ?? 0 })} ·{" "}
                    {t("trees.member", { count: overview()?.memberCount ?? 0 })}
                  </span>
                  <Badge variant="secondary" class="uppercase tracking-wide">
                    {t(roleKey(overview()?.role ?? "viewer"))}
                  </Badge>
                </p>
              </div>
            </div>

            <Tabs defaultValue={defaultTab} class="gap-5">
              <TabsList class="max-w-full overflow-x-auto">
                <TabsIndicator />
                <TabsTrigger value="tree">
                  <Settings />
                  {t("tree.settings.tabTree")}
                </TabsTrigger>
                <TabsTrigger value="members">
                  <Users />
                  {t("tree.settings.tabMembers")}
                </TabsTrigger>
                <Show when={isOwner()}>
                  <TabsTrigger value="invites">
                    <Link2 />
                    {t("tree.settings.tabInvites")}
                  </TabsTrigger>
                  <TabsTrigger value="sharing" data-testid="tree-settings-tab-sharing">
                    <Share2 />
                    {t("tree.settings.tabSharing")}
                  </TabsTrigger>
                </Show>
                <TabsTrigger value="danger" data-testid="tree-settings-tab-danger">
                  <ShieldAlert />
                  {t("tree.settings.tabDanger")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="tree">
                <SectionCard
                  title={t("tree.settings.tree.title")}
                  description={t("tree.settings.tree.description")}
                >
                  <form class="space-y-4" onSubmit={saveTree}>
                    <Field label={t("tree.create.name")} for="settings-name">
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
                    <Field label={t("tree.create.descriptionLabel")} for="settings-description">
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
                        {saving() ? t("auth.saving") : t("tree.settings.saveChanges")}
                      </Button>
                    </Show>
                  </form>
                </SectionCard>

                <SectionCard
                  class="mt-5"
                  title="GEDCOM"
                  description={t("tree.settings.gedcom.description")}
                >
                  <div class="flex flex-wrap items-center gap-3">
                    <A
                      href={`/api/trees/${params.treeId}/gedcom`}
                      class={buttonVariants({ variant: "secondary" })}
                      data-testid="tree-export-gedcom"
                    >
                      <Download size={15} />
                      GEDCOM 5.5.1
                    </A>
                    <A
                      href={`/api/trees/${params.treeId}/gedcom?version=7`}
                      class={buttonVariants({ variant: "secondary" })}
                      data-testid="tree-export-gedcom-7"
                    >
                      <Download size={15} />
                      GEDCOM 7
                    </A>
                    <Show when={canImport()}>
                      <A
                        href={`/trees/${params.treeId}/import`}
                        class={buttonVariants({ variant: "secondary" })}
                        data-testid="tree-import-gedcom"
                      >
                        <Upload size={15} />
                        {t("tree.settings.gedcom.import")}
                      </A>
                    </Show>
                  </div>
                  <p class="mt-2 text-xs text-muted-foreground">
                    {t("tree.settings.gedcom.includes")}
                  </p>
                  <p class="mt-2 text-xs leading-relaxed text-muted-foreground">
                    <Trans
                      key="tree.settings.gedcom.sexNote"
                      components={{
                        code: <code class="mx-1 rounded bg-muted px-1">SEX U</code>,
                      }}
                    />
                  </p>
                </SectionCard>
              </TabsContent>

              <TabsContent value="members">
                <SectionCard
                  title={t("tree.members.title")}
                  description={t("tree.members.description")}
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
                                  {t("tree.members.you")}
                                </span>
                              </Show>
                            </p>
                            <p class="truncate text-xs text-muted-foreground">{member.email}</p>
                            <p class="truncate text-xs text-muted-foreground">
                              <Show
                                when={member.personName}
                                fallback={t("tree.members.notLinked")}
                              >
                                {t("tree.members.linked", { name: member.personName ?? "" })}
                              </Show>
                            </p>
                          </div>
                          <Show
                            when={isOwner() && member.userId !== currentUser().id}
                            fallback={
                              <Badge variant="secondary" class="uppercase tracking-wide">
                                {t(roleKey(member.role))}
                              </Badge>
                            }
                          >
                            <Select
                              options={roleOptions()}
                              optionValue="value"
                              optionTextValue="label"
                              value={roleOptions().find(option => option.value === member.role)}
                              onChange={option => option && changeRole(member.userId, option.value)}
                              itemComponent={itemProps => (
                                <SelectItem item={itemProps.item}>
                                  {itemProps.item.rawValue.label}
                                </SelectItem>
                              )}
                            >
                              <SelectTrigger
                                size="sm"
                                class="w-32"
                                aria-label={t("tree.members.role")}
                              >
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
                                label={t("tree.members.unlink", {
                                  name: member.displayName,
                                  person: member.personName ?? "",
                                })}
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
                              label={t("tree.members.remove", { name: member.displayName })}
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
                    title={t("tree.invites.title")}
                    description={t("tree.invites.description")}
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
                        {t("tree.invites.shareLink")}
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
                        {t("tree.invites.sendByEmail")}
                      </button>
                    </div>

                    <div class="mt-4 grid gap-3 sm:grid-cols-2 sm:items-end">
                      <Field label={t("tree.invites.role")} for="invite-role">
                        <Select
                          options={roleOptions()}
                          optionValue="value"
                          optionTextValue="label"
                          value={roleOptions().find(option => option.value === inviteRole())}
                          onChange={option => option && setInviteRole(option.value)}
                          itemComponent={itemProps => (
                            <SelectItem item={itemProps.item}>
                              {itemProps.item.rawValue.label}
                            </SelectItem>
                          )}
                        >
                          <SelectTrigger
                            id="invite-role"
                            class="w-full"
                            aria-label={t("tree.invites.roleAria")}
                          >
                            <SelectValue<{ value: TreeRole; label: string }>>
                              {state => state.selectedOption().label}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectPortal>
                            <SelectContent />
                          </SelectPortal>
                        </Select>
                      </Field>
                      <Field label={t("tree.settings.expires")} for="invite-days">
                        <Select
                          options={expiryOptions()}
                          optionValue="value"
                          optionTextValue="label"
                          value={expiryOptions().find(
                            option => option.value === String(inviteDays()),
                          )}
                          onChange={option => option && setInviteDays(Number(option.value))}
                          itemComponent={itemProps => (
                            <SelectItem item={itemProps.item}>
                              {itemProps.item.rawValue.label}
                            </SelectItem>
                          )}
                        >
                          <SelectTrigger
                            id="invite-days"
                            class="w-full"
                            aria-label={t("tree.invites.expiryAria")}
                          >
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
                          label={t("tree.invites.email")}
                          for="invite-email"
                          class="sm:col-span-2"
                          hint={canEmailInvites() ? t("tree.invites.emailHint") : undefined}
                        >
                          <input
                            id="invite-email"
                            type="email"
                            class="input"
                            placeholder={t("tree.invites.emailPlaceholder")}
                            autocomplete="email"
                            value={inviteEmail()}
                            onInput={event => setInviteEmail(event.currentTarget.value)}
                            disabled={!canEmailInvites()}
                          />
                        </Field>
                        <Show when={!canEmailInvites()}>
                          <p class="rounded-xl border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground sm:col-span-2">
                            <Trans
                              key="tree.invites.confirmEmail"
                              components={{
                                resend: (
                                  <A
                                    href="/settings"
                                    class="font-semibold text-primary underline decoration-primary/30 underline-offset-4"
                                  >
                                    {t("tree.invites.resendVerification")}
                                  </A>
                                ),
                              }}
                            />
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
                            ? t("tree.settings.working")
                            : inviteMode() === "email"
                              ? t("tree.invites.send")
                              : t("tree.invites.createLink")}
                        </Button>
                      </div>
                    </div>

                    <Show when={createdInvite()}>
                      {invite => (
                        <div class="mt-4 rounded-2xl border border-primary/25 bg-accent p-3">
                          <p class="mb-2 text-xs font-semibold text-primary">
                            {invite().email
                              ? invite().emailSimulated
                                ? t("tree.invites.created.dev", {
                                    email: invite().email ?? "",
                                  })
                                : invite().emailSent
                                  ? t("tree.invites.created.emailed", {
                                      email: invite().email ?? "",
                                    })
                                  : t("tree.invites.created.failed", {
                                      email: invite().email ?? "",
                                    })
                              : t("tree.invites.created.link")}
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
                              {t("common.copy")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </Show>

                    <div class="mt-5">
                      <h3 class="field-label mb-2">{t("tree.invites.recent")}</h3>
                      <Show
                        when={inviteRows()?.length}
                        fallback={
                          <p class="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                            {t("tree.invites.empty")}
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
                                  <p class="font-medium">
                                    {t("tree.invites.roleInvite", {
                                      role: t(roleKey(invite.role)),
                                    })}
                                  </p>
                                  <Show when={invite.email}>
                                    <p class="truncate text-xs text-foreground">{invite.email}</p>
                                  </Show>
                                  <p class="text-xs text-muted-foreground">
                                    {t(inviteStatusKeys[inviteStatus(invite)])} ·{" "}
                                    {formatRelative(invite.createdAt, locale())}
                                    <Show when={invite.email && invite.sentAt}>
                                      {" "}
                                      · {t("tree.invites.emailed")}
                                    </Show>
                                  </p>
                                </div>
                                <Show when={inviteStatus(invite) === "pending" && invite.email}>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={resendingId() === invite.id}
                                    onClick={() => sendInviteAgain(invite.id)}
                                  >
                                    <RotateCw />
                                    {resendingId() === invite.id
                                      ? t("auth.sending")
                                      : t("tree.invites.sendAgain")}
                                  </Button>
                                </Show>
                                <Show when={inviteStatus(invite) === "pending"}>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    class="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() =>
                                      setConfirm({ kind: "revoke", inviteId: invite.id })
                                    }
                                  >
                                    {t("common.revoke")}
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
                    title={t("tree.settings.share.title")}
                    description={t("tree.settings.share.description")}
                  >
                    <div class="grid gap-3 sm:grid-cols-2 sm:items-end">
                      <Field
                        label={t("tree.settings.share.label")}
                        for="share-label"
                        hint={t("tree.settings.onlyYouSee")}
                      >
                        <input
                          id="share-label"
                          class="input"
                          maxlength={80}
                          placeholder={t("tree.settings.share.labelPlaceholder")}
                          value={shareLabel()}
                          onInput={event => setShareLabel(event.currentTarget.value)}
                          data-testid="share-create-label"
                        />
                      </Field>
                      <Field label={t("tree.settings.share.living")} for="share-living">
                        <select
                          id="share-living"
                          class="input"
                          value={shareLiving()}
                          onChange={event =>
                            setShareLiving(event.currentTarget.value as LivingVisibility)
                          }
                          data-testid="share-create-living"
                        >
                          <option value="hidden">{t("tree.settings.share.livingHidden")}</option>
                          <option value="name">{t("tree.settings.share.livingNames")}</option>
                          <option value="full">{t("tree.settings.share.livingFull")}</option>
                        </select>
                      </Field>
                      <Field label={t("tree.settings.expires")} for="share-expiry">
                        <select
                          id="share-expiry"
                          class="input"
                          value={shareExpiry()}
                          onChange={event => setShareExpiry(event.currentTarget.value)}
                          data-testid="share-create-expiry"
                        >
                          <option value="1">{t("tree.settings.in1Day")}</option>
                          <option value="7">{t("tree.settings.in7Days")}</option>
                          <option value="30">{t("tree.settings.in30Days")}</option>
                          <option value="90">{t("tree.settings.in90Days")}</option>
                          <option value="never">{t("tree.settings.never")}</option>
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
                        {t("tree.settings.share.includeMedia")}
                      </label>
                      <div class="sm:col-span-2">
                        <Button
                          type="button"
                          onClick={createShare}
                          disabled={creatingShare()}
                          data-testid="share-create-submit"
                        >
                          <Plus />
                          {creatingShare()
                            ? t("tree.create.creating")
                            : t("tree.settings.share.create")}
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
                            {t("tree.settings.share.copyNow")}
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
                              {t("common.copy")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </Show>

                    <div class="mt-6">
                      <h3 class="field-label">{t("tree.settings.share.listTitle")}</h3>
                      <Show
                        when={shareRows()?.length}
                        fallback={
                          <p
                            class="mt-2 rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
                            data-testid="share-links-empty"
                          >
                            {t("tree.settings.share.empty")}
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
                                    {shareLivingLabel(link.livingVisibility, t)} ·{" "}
                                    {link.includeMedia
                                      ? t("tree.settings.share.photosOn")
                                      : t("tree.settings.share.photosOff")}{" "}
                                    · {shareStatus(link, t, locale())} ·{" "}
                                    {formatRelative(link.createdAt, locale())}
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
                                    {t("common.revoke")}
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
                      title={t("tree.settings.api.title")}
                      description={t("tree.settings.api.description")}
                    >
                      <div class="grid gap-3 sm:grid-cols-2 sm:items-end">
                        <Field
                          label={t("tree.settings.api.tokenName")}
                          for="api-name"
                          hint={t("tree.settings.onlyYouSee")}
                        >
                          <input
                            id="api-name"
                            class="input"
                            maxlength={80}
                            placeholder={t("tree.settings.api.tokenNamePlaceholder")}
                            value={apiName()}
                            onInput={event => setApiName(event.currentTarget.value)}
                            data-testid="api-token-name"
                          />
                        </Field>
                        <Field label={t("tree.settings.expires")} for="api-expiry">
                          <select
                            id="api-expiry"
                            class="input"
                            value={apiExpiry()}
                            onChange={event => setApiExpiry(event.currentTarget.value)}
                            data-testid="api-token-expiry"
                          >
                            <option value="30">{t("tree.settings.in30Days")}</option>
                            <option value="90">{t("tree.settings.in90Days")}</option>
                            <option value="365">{t("tree.settings.in1Year")}</option>
                            <option value="never">{t("tree.settings.never")}</option>
                          </select>
                        </Field>
                        <div class="sm:col-span-2">
                          <p class="field-label mb-2">{t("tree.settings.api.scopes")}</p>
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
                                    <span class="block font-medium">
                                      {t(scopeLabels[scope.value])}
                                    </span>
                                    <span class="mt-0.5 block text-xs text-muted-foreground">
                                      {t(scopeDescriptions[scope.value])}
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
                            {creatingApi()
                              ? t("tree.create.creating")
                              : t("tree.settings.api.create")}
                          </Button>
                          <A
                            href="/docs/api"
                            target="_blank"
                            rel="noreferrer"
                            class={buttonVariants({ variant: "secondary", size: "sm" })}
                            data-testid="api-docs-link"
                          >
                            {t("tree.settings.api.docs")}
                          </A>
                          <A
                            href="/api/v1/openapi.json"
                            target="_blank"
                            rel="noreferrer"
                            class={buttonVariants({ variant: "secondary", size: "sm" })}
                            data-testid="api-openapi-link"
                          >
                            {t("tree.settings.api.spec")}
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
                              {t("tree.settings.api.copyNow")}
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
                        <h3 class="field-label">{t("tree.settings.api.listTitle")}</h3>
                        <Show
                          when={apiRows()?.length}
                          fallback={
                            <p
                              class="mt-2 rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
                              data-testid="api-tokens-empty"
                            >
                              {t("tree.settings.api.empty")}
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
                                      {token.scopes
                                        .map(scope => t(scopeLabels[scope]))
                                        .join(", ")}
                                    </p>
                                    <p class="text-xs text-muted-foreground">
                                      {apiTokenStatus(token, t)}
                                      <Show when={token.lastUsedAt}>
                                        {" "}
                                        ·{" "}
                                        {t("tree.settings.api.used", {
                                          when: formatRelative(token.lastUsedAt, locale()),
                                        })}
                                      </Show>
                                      <Show when={token.expiresAt}>
                                        {" "}
                                        ·{" "}
                                        {t("tree.settings.api.expires", {
                                          when: formatRelative(token.expiresAt, locale()),
                                        })}
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
                                      {t("common.revoke")}
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
                            {t("tree.settings.danger.warningTitle")}
                          </p>
                          <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {t("tree.settings.danger.warningBody")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <SectionCard
                      title={t("tree.settings.danger.leave")}
                      description={t("tree.settings.danger.leaveDescription")}
                    >
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => setConfirm({ kind: "leave" })}
                        data-testid="tree-danger-leave-button"
                      >
                        <LogOut />
                        {t("tree.settings.danger.leave")}
                      </Button>
                      <p class="mt-3 text-xs leading-relaxed text-muted-foreground">
                        {isOnlyOwner()
                          ? t("tree.settings.danger.onlyOwnerLeave")
                          : t("tree.settings.danger.rejoin")}
                      </p>
                    </SectionCard>

                    <Show when={isOwner()}>
                      <SectionCard
                        title={t("tree.settings.danger.deleteTitle")}
                        description={t("tree.settings.danger.deleteDescription")}
                      >
                        <Show
                          when={overview()?.deletionRequest}
                          fallback={
                            <div data-testid="tree-deletion-idle">
                              <ul class="space-y-2 text-xs leading-relaxed text-muted-foreground">
                                <li class="flex gap-2">
                                  <span class="font-semibold text-foreground">1.</span>
                                  {t("tree.settings.danger.step1")}
                                </li>
                                <li class="flex gap-2">
                                  <span class="font-semibold text-foreground">2.</span>
                                  {isOnlyOwner()
                                    ? t("tree.settings.danger.step2OnlyOwner")
                                    : t("tree.settings.danger.step2Owners")}
                                </li>
                                <li class="flex gap-2">
                                  <span class="font-semibold text-foreground">3.</span>
                                  {t("tree.settings.danger.step3")}
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
                                  {t("tree.settings.danger.downloadFirst")}
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
                                  {t("tree.settings.danger.requestDeletion")}
                                </Button>
                              </div>
                              <Show when={isOnlyOwner()}>
                                <p class="mt-3 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                                  {t("tree.settings.danger.onlyOwnerNote")}
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
                                {t("tree.settings.danger.requested", {
                                  when: formatRelative(request().createdAt, locale()),
                                })}
                              </p>
                              <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {t("tree.settings.danger.requestBody", {
                                  name: request().requestedByName,
                                  when: formatRelative(request().expiresAt, locale()),
                                })}
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
                                              {t("tree.members.you")}
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
                                            {t("tree.settings.danger.waiting")}
                                          </Badge>
                                        }
                                      >
                                        <Badge class="bg-primary/10 uppercase tracking-wide text-primary">
                                          {t("tree.settings.danger.approved")}
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
                                    {t("tree.settings.danger.approve")}
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
                                  {cancelPending()
                                    ? t("tree.settings.danger.cancelling")
                                    : t("tree.settings.danger.cancelRequest")}
                                </Button>
                              </div>
                              <Show when={ownersAwaiting().length > 0}>
                                <p class="mt-2 text-xs text-muted-foreground">
                                  {t("tree.settings.danger.waitingOn", {
                                    owners: ownerCountLabel(ownersAwaiting().length),
                                  })}
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
            title={t("tree.delete.title", {
              name: overview()?.tree.name ?? t("tree.settings.thisTree"),
            })}
            description={t("tree.settings.danger.modalDescription")}
            testId="tree-delete-dialog"
          >
            <form class="space-y-4" onSubmit={submitDeleteRequest}>
              <div class="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
                <p class="font-semibold text-destructive">
                  {t("tree.settings.danger.modalCounts", {
                    name: overview()?.tree.name ?? t("tree.settings.thisTreeTitle"),
                    people: t("common.person", { count: overview()?.peopleCount ?? 0 }),
                    members: t("trees.member", { count: overview()?.memberCount ?? 0 }),
                  })}
                </p>
                <p class="mt-1.5">
                  {isOnlyOwner()
                    ? t("tree.settings.danger.modalOnlyOwner")
                    : t("tree.settings.danger.modalOwners")}
                </p>
                <p class="mt-1.5">{t("tree.settings.danger.modalGrace")}</p>
              </div>
              <Field
                label={t("tree.create.name")}
                for="tree-delete-name"
                hint={t("tree.settings.danger.typeName", {
                  name: overview()?.tree.name ?? t("tree.settings.theTreeName"),
                })}
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
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={deletePending() || !deleteNameMatches()}
                  data-testid="tree-delete-submit"
                >
                  {deletePending()
                    ? t("tree.settings.working")
                    : isOnlyOwner()
                      ? t("tree.settings.danger.schedule")
                      : t("tree.settings.danger.requestDeletion")}
                </Button>
              </div>
            </form>
          </Modal>

          <ConfirmDialog
            open={approveOpen()}
            onClose={() => setApproveOpen(false)}
            title={t("tree.settings.danger.approveTitle")}
            message={t("tree.settings.danger.approveMessage")}
            confirmLabel={t("tree.settings.danger.approve")}
            danger
            pending={approvalPending()}
            testId="tree-deletion-approve-dialog"
            onConfirm={() => void approveDeletion()}
          />

          <ConfirmDialog
            open={Boolean(confirm())}
            onClose={() => setConfirm(null)}
            title={confirmTitle(confirm(), t)}
            message={confirmMessage(
              confirm(),
              overview()?.tree.name ?? t("tree.settings.thisTree"),
              t,
            )}
            confirmLabel={confirmLabel(confirm(), t)}
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
}): InviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.acceptedAt) return "used";
  if (new Date(invite.expiresAt).getTime() <= Date.now()) return "expired";
  return "pending";
}

function shareLivingLabel(visibility: LivingVisibility, t: Translate) {
  if (visibility === "hidden") return t("tree.settings.share.summaryHidden");
  if (visibility === "full") return t("tree.settings.share.summaryFull");
  return t("tree.settings.share.summaryNames");
}

function linkStatusActive(link: { revokedAt: Date | null; expiresAt: Date | null }) {
  if (link.revokedAt) return false;
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

function shareStatus(
  link: {
    revokedAt: Date | null;
    expiresAt: Date | null;
    lastAccessedAt: Date | null;
  },
  t: Translate,
  locale: Locale,
) {
  if (link.revokedAt) return t("tree.settings.status.revoked");
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) {
    return t("tree.settings.status.expired");
  }
  if (link.expiresAt) {
    return t("tree.settings.share.expiresIn", {
      when: formatRelative(link.expiresAt, locale),
    });
  }
  return t("tree.settings.share.noExpiry");
}

function confirmTitle(action: { kind: string } | null, t: Translate) {
  if (!action) return "";
  if (action.kind === "remove") return t("tree.members.confirmRemoveTitle");
  if (action.kind === "leave") return t("tree.settings.danger.confirmLeaveTitle");
  if (action.kind === "revoke-share") return t("tree.settings.share.confirmRevokeTitle");
  if (action.kind === "revoke-api") return t("tree.settings.api.confirmRevokeTitle");
  return t("tree.invites.confirmRevokeTitle");
}

function confirmLabel(action: { kind: string } | null, t: Translate) {
  if (!action) return t("common.confirm");
  if (action.kind === "remove") return t("tree.members.confirmRemove");
  if (action.kind === "leave") return t("tree.settings.danger.confirmLeave");
  if (action.kind === "revoke-share") return t("tree.settings.share.confirmRevoke");
  if (action.kind === "revoke-api") return t("tree.settings.api.confirmRevoke");
  return t("tree.invites.confirmRevoke");
}

function confirmMessage(
  action: { kind: string; name?: string } | null,
  treeName: string,
  t: Translate,
) {
  if (!action) return "";
  if (action.kind === "remove") {
    return t("tree.members.confirmRemoveMessage", {
      name: action.name ?? t("tree.members.thisPerson"),
      tree: treeName,
    });
  }
  if (action.kind === "leave") {
    return t("tree.settings.danger.confirmLeaveMessage", { tree: treeName });
  }
  if (action.kind === "revoke-share") {
    return t("tree.settings.share.confirmRevokeMessage");
  }
  if (action.kind === "revoke-api") {
    return t("tree.settings.api.confirmRevokeMessage");
  }
  return t("tree.invites.confirmRevokeMessage");
}

function apiTokenStatus(token: ApiTokenView, t: Translate) {
  if (token.revokedAt) return t("tree.settings.status.revoked");
  if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) {
    return t("tree.settings.status.expired");
  }
  return t("tree.settings.status.active");
}
