import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { FileText, Image as ImageIcon, Search } from "lucide-solid";
import type { GraphFile, GraphPerson, TreeGraph } from "~/api/people-server";
import { Avatar } from "../ui/Avatar";
import { Modal } from "../ui/Modal";

export function GraphSearch(props: {
  open: boolean;
  onClose: () => void;
  data: TreeGraph;
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
    >
      <label class="relative block">
        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          class="input pl-9"
          value={query()}
          onInput={event => setQuery(event.currentTarget.value)}
          placeholder="Name, nickname, maiden name, file…"
          autofocus
        />
      </label>

      <div class="scroll-thin mt-3 max-h-[52dvh] space-y-4 overflow-y-auto">
        <Show when={people().length}>
          <section>
            <h3 class="label mb-1.5">People</h3>
            <div class="space-y-0.5">
              <For each={people()}>
                {person => (
                  <button
                    type="button"
                    class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-moss/5"
                    onClick={() => {
                      props.onPerson(person);
                      props.onClose();
                    }}
                  >
                    <Avatar name={person.displayName} fileId={person.avatarFileId} size={32} />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium">{person.displayName}</span>
                      <span class="block truncate text-[0.7rem] text-muted">
                        {[person.birthDate?.slice(0, 4), person.deathDate?.slice(0, 4)]
                          .filter(Boolean)
                          .join(" - ") || person.bio?.slice(0, 60) || "No dates yet"}
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
            <h3 class="label mb-1.5">Files</h3>
            <div class="space-y-0.5">
              <For each={files()}>
                {file => (
                  <button
                    type="button"
                    class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-moss/5"
                    onClick={() => {
                      props.onFile(file);
                      props.onClose();
                    }}
                  >
                    <span class="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-paper text-muted">
                      <Show
                        when={file.thumbUrl}
                        fallback={
                          <Show when={file.kind === "image"} fallback={<FileText size={16} />}>
                            <ImageIcon size={16} />
                          </Show>
                        }
                      >
                        <img src={file.thumbUrl!} alt="" class="h-full w-full object-cover" />
                      </Show>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium">{file.name}</span>
                      <span class="block truncate text-[0.7rem] text-muted">
                        {personById().get(file.personId)?.displayName ?? "Unknown person"}
                      </span>
                    </span>
                  </button>
                )}
              </For>
            </div>
          </section>
        </Show>

        <Show when={!people().length && !files().length}>
          <p class="py-10 text-center text-sm text-muted">Nothing matches “{query()}”.</p>
        </Show>
      </div>
    </Modal>
  );
}
