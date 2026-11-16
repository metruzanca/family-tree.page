import { Show, createSignal } from "solid-js";
import { CalendarDays, X } from "lucide-solid";
import { formatFuzzyDate, type FuzzyDate } from "~/lib/fuzzy-date";
import { Button } from "../ui/button";
import { FuzzyDateField } from "../ui/FuzzyDateField";
import { Modal } from "../ui/Modal";

type TakenAtFieldProps = {
  value: FuzzyDate | null;
  editable: boolean;
  pending?: boolean;
  pendingLabel?: string;
  onChange: (value: FuzzyDate | null) => void;
};

export function TakenAtField(props: TakenAtFieldProps) {
  const [open, setOpen] = createSignal(false);
  const [draft, setDraft] = createSignal<FuzzyDate | null>(null);

  function startEditing() {
    setDraft(props.value);
    setOpen(true);
  }

  function save() {
    props.onChange(draft());
    setOpen(false);
  }

  function clear() {
    setDraft(null);
    props.onChange(null);
    setOpen(false);
  }

  return (
    <Show
      when={props.editable}
      fallback={
        <span class={props.value ? "" : "text-muted-foreground"}>
          {props.value ? formatFuzzyDate(props.value) : "Not set"}
        </span>
      }
    >
      <span class="flex items-center gap-1">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs text-left transition hover:bg-primary/5"
          disabled={props.pending}
          onClick={startEditing}
        >
          <CalendarDays size={12} class="text-muted-foreground" />
          <span class={props.value ? "" : "text-muted-foreground"}>
            {props.value ? formatFuzzyDate(props.value) : "Set date"}
          </span>
        </button>
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

      <Modal
        open={open()}
        onClose={() => setOpen(false)}
        title="Date taken"
        description="Use a full date, a year or month, or an approximate range."
        footer={
          <>
            <Show when={draft()}>
              <Button variant="ghost" type="button" onClick={clear}>
                Clear
              </Button>
            </Show>
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save}>
              Save date
            </Button>
          </>
        }
      >
        <FuzzyDateField value={draft()} onChange={setDraft} />
      </Modal>
    </Show>
  );
}
