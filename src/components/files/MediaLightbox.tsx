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
import type { FaceBox } from "~/lib/face-box";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { IconButton } from "../ui/icon-button";
import { AssignFaceDialog } from "./AssignFaceDialog";
import { FaceListSection } from "./FaceListSection";
import { FaceOverlay } from "./FaceOverlay";
import { FilePeopleSection } from "./FilePeopleSection";
import { TakenAtField } from "./TakenAtField";
import { formatBytes, formatDate, formatRelative } from "~/lib/format";
import type { FuzzyDate } from "~/lib/fuzzy-date";
import { useI18n } from "~/i18n/LocaleProvider";

type MediaLightboxProps = {
  files: GraphFile[];
  initialFileId?: string | null;
  title: string;
  group?: GraphFileGroup | null;
  person?: GraphPerson;
  people: GraphPerson[];
  role: TreeRole;
  tagPending?: boolean;
  takenAtPending?: boolean;
  facePending?: boolean;
  faceScanPending?: boolean;
  onClose: () => void;
  onSelectPerson: (id: string) => void;
  onSetAvatar: (personId: string, fileId: string | null) => void;
  onSaveTags: (fileId: string, personIds: string[]) => void;
  onSetTakenAt: (fileId: string, value: FuzzyDate | null) => void;
  onDeleteFile: (file: GraphFile) => void;
  /** Reports the photo the lightbox is showing, including after arrow keys. */
  onCurrentChange?: (file: GraphFile) => void;
  onAssignFace?: (fileId: string, faceId: string, personId: string) => void;
  onUnlinkFace?: (fileId: string, faceId: string) => void;
  onSetFaceIgnored?: (fileId: string, faceId: string, ignored: boolean) => void;
  onDeleteFace?: (fileId: string, faceId: string) => void;
  onAddFace?: (fileId: string, personId: string, box: FaceBox) => void;
  onScanFaces?: (fileId: string) => void;
  onRenameGroup?: (name: string) => void;
  onDeleteGroup?: () => void;
  /** When false, only thumbnails are shown and download links are hidden. */
  allowDownload?: boolean;
  /** Overrides the image and download URLs, used by demo and share views. */
  fileUrlFor?: (file: GraphFile, inline: boolean) => string;
  /** Overrides thumbnail URLs for portraits, used by demo and share views. */
  thumbUrlFor?: (fileId: string) => string;
};

