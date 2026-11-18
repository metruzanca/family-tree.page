import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { revalidate } from "@solidjs/router";
import type {
  GraphPerson,
  GraphPersonEvent,
  GraphRelationship,
} from "~/api/people-server";
import { createPersonEvent, updatePersonEvent } from "~/api/people-server";
import { getTreeGraph } from "~/api";
import {
  PERSON_EVENT_OPTIONS,
  eventPartnerOf,
  personEventKey,
  type PersonEventKind,
} from "~/lib/person-events";
import { attemptAction } from "~/lib/action-result";
import type { FuzzyDate } from "~/lib/fuzzy-date";
import { Button } from "../ui/button";
import { Field } from "../ui/Field";
import { FuzzyDateField } from "../ui/FuzzyDateField";
import { Modal } from "../ui/Modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectPortal,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useToast } from "../ui/Toast";
import { useI18n } from "~/i18n/LocaleProvider";

type PersonEventDialogProps = {
  open: boolean;
  onClose: () => void;
  treeId: string;
  person: GraphPerson;
  people: GraphPerson[];
  relationships: GraphRelationship[];
  event?: GraphPersonEvent | null;
};

type PartnerOption = { value: string; label: string };

export function PersonEventDialog(props: PersonEventDialogProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = createStore({
    kind: "residence" as PersonEventKind,
    partnerPersonId: "",
    title: "",
    place: "",
    date: null as FuzzyDate | null,
    description: "",
  });
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");

  const showsPartner = () => form.kind === "marriage" || form.kind === "divorce";

  /** Only people already connected to this person as partners are offered. */
  const partnerIds = createMemo(() => {
    const found = new Set<string>();
    for (const relationship of props.relationships) {
      if (relationship.type !== "partner") continue;
      if (relationship.source === props.person.id) found.add(relationship.target);
      if (relationship.target === props.person.id) found.add(relationship.source);
    }
    return found;
  });

  const partnerOptions = createMemo<PartnerOption[]>(() => {
    const current = form.partnerPersonId;
    const recorded = props.people
      // Keep a stale choice selectable so an old event can still be saved.
      .filter(
        person =>
          person.id !== props.person.id &&
          (partnerIds().has(person.id) || person.id === current),
      )
      .map(person => ({ value: person.id, label: person.displayName }))
      .sort((left, right) => left.label.localeCompare(right.label));
    return [{ value: "", label: t("person.event.noPartner") }, ...recorded];
  });

  const partnerOption = createMemo(
    () =>
      partnerOptions().find(option => option.value === form.partnerPersonId) ??
      partnerOptions()[0],
  );

  createEffect(() => {
    if (!props.open) return;
    const event = props.event;
    setForm({
      kind: event?.kind ?? "residence",
      // The editor names the other participant, not the row's stored partner,
      // so a shared event reads correctly from either timeline.
      partnerPersonId: event
        ? (eventPartnerOf(event, props.person.id) ?? "")
        : "",
      title: event?.title ?? "",
      place: event?.place ?? "",
      date: event?.date ?? null,
      description: event?.description ?? "",
    });
    setError("");
  });

  function changeKind(kind: PersonEventKind) {
    setForm("kind", kind);
    if (kind !== "marriage" && kind !== "divorce") {
      setForm("partnerPersonId", "");
      return;
    }
    // One recorded partner is almost always the intended spouse.
    if (!form.partnerPersonId && partnerIds().size === 1) {
      setForm("partnerPersonId", [...partnerIds()][0]);
    }
  }

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
      partnerPersonId:
        showsPartner() && form.partnerPersonId ? form.partnerPersonId : null,
    };

    const result = await attemptAction(() =>
      props.event
        ? updatePersonEvent({
            treeId: props.treeId,
            eventId: props.event.id,
            personId: props.person.id,
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
    toast.show(
      props.event ? t("person.event.updated") : t("person.event.added"),
      "success",
    );
    props.onClose();
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={
        props.event
          ? t("person.event.editTitle")
          : t("person.event.addTitle", { name: props.person.firstName })
      }
      description={t("person.event.description")}
      testId="person-event-form-dialog"
      footer={
        <>
          <Button
            variant="ghost"
            type="button"
            onClick={props.onClose}
            data-testid="person-event-form-cancel"
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="person-event-form"
            disabled={pending()}
            data-testid="person-event-form-submit"
          >
            {pending()
              ? t("person.form.saving")
              : props.event
                ? t("person.form.saveChanges")
                : t("person.panel.addEvent")}
          </Button>
        </>
      }
    >
      <form id="person-event-form" class="space-y-4" onSubmit={submit} data-testid="person-event-form">
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label={t("person.event.type")} for="event-kind">
            <select
              id="event-kind"
              class="input"
              value={form.kind}
              data-testid="person-event-form-kind"
              onChange={event =>
                changeKind(event.currentTarget.value as PersonEventKind)
              }
            >
              <For each={PERSON_EVENT_OPTIONS}>
                {option => <option value={option.value}>{t(personEventKey(option.value))}</option>}
              </For>
            </select>
          </Field>
          <Field
            label={t("person.event.title")}
            for="event-title"
            hint={
              form.kind === "other"
                ? t("person.event.titleRequired")
                : t("person.event.titleOptional")
            }
          >
            <input
              id="event-title"
              class="input"
              placeholder={t("person.event.titlePlaceholder")}
              value={form.title}
              maxlength={120}
              data-testid="person-event-form-title"
              onInput={event => setForm("title", event.currentTarget.value)}
            />
          </Field>
        </div>

        <Show when={showsPartner()}>
          <Field
            label={
              form.kind === "divorce"
                ? t("person.event.formerSpouse")
                : t("person.event.spouse")
            }
            for="event-partner"
            hint={
              partnerIds().size
                ? t("person.event.partnerHint")
                : t("person.event.noPartnersHint")
            }
          >
            <Select
              options={partnerOptions()}
              optionValue="value"
              optionTextValue="label"
              value={partnerOption()}
              onChange={option => option && setForm("partnerPersonId", option.value)}
              itemComponent={itemProps => (
                <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
              )}
            >
              <SelectTrigger
                id="event-partner"
                class="w-full"
                aria-label={
                  form.kind === "divorce"
                    ? t("person.event.formerSpouse")
                    : t("person.event.spouse")
                }
                data-testid="person-event-form-partner"
              >
                <SelectValue<PartnerOption>>
                  {state => state.selectedOption().label}
                </SelectValue>
              </SelectTrigger>
              <SelectPortal>
                <SelectContent />
              </SelectPortal>
            </Select>
          </Field>
        </Show>

        <Field label={t("person.event.date")} for="event-date">
          <FuzzyDateField
            id="event-date"
            testId="person-event-form-date"
            value={form.date}
            onChange={value => setForm("date", value)}
          />
        </Field>

        <Field label={t("person.event.place")} for="event-place">
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

        <Field label={t("person.event.notes")} for="event-description">
          <textarea
            id="event-description"
            class="input min-h-24"
            placeholder={t("person.event.notesPlaceholder")}
            value={form.description}
            maxlength={2000}
            data-testid="person-event-form-description"
            onInput={event => setForm("description", event.currentTarget.value)}
          />
        </Field>

        <p class="text-xs leading-relaxed text-muted-foreground">
          {t("person.event.datesHint")}
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
