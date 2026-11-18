import { For, Show, Suspense, createEffect, createMemo, createSignal } from "solid-js";
import { A, createAsync, useParams } from "@solidjs/router";
import { Clock3, History } from "lucide-solid";
import {
  getTreeActivity,
  getTreeGraph,
  getTreeMembers,
  requireUserPage,
} from "~/api";
import type { ActivityAction, ActivityGroup, ActivityItem } from "~/lib/activity";
import { ACTIVITY_GROUPS, activityGroupFor } from "~/lib/activity";
import { formatDate, formatRelative } from "~/lib/format";
import { AppHeader } from "~/components/app/AppHeader";
import { Avatar } from "~/components/ui/Avatar";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { LoadingScreen } from "~/components/ui/Loading";
import { useToast } from "~/components/ui/Toast";
import { useI18n } from "~/i18n/LocaleProvider";
import type { TranslationKey } from "~/i18n";

const groupKeys: Record<ActivityGroup | "", TranslationKey> = {
  "": "tree.activity.group.all",
  people: "tree.activity.group.people",
  relationships: "tree.activity.group.relationships",
  events: "tree.activity.group.events",
  media: "tree.activity.group.media",
  members: "tree.activity.group.members",
  tree: "tree.activity.group.tree",
};

const actionKeys: Record<ActivityAction, TranslationKey> = {
  "person.created": "tree.activity.action.personCreated",
  "person.updated": "tree.activity.action.personUpdated",
  "person.deleted": "tree.activity.action.personDeleted",
  "relationship.created": "tree.activity.action.relationshipCreated",
  "relationship.removed": "tree.activity.action.relationshipRemoved",
  "event.created": "tree.activity.action.eventCreated",
  "event.updated": "tree.activity.action.eventUpdated",
  "event.deleted": "tree.activity.action.eventDeleted",
  "file.uploaded": "tree.activity.action.fileUploaded",
  "file.updated": "tree.activity.action.fileUpdated",
  "file.deleted": "tree.activity.action.fileDeleted",
  "group.renamed": "tree.activity.action.groupRenamed",
  "group.deleted": "tree.activity.action.groupDeleted",
  "member.role_changed": "tree.activity.action.memberRoleChanged",
  "member.removed": "tree.activity.action.memberRemoved",
  "member.left": "tree.activity.action.memberLeft",
  "invite.created": "tree.activity.action.inviteCreated",
  "invite.revoked": "tree.activity.action.inviteRevoked",
  "invite.accepted": "tree.activity.action.inviteAccepted",
  "tree.updated": "tree.activity.action.treeUpdated",
  "tree.deletion_requested": "tree.activity.action.treeDeletionRequested",
  "tree.deletion_approved": "tree.activity.action.treeDeletionApproved",
  "tree.deletion_cancelled": "tree.activity.action.treeDeletionCancelled",
  "tree.deletion_scheduled": "tree.activity.action.treeDeletionScheduled",
  "tree.restored": "tree.activity.action.treeRestored",
  "tree.imported": "tree.activity.action.treeImported",
};

export const route = {
  preload: ({ params }: { params: { treeId: string } }) => {
    requireUserPage();
    getTreeGraph(params.treeId);
    getTreeMembers(params.treeId);
  },
};

export default function TreeActivityPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <TreeActivityInner />
    </Suspense>
  );
}

