import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { Check, Search } from "lucide-solid";
import type { GraphPerson } from "~/api/people-server";
import { Avatar } from "../ui/Avatar";
import { Modal } from "../ui/Modal";
import { formatFuzzyYearRange } from "~/lib/fuzzy-date";

export function FocusPersonDialog(props: {
  open: boolean;
  onClose: () => void;
  people: GraphPerson[];
  viewerPersonId: string | null;
  pending: boolean;
  onSave: (personId: string | null) => void;
}) {
  const [query, setQuery] = createSignal("");

  createEffect(() => {
    if (props.open) setQuery("");
  });

  const matches = createMemo(() => {
    const term = query().trim().toLowerCase();
    const sorted = [...props.people].sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
    const filtered = term
      ? sorted.filter(person =>
          [person.displayName, person.nickname, person.maidenName]
            .filter(Boolean)
            .some(value => value!.toLowerCase().includes(term)),
        )
      : sorted;
    return filtered.slice(0, 80);
  });

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Who are you in this tree?"
      description="The tree opens around this person. Everyone can still see the whole family when they want to."
      testId="focus-person-dialog"
      footer={
        <div class="flex w-full items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>This only changes what you see first.</span>
          <Show when={props.viewerPersonId}>
            <button
              type="button"
              class="font-semibold text-primary underline decoration-primary/30 underline-offset-4 disabled:opacity-50"
              disabled={props.pending}
              data-testid="focus-person-clear"
              onClick={() => props.onSave(null)}
            >
              Clear my link
            </button>
          </Show>
        </div>
      }
    >
      <label class="relative block">
        <Search
          size={16}
          class="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          class="input pl-10"
          value={query()}
          onInput={event => setQuery(event.currentTarget.value)}
          placeholder="Search by name, nickname or maiden name"
          data-testid="focus-person-search"
          autofocus
        />
      </label>

      <div class="scroll-thin mt-3 max-h-[52dvh] space-y-0.5 overflow-y-auto pr-1">
        <For each={matches()}>
          {person => {
            const isCurrent = () => person.id === props.viewerPersonId;
            return (
              <button
                type="button"
                class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-accent/70 focus-visible:bg-accent/70 focus-visible:outline-none"
                disabled={props.pending}
                data-testid={`focus-person-result-${person.id}`}
                onClick={() => props.onSave(person.id)}
              >
                <Avatar
                  name={person.displayName}
                  fileId={person.avatarFileId}
                  size={32}
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">
                    {person.displayName}
                  </span>
                  <span class="block truncate text-xs text-muted-foreground">
                    {formatFuzzyYearRange(person.birthDate, person.deathDate) ||
                      person.bio?.slice(0, 60) ||
                      "No dates yet"}
                  </span>
                </span>
                <Show when={isCurrent()}>
                  <Check size={15} class="text-primary" />
                </Show>
              </button>
            );
          }}
        </For>
        <Show when={!matches().length}>
          <p class="py-8 text-center text-sm text-muted-foreground" data-testid="focus-person-empty">
            Nothing matches “{query()}”.
          </p>
        </Show>
      </div>
    </Modal>
  );
}
