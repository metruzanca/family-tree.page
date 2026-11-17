import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { Check, Link2Off, Search, UserRoundX } from "lucide-solid";
import type { GraphFace, GraphFile, GraphPerson } from "~/api/people-server";
import { formatYears } from "~/lib/format";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/button";
import { Modal } from "../ui/Modal";
import { FaceCrop } from "./FaceCrop";
import type { FaceBox } from "~/lib/face-box";

type AssignFaceDialogProps = {
  open: boolean;
  onClose: () => void;
  file: GraphFile;
  face: GraphFace | null;
  /** A box just drawn by hand, before it exists on the server. */
  draftBox: FaceBox | null;
  people: GraphPerson[];
  pending?: boolean;
  onAssign: (personId: string) => void;
  onUnlink: () => void;
  onIgnore: () => void;
};

export function AssignFaceDialog(props: AssignFaceDialogProps) {
  const [query, setQuery] = createSignal("");

  createEffect(() => {
    if (props.open) setQuery("");
  });

  const box = () => props.draftBox ?? props.face?.box ?? null;
  const assignedPerson = createMemo(() =>
    props.face?.personId
      ? props.people.find(person => person.id === props.face?.personId)
      : undefined,
  );

  const candidates = createMemo(() => {
    const term = query().trim().toLowerCase();
    return props.people
      .filter(person => {
        if (!term) return true;
        const haystack = [
          person.displayName,
          person.nickname ?? "",
          person.maidenName ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  });

  /** Group photos usually include people the editor already linked elsewhere. */
  const isGroupPhoto = () =>
    props.file.faces.filter(face => face.status !== "ignored").length > 1;
  const taggedInPhoto = createMemo(() => new Set(props.file.taggedPersonIds));
  const priorityPeople = createMemo(() =>
    isGroupPhoto() ? candidates().filter(person => taggedInPhoto().has(person.id)) : [],
  );
  const otherPeople = createMemo(() =>
    candidates().filter(
      person => !priorityPeople().some(tagged => tagged.id === person.id),
    ),
  );

  function personRow(person: GraphPerson) {
    const isCurrent = () => props.face?.personId === person.id;
    return (
      <li>
        <button
          type="button"
          class={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition ${
            isCurrent() ? "bg-primary/10" : "hover:bg-primary/5"
          }`}
          disabled={props.pending || isCurrent()}
          aria-pressed={isCurrent()}
          data-testid={`assign-face-person-${person.id}`}
          onClick={() => props.onAssign(person.id)}
        >
          <Avatar name={person.displayName} fileId={person.avatarFileId} size={32} />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{person.displayName}</span>
            <Show when={formatYears(person.birthDate, person.deathDate)}>
              <span class="block text-[0.68rem] text-muted-foreground">
                {formatYears(person.birthDate, person.deathDate)}
              </span>
            </Show>
          </span>
          <Show when={isCurrent()}>
            <span class="grid h-6 w-6 place-items-center rounded-full border border-primary bg-primary text-primary-foreground">
              <Check size={14} />
            </span>
          </Show>
        </button>
      </li>
    );
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Who is this?"
      description="Link a person to this face."
      testId="assign-face-dialog"
      footer={
        <div class="flex w-full items-center justify-between gap-3">
          <Show when={props.face}>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={props.pending}
              data-testid="assign-face-ignore"
              onClick={props.onIgnore}
            >
              <UserRoundX size={14} />
              Not a face
            </Button>
          </Show>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            class="ml-auto"
            onClick={props.onClose}
            data-testid="assign-face-cancel"
          >
            Cancel
          </Button>
        </div>
      }
    >
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <Show when={box()}>
            {faceBox => (
              <FaceCrop
                thumbUrl={props.file.thumbUrl}
                imageWidth={props.file.width}
                imageHeight={props.file.height}
                box={faceBox()}
                size={72}
                class="rounded-2xl border border-border"
                testId="assign-face-crop"
              />
            )}
          </Show>
          <div class="min-w-0 flex-1">
            <Show
              when={assignedPerson()}
              fallback={
                <p class="text-sm text-muted-foreground">
                  This face is not linked to anyone yet.
                </p>
              }
            >
              {person => (
                <>
                  <p class="truncate text-sm font-semibold" data-testid="assign-face-current">
                    {person().displayName}
                  </p>
                  <Show when={formatYears(person().birthDate, person().deathDate)}>
                    <p class="text-[0.7rem] text-muted-foreground">
                      {formatYears(person().birthDate, person().deathDate)}
                    </p>
                  </Show>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    class="mt-1 h-7 gap-1 px-1.5 text-[0.7rem] text-muted-foreground hover:text-destructive"
                    disabled={props.pending}
                    data-testid="assign-face-unlink"
                    onClick={props.onUnlink}
                  >
                    <Link2Off size={13} />
                    Remove link
                  </Button>
                </>
              )}
            </Show>
          </div>
        </div>

        <div class="relative">
          <Search
            size={15}
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            class="input pl-9"
            type="search"
            placeholder="Search people"
            value={query()}
            autofocus
            onInput={event => setQuery(event.currentTarget.value)}
            aria-label="Search people"
            data-testid="assign-face-search"
          />
        </div>

        <Show
          when={candidates().length}
          fallback={
            <p
              class="rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs leading-relaxed text-muted-foreground"
              data-testid="assign-face-empty"
            >
              No people match “{query()}”.
            </p>
          }
        >
          <Show
            when={priorityPeople().length}
            fallback={
              <ul class="space-y-1" data-testid="assign-face-list">
                <For each={candidates()}>{person => personRow(person)}</For>
              </ul>
            }
          >
            <div class="space-y-3">
              <div data-testid="assign-face-tagged">
                <p
                  class="mb-1 px-2 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground"
                  data-testid="assign-face-tagged-heading"
                >
                  Already in this photo
                </p>
                <ul class="space-y-1">
                  <For each={priorityPeople()}>{person => personRow(person)}</For>
                </ul>
              </div>
              <Show when={otherPeople().length}>
                <div data-testid="assign-face-others">
                  <p class="mb-1 px-2 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    Everyone else
                  </p>
                  <ul class="space-y-1">
                    <For each={otherPeople()}>{person => personRow(person)}</For>
                  </ul>
                </div>
              </Show>
            </div>
          </Show>
        </Show>
      </div>
    </Modal>
  );
}
