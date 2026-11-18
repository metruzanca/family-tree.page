import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import { FolderOpen, Image as ImageIcon, Inbox, Search, Upload } from "lucide-solid";
import type { GraphFile, GraphFileGroup, GraphPerson } from "~/api/people-server";
import {
  albumFiles,
  filesForPerson,
  inboxFiles,
  looseFilesForPerson,
  mediaFolders,
  personAlbums,
} from "~/lib/media";
import { Avatar } from "../ui/Avatar";
import { MediaTile } from "./MediaTile";
import { useI18n } from "~/i18n/LocaleProvider";

const DRAG_TYPE = "application/x-family-tree-files";

type PersonFoldersProps = {
  people: GraphPerson[];
  files: GraphFile[];
  groups: GraphFileGroup[];
  editable: boolean;
  /** "inbox" or a person id. */
  folder: string;
  selectedIds: string[];
  selecting: boolean;
  onFolderChange: (folder: string) => void;
  onToggleSelect: (fileId: string) => void;
  onClearSelection: () => void;
  onOpenFile: (file: GraphFile, files: GraphFile[]) => void;
  onUpload: (files: File[], personId: string | null) => void;
  onAssign: (fileIds: string[], personId: string | null) => void;
};

export function PersonFolders(props: PersonFoldersProps) {
  const { t } = useI18n();
  const [query, setQuery] = createSignal("");
  const [dragOver, setDragOver] = createSignal<string | null>(null);
  const [draggingIds, setDraggingIds] = createSignal<string[]>([]);

  const folders = createMemo(() => mediaFolders(props.people, props.files));
  const inbox = createMemo(() => inboxFiles(props.files));
  const visibleFolders = createMemo(() => {
    const term = query().trim().toLowerCase();
    if (!term) return folders();
    return folders().filter(folder =>
      folder.person.displayName.toLowerCase().includes(term),
    );
  });

  const active = createMemo(() => {
    if (props.folder === "inbox") {
      return {
        name: t("media.inbox"),
        personId: null as string | null,
        files: inbox(),
        count: inbox().length,
        albums: [] as GraphFileGroup[],
      };
    }
    const person = props.people.find(candidate => candidate.id === props.folder);
    const files = looseFilesForPerson(props.files, props.folder);
    return {
      name: person?.displayName ?? t("media.folders.unknownPerson"),
      personId: props.folder,
      files,
      count: filesForPerson(props.files, props.folder).length,
      albums: personAlbums(props.groups, props.files, props.folder),
    };
  });

  const looseFiles = createMemo(() => active().files);
  const albums = createMemo(() => active().albums);

  function hasFiles(event: DragEvent) {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  function dropOn(event: DragEvent, folder: string) {
    if (!props.editable) return;
    event.preventDefault();
    event.stopPropagation();
    setDragOver(null);
    setDraggingIds([]);
    const personId = folder === "inbox" ? null : folder;

    if (hasFiles(event)) {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length) props.onUpload(files, personId);
      return;
    }

    const raw = event.dataTransfer?.getData(DRAG_TYPE);
    if (!raw) return;
    try {
      const ids = JSON.parse(raw) as string[];
      if (!Array.isArray(ids) || !ids.length) return;
      props.onAssign(ids, personId);
      props.onClearSelection();
    } catch {
      // A foreign drag payload is not ours to read. Ignore it.
    }
  }

  function startDrag(event: DragEvent, file: GraphFile) {
    const ids =
      props.selectedIds.includes(file.id) && props.selectedIds.length
        ? props.selectedIds
        : [file.id];
    event.dataTransfer?.setData(DRAG_TYPE, JSON.stringify(ids));
    event.dataTransfer?.setData("text/plain", ids.join(","));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    setDraggingIds(ids);
  }

  return (
    <div class="mt-5 grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]" data-testid="person-folders">
      <aside class="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <label class="relative block">
          <Search
            size={14}
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            class="input pl-8 text-sm"
            placeholder={t("media.folders.findPerson")}
            value={query()}
            onInput={event => setQuery(event.currentTarget.value)}
            data-testid="person-folder-search"
          />
        </label>

        <div
          class="scroll-thin mt-2 flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
          data-testid="person-folder-rail"
        >
          <FolderButton
            label={t("media.inbox")}
            count={inbox().length}
            active={props.folder === "inbox"}
            highlight={dragOver() === "inbox"}
            testId="person-folder-inbox"
            onSelect={() => props.onFolderChange("inbox")}
            onDragOver={event => {
              if (!props.editable) return;
              event.preventDefault();
              event.stopPropagation();
              setDragOver("inbox");
            }}
            onDragLeave={() => setDragOver(current => (current === "inbox" ? null : current))}
            onDrop={event => dropOn(event, "inbox")}
          >
            <span class="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <Inbox size={15} />
            </span>
          </FolderButton>

          <For each={visibleFolders()}>
            {folder => (
              <FolderButton
                label={folder.person.displayName}
                count={folder.count}
                active={props.folder === folder.person.id}
                highlight={dragOver() === folder.person.id}
                testId={`person-folder-${folder.person.id}`}
                onSelect={() => props.onFolderChange(folder.person.id)}
                onDragOver={event => {
                  if (!props.editable) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setDragOver(folder.person.id);
                }}
                onDragLeave={() =>
                  setDragOver(current =>
                    current === folder.person.id ? null : current,
                  )
                }
                onDrop={event => dropOn(event, folder.person.id)}
              >
                <Avatar
                  name={folder.person.displayName}
                  fileId={folder.person.avatarFileId}
                  size={32}
                />
              </FolderButton>
            )}
          </For>
        </div>
      </aside>

      <section class="min-w-0">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="font-display text-2xl tracking-tight" data-testid="person-folder-title">
              {active().name}
            </h2>
            <p class="mt-0.5 text-sm text-muted-foreground">
              {t("media.photos", { count: active().count })}
              <Show when={props.editable}>
                {" "}
                ·{" "}
                {props.folder === "inbox"
                  ? t("media.folders.dropUnfiled")
                  : t("media.folders.dropFiled")}
              </Show>
            </p>
          </div>
        </div>

        <div
          class="mt-4 min-h-64 rounded-2xl border border-dashed p-3 transition"
          classList={{
            "border-primary/50 bg-primary/5": dragOver() === (props.folder ?? ""),
            "border-border": dragOver() !== (props.folder ?? ""),
          }}
          onDragOver={event => {
            if (!props.editable) return;
            event.preventDefault();
            event.stopPropagation();
            setDragOver(props.folder);
          }}
          onDragLeave={() =>
            setDragOver(current => (current === props.folder ? null : current))
          }
          onDrop={event => dropOn(event, props.folder)}
          data-testid="person-folder-contents"
        >
          <Show
            when={looseFiles().length || albums().length}
            fallback={
              <div class="grid min-h-56 place-items-center px-6 py-10 text-center">
                <div>
                  <div class="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                    <Show when={props.editable} fallback={<ImageIcon size={22} />}>
                      <Upload size={22} />
                    </Show>
                  </div>
                  <p class="mt-3 text-sm font-semibold">{t("media.folders.empty.title")}</p>
                  <p class="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                    {props.editable
                      ? props.folder === "inbox"
                        ? t("media.folders.empty.inboxHint")
                        : t("media.folders.empty.personHint", { name: active().name })
                      : t("media.folders.empty.readOnly")}
                  </p>
                </div>
              </div>
            }
          >
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <For each={albums()}>
                {group => (
                  <AlbumTile
                    group={group}
                    onClick={() => {
                      const files = albumFiles(props.files, group.id);
                      if (files.length) props.onOpenFile(files[0], files);
                    }}
                  />
                )}
              </For>
              <For each={looseFiles()}>
                {file => (
                  <MediaTile
                    file={file}
                    selected={props.selectedIds.includes(file.id)}
                    selecting={props.selecting}
                    draggable={props.editable}
                    dragging={draggingIds().includes(file.id)}
                    onDragStart={event => startDrag(event, file)}
                    onDragEnd={() => setDraggingIds([])}
                    onClick={() => {
                      if (props.selecting) {
                        props.onToggleSelect(file.id);
                        return;
                      }
                      props.onOpenFile(file, looseFiles());
                    }}
                    onToggle={() => props.onToggleSelect(file.id)}
                  />
                )}
              </For>
            </div>
          </Show>

          <Show when={!props.editable && !looseFiles().length && !albums().length}>
            <p class="sr-only">{t("media.folders.none")}</p>
          </Show>
        </div>
      </section>
    </div>
  );
}

