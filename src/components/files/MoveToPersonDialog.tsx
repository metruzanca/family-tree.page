import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { Inbox, Search } from "lucide-solid";
import type { GraphPerson } from "~/api/people-server";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/button";
import { Modal } from "../ui/Modal";

type MoveToPersonDialogProps = {
  open: boolean;
  onClose: () => void;
  people: GraphPerson[];
  /** How many photos are being moved, for the heading. */
  count: number;
  pending?: boolean;
  onSelect: (personId: string | null) => void;
};

export function MoveToPersonDialog(props: MoveToPersonDialogProps) {
  const [query, setQuery] = createSignal("");

  createEffect(() => {
    if (props.open) setQuery("");
  });

  const candidates = createMemo(() => {
    const term = query().trim().toLowerCase();
    return props.people
      .filter(person => {
        if (!term) return true;
        return `${person.displayName} ${person.nickname ?? ""} ${person.maidenName ?? ""}`
          .toLowerCase()
          .includes(term);
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  });

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="File photos"
      description={`Move ${props.count} ${props.count === 1 ? "photo" : "photos"} to a person's folder.`}
      testId="move-to-person-dialog"
    >
      <div class="flex min-h-0 flex-col">
        <label class="relative mx-5 mt-4 block">
          <Search
            size={15}
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            class="input pl-9"
            type="search"
            placeholder="Search people"
            value={query()}
            onInput={event => setQuery(event.currentTarget.value)}
            data-testid="move-to-person-search"
          />
        </label>

        <button
          type="button"
          class="mx-5 mt-3 flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
          disabled={props.pending}
          onClick={() => props.onSelect(null)}
          data-testid="move-to-person-inbox"
        >
          <span class="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            <Inbox size={17} />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold">Tree inbox</span>
            <span class="block text-[0.7rem] text-muted-foreground">
              Keep it unfiled for now
            </span>
          </span>
        </button>

        <div class="scroll-thin mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-1">
          <Show
            when={candidates().length}
            fallback={
              <p class="px-2 py-6 text-center text-sm text-muted-foreground">
                No people match that search.
              </p>
            }
          >
            <For each={candidates()}>
              {person => (
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-primary/5 disabled:opacity-50"
                  disabled={props.pending}
                  onClick={() => props.onSelect(person.id)}
                  data-testid={`move-to-person-${person.id}`}
                >
                  <Avatar
                    name={person.displayName}
                    fileId={person.avatarFileId}
                    size={36}
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-semibold">
                      {person.displayName}
                    </span>
                    <Show when={person.nickname || person.maidenName}>
                      <span class="block truncate text-[0.7rem] text-muted-foreground">
                        {person.nickname ?? `Born ${person.maidenName}`}
                      </span>
                    </Show>
                  </span>
                </button>
              )}
            </For>
          </Show>
        </div>

        <div class="flex justify-end border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={props.onClose} data-testid="move-to-person-cancel">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
