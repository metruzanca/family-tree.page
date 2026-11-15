import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { Portal } from "solid-js/web";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Image as ImageIcon,
  Trash2,
  UserRound,
  X,
} from "lucide-solid";
import type { GraphFile, GraphFileGroup, GraphPerson } from "~/api/people-server";
import type { TreeRole } from "~/server/guards";
import { Avatar } from "../ui/Avatar";
import { Button, IconButton } from "../ui/Button";
import { formatBytes, formatDate, formatRelative } from "~/lib/format";

type MediaLightboxProps = {
  files: GraphFile[];
  initialFileId?: string | null;
  title: string;
  group?: GraphFileGroup | null;
  person?: GraphPerson;
  role: TreeRole;
  onClose: () => void;
  onSelectPerson: (id: string) => void;
  onSetAvatar: (personId: string, fileId: string | null) => void;
  onDeleteFile: (file: GraphFile) => void;
  onRenameGroup?: (name: string) => void;
  onDeleteGroup?: () => void;
};

export function MediaLightbox(props: MediaLightboxProps) {
  const editable = () => props.role === "owner" || props.role === "editor";
  const initialIndex = () => {
    if (!props.files.length) return 0;
    const found = props.files.findIndex(file => file.id === props.initialFileId);
    return found >= 0 ? found : 0;
  };
  const [index, setIndex] = createSignal(initialIndex());
  const [albumName, setAlbumName] = createSignal(props.group?.name ?? "");

  const current = createMemo(() => props.files[index()] ?? props.files[0]);
  const isImage = () => current()?.kind === "image";

  createEffect(() => {
    const list = props.files;
    if (!list.length) {
      props.onClose();
      return;
    }
    if (index() >= list.length) setIndex(list.length - 1);
  });

  let lastInitial = props.initialFileId;
  createEffect(() => {
    const id = props.initialFileId;
    if (id === lastInitial) return;
    lastInitial = id;
    if (!id) return;
    const found = props.files.findIndex(file => file.id === id);
    if (found >= 0) setIndex(found);
  });

  createEffect(() => {
    setAlbumName(props.group?.name ?? "");
  });

  function next() {
    if (props.files.length < 2) return;
    setIndex(value => (value + 1) % props.files.length);
  }

  function previous() {
    if (props.files.length < 2) return;
    setIndex(value => (value - 1 + props.files.length) % props.files.length);
  }

  onMount(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") previous();
    };
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    });
  });

  return (
    <Portal>
      <div class="fixed inset-0 z-[60] flex flex-col bg-[#080a07] text-white sm:flex-row">
        <div class="relative flex min-h-0 flex-1 flex-col">
          <button
            type="button"
            class="absolute right-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white/80 transition hover:bg-black/75 hover:text-white"
            aria-label="Close lightbox"
            onClick={props.onClose}
          >
            <X size={19} />
          </button>

          <div
            class="relative flex min-h-0 flex-1 items-center justify-center p-4 pb-24 sm:p-10 sm:pb-28"
            onClick={event => {
              if (event.target === event.currentTarget) props.onClose();
            }}
          >
            <Show
              when={isImage() ? current() : null}
              fallback={
                <div class="flex max-w-sm flex-col items-center gap-4 text-center">
                  <FileText size={54} class="text-white/35" />
                  <p class="text-sm text-white/60">
                    This file is downloaded rather than previewed.
                  </p>
                  <Show when={current()}>
                    {file => (
                      <a
                        href={`/api/files/${file().id}/download`}
                        class="btn btn-secondary btn-sm"
                        download={file().name}
                      >
                        <Download size={14} />
                        Download file
                      </a>
                    )}
                  </Show>
                </div>
              }
            >
              {file => (
                <img
                  src={`/api/files/${file().id}/download?inline=1`}
                  alt={file().name}
                  class="max-h-full max-w-full object-contain"
                />
              )}
            </Show>

            <Show when={props.files.length > 1}>
              <button
                type="button"
                class="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white/75 transition hover:bg-black/70 hover:text-white sm:left-6"
                aria-label="Previous file"
                onClick={previous}
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                class="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white/75 transition hover:bg-black/70 hover:text-white sm:right-6"
                aria-label="Next file"
                onClick={next}
              >
                <ChevronRight size={22} />
              </button>
            </Show>
          </div>

          <Show when={props.files.length > 1}>
            <div class="scroll-thin absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 overflow-x-auto bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-10">
              <For each={props.files}>
                {(file, fileIndex) => (
                  <button
                    type="button"
                    class={`relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                      fileIndex() === index()
                        ? "border-gold opacity-100"
                        : "border-white/15 opacity-55 hover:opacity-90"
                    }`}
                    aria-label={`Show ${file.name}`}
                    onClick={() => setIndex(fileIndex())}
                  >
                    <Show
                      when={file.thumbUrl}
                      fallback={
                        <span class="grid h-full w-full place-items-center bg-white/10 text-white/60">
                          <Show when={file.kind === "image"} fallback={<FileText size={17} />}>
                            <ImageIcon size={17} />
                          </Show>
                        </span>
                      }
                    >
                      <img
                        src={file.thumbUrl!}
                        alt=""
                        class="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        <aside class="scroll-thin max-h-[46dvh] shrink-0 overflow-y-auto border-t border-line bg-raised px-5 py-4 text-ink sm:max-h-none sm:w-[24rem] sm:border-l sm:border-t-0 sm:py-5">
          <div class="mx-auto max-w-lg">
            <div class="flex items-start gap-3">
              <span class="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-paper text-muted">
                <Show
                  when={current()?.thumbUrl}
                  fallback={
                    <Show when={isImage()} fallback={<FileText size={20} />}>
                      <ImageIcon size={20} />
                    </Show>
                  }
                >
                  <img src={current()!.thumbUrl!} alt="" class="h-full w-full object-cover" />
                </Show>
              </span>
              <div class="min-w-0 flex-1">
                <Show
                  when={props.group && editable()}
                  fallback={
                    <h2 class="line-clamp-2 font-display text-xl leading-tight tracking-tight">
                      {props.group?.name ?? props.title}
                    </h2>
                  }
                >
                  <div class="flex gap-1.5">
                    <input
                      class="input !py-1.5 text-sm"
                      value={albumName()}
                      onInput={event => setAlbumName(event.currentTarget.value)}
                      maxlength={80}
                      aria-label="Album name"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!albumName().trim() || albumName().trim() === props.group?.name}
                      onClick={() => props.onRenameGroup?.(albumName().trim())}
                    >
                      Save
                    </Button>
                  </div>
                </Show>
                <p class="mt-1 text-[0.7rem] text-muted">
                  <Show
                    when={props.group}
                    fallback={
                      <>
                        Added {formatRelative(current()?.createdAt)}
                      </>
                    }
                  >
                    {props.files.length} {props.files.length === 1 ? "item" : "items"} · Added{" "}
                    {formatRelative(props.group?.createdAt)}
                  </Show>
                </p>
                <div class="mt-1.5 flex flex-wrap gap-1.5">
                  <span class="badge">{current()?.kind ?? "file"}</span>
                  <Show when={current()?.isAvatar}>
                    <span class="badge">Portrait</span>
                  </Show>
                  <Show when={props.files.length > 1}>
                    <span class="badge">{index() + 1} / {props.files.length}</span>
                  </Show>
                </div>
              </div>
            </div>

            <div class="mt-4 flex flex-wrap items-center gap-2">
              <Show when={current()}>
                {file => (
                  <a
                    href={`/api/files/${file().id}/download`}
                    class="btn btn-secondary btn-sm"
                    download={file().name}
                  >
                    <Download size={14} />
                    Download
                  </a>
                )}
              </Show>
              <Show when={editable() && current()?.kind === "image"}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (!current() || !props.person) return;
                    props.onSetAvatar(
                      props.person.id,
                      current()!.isAvatar ? null : current()!.id,
                    );
                  }}
                >
                  <UserRound size={14} />
                  {current()?.isAvatar ? "Remove portrait" : "Use as portrait"}
                </Button>
              </Show>
              <Show when={editable()}>
                <IconButton
                  label="Delete file"
                  class="ml-auto text-danger"
                  onClick={() => current() && props.onDeleteFile(current()!)}
                >
                  <Trash2 size={16} />
                </IconButton>
              </Show>
            </div>

            <Show when={current()}>
              {file => (
                <section class="mt-5">
                  <h3 class="label">Current file</h3>
                  <p class="mt-1 truncate text-sm font-medium">{file().name}</p>
                  <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt class="text-[0.68rem] text-muted">Type</dt>
                      <dd class="mt-0.5 truncate">{file().mimeType}</dd>
                    </div>
                    <div>
                      <dt class="text-[0.68rem] text-muted">Size</dt>
                      <dd class="mt-0.5">{formatBytes(file().sizeBytes)}</dd>
                    </div>
                    <Show when={file().width && file().height}>
                      <div>
                        <dt class="text-[0.68rem] text-muted">Dimensions</dt>
                        <dd class="mt-0.5">
                          {file().width} × {file().height}
                        </dd>
                      </div>
                    </Show>
                    <div>
                      <dt class="text-[0.68rem] text-muted">Added</dt>
                      <dd class="mt-0.5">{formatDate(file().createdAt)}</dd>
                    </div>
                  </dl>
                </section>
              )}
            </Show>

            <section class="mt-5">
              <h3 class="label">Attached to</h3>
              <Show
                when={props.person}
                fallback={<p class="mt-1.5 text-xs text-muted">This person is no longer in the tree.</p>}
              >
                {person => (
                  <button
                    type="button"
                    class="mt-1.5 flex w-full items-center gap-2.5 rounded-xl px-1 py-1 text-left hover:bg-moss/5"
                    onClick={() => props.onSelectPerson(person().id)}
                  >
                    <Avatar
                      name={person().displayName}
                      fileId={person().avatarFileId}
                      size={36}
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-semibold">
                        {person().displayName}
                      </span>
                      <span class="block text-[0.7rem] text-muted">Open their profile</span>
                    </span>
                  </button>
                )}
              </Show>
            </section>

            <Show when={props.group && editable()}>
              <section class="mt-5 border-t border-line pt-4">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => props.onDeleteGroup?.()}
                >
                  <Trash2 size={14} />
                  Delete album
                </Button>
                <p class="mt-2 text-[0.68rem] leading-relaxed text-muted">
                  This removes every file in the album.
                </p>
              </section>
            </Show>

            <p class="mt-5 text-[0.68rem] leading-relaxed text-muted">
              Files stay private to this tree. Downloads use a short-lived signed link.
            </p>
          </div>
        </aside>
      </div>
    </Portal>
  );
}
