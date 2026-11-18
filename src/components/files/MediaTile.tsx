import { Show } from "solid-js";
import { Check, Image as ImageIcon, Inbox } from "lucide-solid";
import type { GraphFile } from "~/api/people-server";
import { Badge } from "../ui/badge";

type MediaTileProps = {
  file: GraphFile;
  selected: boolean;
  selecting: boolean;
  onClick: () => void;
  onToggle: () => void;
  draggable?: boolean;
  dragging?: boolean;
  onDragStart?: (event: DragEvent) => void;
  onDragEnd?: () => void;
};

export function MediaTile(props: MediaTileProps) {
  return (
    <div
      class={`group relative aspect-square overflow-hidden rounded-xl border bg-muted transition ${
        props.selected ? "border-primary ring-2 ring-primary/40" : "border-border"
      } ${props.dragging ? "opacity-40" : ""}`}
      draggable={props.draggable}
      onDragStart={event => {
        if (!props.draggable) {
          event.preventDefault();
          return;
        }
        props.onDragStart?.(event);
      }}
      onDragEnd={() => props.onDragEnd?.()}
    >
      <button
        type="button"
        class="absolute inset-0 block h-full w-full text-left"
        onClick={props.onClick}
        aria-label={props.file.name}
        data-testid={`media-tile-${props.file.id}`}
      >
        <Show
          when={props.file.thumbUrl}
          fallback={
            <span class="grid h-full w-full place-items-center text-muted-foreground">
              <ImageIcon size={22} />
            </span>
          }
        >
          <img
            src={props.file.thumbUrl!}
            alt={props.file.name}
            loading="lazy"
            decoding="async"
            class="pointer-events-none h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        </Show>
        <span class="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 text-[0.68rem] font-medium text-white opacity-0 transition group-hover:opacity-100">
          {props.file.name}
        </span>
      </button>

      <Show when={props.file.personId === null}>
        <Badge
          variant="secondary"
          class="pointer-events-none absolute left-1.5 top-1.5 gap-1 bg-black/55 text-[0.6rem] text-white backdrop-blur"
        >
          <Inbox size={10} />
          Inbox
        </Badge>
      </Show>

      <Show when={props.selecting}>
        <button
          type="button"
          class={`absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full border text-white shadow ${
            props.selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-white/70 bg-black/40"
          }`}
          aria-label={props.selected ? "Deselect photo" : "Select photo"}
          aria-pressed={props.selected}
          onClick={props.onToggle}
          data-testid={`media-tile-select-${props.file.id}`}
        >
          <Show when={props.selected}>
            <Check size={14} />
          </Show>
        </button>
      </Show>

      <Show when={props.file.isAvatar}>
        <span class="pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[0.58rem] font-semibold uppercase tracking-wide text-white backdrop-blur">
          Portrait
        </span>
      </Show>
    </div>
  );
}
