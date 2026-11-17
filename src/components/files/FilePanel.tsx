import { Show } from "solid-js";
import {
  CalendarDays,
  Download,
  FileText,
  Image as ImageIcon,
  Trash2,
  UserRound,
  X,
} from "lucide-solid";
import type { GraphFile, GraphPerson } from "~/api/people-server";
import type { TreeRole } from "~/server/guards";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { IconButton } from "../ui/icon-button";
import { FilePeopleSection } from "./FilePeopleSection";
import { TakenAtField } from "./TakenAtField";
import { formatBytes, formatDate, formatRelative } from "~/lib/format";
import type { FuzzyDate } from "~/lib/fuzzy-date";

type FilePanelProps = {
  file: GraphFile;
  person: GraphPerson | undefined;
  people: GraphPerson[];
  role: TreeRole;
  tagPending?: boolean;
  takenAtPending?: boolean;
  onClose: () => void;
  onPreview: () => void;
  onSelectPerson: (id: string) => void;
  onSetAvatar: (fileId: string | null) => void;
  onSaveTags: (personIds: string[]) => void;
  onSetTakenAt: (value: FuzzyDate | null) => void;
  onDelete: () => void;
  /** When false, the download button is hidden. Used by share views. */
  allowDownload?: boolean;
  /** Overrides thumbnail URLs for portraits, used by demo and share views. */
  thumbUrlFor?: (fileId: string) => string;
};

export function FilePanel(props: FilePanelProps) {
  const editable = () => props.role === "owner" || props.role === "editor";
  const isImage = () => props.file.kind === "image";

  return (
    <aside
      class="mobile-sheet absolute inset-x-0 bottom-0 z-30 flex flex-col sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-20 sm:max-h-none sm:w-[24rem] sm:rounded-3xl sm:border sm:pb-0"
      data-testid="file-panel"
    >
      <div class="flex items-center justify-between px-4 pb-1 pt-2 sm:hidden">
        <span class="mx-auto h-1 w-10 rounded-full bg-border" />
        <IconButton
          label="Close"
          onClick={props.onClose}
          class="!absolute right-2 top-2"
          data-testid="file-panel-close-mobile"
        >
          <X size={17} />
        </IconButton>
      </div>

      <div class="flex items-start gap-3 px-5 pb-4 pt-2 sm:pt-5" data-testid="file-panel-header">
        <div class="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-background text-muted-foreground">
          <Show
            when={isImage() && props.file.thumbUrl}
            fallback={
              <Show when={isImage()} fallback={<FileText size={26} />}>
                <ImageIcon size={26} />
              </Show>
            }
          >
            <img
              src={props.file.thumbUrl!}
              alt={props.file.name}
              class="h-full w-full object-cover"
            />
          </Show>
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="line-clamp-2 font-display text-xl leading-tight tracking-tight">
            {props.file.name}
          </h2>
          <p class="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays size={12} />
            Added {formatRelative(props.file.createdAt)}
          </p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary" class="uppercase tracking-wide">
              {props.file.kind}
            </Badge>
            <Show when={props.file.isAvatar}>
              <Badge variant="secondary" class="uppercase tracking-wide">
                Portrait
              </Badge>
            </Show>
          </div>
        </div>
        <div class="hidden sm:block">
          <IconButton label="Close" onClick={props.onClose} data-testid="file-panel-close">
            <X size={17} />
          </IconButton>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 border-y border-border px-5 py-2.5">
        <Show when={isImage()}>
          <Button
            size="sm"
            variant="secondary"
            onClick={props.onPreview}
            data-testid="file-panel-preview"
          >
            View full size
          </Button>
        </Show>
        <Show when={props.allowDownload !== false}>
          <a
            href={`/api/files/${props.file.id}/download`}
            class={buttonVariants({ variant: "secondary", size: "sm" })}
            download={props.file.name}
            data-testid="file-panel-download"
          >
            <Download size={14} />
            Download
          </a>
        </Show>
        <Show when={editable() && isImage()}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => props.onSetAvatar(props.file.isAvatar ? null : props.file.id)}
            data-testid="file-panel-portrait"
          >
            <UserRound size={14} />
            {props.file.isAvatar ? "Remove portrait" : "Use as portrait"}
          </Button>
        </Show>
        <Show when={editable()}>
          <IconButton
            label="Delete file"
            class="ml-auto text-destructive"
            onClick={props.onDelete}
            data-testid="file-panel-delete"
          >
            <Trash2 size={16} />
          </IconButton>
        </Show>
      </div>

      <div class="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <section data-testid="file-panel-details">
          <h3 class="field-label">Details</h3>
          <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt class="text-[0.68rem] text-muted-foreground">Type</dt>
              <dd class="mt-0.5 truncate">{props.file.mimeType}</dd>
            </div>
            <div>
              <dt class="text-[0.68rem] text-muted-foreground">Size</dt>
              <dd class="mt-0.5">{formatBytes(props.file.sizeBytes)}</dd>
            </div>
            <Show when={props.file.width && props.file.height}>
              <div>
                <dt class="text-[0.68rem] text-muted-foreground">Dimensions</dt>
                <dd class="mt-0.5">
                  {props.file.width} × {props.file.height}
                </dd>
              </div>
            </Show>
            <div>
              <dt class="text-[0.68rem] text-muted-foreground">Added</dt>
              <dd class="mt-0.5">{formatDate(props.file.createdAt)}</dd>
            </div>
            <Show when={isImage()}>
              <div>
                <dt class="text-[0.68rem] text-muted-foreground">Taken</dt>
                <dd class="mt-0.5">
                  <TakenAtField
                    value={props.file.takenAt}
                    editable={editable()}
                    pending={props.takenAtPending}
                    onChange={value => props.onSetTakenAt(value)}
                  />
                </dd>
              </div>
            </Show>
          </dl>
        </section>

        <section class="mt-6" data-testid="file-panel-attached">
          <h3 class="field-label">Attached to</h3>
          <Show
            when={props.person}
            fallback={<p class="mt-1.5 text-xs text-muted-foreground">This person is no longer in the tree.</p>}
          >
            {person => (
              <button
                type="button"
                class="mt-1.5 flex w-full items-center gap-2.5 rounded-xl px-1 py-1 text-left hover:bg-primary/5"
                data-testid={`file-panel-person-${person().id}`}
                onClick={() => props.onSelectPerson(person().id)}
              >
                <Avatar
                  name={person().displayName}
                  fileId={person().avatarFileId}
                  thumbUrl={
                    props.thumbUrlFor && person().avatarFileId
                      ? props.thumbUrlFor(person().avatarFileId!)
                      : undefined
                  }
                  size={36}
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold">
                    {person().displayName}
                  </span>
                  <span class="block text-[0.7rem] text-muted-foreground">Open their profile</span>
                </span>
              </button>
            )}
          </Show>
        </section>

        <Show when={isImage()}>
          <div class="mt-6">
            <FilePeopleSection
              people={props.people}
              primaryPerson={props.person}
              taggedPersonIds={props.file.taggedPersonIds}
              editable={editable()}
              pending={props.tagPending}
              onSave={props.onSaveTags}
            />
          </div>
        </Show>

        <p class="mt-6 text-[0.68rem] leading-relaxed text-muted-foreground">
          <Show
            when={props.allowDownload !== false}
            fallback="This tree is shared read-only. Media is shown as thumbnails."
          >
            Files stay private to this tree. Downloads use a short-lived signed link.
          </Show>
        </p>
      </div>
    </aside>
  );
}
