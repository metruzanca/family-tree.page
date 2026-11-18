import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import {
  Check,
  FolderInput,
  FolderOpen,
  Images,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-solid";
import type { GraphFile, TreeGraph } from "~/api/people-server";
import type { TreeRole } from "~/server/guards";
import {
  filterMediaFiles,
  groupMediaByYear,
  inboxFiles,
  mediaFolders,
  type MediaLocation,
} from "~/lib/media";
import { Button, buttonVariants } from "../ui/button";
import { Progress, ProgressGroup, ProgressLabel, ProgressValueLabel } from "../ui/progress";
import { FileUploadButton } from "./FileUploadButton";
import { MediaTile } from "./MediaTile";
import { MoveToPersonDialog } from "./MoveToPersonDialog";
import { PersonFolders } from "./PersonFolders";
import { useI18n } from "~/i18n/LocaleProvider";

type MediaGalleryProps = {
  treeId: string;
  data: TreeGraph;
  role: TreeRole;
  uploading: boolean;
  uploadProgress: number;
  /** Opens the gallery already filtered to a person, from a profile link. */
  initialLocation?: MediaLocation;
  onUpload: (files: File[], personId: string | null) => void;
  onOpenFile: (file: GraphFile, files: GraphFile[]) => void;
  onAssign: (fileIds: string[], personId: string | null) => void;
  onDelete: (fileIds: string[]) => void;
};

const uploadAccept =
  "image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif";

export function MediaGallery(props: MediaGalleryProps) {
  const { t } = useI18n();
  const editable = () => props.role === "owner" || props.role === "editor";
  const [view, setView] = createSignal<"gallery" | "people">("gallery");
  const [location, setLocation] = createSignal<MediaLocation>(
    props.initialLocation ?? "all",
  );
  const [folder, setFolder] = createSignal(
    props.initialLocation && props.initialLocation !== "all" && props.initialLocation !== "inbox"
      ? props.initialLocation
      : "inbox",
  );
  const [query, setQuery] = createSignal("");
  const [selecting, setSelecting] = createSignal(false);
  const [selected, setSelected] = createSignal<string[]>([]);
  const [moveOpen, setMoveOpen] = createSignal(false);
  const [dropActive, setDropActive] = createSignal(false);

  const locations = createMemo(() =>
    mediaFolders(props.data.people, props.data.files).map(folder => folder.person),
  );
  const inbox = createMemo(() => inboxFiles(props.data.files));
  const galleryFiles = createMemo(() =>
    filterMediaFiles(props.data.files, { location: location(), query: query() }),
  );
  const yearGroups = createMemo(() => groupMediaByYear(galleryFiles()));
  const imageCount = createMemo(
    () => props.data.files.filter(file => file.kind === "image").length,
  );
  const uploadTarget = createMemo(() => {
    if (view() === "people") return folder() === "inbox" ? null : folder();
    const value = location();
    return value === "all" || value === "inbox" ? null : value;
  });
  const destinationName = createMemo(() => {
    const personId = view() === "people" ? folder() : uploadTarget();
    if (!personId || personId === "inbox") return null;
    return props.data.people.find(person => person.id === personId)?.displayName ?? null;
  });
  const destinationInFolder = createMemo(() =>
    view() === "people" ? folder() !== "inbox" : Boolean(uploadTarget()),
  );
  const uploadTargetLabel = createMemo(() => {
    const name = destinationName();
    if (name) return t("media.upload.toPerson", { name });
    return destinationInFolder() ? t("media.upload.toFolder") : t("media.upload.toInbox");
  });
  const dropTargetLabel = createMemo(() => {
    const name = destinationName();
    if (name) return t("media.drop.toPerson", { name });
    return destinationInFolder() ? t("media.drop.toFolder") : t("media.drop.toInbox");
  });

  // A photo can be deleted or moved from the lightbox, so drop selections that
  // no longer point at a file in this tree.
  createEffect(() => {
    const ids = new Set(props.data.files.map(file => file.id));
    setSelected(current => {
      const next = current.filter(id => ids.has(id));
      return next.length === current.length ? current : next;
    });
  });

  function clearSelection() {
    setSelected([]);
    setSelecting(false);
  }

  function toggleSelected(fileId: string) {
    setSelected(current =>
      current.includes(fileId)
        ? current.filter(id => id !== fileId)
        : [...current, fileId],
    );
  }

  function handleTile(file: GraphFile) {
    if (selecting()) {
      toggleSelected(file.id);
      return;
    }
    props.onOpenFile(
      file,
      yearGroups().flatMap(group => group.files),
    );
  }

  function handleAssign(personId: string | null) {
    const fileIds = selected();
    if (!fileIds.length) return;
    props.onAssign(fileIds, personId);
    setMoveOpen(false);
    clearSelection();
  }

  function hasFiles(event: DragEvent) {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  function handleDrop(event: DragEvent) {
    if (!editable() || !hasFiles(event)) return;
    event.preventDefault();
    setDropActive(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) props.onUpload(files, uploadTarget());
  }

  return (
    <div
      class="relative"
      onDragOver={event => {
        if (!editable() || !hasFiles(event)) return;
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={event => {
        if (event.currentTarget === event.target || !event.relatedTarget) {
          setDropActive(false);
        }
      }}
      onDrop={handleDrop}
      data-testid="media-gallery"
    >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="font-display text-3xl tracking-tight">{t("media.title")}</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            {t("media.count", { count: imageCount() })}
            <Show when={inbox().length}>
              {" "}
              · {t("media.inboxWaiting", { count: inbox().length })}
            </Show>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div
            class="flex items-center rounded-full border border-border bg-muted/70 p-1"
            role="tablist"
            aria-label={t("media.viewsAria")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={view() === "gallery"}
              class={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                view() === "gallery"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setView("gallery")}
              data-testid="media-tab-gallery"
            >
              <Images size={13} />
              {t("media.view.gallery")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view() === "people"}
              class={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                view() === "people"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setView("people")}
              data-testid="media-tab-people"
            >
              <FolderOpen size={13} />
              {t("media.view.people")}
            </button>
          </div>
          <Show when={editable()}>
            <button
              type="button"
              class={buttonVariants({
                variant: selecting() ? "default" : "secondary",
                size: "sm",
              })}
              onClick={() => {
                if (selecting()) clearSelection();
                else setSelecting(true);
              }}
              data-testid="media-select-toggle"
            >
              {selecting() ? <X size={14} /> : <Check size={14} />}
              {selecting() ? t("common.done") : t("media.select")}
            </button>
          </Show>
          <Show when={editable()}>
            <FileUploadButton
              multiple
              accept={uploadAccept}
              onFiles={files => props.onUpload(files, uploadTarget())}
              disabled={props.uploading}
              class={buttonVariants({ size: "sm" })}
              testId="media-upload"
            >
              <Upload size={14} />
              {props.uploading
                ? t("person.panel.uploading")
                : view() === "people" || uploadTarget()
                  ? t("media.upload.here")
                  : t("media.upload.add")}
            </FileUploadButton>
          </Show>
        </div>
      </div>

      <Show when={props.uploading}>
        <div class="mt-4" data-testid="media-upload-progress">
          <Progress value={props.uploadProgress * 100} class="gap-1.5">
            <ProgressGroup class="text-xs text-muted-foreground">
              <ProgressLabel>{uploadTargetLabel()}</ProgressLabel>
              <ProgressValueLabel />
            </ProgressGroup>
          </Progress>
        </div>
      </Show>

      <Show when={view() === "gallery"}>
        <div class="mt-5 flex flex-wrap items-center gap-2">
          <label class="relative min-w-48 flex-1 sm:max-w-xs">
            <Search
              size={15}
              class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              class="input pl-9"
              placeholder={t("media.search.placeholder")}
              value={query()}
              onInput={event => setQuery(event.currentTarget.value)}
              data-testid="media-search"
            />
          </label>
          <select
            class="input w-auto min-w-40"
            value={location()}
            onChange={event => setLocation(event.currentTarget.value)}
            data-testid="media-filter-person"
          >
            <option value="all">{t("media.filter.all")}</option>
            <option value="inbox">{t("media.filter.inbox", { count: inbox().length })}</option>
            <For each={locations()}>
              {person => <option value={person.id}>{person.displayName}</option>}
            </For>
          </select>
          <span class="text-xs text-muted-foreground">
            {t("media.shown", { count: galleryFiles().length })}
          </span>
        </div>
      </Show>

      <Show when={view() === "people"}>
        <PersonFolders
          people={props.data.people}
          files={props.data.files}
          groups={props.data.groups}
          editable={editable()}
          folder={folder()}
          selectedIds={selected()}
          selecting={selecting()}
          onFolderChange={setFolder}
          onToggleSelect={toggleSelected}
          onClearSelection={clearSelection}
          onOpenFile={props.onOpenFile}
          onUpload={props.onUpload}
          onAssign={props.onAssign}
        />
      </Show>

      <Show when={view() === "gallery"}>
        <Show
          when={galleryFiles().length}
          fallback={
            <div
              class="mt-6 grid place-items-center rounded-3xl border border-dashed border-border px-6 py-20 text-center"
              data-testid="media-empty"
            >
              <div class="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <Show when={imageCount()} fallback={<Images size={26} />}>
                  <Search size={24} />
                </Show>
              </div>
              <h2 class="mt-4 font-display text-xl">
                {imageCount() ? t("media.empty.noMatch") : t("media.empty.none")}
              </h2>
              <p class="mt-1 max-w-sm text-sm text-muted-foreground">
                {imageCount()
                  ? t("media.empty.noMatchHint")
                  : editable()
                    ? t("media.empty.dropHint")
                    : t("media.empty.readOnly")}
              </p>
            </div>
          }
        >
          <div class="mt-6 space-y-8 pb-24">
            <For each={yearGroups()}>
              {group => (
                <section data-testid={`media-year-${group.year ?? "undated"}`}>
                  <div class="sticky top-16 z-10 -mx-1 mb-2 flex items-center gap-2 bg-background/85 px-1 py-1 backdrop-blur">
                    <h2 class="font-display text-lg tracking-tight">
                      {group.year ?? t("media.undated")}
                    </h2>
                    <span class="text-xs text-muted-foreground">
                      {group.files.length}
                    </span>
                  </div>
                  <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    <For each={group.files}>
                      {file => (
                        <MediaTile
                          file={file}
                          selected={selected().includes(file.id)}
                          selecting={selecting()}
                          onClick={() => handleTile(file)}
                          onToggle={() => toggleSelected(file.id)}
                        />
                      )}
                    </For>
                  </div>
                </section>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={editable() && selected().length}>
        <div
          class="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-[min(94vw,34rem)] items-center gap-2 rounded-2xl border border-border bg-card/95 px-3 py-2.5 shadow-[var(--shadow-soft)] backdrop-blur"
          data-testid="media-selection-bar"
        >
          <span class="ml-1 text-sm font-semibold">
            {t("media.selected", { count: selected().length })}
          </span>
          <div class="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setMoveOpen(true)}
              data-testid="media-selection-file"
            >
              <FolderInput size={14} />
              {t("media.fileUnder")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              class="text-destructive"
              onClick={() => props.onDelete(selected())}
              data-testid="media-selection-delete"
            >
              <Trash2 size={14} />
              {t("common.delete")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              data-testid="media-selection-clear"
            >
              {t("media.clearSelection")}
            </Button>
          </div>
        </div>
      </Show>

      <Show when={dropActive()}>
        <div
          class="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-background/80 backdrop-blur-sm"
          data-testid="media-drop-overlay"
        >
          <div class="rounded-3xl border-2 border-dashed border-primary/50 bg-card px-10 py-8 text-center shadow-xl">
            <Upload size={28} class="mx-auto text-primary" />
            <p class="mt-3 font-display text-xl">
              {dropTargetLabel()}
            </p>
            <p class="mt-1 text-sm text-muted-foreground">
              {t("media.drop.private")}
            </p>
          </div>
        </div>
      </Show>

      <MoveToPersonDialog
        open={moveOpen()}
        onClose={() => setMoveOpen(false)}
        people={props.data.people}
        count={selected().length}
        onSelect={handleAssign}
      />
    </div>
  );
}

