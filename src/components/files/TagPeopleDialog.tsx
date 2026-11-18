import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { Check, Search, Tag, X } from "lucide-solid";
import type { GraphPerson } from "~/api/people-server";
import { formatYears } from "~/lib/format";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/button";
import { Modal } from "../ui/Modal";

type TagPeopleDialogProps = {
  open: boolean;
  onClose: () => void;
  people: GraphPerson[];
  /** The person the photo is filed under. They are already linked, so they cannot be tagged again. */
  primaryPerson?: GraphPerson;
  selectedIds: string[];
  pending?: boolean;
  onSave: (personIds: string[]) => void;
};

export function TagPeopleDialog(props: TagPeopleDialogProps) {
  const [query, setQuery] = createSignal("");
  const [selected, setSelected] = createSignal<string[]>([]);

  createEffect(() => {
    if (!props.open) return;
    setSelected(
      props.selectedIds.filter(id => id !== props.primaryPerson?.id),
    );
    setQuery("");
  });

  const candidates = createMemo(() => {
    const term = query().trim().toLowerCase();
    return props.people
      .filter(person => person.id !== props.primaryPerson?.id)
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

  function toggle(personId: string) {
    setSelected(current =>
      current.includes(personId)
        ? current.filter(id => id !== personId)
        : [...current, personId],
    );
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="People in this photo"
      testId="tag-people-dialog"
      description={
        props.primaryPerson
          ? `Filed under ${props.primaryPerson.displayName}. Tag everyone else who appears here.`
          : "Tag everyone who appears in this photo. The first person you pick files it under them."
      }
      footer={
        <div class="flex w-full items-center justify-between gap-3">
          <span class="text-xs text-muted-foreground">
            {selected().length} tagged
          </span>
          <div class="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={props.onClose}
              data-testid="tag-people-cancel"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              type="button"
              disabled={props.pending}
              data-testid="tag-people-save"
              onClick={() => props.onSave(selected())}
            >
              <Tag size={14} />
              {props.pending ? "Saving…" : "Save tags"}
            </Button>
          </div>
        </div>
      }
    >
      <div class="flex flex-col gap-3">
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
            data-testid="tag-people-search"
          />
        </div>

        <Show
          when={candidates().length}
          fallback={
            <p
              class="rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs leading-relaxed text-muted-foreground"
              data-testid="tag-people-empty"
            >
              <Show
                when={props.people.length > 1}
                fallback="There is nobody else in this tree to tag yet."
              >
                No people match “{query()}”.
              </Show>
            </p>
          }
        >
          <ul class="space-y-1">
            <For each={candidates()}>
              {person => {
                const isSelected = () => selected().includes(person.id);
                return (
                  <li>
                    <button
                      type="button"
                      class={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition ${
                        isSelected() ? "bg-primary/10" : "hover:bg-primary/5"
                      }`}
                      aria-pressed={isSelected()}
                      data-testid={`tag-people-person-${person.id}`}
                      onClick={() => toggle(person.id)}
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
                        <Show when={formatYears(person.birthDate, person.deathDate)}>
                          <span class="block text-[0.68rem] text-muted-foreground">
                            {formatYears(person.birthDate, person.deathDate)}
                          </span>
                        </Show>
                      </span>
                      <span
                        class={`grid h-6 w-6 place-items-center rounded-full border ${
                          isSelected()
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-transparent"
                        }`}
                      >
                        <Check size={14} />
                      </span>
                    </button>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>

        <Show when={selected().length}>
          <div class="flex flex-wrap gap-1.5 border-t border-border pt-3">
            <For each={selected()}>
              {personId => {
                const person = () => props.people.find(candidate => candidate.id === personId);
                return (
                  <span class="inline-flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-1.5 pr-1 text-xs">
                    {person()?.displayName ?? "Unknown"}
                    <button
                      type="button"
                      class="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                      aria-label={`Untag ${person()?.displayName ?? "person"}`}
                      data-testid={`tag-people-untag-${personId}`}
                      onClick={() => toggle(personId)}
                    >
                      <X size={11} />
                    </button>
                  </span>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </Modal>
  );
}
