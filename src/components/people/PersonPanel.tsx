import { For, Show, createMemo } from "solid-js";
import {
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
  UserPlus,
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
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { IconButton } from "../ui/icon-button";
import { Progress, ProgressGroup, ProgressLabel, ProgressValueLabel } from "../ui/progress";
import { FileUploadButton } from "../files/FileUploadButton";
import { formatYears } from "~/lib/format";
import { compareFuzzyDates, formatFuzzyDate } from "~/lib/fuzzy-date";
import { personEventKindLabel } from "~/lib/person-events";

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
  onClaimPerson: () => void;
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

export function PersonPanel(props: PersonPanelProps) {
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
  const events = createMemo(() =>
    props.data.events
      .filter(event => event.personId === props.person.id)
      .sort(
        (a, b) =>
          compareFuzzyDates(a.date, b.date) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      ),
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
          label="Close"
          onClick={props.onClose}
          class="!absolute right-2 top-2"
          data-testid="person-panel-close-mobile"
        >
          <X size={17} />
        </IconButton>
      </div>

      <div class="flex items-start gap-3 px-5 pb-4 pt-2 sm:pt-5" data-testid="person-panel-header">
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
        <div class="min-w-0 flex-1">
          <h2 class="truncate font-display text-2xl leading-tight tracking-tight">
            {props.person.displayName}
          </h2>
          <Show when={formatYears(props.person.birthDate, props.person.deathDate)}>
            <p class="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays size={12} />
              {formatYears(props.person.birthDate, props.person.deathDate)}
            </p>
          </Show>
          <Show when={props.person.birthPlace || props.person.deathPlace}>
            <p class="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <MapPin size={12} />
              {props.person.birthPlace ?? props.person.deathPlace}
            </p>
          </Show>
        </div>
        <div class="hidden sm:block">
          <IconButton label="Close" onClick={props.onClose} data-testid="person-panel-close">
            <X size={17} />
          </IconButton>
        </div>
      </div>

      <Show when={!props.readOnly}>
        <div class="flex items-center gap-2 overflow-x-auto border-y border-border px-5 py-2.5 no-scrollbar">
          <Show
            when={props.isViewer}
            fallback={
              <Button
                size="sm"
                variant="secondary"
                onClick={props.onClaimPerson}
                data-testid="person-panel-claim"
              >
                <UserCheck size={13} />
                This is me
              </Button>
            }
          >
            <span class="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-accent px-2.5 py-1 text-xs font-semibold text-primary">
              <UserCheck size={13} />
              This is you
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
            Edit
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={props.onAddRelative}
            data-testid="person-panel-add-relative"
          >
            <UserPlus size={13} />
            Add relative
          </Button>
          <FileUploadButton
            multiple
            onFiles={props.onUpload}
            disabled={props.uploading}
            class={buttonVariants({ variant: "secondary", size: "sm" })}
            testId="person-panel-upload"
          >
            <Upload size={13} />
            {props.uploading ? "Uploading…" : "Add files"}
          </FileUploadButton>
        </Show>
        <Show when={editable()}>
          <IconButton
            label="Delete person"
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
              <ProgressLabel>Uploading to this person</ProgressLabel>
              <ProgressValueLabel />
            </ProgressGroup>
          </Progress>
        </div>
      </Show>

      <div class="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <Show when={props.person.bio}>
          <section class="mb-5" data-testid="person-panel-about">
            <h3 class="field-label">About</h3>
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
                Born {props.person.maidenName}
              </Badge>
            </Show>
          </section>
        </Show>

        <section class="mb-5" data-testid="person-panel-events">
          <div class="flex items-center justify-between">
            <h3 class="field-label">Life events</h3>
            <Show when={editable()}>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[0.68rem] font-semibold text-muted-foreground transition hover:bg-primary/5 hover:text-foreground"
                data-testid="person-panel-add-event"
                onClick={props.onAddEvent}
              >
                <Plus size={12} />
                Add event
              </button>
            </Show>
          </div>
          <Show
            when={events().length}
            fallback={
              <p
                class="mt-1.5 rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs leading-relaxed text-muted-foreground"
                data-testid="person-panel-events-empty"
              >
                {editable()
                  ? "Add a residence, job, migration, or burial to build a timeline."
                  : "No life events yet."}
              </p>
            }
          >
            <ol class="mt-2 space-y-2">
              <For each={events()}>
                {event => (
                  <LifeEventEntry
                    event={event}
                    editable={editable()}
                    onEdit={() => props.onEditEvent(event)}
                    onDelete={() => props.onDeleteEvent(event)}
                  />
                )}
              </For>
            </ol>
          </Show>
        </section>

        <section class="mb-5 space-y-4" data-testid="person-panel-relatives">
          <RelationGroup
            testId="parents"
            title="Parents"
            entries={parents()}
            editable={editable()}
            onSelect={props.onSelectPerson}
            onRemove={props.onRemoveRelationship}
            empty="No parents added yet."
          />
          <RelationGroup
            testId="partners"
            title="Partners"
            entries={partners()}
            editable={editable()}
            onSelect={props.onSelectPerson}
            onRemove={props.onRemoveRelationship}
            empty="No partners added yet."
            labelFor={entry =>
              entry.relationship.type === "partner" ? partnerLabel(entry.relationship.status) : ""
            }
          />
          <RelationGroup
            testId="children"
            title="Children"
            entries={children()}
            editable={editable()}
            onSelect={props.onSelectPerson}
            onRemove={props.onRemoveRelationship}
            empty="No children added yet."
          />
          <Show when={editable()}>
            <button
              type="button"
              onClick={props.onAddRelative}
              data-testid="person-panel-connect"
              class="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              <Plus size={13} />
              Connect another person
            </button>
          </Show>
        </section>

        <section data-testid="person-panel-media">
          <div class="flex items-center justify-between">
            <h3 class="field-label">Photos and files</h3>
            <span class="text-[0.7rem] text-muted-foreground">{mediaCount()}</span>
          </div>
          <Show
            when={mediaCount()}
            fallback={
              <p
                class="mt-2 rounded-xl border border-dashed border-border px-3 py-5 text-center text-xs leading-relaxed text-muted-foreground"
                data-testid="person-panel-media-empty"
              >
                No files yet.{" "}
                {props.readOnly
                  ? "There are no photos or files shared for this person."
                  : `Add a portrait or a document about ${firstName(props.person)}.`}
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
              <h3 class="field-label">Also in photos</h3>
              <span class="text-[0.7rem] text-muted-foreground">{taggedPhotos().length}</span>
            </div>
            <p class="mt-1 text-[0.68rem] leading-relaxed text-muted-foreground">
              Photos filed under someone else where {firstName(props.person)} is tagged.
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
                    aria-label="Remove relationship"
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
  const cover = () =>
    props.group.coverFileId ? `/api/files/${props.group.coverFileId}/thumb` : null;
  return (
    <button
      type="button"
      class="group relative aspect-square overflow-hidden rounded-xl border border-border bg-background text-left"
      title={props.group.name}
      aria-label={`Open ${props.group.name}`}
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
  return (
    <div
      class="group relative aspect-square overflow-hidden rounded-xl border border-border bg-background"
      data-testid={`person-panel-file-${props.file.id}`}
    >
      <button
        type="button"
        class="h-full w-full"
        onClick={props.onPreview}
        aria-label={`Open ${props.file.name}`}
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
          Portrait
        </span>
      </Show>
      <Show when={props.editable}>
        <div class="absolute inset-x-1 bottom-1 flex justify-between opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <button
            type="button"
            class="rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
            title={props.file.isAvatar ? "Remove portrait" : "Use as portrait"}
            aria-label={props.file.isAvatar ? "Remove portrait" : "Use as portrait"}
            data-testid={`person-panel-file-avatar-${props.file.id}`}
            onClick={props.onAvatar}
          >
            <ImageIcon size={12} />
          </button>
          <button
            type="button"
            class="rounded-full bg-black/60 p-1.5 text-white hover:bg-destructive"
            title="Delete file"
            aria-label="Delete file"
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
  return (
    <button
      type="button"
      class="group relative aspect-square overflow-hidden rounded-xl border border-border bg-background"
      title={props.file.name}
      aria-label={`Open ${props.file.name}`}
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
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      class="group rounded-xl border border-border bg-background/60 px-3 py-2.5"
      data-testid={`person-panel-event-${props.event.id}`}
    >
      <div class="flex items-start gap-2">
        <Clock3 size={13} class="mt-0.5 shrink-0 text-muted-foreground" />
        <div class="min-w-0 flex-1">
          <p class="text-[0.66rem] font-semibold uppercase tracking-wide text-muted-foreground">
            {formatFuzzyDate(props.event.date) || "Undated"}
          </p>
          <p class="mt-0.5 text-sm font-medium leading-snug">
            {props.event.title ?? personEventKindLabel(props.event.kind)}
          </p>
          <Show when={props.event.title}>
            <p class="text-[0.66rem] text-muted-foreground">
              {personEventKindLabel(props.event.kind)}
            </p>
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
              aria-label="Edit event"
              title="Edit event"
              data-testid={`person-panel-event-edit-${props.event.id}`}
              onClick={props.onEdit}
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              class="rounded-full p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              aria-label="Delete event"
              title="Delete event"
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

function partnerLabel(status: string) {
  switch (status) {
    case "married":
      return "Married";
    case "divorced":
      return "Divorced";
    case "separated":
      return "Separated";
    case "widowed":
      return "Widowed";
    case "unknown":
      return "Partner";
    default:
      return "Partners";
  }
}

function firstName(person: GraphPerson) {
  return person.firstName || person.displayName;
}
