import { For, createEffect, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { revalidate } from "@solidjs/router";
import type { GraphPerson, GraphPersonEvent } from "~/api/people-server";
import { createPersonEvent, updatePersonEvent } from "~/api/people-server";
import { getTreeGraph } from "~/api";
import {
  PERSON_EVENT_OPTIONS,
  type PersonEventKind,
} from "~/lib/person-events";
import { attemptAction } from "~/lib/action-result";
import type { FuzzyDate } from "~/lib/fuzzy-date";
import { Button } from "../ui/button";
import { Field } from "../ui/Field";
import { FuzzyDateField } from "../ui/FuzzyDateField";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

type PersonEventDialogProps = {
  open: boolean;
  onClose: () => void;
  treeId: string;
  person: GraphPerson;
  event?: GraphPersonEvent | null;
};

export function PersonEventDialog(props: PersonEventDialogProps) {
  const toast = useToast();
  const [form, setForm] = createStore({
    kind: "residence" as PersonEventKind,
    title: "",
    place: "",
    date: null as FuzzyDate | null,
    description: "",
  });
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");

  createEffect(() => {
    if (!props.open) return;
    const event = props.event;
    setForm({
      kind: event?.kind ?? "residence",
      title: event?.title ?? "",
      place: event?.place ?? "",
      date: event?.date ?? null,
      description: event?.description ?? "",
    });
    setError("");
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (pending()) return;
    setPending(true);
    setError("");

    const payload = {
      kind: form.kind,
      title: form.title,
      place: form.place,
      date: form.date,
      description: form.description,
    };

    const result = await attemptAction(() =>
      props.event
        ? updatePersonEvent({
            treeId: props.treeId,
            eventId: props.event.id,
            ...payload,
          })
        : createPersonEvent({
            treeId: props.treeId,
            personId: props.person.id,
            ...payload,
          }),
    );

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    await revalidate(getTreeGraph.key);
    toast.show(props.event ? "Event updated." : "Event added.", "success");
    props.onClose();
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.event ? "Edit life event" : `Add a life event for ${props.person.firstName}`}
      description="Residences, work, military service, migration, burial, and anything else worth keeping."
      testId="person-event-form-dialog"
      footer={
        <>
          <Button
            variant="ghost"
            type="button"
            onClick={props.onClose}
            data-testid="person-event-form-cancel"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="person-event-form"
            disabled={pending()}
            data-testid="person-event-form-submit"
          >
            {pending() ? "Saving…" : props.event ? "Save changes" : "Add event"}
          </Button>
        </>
      }
    >
      <form id="person-event-form" class="space-y-4" onSubmit={submit} data-testid="person-event-form">
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label="Type" for="event-kind">
            <select
              id="event-kind"
              class="input"
              value={form.kind}
              data-testid="person-event-form-kind"
              onChange={event =>
                setForm("kind", event.currentTarget.value as PersonEventKind)
              }
            >
              <For each={PERSON_EVENT_OPTIONS}>
                {option => <option value={option.value}>{option.label}</option>}
              </For>
            </select>
          </Field>
          <Field
            label="Title"
            for="event-title"
            hint={form.kind === "other" ? "Required for an other event." : "Optional."}
          >
            <input
              id="event-title"
              class="input"
              placeholder="Opened the hardware store"
              value={form.title}
              maxlength={120}
              data-testid="person-event-form-title"
              onInput={event => setForm("title", event.currentTarget.value)}
            />
          </Field>
        </div>

        <Field label="Date" for="event-date">
          <FuzzyDateField
            id="event-date"
            testId="person-event-form-date"
            value={form.date}
            onChange={value => setForm("date", value)}
          />
        </Field>

        <Field label="Place" for="event-place">
          <input
            id="event-place"
            class="input"
            placeholder="Springfield"
            value={form.place}
            maxlength={160}
            data-testid="person-event-form-place"
            onInput={event => setForm("place", event.currentTarget.value)}
          />
        </Field>

        <Field label="Notes" for="event-description">
          <textarea
            id="event-description"
            class="input min-h-24"
            placeholder="Anything that gives this event context."
            value={form.description}
            maxlength={2000}
            data-testid="person-event-form-description"
            onInput={event => setForm("description", event.currentTarget.value)}
          />
        </Field>

        <p class="text-xs leading-relaxed text-muted-foreground">
          Dates can be partial or approximate, so "about 1943" and "before 1900" are both fine.
        </p>

        {error() && (
          <p
            class="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
            data-testid="person-event-form-error"
          >
            {error()}
          </p>
        )}
      </form>
    </Modal>
  );
}
