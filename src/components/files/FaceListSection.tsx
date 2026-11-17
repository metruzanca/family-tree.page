import { For, Show, createMemo } from "solid-js";
import { RotateCcw, ScanFace, Trash2, UserRoundPlus } from "lucide-solid";
import type { GraphFile } from "~/api/people-server";
import { Button } from "../ui/button";
import { FaceCrop } from "./FaceCrop";

type FaceListSectionProps = {
  file: GraphFile;
  pending?: boolean;
  scanning?: boolean;
  onSelectFace: (faceId: string) => void;
  onScan: () => void;
  onAddFace: () => void;
  onUnignore: (faceId: string) => void;
  onDeleteFace: (faceId: string) => void;
};

/**
 * The review list beside the photo. Assigned faces are represented by the
 * people chips, so only faces that still need a name appear here.
 */
export function FaceListSection(props: FaceListSectionProps) {
  const unassigned = createMemo(() =>
    props.file.faces.filter(face => face.status === "unassigned"),
  );
  const assignedCount = createMemo(
    () => props.file.faces.filter(face => face.status === "assigned").length,
  );
  const ignored = createMemo(() => props.file.faces.filter(face => face.status === "ignored"));
  const numberOf = (faceId: string) =>
    props.file.faces.filter(face => face.status !== "ignored").findIndex(face => face.id === faceId) + 1;

  return (
    <section class="mt-5 border-t border-border pt-4" data-testid="file-faces">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="field-label">Faces</h3>
        <div class="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            type="button"
            class="h-7 gap-1 px-1.5 text-[0.7rem] text-muted-foreground hover:text-foreground"
            disabled={props.pending || props.scanning}
            data-testid="file-faces-add"
            onClick={props.onAddFace}
          >
            <UserRoundPlus size={13} />
            Add a face
          </Button>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            class="h-7 gap-1 px-1.5 text-[0.7rem] text-muted-foreground hover:text-foreground"
            disabled={props.pending || props.scanning}
            data-testid="file-faces-scan"
            onClick={props.onScan}
          >
            <ScanFace size={13} />
            {props.scanning
              ? "Checking…"
              : props.file.facesScannedAt
                ? "Check again"
                : "Check for faces"}
          </Button>
        </div>
      </div>

      <Show when={unassigned().length}>
        <p class="mt-2 text-xs text-muted-foreground" data-testid="file-faces-summary">
          {unassigned().length} {unassigned().length === 1 ? "face needs" : "faces need"} a name.
          Choose one and link a person.
        </p>
        <ul class="mt-2 flex flex-wrap gap-2">
          <For each={unassigned()}>
            {face => (
              <li>
                <button
                  type="button"
                  class="group relative overflow-hidden rounded-xl border border-border transition hover:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={props.pending}
                  data-testid={`file-face-${face.id}`}
                  onClick={() => props.onSelectFace(face.id)}
                >
                  <FaceCrop
                    thumbUrl={props.file.thumbUrl}
                    imageWidth={props.file.width}
                    imageHeight={props.file.height}
                    box={face.box}
                    size={64}
                    testId={`file-face-crop-${face.id}`}
                  />
                  <span class="absolute left-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[0.6rem] font-bold text-black">
                    {numberOf(face.id)}
                  </span>
                  <span class="absolute inset-x-0 bottom-0 bg-black/65 py-0.5 text-center text-[0.6rem] font-semibold uppercase tracking-wide text-white">
                    Link
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show when={!unassigned().length}>
        <p
          class="mt-2 text-xs leading-relaxed text-muted-foreground"
          data-testid="file-faces-empty"
        >
          <Show
            when={assignedCount()}
            fallback={
              <Show
                when={props.file.facesScannedAt}
                fallback="This photo has not been checked for faces yet."
              >
                <Show
                  when={ignored().length}
                  fallback="No faces found in this photo. Add one if someone is missing."
                >
                  Every face in this photo is ignored.
                </Show>
              </Show>
            }
          >
            Every face in this photo is linked to a person.
          </Show>
        </p>
        <Show when={assignedCount() > 0}>
          <p class="mt-1 text-[0.68rem] text-muted-foreground">
            {assignedCount()} {assignedCount() === 1 ? "face" : "faces"} linked. Click a box
            on the photo to change it.
          </p>
        </Show>
      </Show>

      <Show when={ignored().length}>
        <details class="mt-3">
          <summary
            class="cursor-pointer text-[0.7rem] text-muted-foreground"
            data-testid="file-faces-ignored-toggle"
          >
            Ignored ({ignored().length})
          </summary>
          <ul class="mt-2 flex flex-wrap gap-2">
            <For each={ignored()}>
              {face => (
                <li
                  class="flex items-center gap-1 rounded-xl border border-border p-1"
                  data-testid={`file-face-ignored-${face.id}`}
                >
                  <FaceCrop
                    thumbUrl={props.file.thumbUrl}
                    imageWidth={props.file.width}
                    imageHeight={props.file.height}
                    box={face.box}
                    size={32}
                    testId={`file-face-crop-${face.id}`}
                  />
                  <button
                    type="button"
                    class="rounded-md p-1 text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                    aria-label="Restore this face"
                    disabled={props.pending}
                    data-testid={`file-face-restore-${face.id}`}
                    onClick={() => props.onUnignore(face.id)}
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button
                    type="button"
                    class="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove this face box"
                    disabled={props.pending}
                    data-testid={`file-face-delete-${face.id}`}
                    onClick={() => props.onDeleteFace(face.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              )}
            </For>
          </ul>
        </details>
      </Show>
    </section>
  );
}
