import { For, Show } from "solid-js";
import { Tag, X } from "lucide-solid";
import type { GraphPerson } from "~/api/people-server";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/button";

type FileTagListProps = {
  people: GraphPerson[];
  taggedPersonIds: string[];
  editable: boolean;
  pending?: boolean;
  onEdit: () => void;
  onRemove: (personId: string) => void;
};

export function FileTagList(props: FileTagListProps) {
  const tagged = () =>
    props.taggedPersonIds
      .map(personId => props.people.find(person => person.id === personId))
      .filter((person): person is GraphPerson => Boolean(person));

  return (
    <section>
      <div class="flex items-center justify-between gap-2">
        <h3 class="field-label">People in this photo</h3>
        <Show when={props.editable}>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            class="h-6 px-1.5 text-[0.7rem] text-muted-foreground hover:text-foreground"
            disabled={props.pending}
            onClick={props.onEdit}
          >
            <Tag size={12} />
            {tagged().length ? "Edit" : "Tag people"}
          </Button>
        </Show>
      </div>
      <Show
        when={tagged().length}
        fallback={
          <p class="mt-1.5 text-xs text-muted-foreground">
            {props.editable
              ? "Nobody else is tagged in this photo yet."
              : "Nobody else is tagged in this photo."}
          </p>
        }
      >
        <ul class="mt-2 flex flex-wrap gap-1.5">
          <For each={tagged()}>
            {person => (
              <li class="inline-flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-0.5 pr-1.5">
                <Avatar name={person.displayName} fileId={person.avatarFileId} size={22} />
                <span class="max-w-32 truncate text-xs font-medium">{person.displayName}</span>
                <Show when={props.editable}>
                  <button
                    type="button"
                    class="rounded-full p-0.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove ${person.displayName} from this photo`}
                    title={`Remove ${person.displayName}`}
                    disabled={props.pending}
                    onClick={() => props.onRemove(person.id)}
                  >
                    <X size={11} />
                  </button>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}