function TreeActivityInner() {
  const params = useParams<{ treeId: string }>();
  const toast = useToast();
  const { t, locale } = useI18n();
  const user = createAsync(() => requireUserPage());
  const graph = createAsync(() => getTreeGraph(params.treeId));
  const members = createAsync(() => getTreeMembers(params.treeId));

  const [personId, setPersonId] = createSignal("");
  const [actorUserId, setActorUserId] = createSignal("");
  const [group, setGroup] = createSignal<ActivityGroup | "">("");
  const [extra, setExtra] = createSignal<ActivityItem[]>([]);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [loadingOlder, setLoadingOlder] = createSignal(false);

  const firstPage = createAsync(() =>
    getTreeActivity(params.treeId, {
      personId: personId() || null,
      actorUserId: actorUserId() || null,
      group: group(),
      limit: 30,
    }),
  );

  createEffect(() => {
    const page = firstPage();
    if (!page) return;
    setExtra([]);
    setCursor(page.nextCursor);
  });

  const items = createMemo(() => [...(firstPage()?.items ?? []), ...extra()]);

  async function loadOlder() {
    const before = cursor();
    if (!before || loadingOlder()) return;
    setLoadingOlder(true);
    try {
      const page = await getTreeActivity(params.treeId, {
        personId: personId() || null,
        actorUserId: actorUserId() || null,
        group: group(),
        before,
        limit: 30,
      });
      setExtra(current => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      toast.show(t("tree.activity.loadOlderError"), "error");
    } finally {
      setLoadingOlder(false);
    }
  }

  const people = createMemo(() =>
    [...(graph()?.people ?? [])].sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    ),
  );

  return (
    <Show when={user()}>
      {currentUser => (
        <Show when={graph()}>
          {data => (
            <div class="page-shell min-h-[100dvh]" data-testid="activity-page">
              <AppHeader
                user={currentUser()}
                back={{ href: `/trees/${params.treeId}`, label: t("tree.backToTree") }}
                center={data().tree.name}
              />
              <main class="mx-auto max-w-4xl px-4 pb-20 pt-8 sm:px-6">
                <div class="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p class="eyebrow mb-2 flex items-center gap-1.5">
                      <History size={13} />
                      {t("tree.activity.eyebrow")}
                    </p>
                    <h1 class="font-display text-4xl tracking-tight">
                      {t("tree.activity.title")}
                    </h1>
                    <p class="mt-2 max-w-xl text-sm text-muted-foreground">
                      {t("tree.activity.subtitle")}
                    </p>
                  </div>
                  <A
                    href={`/trees/${params.treeId}`}
                    class={buttonVariants({ variant: "secondary", size: "sm" })}
                    data-testid="activity-open-graph"
                  >
                    {t("tree.openGraph")}
                  </A>
                </div>

                <section class="mt-6 grid gap-2 rounded-2xl border border-border bg-card/60 p-3 sm:grid-cols-3">
                  <label class="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("tree.activity.person")}
                    <select
                      class="input text-sm normal-case tracking-normal"
                      data-testid="activity-person-filter"
                      value={personId()}
                      onChange={event => setPersonId(event.currentTarget.value)}
                    >
                      <option value="">{t("tree.everyone")}</option>
                      <For each={people()}>
                        {person => <option value={person.id}>{person.displayName}</option>}
                      </For>
                    </select>
                  </label>
                  <label class="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("tree.activity.member")}
                    <select
                      class="input text-sm normal-case tracking-normal"
                      data-testid="activity-actor-filter"
                      value={actorUserId()}
                      onChange={event => setActorUserId(event.currentTarget.value)}
                    >
                      <option value="">{t("tree.activity.anyone")}</option>
                      <For each={members() ?? []}>
                        {member => <option value={member.userId}>{member.displayName}</option>}
                      </For>
                    </select>
                  </label>
                  <label class="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("tree.activity.type")}
                    <select
                      class="input text-sm normal-case tracking-normal"
                      data-testid="activity-group-filter"
                      value={group()}
                      onChange={event =>
                        setGroup(event.currentTarget.value as ActivityGroup | "")
                      }
                    >
                      <For each={ACTIVITY_GROUPS}>
                        {option => (
                          <option value={option.value}>{t(groupKeys[option.value])}</option>
                        )}
                      </For>
                    </select>
                  </label>
                </section>

                <Show
                  when={items().length}
                  fallback={
                    <div
                      class="mt-8 rounded-3xl border border-dashed border-border p-10 text-center"
                      data-testid="activity-empty"
                    >
                      <Clock3 class="mx-auto text-muted-foreground" />
                      <p class="mt-3 text-sm font-medium">{t("tree.activity.empty.title")}</p>
                      <p class="mt-1 text-xs text-muted-foreground">
                        {t("tree.activity.empty.body")}
                      </p>
                    </div>
                  }
                >
                  <ol class="mt-6 space-y-2" data-testid="activity-list">
                    <For each={items()}>
                      {item => <ActivityRow item={item} />}
                    </For>
                  </ol>
                  <Show when={cursor()}>
                    <div class="mt-6 flex justify-center">
                      <Button
                        variant="secondary"
                        type="button"
                        data-testid="activity-load-older"
                        disabled={loadingOlder()}
                        onClick={() => void loadOlder()}
                      >
                        {loadingOlder() ? t("common.loading") : t("tree.activity.loadOlder")}
                      </Button>
                    </div>
                  </Show>
                </Show>
              </main>
            </div>
          )}
        </Show>
      )}
    </Show>
  );
}

function ActivityRow(props: { item: ActivityItem }) {
  const { t, locale } = useI18n();
  const group = () => activityGroupFor(props.item.action);
  return (
    <li
      class="rounded-2xl border border-border bg-card/60 px-4 py-3"
      data-testid={`activity-row-${props.item.id}`}
    >
      <div class="flex items-start gap-3">
        <Avatar name={props.item.actorName} fileId={null} size={34} />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p class="text-sm font-semibold">{props.item.summary}</p>
            <Badge variant="secondary" class="px-2 py-0.5 text-[0.62rem] normal-case">
              {t(actionKeys[props.item.action])}
            </Badge>
          </div>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {props.item.actorName} · {formatRelative(props.item.createdAt, locale())} ·{" "}
            {formatDate(props.item.createdAt, locale())}
          </p>
          <Show when={props.item.changes?.length}>
            <ul
              class="mt-2 space-y-1 rounded-xl bg-background/60 px-3 py-2"
              data-testid={`activity-changes-${props.item.id}`}
            >
              <For each={props.item.changes ?? []}>
                {change => (
                  <li class="text-xs leading-relaxed text-muted-foreground">
                    <span class="font-medium text-foreground">{change.label}:</span>{" "}
                    {change.from ?? t("tree.activity.emptyValue")} →{" "}
                    {change.to ?? t("tree.activity.emptyValue")}
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <p class="mt-1 text-[0.62rem] uppercase tracking-wide text-muted-foreground">
            {t(groupKeys[group()])}
          </p>
        </div>
      </div>
    </li>
  );
}
