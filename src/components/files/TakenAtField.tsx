import { Show } from "solid-js";
import { X } from "lucide-solid";
import { formatCalendarDate } from "~/lib/format";

type TakenAtFieldProps = {
  value: string | null;
  editable: boolean;
  pending?: boolean;
  pendingLabel?: string;
  onChange: (value: string | null) => void;
};

export function TakenAtField(props: TakenAtFieldProps) {
  return (
    <Show
      when={props.editable}
      fallback={
        <span class={props.value ? "" : "text-muted-foreground"}>
          {props.value ? formatCalendarDate(props.value) : "Not set"}
        </span>
      }
    >
      <span class="flex items-center gap-1">
        <input
          type="date"
          class="input !w-auto !py-1 text-xs"
          value={props.value ?? ""}
          disabled={props.pending}
          aria-label="Date taken"
          onChange={event => props.onChange(event.currentTarget.value || null)}
        />
        <Show when={props.value}>
          <button
            type="button"
            class="rounded-full p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            aria-label="Clear date taken"
            title="Clear date taken"
            disabled={props.pending}
            onClick={() => props.onChange(null)}
          >
            <X size={12} />
          </button>
        </Show>
        <Show when={props.pending}>
          <span class="text-[0.65rem] text-muted-foreground">
            {props.pendingLabel ?? "Saving…"}
          </span>
        </Show>
      </span>
    </Show>
  );
}
