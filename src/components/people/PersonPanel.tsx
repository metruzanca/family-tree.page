import { A } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import {
  Baby,
  CalendarDays,
  Clock3,
  FileText,
  Image as ImageIcon,
  Layers,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UserCheck,
  UserRound,
  X,
} from "lucide-solid";
import type {
  GraphFile,
  GraphFileGroup,
  GraphPerson,
  GraphPersonEvent,
  GraphRelationship,
  TreeGraph,
} from "~/api/people-server";
import type { TreeRole } from "~/server/guards";
import type { PersonSex } from "~/lib/person-sex";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { IconButton } from "../ui/icon-button";
import { Progress, ProgressGroup, ProgressLabel, ProgressValueLabel } from "../ui/progress";
import { FileUploadButton } from "../files/FileUploadButton";
import { PersonContactSection, PersonLinksSection } from "./PersonLinks";
import { formatFuzzyDate, formatFuzzyYears } from "~/lib/fuzzy-date";
import {
  buildLifeTimeline,
  eventInvolvesPerson,
  eventPartnerOf,
  personEventKey,
  type TimelineChildBirth,
} from "~/lib/person-events";
import { useI18n } from "~/i18n/LocaleProvider";
import type { TranslationKey } from "~/i18n";

type PersonPanelProps = {
  person: GraphPerson;
  data: TreeGraph;
  role: TreeRole;
  uploading: boolean;
  uploadProgress: number;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddRelative: () => void;
  /** True when this person is the signed-in member's own place in the tree. */
  isViewer: boolean;
  /** Members other than the viewer who linked this person to their account. */
  claimedBy?: string[];
  onSelectPerson: (id: string) => void;
  onSelectFile: (file: GraphFile) => void;
  onSelectGroup: (groupId: string) => void;
  onSetAvatar: (fileId: string | null) => void;
  onDeleteFile: (file: GraphFile) => void;
  onUpload: (files: File[]) => void;
  onRemoveRelationship: (relationship: GraphRelationship) => void;
  onAddEvent: () => void;
  onEditEvent: (event: GraphPersonEvent) => void;
  onDeleteEvent: (event: GraphPersonEvent) => void;
  /** Hides member-only affordances such as claiming a person. */
  readOnly?: boolean;
  /** Overrides thumbnail URLs for portraits, used by demo and share views. */
  thumbUrlFor?: (fileId: string) => string;
};

const SEX_KEYS: Record<PersonSex, TranslationKey> = {
  female: "person.sex.female",
  male: "person.sex.male",
  other: "person.sex.other",
  unknown: "common.unknown",
};

