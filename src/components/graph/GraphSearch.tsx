import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { FileText, Image as ImageIcon, Search } from "lucide-solid";
import type { GraphFile, GraphPerson, TreeGraph } from "~/api/people-server";
import { formatFuzzyYearRange } from "~/lib/fuzzy-date";
import { Avatar } from "../ui/Avatar";
import { Kbd, KbdGroup } from "../ui/kbd";
import { Modal } from "../ui/Modal";

export function GraphSearch(props: {
  open: boolean;
  onClose: () => void;
  data: TreeGraph;
  /** True when the person sits outside the focused part of the tree. */
  isOutsideFocus?: (personId: string) => boolean;
  onPerson: (person: GraphPerson) => void;
  onFile: (file: GraphFile) => void;
}) {
  const [query, setQuery] = createSignal("");
  createEffect(() => {
    if (props.open) setQuery("");
  });

  const needle = createMemo(() => query().trim().toLowerCase());
  const people = createMemo(() => {
    const term = needle();
    return props.data.people
      .filter(person => {
        if (!term) return true;
        return [person.displayName, person.nickname, person.maidenName]
          .filter(Boolean)
          .some(value => value!.toLowerCase().includes(term));
      })
      .slice(0, 40);
  });
  const files = createMemo(() => {
    const term = needle();
    if (!term) return [];
    return props.data.files
      .filter(file => file.name.toLowerCase().includes(term))
      .slice(0, 20);
  });
  const personById = createMemo(() => new Map(props.data.people.map(person => [person.id, person])));

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Search the tree"
      description="Find a person or a file. Selecting a result opens its panel and brings it into view."
      footer={
        <div class="flex w-full items-center justify-between text-xs text-muted-foreground">
          <span>
            {people().length} {people().length === 1 ? "person" : "people"}
            <Show when={files().length}> · {files().length} files</Show>
          </span>
          <span class="flex items-center gap-1.5">
            Close
            <Kbd>Esc</Kbd>
          </span>
        </div>
      }
    >
      <label class="relative block">
        <Search size={16} class="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          class="input pl-10"
          value={query()}
          onInput={event => setQuery(event.currentTarget.value)}
          placeholder="Name, nickname, maiden name, file…"
          autofocus
        />
      </label>

      <div class="scroll-thin mt-3 max-h-[52dvh] space-y-4 overflow-y-auto pr-1">
        <Show when={people().length}>
          <section>
            <h3 class="field-label mb-1.5">People</h3>
            <div class="space-y-0.5">
              <For each={people()}>
                {person => (
                  <button
                    type="button"
                    class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-accent/70 focus-visible:bg-accent/70 focus-visible:outline-none"
                    onClick={() => {
                      props.onPerson(person);
                      props.onClose();
                    }}
                  >
                    <Avatar name={person.displayName} fileId={person.avatarFileId} size={32} />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium">{person.displayName}</span>
                      <span class="block truncate text-xs text-muted-foreground">
                        <Show
                          when={props.isOutsideFocus?.(person.id)}
                          fallback={
                            formatFuzzyYearRange(person.birthDate, person.deathDate) ||
                            person.bio?.slice(0, 60) ||
                            "No dates yet"
                          }
                        >
                          Outside your focus · opens in context
                        </Show>
                      </span>
                    </span>
                  </button>
                )}
              </For>
            </div>
          </section>
        </Show>

        <Show when={files().length}>
          <section>
            <h3 class="field-label mb-1.5">Files</h3>
            <div class="space-y-0.5">
              <For each={files()}>
                {file => (
                  <button
                    type="button"
                    class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-accent/70 focus-visible:bg-accent/70 focus-visible:outline-none"
                    onClick={() => {
                      props.onFile(file);
                      props.onClose();
                    }}
                  >
                    <span class="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted text-muted-foreground">
                      <Show
                        when={file.thumbUrl}
                        fallback={
                          <Show when={file.kind === "image"} fallback={<FileText size={16} />}>
                            <ImageIcon size={16} />
                          </Show>
                        }
                      >
                        <img src={file.thumbUrl!} alt="" class="size-full object-cover" />
                      </Show>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium">{file.name}</span>
                      <span class="block truncate text-xs text-muted-foreground">
                        {personById().get(file.personId)?.displayName ?? "Unknown person"}
                        <Show when={props.isOutsideFocus?.(file.personId)}>
                          {" "}
                          · outside your focus
                        </Show>
                      </span>
                    </span>
                  </button>
                )}
              </For>
            </div>
          </section>
        </Show>

        <Show when={!people().length && !files().length}>
          <p class="py-10 text-center text-sm text-muted-foreground">
            Nothing matches “{query()}”.
          </p>
        </Show>
      </div>

      <div class="mt-4 flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <KbdGroup>
          <Kbd>/</Kbd>
          <span>to search anywhere</span>
        </KbdGroup>
      </div>
    </Modal>
  );
}
