import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { FileText, Image as ImageIcon, Search } from "lucide-solid";
import type { GraphFile, GraphPerson, TreeGraph } from "~/api/people-server";
import { formatFuzzyYearRange } from "~/lib/fuzzy-date";
import { useI18n } from "~/i18n/LocaleProvider";
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
  const { t, locale } = useI18n();
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
      title={t("graph.search.title")}
      description={t("graph.search.description")}
      testId="graph-search-dialog"
      footer={
        <div class="flex w-full items-center justify-between text-xs text-muted-foreground">
          <span>
            {t("common.person", { count: people().length })}
            <Show when={files().length}>
              {" · "}
              {t("graph.search.fileCount", { count: files().length })}
            </Show>
          </span>
          <span class="flex items-center gap-1.5">
            {t("common.close")}
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
          placeholder={t("graph.search.placeholder")}
          data-testid="graph-search-input"
          autofocus
        />
      </label>

      <div class="scroll-thin mt-3 max-h-[52dvh] space-y-4 overflow-y-auto pr-1">
        <Show when={people().length}>
          <section>
            <h3 class="field-label mb-1.5">{t("graph.search.people")}</h3>
            <div class="space-y-0.5">
              <For each={people()}>
                {person => (
                  <button
                    type="button"
                    class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-accent/70 focus-visible:bg-accent/70 focus-visible:outline-none"
                    data-testid={`graph-search-person-${person.id}`}
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
                            formatFuzzyYearRange(
                              person.birthDate,
                              person.deathDate,
                              locale(),
                            ) ||
                            person.bio?.slice(0, 60) ||
                            t("people.focus.noDates")
                          }
                        >
                          {t("graph.search.outsideContext")}
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
            <h3 class="field-label mb-1.5">{t("graph.search.files")}</h3>
            <div class="space-y-0.5">
              <For each={files()}>
                {file => (
                  <button
                    type="button"
                    class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-accent/70 focus-visible:bg-accent/70 focus-visible:outline-none"
                    data-testid={`graph-search-file-${file.id}`}
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
                        {(file.personId
                          ? personById().get(file.personId)?.displayName
                          : null) ?? t("graph.search.inInbox")}
                        <Show
                          when={file.personId && props.isOutsideFocus?.(file.personId)}
                        >
                          {" · "}
                          {t("graph.search.outsideShort")}
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
          <p
            class="py-10 text-center text-sm text-muted-foreground"
            data-testid="graph-search-empty"
          >
            {t("people.focus.empty", { query: query() })}
          </p>
        </Show>
      </div>

      <div class="mt-4 flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <KbdGroup>
          <Kbd>/</Kbd>
          <span>{t("graph.search.shortcutHint")}</span>
        </KbdGroup>
      </div>
    </Modal>
  );
}
