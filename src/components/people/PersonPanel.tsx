import { For, Show, createMemo } from "solid-js";
import {
  CalendarDays,
  FileText,
  Image as ImageIcon,
  Layers,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-solid";
import type {
  GraphFile,
  GraphFileGroup,
  GraphPerson,
  GraphRelationship,
  TreeGraph,
} from "~/api/people-server";
import type { TreeRole } from "~/server/guards";
import { Avatar } from "../ui/Avatar";
import { Button, IconButton } from "../ui/Button";
import { FileUploadButton } from "../files/FileUploadButton";
import { formatYears } from "~/lib/format";

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
  onSelectPerson: (id: string) => void;
  onSelectFile: (file: GraphFile) => void;
  onSelectGroup: (groupId: string) => void;
  onSetAvatar: (fileId: string | null) => void;
  onDeleteFile: (file: GraphFile) => void;
  onUpload: (files: File[]) => void;
  onRemoveRelationship: (relationship: GraphRelationship) => void;
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
  const mediaCount = () => groups().length + files().length;
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
    <aside class="mobile-sheet absolute inset-x-0 bottom-0 z-30 flex flex-col sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-20 sm:max-h-none sm:w-[24rem] sm:rounded-3xl sm:border sm:pb-0">
      <div class="flex items-center justify-between px-4 pb-1 pt-2 sm:hidden">
        <span class="mx-auto h-1 w-10 rounded-full bg-line" />
        <IconButton label="Close" onClick={props.onClose} class="!absolute right-2 top-2">
          <X size={17} />
        </IconButton>
      </div>

      <div class="flex items-start gap-3 px-5 pb-4 pt-2 sm:pt-5">
        <Avatar name={props.person.displayName} fileId={props.person.avatarFileId} size={58} />
        <div class="min-w-0 flex-1">
          <h2 class="truncate font-display text-2xl leading-tight tracking-tight">
            {props.person.displayName}
          </h2>
          <Show when={formatYears(props.person.birthDate, props.person.deathDate)}>
            <p class="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <CalendarDays size={12} />
              {formatYears(props.person.birthDate, props.person.deathDate)}
            </p>
          </Show>
          <Show when={props.person.birthPlace || props.person.deathPlace}>
            <p class="mt-1 flex items-center gap-1.5 truncate text-xs text-muted">
              <MapPin size={12} />
              {props.person.birthPlace ?? props.person.deathPlace}
            </p>
          </Show>
        </div>
        <div class="hidden sm:block">
          <IconButton label="Close" onClick={props.onClose}>
            <X size={17} />
          </IconButton>
        </div>
      </div>

      <div class="flex items-center gap-2 overflow-x-auto border-y border-line px-5 py-2.5 no-scrollbar">
        <Show when={editable()}>
          <Button size="sm" variant="secondary" onClick={props.onEdit}>
            <Pencil size={13} />
            Edit
          </Button>
          <Button size="sm" variant="secondary" onClick={props.onAddRelative}>
            <UserPlus size={13} />
            Add relative
          </Button>
          <FileUploadButton
            multiple
            onFiles={props.onUpload}
            disabled={props.uploading}
            class="btn btn-secondary btn-sm"
          >
            <Upload size={13} />
            {props.uploading ? "Uploading…" : "Add files"}
          </FileUploadButton>
        </Show>
        <Show when={editable()}>
          <IconButton label="Delete person" class="ml-auto text-danger" onClick={props.onDelete}>
            <Trash2 size={16} />
          </IconButton>
        </Show>
      </div>

      <Show when={props.uploading}>
        <div class="border-b border-line px-5 py-2.5">
          <div class="mb-1 flex items-center justify-between text-[0.7rem] text-muted">
            <span>Uploading to this person</span>
            <span>{Math.round(props.uploadProgress * 100)}%</span>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full bg-moss-soft">
            <div
              class="h-full rounded-full bg-moss transition-[width]"
              style={{ width: `${Math.max(4, props.uploadProgress * 100)}%` }}
            />
          </div>
        </div>
      </Show>

      <div class="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <Show when={props.person.bio}>
          <section class="mb-5">
            <h3 class="label">About</h3>
            <p class="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
              {props.person.bio}
            </p>
          </section>
        </Show>

        <Show when={props.person.maidenName || props.person.nickname}>
          <section class="mb-5 flex flex-wrap gap-2 text-xs">
            <Show when={props.person.nickname}>
              <span class="rounded-full bg-moss-soft px-2.5 py-1">“{props.person.nickname}”</span>
            </Show>
            <Show when={props.person.maidenName}>
              <span class="rounded-full bg-moss-soft px-2.5 py-1">
                Born {props.person.maidenName}
              </span>
            </Show>
          </section>
        </Show>

        <section class="mb-5 space-y-4">
          <RelationGroup
            title="Parents"
            entries={parents()}
            editable={editable()}
            onSelect={props.onSelectPerson}
            onRemove={props.onRemoveRelationship}
            empty="No parents added yet."
          />
          <RelationGroup
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
              class="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2 text-xs font-semibold text-muted transition hover:border-moss/40 hover:text-ink"
            >
              <Plus size={13} />
              Connect another person
            </button>
          </Show>
        </section>

        <section>
          <div class="flex items-center justify-between">
            <h3 class="label">Photos and files</h3>
            <span class="text-[0.7rem] text-muted">{mediaCount()}</span>
          </div>
          <Show
            when={mediaCount()}
            fallback={
              <p class="mt-2 rounded-xl border border-dashed border-line px-3 py-5 text-center text-xs leading-relaxed text-muted">
                No files yet. Add a portrait or a document about {firstName(props.person)}.
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
      </div>
    </aside>
  );
}