export function PersonPanel(props: PersonPanelProps) {
  const { t, locale } = useI18n();
  const editable = () => props.role === "owner" || props.role === "editor";
  const people = createMemo(() => new Map(props.data.people.map(person => [person.id, person])));
  const groups = createMemo(() =>
    props.data.groups.filter(group => group.personId === props.person.id),
  );
  const files = createMemo(() =>
    props.data.files.filter(
      file => file.personId === props.person.id && !file.groupId,
    ),
  );
  const taggedPhotos = createMemo(() =>
    props.data.files.filter(
      file =>
        file.kind === "image" &&
        file.personId !== props.person.id &&
        file.taggedPersonIds.includes(props.person.id),
    ),
  );
  const mediaCount = () => groups().length + files().length;
  const avatarFile = createMemo(() => {
    const fileId = props.person.avatarFileId;
    if (!fileId) return null;
    return (
      props.data.files.find(file => file.id === fileId && file.kind === "image") ?? null
    );
  });
  const avatar = () => (
    <Avatar
      name={props.person.displayName}
      fileId={props.person.avatarFileId}
      thumbUrl={
        props.thumbUrlFor && props.person.avatarFileId
          ? props.thumbUrlFor(props.person.avatarFileId!)
          : undefined
      }
      size={58}
    />
  );
  const events = createMemo(() =>
    props.data.events.filter(event => eventInvolvesPerson(event, props.person.id)),
  );
  const parents = createMemo(() =>
    props.data.relationships
      .filter(
        (relationship): relationship is Extract<GraphRelationship, { type: "parent" }> =>
          relationship.type === "parent" && relationship.target === props.person.id,
      )
      .map(relationship => ({
        relationship,
        person: people().get(relationship.source),
      }))
      .filter(entry => entry.person),
  );
  const children = createMemo(() =>
    props.data.relationships
      .filter(
        (relationship): relationship is Extract<GraphRelationship, { type: "parent" }> =>
          relationship.type === "parent" && relationship.source === props.person.id,
      )
      .map(relationship => ({
        relationship,
        person: people().get(relationship.target),
      }))
      .filter(entry => entry.person),
  );
  const childPeople = createMemo(() =>
    children()
      .map(entry => entry.person)
      .filter((person): person is GraphPerson => Boolean(person)),
  );
  /** Own events plus the births of this person's children, in date order. */
  const timeline = createMemo(() => buildLifeTimeline(events(), childPeople()));
  const partners = createMemo(() =>
    props.data.relationships
      .filter(
        (relationship): relationship is Extract<GraphRelationship, { type: "partner" }> =>
          relationship.type === "partner" &&
          (relationship.source === props.person.id || relationship.target === props.person.id),
      )
      .map(relationship => ({
        relationship,
        person: people().get(
          relationship.source === props.person.id ? relationship.target : relationship.source,
        ),
      }))
      .filter(entry => entry.person),
  );

  return (
    <aside
      class="mobile-sheet absolute inset-x-0 bottom-0 z-30 flex flex-col sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-20 sm:max-h-none sm:w-[24rem] sm:rounded-3xl sm:border sm:pb-0"
      data-testid="person-panel"
    >
      <div class="flex items-center justify-between px-4 pb-1 pt-2 sm:hidden">
        <span class="mx-auto h-1 w-10 rounded-full bg-border" />
        <IconButton
          label={t("common.close")}
          onClick={props.onClose}
          class="!absolute right-2 top-2"
          data-testid="person-panel-close-mobile"
        >
          <X size={17} />
        </IconButton>
      </div>

      <div class="flex items-start gap-3 px-5 pb-4 pt-2 sm:pt-5" data-testid="person-panel-header">
        <Show when={avatarFile()} fallback={avatar()}>
          <button
            type="button"
            class="shrink-0 cursor-zoom-in rounded-full transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            title={t("person.panel.openPortrait")}
            aria-label={t("person.panel.openPortraitOf", { name: props.person.displayName })}
            data-testid="person-panel-avatar"
            onClick={() => props.onSelectFile(avatarFile()!)}
          >
            {avatar()}
          </button>
        </Show>
        <div class="min-w-0 flex-1">
          <h2 class="truncate font-display text-2xl leading-tight tracking-tight">
            {props.person.displayName}
          </h2>
          <Show when={props.claimedBy?.length}>
            <p
              class="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground"
              data-testid="person-panel-claimed-by"
            >
              <UserCheck size={12} class="shrink-0" />
              {t("person.panel.claimedBy", { names: props.claimedBy!.join(", ") })}
            </p>
          </Show>
          <Show when={formatFuzzyYears(props.person.birthDate, props.person.deathDate, locale())}>
            <p class="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays size={12} />
              {formatFuzzyYears(props.person.birthDate, props.person.deathDate, locale())}
            </p>
          </Show>
          <Show when={props.person.birthPlace || props.person.deathPlace}>
            <p class="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <MapPin size={12} />
              {props.person.birthPlace ?? props.person.deathPlace}
            </p>
          </Show>
          <Show when={props.person.sex !== "unknown"}>
            <p
              class="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
              data-testid="person-panel-sex"
            >
              <UserRound size={12} />
              {t(SEX_KEYS[props.person.sex])}
            </p>
          </Show>
        </div>
        <div class="hidden sm:block">
          <IconButton label={t("common.close")} onClick={props.onClose} data-testid="person-panel-close">
            <X size={17} />
          </IconButton>
        </div>
      </div>

      <Show when={!props.readOnly && (props.isViewer || editable())}>
        <div
          class="flex flex-wrap items-center gap-2 border-y border-border px-5 py-2.5"
          data-testid="person-panel-actions"
        >
          <Show when={props.isViewer}>
            <span class="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-accent px-2.5 py-1 text-xs font-semibold text-primary">
              <UserCheck size={13} />
              {t("person.panel.thisIsYou")}
            </span>
          </Show>
          <Show when={editable()}>
            <Button
              size="sm"
              variant="secondary"
              onClick={props.onEdit}
              data-testid="person-panel-edit"
            >
              <Pencil size={13} />
              {t("common.edit")}
            </Button>
            <FileUploadButton
              multiple
              onFiles={props.onUpload}
              disabled={props.uploading}
              class={buttonVariants({ variant: "secondary", size: "sm" })}
              testId="person-panel-upload"
            >
              <Upload size={13} />
              {props.uploading ? t("person.panel.uploading") : t("person.panel.addFiles")}
            </FileUploadButton>
          </Show>
          <Show when={editable()}>
            <IconButton
              label={t("tree.delete.personConfirm")}
              class="ml-auto text-destructive"
              onClick={props.onDelete}
              data-testid="person-panel-delete"
            >
              <Trash2 size={16} />
            </IconButton>
          </Show>
        </div>
      </Show>

      <Show when={props.uploading}>
        <div class="border-b border-border px-5 py-2.5" data-testid="person-panel-upload-progress">
          <Progress value={props.uploadProgress * 100} class="gap-1.5">
            <ProgressGroup class="text-xs text-muted-foreground">
              <ProgressLabel>{t("person.panel.uploadProgress")}</ProgressLabel>
              <ProgressValueLabel />
            </ProgressGroup>
          </Progress>
        </div>
      </Show>

      <div class="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <Show when={props.person.bio}>
          <section class="mb-5" data-testid="person-panel-about">
            <h3 class="field-label">{t("person.panel.about")}</h3>
            <p class="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {props.person.bio}
            </p>
          </section>
        </Show>

        <Show when={props.person.maidenName || props.person.nickname}>
          <section class="mb-5 flex flex-wrap gap-2 text-xs">
            <Show when={props.person.nickname}>
              <Badge variant="secondary" class="px-2.5 py-1 text-xs normal-case">
                “{props.person.nickname}”
              </Badge>
            </Show>
            <Show when={props.person.maidenName}>
              <Badge variant="secondary" class="px-2.5 py-1 text-xs normal-case">
                {t("person.panel.bornName", { name: props.person.maidenName ?? "" })}
              </Badge>
            </Show>
          </section>
        </Show>

        <Show when={props.person.links.length}>
          <PersonLinksSection links={props.person.links} />
        </Show>

        <Show when={props.person.contactEmail || props.person.contactPhone}>
          <PersonContactSection
            email={props.person.contactEmail}
            phone={props.person.contactPhone}
          />
        </Show>

        <section class="mb-5" data-testid="person-panel-events">
          <div class="flex items-center justify-between">
            <h3 class="field-label">{t("person.panel.lifeEvents")}</h3>
            <Show when={editable()}>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[0.68rem] font-semibold text-muted-foreground transition hover:bg-primary/5 hover:text-foreground"
                data-testid="person-panel-add-event"
                onClick={props.onAddEvent}
              >
                <Plus size={12} />
                {t("person.panel.addEvent")}
              </button>
            </Show>
          </div>
          <Show
            when={timeline().length}
            fallback={
              <p
                class="mt-1.5 rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs leading-relaxed text-muted-foreground"
                data-testid="person-panel-events-empty"
              >
                {editable()
                  ? t("person.panel.eventsEmptyEditable")
                  : t("person.panel.eventsEmpty")}
              </p>
            }
          >
            <ol class="mt-2 space-y-2">
              <For each={timeline()}>
                {entry =>
                  entry.type === "event" ? (
                    <LifeEventEntry
                      event={entry.event}
                      partner={people().get(
                        eventPartnerOf(entry.event, props.person.id) ?? "",
                      )}
                      editable={editable()}
                      onEdit={() => props.onEditEvent(entry.event)}
                      onDelete={() => props.onDeleteEvent(entry.event)}
                      onSelectPartner={props.onSelectPerson}
                    />
                  ) : (
                    <ChildBirthEntry entry={entry} onSelect={props.onSelectPerson} />
                  )
                }
              </For>
            </ol>
          </Show>
        </section>

        <section class="mb-5 space-y-4" data-testid="person-panel-relatives">
          <RelationGroup
            testId="parents"
            title={t("person.panel.parents")}
            entries={parents()}
            editable={editable()}
            onSelect={props.onSelectPerson}
            onRemove={props.onRemoveRelationship}
            empty={t("person.panel.parentsEmpty")}
          />
          <RelationGroup
            testId="partners"
            title={t("person.panel.partners")}
            entries={partners()}
            editable={editable()}
            onSelect={props.onSelectPerson}
            onRemove={props.onRemoveRelationship}
            empty={t("person.panel.partnersEmpty")}
            labelFor={entry =>
              entry.relationship.type === "partner" ? partnerLabel(entry.relationship.status, t) : ""
            }
          />
          <RelationGroup
            testId="children"
            title={t("person.panel.children")}
            entries={children()}
            editable={editable()}
            onSelect={props.onSelectPerson}
            onRemove={props.onRemoveRelationship}
            empty={t("person.panel.childrenEmpty")}
          />
          <Show when={editable()}>
            <button
              type="button"
              onClick={props.onAddRelative}
              data-testid="person-panel-connect"
              class="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              <Plus size={13} />
              {t("person.panel.connectAnother")}
            </button>
          </Show>
        </section>

        <section data-testid="person-panel-media">
          <div class="flex items-center justify-between gap-2">
            <h3 class="field-label">{t("person.panel.media")}</h3>
            <div class="flex items-center gap-2">
              <span class="text-[0.7rem] text-muted-foreground">{mediaCount()}</span>
              <Show when={!props.readOnly && mediaCount()}>
                <A
                  href={`/trees/${props.data.tree.id}/media?person=${props.person.id}`}
                  class="text-[0.7rem] font-semibold text-primary hover:underline"
                  data-testid="person-panel-view-all-media"
                >
                  {t("person.panel.viewAllMedia")}
                </A>
              </Show>
            </div>
          </div>
          <Show
            when={mediaCount()}
            fallback={
              <p
                class="mt-2 rounded-xl border border-dashed border-border px-3 py-5 text-center text-xs leading-relaxed text-muted-foreground"
                data-testid="person-panel-media-empty"
              >
                {props.readOnly
                  ? t("person.panel.mediaEmptyReadOnly")
                  : t("person.panel.mediaEmptyEditable", { name: firstName(props.person) })}
              </p>
            }
          >
            <div class="mt-2 grid grid-cols-3 gap-2">
              <For each={groups()}>
                {group => (
                  <GroupTile
                    group={group}
                    onOpen={() => props.onSelectGroup(group.id)}
                  />
                )}
              </For>
              <For each={files()}>
                {file => (
                  <FileTile
                    file={file}
                    editable={editable()}
                    onPreview={() => props.onSelectFile(file)}
                    onAvatar={() => props.onSetAvatar(file.isAvatar ? null : file.id)}
                    onDelete={() => props.onDeleteFile(file)}
                  />
                )}
              </For>
            </div>
          </Show>
        </section>

        <Show when={taggedPhotos().length}>
          <section class="mt-6" data-testid="person-panel-tagged-photos">
            <div class="flex items-center justify-between">
              <h3 class="field-label">{t("person.panel.taggedPhotos")}</h3>
              <span class="text-[0.7rem] text-muted-foreground">{taggedPhotos().length}</span>
            </div>
            <p class="mt-1 text-[0.68rem] leading-relaxed text-muted-foreground">
              {t("person.panel.taggedPhotosHint", { name: firstName(props.person) })}
            </p>
            <div class="mt-2 grid grid-cols-3 gap-2">
              <For each={taggedPhotos()}>
                {file => (
                  <TaggedPhotoTile
                    file={file}
                    onOpen={() => props.onSelectFile(file)}
                  />
                )}
              </For>
            </div>
          </section>
        </Show>
      </div>
    </aside>
  );
}