function FolderButton(props: {
  label: string;
  count: number;
  active: boolean;
  highlight: boolean;
  testId: string;
  onSelect: () => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent) => void;
  children: JSX.Element;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      class={`flex min-w-40 items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition lg:w-full lg:min-w-0 ${
        props.highlight
          ? "border-primary/60 bg-primary/10 ring-2 ring-primary/40"
          : props.active
            ? "border-primary/30 bg-primary/5"
            : "border-transparent hover:bg-primary/5"
      }`}
      aria-pressed={props.active}
      onClick={props.onSelect}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      data-testid={props.testId}
    >
      {props.children}
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-semibold">{props.label}</span>
        <span class="block text-[0.68rem] text-muted-foreground">
          {t("media.photos", { count: props.count })}
        </span>
      </span>
      <Show when={props.highlight}>
        <FolderOpen size={14} class="text-primary" />
      </Show>
    </button>
  );
}

function AlbumTile(props: { group: GraphFileGroup; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      class="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted text-left"
      onClick={props.onClick}
      aria-label={t("trees.open", { name: props.group.name })}
      data-testid={`media-album-${props.group.id}`}
    >
      <Show
        when={props.group.coverFileId}
        fallback={
          <span class="grid h-full w-full place-items-center text-muted-foreground">
            <FolderOpen size={22} />
          </span>
        }
      >
        <img
          src={`/api/files/${props.group.coverFileId}/thumb`}
          alt=""
          loading="lazy"
          decoding="async"
          class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      </Show>
      <span class="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[0.6rem] font-semibold text-white backdrop-blur">
        <FolderOpen size={10} />
        {t("media.album.label")}
      </span>
      <span class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 text-[0.68rem] font-medium text-white">
        {props.group.name}
      </span>
    </button>
  );
}