type RelationEntry = { relationship: GraphRelationship; person?: GraphPerson };

function RelationGroup(props: {
  title: string;
  entries: RelationEntry[];
  editable: boolean;
  onSelect: (id: string) => void;
  onRemove: (relationship: GraphRelationship) => void;
  empty: string;
  labelFor?: (entry: RelationEntry) => string;
}) {
  return (
    <div>
      <h3 class="label">{props.title}</h3>
      <Show
        when={props.entries.length}
        fallback={<p class="mt-1 text-xs text-muted">{props.empty}</p>}
      >
        <ul class="mt-1.5 space-y-1">
          <For each={props.entries}>
            {entry => (
              <li class="group flex items-center gap-2 rounded-xl px-1 py-1 hover:bg-moss/5">
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => entry.person && props.onSelect(entry.person.id)}
                >
                  <Avatar name={entry.person?.displayName ?? "?"} fileId={entry.person?.avatarFileId} size={28} />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium">{entry.person?.displayName}</span>
                    <Show when={props.labelFor?.(entry)}>
                      <span class="block text-[0.68rem] text-muted">{props.labelFor?.(entry)}</span>
                    </Show>
                  </span>
                </button>
                <Show when={props.editable}>
                  <button
                    type="button"
                    class="rounded-full p-1 text-muted opacity-60 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                    aria-label="Remove relationship"
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
      class="group relative aspect-square overflow-hidden rounded-xl border border-line bg-paper text-left"
      title={props.group.name}
      aria-label={`Open ${props.group.name}`}
      onClick={props.onOpen}
    >
      <span class="absolute left-2 top-2 h-[calc(100%-0.4rem)] w-[calc(100%-0.4rem)] rounded-lg border border-line bg-raised/80" />
      <span class="absolute left-1 top-1 h-[calc(100%-0.4rem)] w-[calc(100%-0.4rem)] rounded-lg border border-line bg-raised" />
      <span class="absolute inset-0 overflow-hidden rounded-xl">
        <Show
          when={cover()}
          fallback={
            <span class="flex h-full w-full items-center justify-center text-muted">
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
    <div class="group relative aspect-square overflow-hidden rounded-xl border border-line bg-paper">
      <button type="button" class="h-full w-full" onClick={props.onPreview} aria-label={`Open ${props.file.name}`}>
        <Show
          when={props.file.thumbUrl}
          fallback={
            <span class="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-muted">
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
            onClick={props.onAvatar}
          >
            <ImageIcon size={12} />
          </button>
          <button
            type="button"
            class="rounded-full bg-black/60 p-1.5 text-white hover:bg-danger"
            title="Delete file"
            aria-label="Delete file"
            onClick={props.onDelete}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </Show>
    </div>
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