type RelationEntry = { relationship: GraphRelationship; person?: GraphPerson };

function RelationGroup(props: {
  testId: string;
  title: string;
  entries: RelationEntry[];
  editable: boolean;
  onSelect: (id: string) => void;
  onRemove: (relationship: GraphRelationship) => void;
  empty: string;
  labelFor?: (entry: RelationEntry) => string;
}) {
  const { t } = useI18n();
  return (
    <div data-testid={`person-panel-relatives-${props.testId}`}>
      <h3 class="field-label">{props.title}</h3>
      <Show
        when={props.entries.length}
        fallback={<p class="mt-1 text-xs text-muted-foreground">{props.empty}</p>}
      >
        <ul class="mt-1.5 space-y-1">
          <For each={props.entries}>
            {entry => (
              <li
                class="group flex items-center gap-2 rounded-xl px-1 py-1 hover:bg-primary/5"
                data-testid={`person-panel-relative-${entry.person?.id ?? entry.relationship.id}`}
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 text-left"
                  data-testid={`person-panel-relative-open-${entry.person?.id ?? entry.relationship.id}`}
                  onClick={() => entry.person && props.onSelect(entry.person.id)}
                >
                  <Avatar name={entry.person?.displayName ?? "?"} fileId={entry.person?.avatarFileId} size={28} />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium">{entry.person?.displayName}</span>
                    <Show when={props.labelFor?.(entry)}>
                      <span class="block text-[0.68rem] text-muted-foreground">{props.labelFor?.(entry)}</span>
                    </Show>
                  </span>
                </button>
                <Show when={props.editable}>
                  <button
                    type="button"
                    class="rounded-full p-1 text-muted-foreground opacity-60 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    aria-label={t("person.panel.removeRelationship")}
                    data-testid={`person-panel-relative-remove-${entry.person?.id ?? entry.relationship.id}`}
                    onClick={() => props.onRemove(entry.relationship)}
                  >
                    <X size={13} />
                  </button>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

function GroupTile(props: { group: GraphFileGroup; onOpen: () => void }) {
  const { t } = useI18n();
  const cover = () =>
    props.group.coverFileId ? `/api/files/${props.group.coverFileId}/thumb` : null;
  return (
    <button
      type="button"
      class="group relative aspect-square overflow-hidden rounded-xl border border-border bg-background text-left"
      title={props.group.name}
      aria-label={t("person.panel.open", { name: props.group.name })}
      data-testid={`person-panel-group-${props.group.id}`}
      onClick={props.onOpen}
    >
      <span class="absolute left-2 top-2 h-[calc(100%-0.4rem)] w-[calc(100%-0.4rem)] rounded-lg border border-border bg-card/80" />
      <span class="absolute left-1 top-1 h-[calc(100%-0.4rem)] w-[calc(100%-0.4rem)] rounded-lg border border-border bg-card" />
      <span class="absolute inset-0 overflow-hidden rounded-xl">
        <Show
          when={cover()}
          fallback={
            <span class="flex h-full w-full items-center justify-center text-muted-foreground">
              <Layers size={24} />
            </span>
          }
        >
          <img src={cover()!} alt="" class="h-full w-full object-cover" loading="lazy" />
        </Show>
      </span>
      <span class="absolute left-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-[0.62rem] font-bold text-[#161a12]">
        {props.group.count}
      </span>
      <span class="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1 pt-4 text-[0.62rem] font-semibold text-white">
        {props.group.name}
      </span>
    </button>
  );
}

function FileTile(props: {
  file: GraphFile;
  editable: boolean;
  onPreview: () => void;
  onAvatar: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      class="group relative aspect-square overflow-hidden rounded-xl border border-border bg-background"
      data-testid={`person-panel-file-${props.file.id}`}
    >
      <button
        type="button"
        class="h-full w-full"
        onClick={props.onPreview}
        aria-label={t("person.panel.open", { name: props.file.name })}
        data-testid={`person-panel-file-open-${props.file.id}`}
      >
        <Show
          when={props.file.thumbUrl}
          fallback={
            <span class="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
              <Show when={props.file.kind === "image"} fallback={<FileText size={22} />}>
                <ImageIcon size={22} />
              </Show>
              <span class="line-clamp-2 text-center text-[0.6rem] leading-tight">
                {props.file.name}
              </span>
            </span>
          }
        >
          <img
            src={props.file.thumbUrl!}
            alt={props.file.name}
            class="h-full w-full object-cover"
            loading="lazy"
          />
        </Show>
      </button>
      <Show when={props.file.isAvatar}>
        <span class="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wide text-white">
          {t("person.panel.portrait")}
        </span>
      </Show>
      <Show when={props.editable}>
        <div class="absolute inset-x-1 bottom-1 flex justify-between opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <button
            type="button"
            class="rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
            title={
              props.file.isAvatar
                ? t("person.panel.removePortrait")
                : t("person.panel.useAsPortrait")
            }
            aria-label={
              props.file.isAvatar
                ? t("person.panel.removePortrait")
                : t("person.panel.useAsPortrait")
            }
            data-testid={`person-panel-file-avatar-${props.file.id}`}
            onClick={props.onAvatar}
          >
            <ImageIcon size={12} />
          </button>
          <button
            type="button"
            class="rounded-full bg-black/60 p-1.5 text-white hover:bg-destructive"
            title={t("tree.delete.fileConfirm")}
            aria-label={t("tree.delete.fileConfirm")}
            data-testid={`person-panel-file-delete-${props.file.id}`}
            onClick={props.onDelete}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </Show>
    </div>
  );
}

function TaggedPhotoTile(props: { file: GraphFile; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      class="group relative aspect-square overflow-hidden rounded-xl border border-border bg-background"
      title={props.file.name}
      aria-label={t("person.panel.open", { name: props.file.name })}
      data-testid={`person-panel-tagged-photo-${props.file.id}`}
      onClick={props.onOpen}
    >
      <Show
        when={props.file.thumbUrl}
        fallback={
          <span class="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon size={22} />
          </span>
        }
      >
        <img
          src={props.file.thumbUrl!}
          alt={props.file.name}
          class="h-full w-full object-cover transition group-hover:scale-[1.03]"
          loading="lazy"
        />
      </Show>
    </button>
  );
}

function LifeEventEntry(props: {
  event: GraphPersonEvent;
  partner: GraphPerson | undefined;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSelectPartner: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <li
      class="group rounded-xl border border-border bg-background/60 px-3 py-2.5"
      data-testid={`person-panel-event-${props.event.id}`}
    >
      <div class="flex items-start gap-2">
        <Clock3 size={13} class="mt-0.5 shrink-0 text-muted-foreground" />
        <div class="min-w-0 flex-1">
          <p class="text-[0.66rem] font-semibold uppercase tracking-wide text-muted-foreground">
            {formatFuzzyDate(props.event.date, { locale: locale() }) || t("person.event.undated")}
          </p>
          <p class="mt-0.5 text-sm font-medium leading-snug">
            {props.event.title ?? t(personEventKey(props.event.kind))}
          </p>
          <Show when={props.event.title}>
            <p class="text-[0.66rem] text-muted-foreground">
              {t(personEventKey(props.event.kind))}
            </p>
          </Show>
          <Show when={props.partner}>
            {partner => (
              <button
                type="button"
                class="mt-0.5 flex max-w-full items-center gap-1 truncate text-left text-xs text-muted-foreground transition hover:text-primary"
                data-testid={`person-panel-event-partner-${props.event.id}`}
                onClick={() => props.onSelectPartner(partner().id)}
              >
                <UserRound size={11} class="shrink-0" />
                {t("person.event.with", { name: partner().displayName })}
              </button>
            )}
          </Show>
          <Show when={props.event.place}>
            <p class="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin size={11} />
              {props.event.place}
            </p>
          </Show>
          <Show when={props.event.description}>
            <p class="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
              {props.event.description}
            </p>
          </Show>
        </div>
        <Show when={props.editable}>
          <div class="flex shrink-0 gap-0.5 opacity-70 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
            <button
              type="button"
              class="rounded-full p-1 text-muted-foreground transition hover:bg-primary/10 hover:text-foreground"
              aria-label={t("person.event.edit")}
              title={t("person.event.edit")}
              data-testid={`person-panel-event-edit-${props.event.id}`}
              onClick={props.onEdit}
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              class="rounded-full p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              aria-label={t("tree.delete.eventConfirm")}
              title={t("tree.delete.eventConfirm")}
              data-testid={`person-panel-event-delete-${props.event.id}`}
              onClick={props.onDelete}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </Show>
      </div>
    </li>
  );
}

function ChildBirthEntry(props: {
  entry: TimelineChildBirth;
  onSelect: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <li
      class="rounded-xl border border-dashed border-border bg-background/40 px-3 py-2.5"
      data-testid={`person-panel-child-birth-${props.entry.personId}`}
    >
      <div class="flex items-start gap-2">
        <Baby size={13} class="mt-0.5 shrink-0 text-muted-foreground" />
        <div class="min-w-0 flex-1">
          <p class="text-[0.66rem] font-semibold uppercase tracking-wide text-muted-foreground">
            {formatFuzzyDate(props.entry.date, { locale: locale() }) || t("person.event.undated")}
          </p>
          <button
            type="button"
            class="mt-0.5 block max-w-full truncate text-left text-sm font-medium leading-snug transition hover:text-primary"
            data-testid={`person-panel-child-birth-open-${props.entry.personId}`}
            onClick={() => props.onSelect(props.entry.personId)}
          >
            {t("person.event.childBirth", { name: props.entry.name })}
          </button>
          <Show when={props.entry.place}>
            <p class="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin size={11} />
              {props.entry.place}
            </p>
          </Show>
          <p class="mt-1 text-[0.66rem] text-muted-foreground">
            {t("person.panel.fromChildRecord")}
          </p>
        </div>
      </div>
    </li>
  );
}

function partnerLabel(status: string, t: ReturnType<typeof useI18n>["t"]) {
  switch (status) {
    case "married":
      return t("person.partner.married");
    case "divorced":
      return t("person.partner.divorced");
    case "separated":
      return t("person.partner.separated");
    case "widowed":
      return t("person.partner.widowed");
    case "unknown":
      return t("person.partner.unknown");
    default:
      return t("person.partner.partners");
  }
}

function firstName(person: GraphPerson) {
  return person.firstName || person.displayName;
}