export function MediaLightbox(props: MediaLightboxProps) {
  const { t, locale } = useI18n();
  const editable = () => props.role === "owner" || props.role === "editor";
  const canDownload = () => props.allowDownload !== false;
  const previewUrl = (file: GraphFile) => {
    if (props.fileUrlFor) return props.fileUrlFor(file, true);
    if (!canDownload() && file.thumbUrl) return file.thumbUrl;
    return `/api/files/${file.id}/download?inline=1`;
  };
  const downloadUrl = (file: GraphFile) =>
    props.fileUrlFor ? props.fileUrlFor(file, false) : `/api/files/${file.id}/download`;
  const initialIndex = () => {
    if (!props.files.length) return 0;
    const found = props.files.findIndex(file => file.id === props.initialFileId);
    return found >= 0 ? found : 0;
  };
  const [index, setIndex] = createSignal(initialIndex());
  const [albumName, setAlbumName] = createSignal(props.group?.name ?? "");
  const [activeFaceId, setActiveFaceId] = createSignal<string | null>(null);
  const [draftBox, setDraftBox] = createSignal<FaceBox | null>(null);
  const [drawingFace, setDrawingFace] = createSignal(false);
  let imageRef: HTMLImageElement | undefined;

  const current = createMemo(() => props.files[index()] ?? props.files[0]);
  createEffect(() => {
    const file = current();
    if (file) props.onCurrentChange?.(file);
  });
  const isImage = () => current()?.kind === "image";
  const canEditFaces = () =>
    editable() && Boolean(props.onAssignFace) && isImage();
  const activeFace = createMemo(() => {
    const id = activeFaceId();
    return id ? (current()?.faces.find(face => face.id === id) ?? null) : null;
  });
  const faceDialogOpen = () => Boolean(activeFace() || draftBox());

  createEffect(() => {
    // Moving to another photo must not carry a selection or an unfinished box.
    current()?.id;
    setActiveFaceId(null);
    setDraftBox(null);
    setDrawingFace(false);
  });

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
      if (drawingFace()) {
        if (event.key === "Escape") setDrawingFace(false);
        return;
      }
      if (faceDialogOpen()) return;
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
      <div
        class="fixed inset-0 z-[60] flex flex-col bg-[#080a07] text-white sm:flex-row"
        data-testid="media-lightbox"
      >
        <div class="relative flex min-h-0 flex-1 flex-col">
          <button
            type="button"
            class="absolute right-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white/80 transition hover:bg-black/75 hover:text-white"
            aria-label={t("media.lightbox.close")}
            data-testid="media-lightbox-close"
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
                    {t("media.lightbox.downloadOnly")}
                  </p>
                  <Show when={canDownload() ? current() : null}>
                    {file => (
                      <a
                        href={downloadUrl(file())}
                        class={buttonVariants({ variant: "secondary", size: "sm" })}
                        download={file().name}
                        data-testid="media-lightbox-download-fallback"
                      >
                        <Download size={14} />
                        {t("media.lightbox.downloadFile")}
                      </a>
                    )}
                  </Show>
                </div>
              }
            >
              {file => (
                <img
                  ref={imageRef}
                  src={previewUrl(file())}
                  alt={file().name}
                  class="max-h-full max-w-full object-contain"
                />
              )}
            </Show>

            <Show when={canEditFaces() && current() ? current()! : null}>
              {file => (
                <FaceOverlay
                  img={imageRef}
                  faces={file().faces}
                  people={props.people}
                  selectedFaceId={activeFaceId()}
                  onSelect={setActiveFaceId}
                  drawing={drawingFace()}
                  onDrawBox={box => {
                    setDrawingFace(false);
                    setDraftBox(box);
                  }}
                  onCancelDraw={() => setDrawingFace(false)}
                />
              )}
            </Show>

            <Show when={props.files.length > 1}>
              <button
                type="button"
                class="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/25 text-white/55 backdrop-blur transition hover:bg-black/45 hover:text-white/85 sm:left-6"
                aria-label={t("media.lightbox.previous")}
                data-testid="media-lightbox-prev"
                onClick={previous}
              >
                <ChevronLeft size={22} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                class="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/25 text-white/55 backdrop-blur transition hover:bg-black/45 hover:text-white/85 sm:right-6"
                aria-label={t("media.lightbox.next")}
                data-testid="media-lightbox-next"
                onClick={next}
              >
                <ChevronRight size={22} strokeWidth={1.5} />
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
                    aria-label={t("media.lightbox.show", { name: file.name })}
                    data-testid={`media-lightbox-thumb-${file.id}`}
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

        <aside
          class="scroll-thin max-h-[46dvh] shrink-0 overflow-y-auto border-t border-border bg-card px-5 py-4 text-foreground sm:max-h-none sm:w-[24rem] sm:border-l sm:border-t-0 sm:py-5"
          data-testid="media-lightbox-sidebar"
        >
          <div class="mx-auto max-w-lg">
            <div class="flex items-start gap-3">
              <span class="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-background text-muted-foreground">
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
                      aria-label={t("media.lightbox.albumName")}
                      data-testid="media-lightbox-album-name"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!albumName().trim() || albumName().trim() === props.group?.name}
                      data-testid="media-lightbox-album-save"
                      onClick={() => props.onRenameGroup?.(albumName().trim())}
                    >
                      {t("common.save")}
                    </Button>
                  </div>
                </Show>
                <p class="mt-1 text-[0.7rem] text-muted-foreground">
                  <Show
                    when={props.group}
                    fallback={
                      <>
                        {t("media.added", {
                          when: formatRelative(current()?.createdAt, locale()),
                        })}
                      </>
                    }
                  >
                    {t("media.lightbox.groupSummary", {
                      count: props.files.length,
                      when: formatRelative(props.group?.createdAt, locale()),
                    })}
                  </Show>
                </p>
                <div class="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" class="uppercase tracking-wide">
                    {t(
                      current()?.kind === "image"
                        ? "media.kind.image"
                        : current()?.kind === "document"
                          ? "media.kind.document"
                          : "media.kind.other",
                    )}
                  </Badge>
                  <Show when={current()?.isAvatar}>
                    <Badge variant="secondary" class="uppercase tracking-wide">
                      {t("person.panel.portrait")}
                    </Badge>
                  </Show>
                  <Show when={props.files.length > 1}>
                    <Badge variant="secondary">{index() + 1} / {props.files.length}</Badge>
                  </Show>
                </div>
              </div>
            </div>

            <div class="mt-4 flex flex-wrap items-center gap-2">
              <Show when={canDownload() ? current() : null}>
                {file => (
                  <a
                    href={downloadUrl(file())}
                    class={buttonVariants({ variant: "secondary", size: "sm" })}
                    download={file().name}
                    data-testid="media-lightbox-download"
                  >
                    <Download size={14} />
                    {t("media.download")}
                  </a>
                )}
              </Show>
              <Show when={editable() && current()?.kind === "image" && props.person}>
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="media-lightbox-portrait"
                  onClick={() => {
                    if (!current() || !props.person) return;
                    props.onSetAvatar(
                      props.person.id,
                      current()!.isAvatar ? null : current()!.id,
                    );
                  }}
                >
                  <UserRound size={14} />
                  {current()?.isAvatar
                    ? t("person.panel.removePortrait")
                    : t("person.panel.useAsPortrait")}
                </Button>
              </Show>
              <Show when={editable()}>
                <IconButton
                  label={t("tree.delete.fileConfirm")}
                  class="ml-auto text-destructive"
                  data-testid="media-lightbox-delete"
                  onClick={() => current() && props.onDeleteFile(current()!)}
                >
                  <Trash2 size={16} />
                </IconButton>
              </Show>
            </div>

            <Show when={current()}>
              {file => (
                <section class="mt-5" data-testid="media-lightbox-file-details">
                  <h3 class="field-label">{t("media.lightbox.currentFile")}</h3>
                  <p class="mt-1 truncate text-sm font-medium">{file().name}</p>
                  <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt class="text-[0.68rem] text-muted-foreground">
                        {t("person.event.type")}
                      </dt>
                      <dd class="mt-0.5 truncate">{file().mimeType}</dd>
                    </div>
                    <div>
                      <dt class="text-[0.68rem] text-muted-foreground">
                        {t("media.field.size")}
                      </dt>
                      <dd class="mt-0.5">{formatBytes(file().sizeBytes)}</dd>
                    </div>
                    <Show when={file().width && file().height}>
                      <div>
                        <dt class="text-[0.68rem] text-muted-foreground">
                          {t("media.field.dimensions")}
                        </dt>
                        <dd class="mt-0.5">
                          {file().width} × {file().height}
                        </dd>
                      </div>
                    </Show>
                    <div>
                      <dt class="text-[0.68rem] text-muted-foreground">
                        {t("media.field.added")}
                      </dt>
                      <dd class="mt-0.5">{formatDate(file().createdAt, locale())}</dd>
                    </div>
                    <Show when={file().kind === "image"}>
                      <div>
                        <dt class="text-[0.68rem] text-muted-foreground">
                          {t("media.field.taken")}
                        </dt>
                        <dd class="mt-0.5">
                          <TakenAtField
                            value={file().takenAt}
                            editable={editable()}
                            pending={props.takenAtPending}
                            onChange={value => props.onSetTakenAt(file().id, value)}
                          />
                        </dd>
                      </div>
                    </Show>
                  </dl>
                </section>
              )}
            </Show>

            <section class="mt-5" data-testid="media-lightbox-attached">
              <h3 class="field-label">{t("media.field.attachedTo")}</h3>
              <Show
                when={props.person}
                fallback={
                  <p class="mt-1.5 rounded-xl border border-dashed border-border px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                    <Show
                      when={current()?.personId}
                      fallback={t("media.attached.inbox")}
                    >
                      {t("media.attached.missingPerson")}
                    </Show>
                  </p>
                }
              >
                {person => (
                  <button
                    type="button"
                    class="mt-1.5 flex w-full items-center gap-2.5 rounded-xl px-1 py-1 text-left hover:bg-primary/5"
                    data-testid={`media-lightbox-person-${person().id}`}
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
                      <span class="block text-[0.7rem] text-muted-foreground">
                        {t("media.attached.openProfile")}
                      </span>
                    </span>
                  </button>
                )}
              </Show>
            </section>

            <Show when={current()}>
              {file => (
                <Show when={file().kind === "image"}>
                  <div class="mt-5">
                    <FilePeopleSection
                      people={props.people}
                      primaryPerson={props.person}
                      taggedPersonIds={file().taggedPersonIds}
                      editable={editable()}
                      pending={props.tagPending}
                      onSave={personIds => props.onSaveTags(file().id, personIds)}
                    />
                  </div>
                  <Show when={canEditFaces()}>
                    <FaceListSection
                      file={file()}
                      pending={props.facePending}
                      scanning={props.faceScanPending}
                      onSelectFace={setActiveFaceId}
                      onScan={() => props.onScanFaces?.(file().id)}
                      onAddFace={() => {
                        setDraftBox(null);
                        setDrawingFace(true);
                      }}
                      onUnignore={faceId => props.onSetFaceIgnored?.(file().id, faceId, false)}
                      onDeleteFace={faceId => props.onDeleteFace?.(file().id, faceId)}
                    />
                  </Show>
                </Show>
              )}
            </Show>

            <Show when={props.group && editable()}>
              <section class="mt-5 border-t border-border pt-4">
                <Button
                  variant="destructive"
                  size="sm"
                  data-testid="media-lightbox-delete-album"
                  onClick={() => props.onDeleteGroup?.()}
                >
                  <Trash2 size={14} />
                  {t("tree.delete.albumConfirm")}
                </Button>
                <p class="mt-2 text-[0.68rem] leading-relaxed text-muted-foreground">
                  {t("media.album.deleteHint")}
                </p>
              </section>
            </Show>

            <p class="mt-5 text-[0.68rem] leading-relaxed text-muted-foreground">
              <Show
                when={canDownload()}
                fallback={t("media.footer.readOnly")}
              >
                {t("media.footer.private")}
              </Show>
            </p>
          </div>
        </aside>
      </div>

      <Show when={current()}>
        {file => (
          <AssignFaceDialog
            open={faceDialogOpen()}
            onClose={() => {
              setDraftBox(null);
              setActiveFaceId(null);
            }}
            file={file()}
            face={activeFace()}
            draftBox={draftBox()}
            people={props.people}
            pending={props.facePending}
            onAssign={personId => {
              const face = activeFace();
              const box = draftBox();
              setDraftBox(null);
              setActiveFaceId(null);
              if (face) {
                props.onAssignFace?.(file().id, face.id, personId);
              } else if (box && props.onAddFace) {
                props.onAddFace(file().id, personId, box);
              }
            }}
            onUnlink={() => {
              const face = activeFace();
              setActiveFaceId(null);
              if (face) props.onUnlinkFace?.(file().id, face.id);
            }}
            onIgnore={() => {
              const face = activeFace();
              setActiveFaceId(null);
              if (face) props.onSetFaceIgnored?.(file().id, face.id, true);
            }}
          />
        )}
      </Show>
    </Portal>
  );
}
