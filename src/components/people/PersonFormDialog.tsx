import { For, Show, createEffect, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { revalidate } from "@solidjs/router";
import type { GraphPerson } from "~/api/people-server";
import {
  createPerson,
  findPossibleDuplicates,
  updatePerson,
} from "~/api/people-server";
import { getMyTrees, getTreeGraph, getTreeOverview } from "~/api";
import type { DuplicateCandidate } from "~/lib/duplicates";
import { DuplicateWarning } from "./DuplicateWarning";
import { Button } from "../ui/button";
import { Field } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";
import { FuzzyDateField } from "../ui/FuzzyDateField";
import { attemptAction } from "~/lib/action-result";
import { track } from "~/lib/analytics";
import type { FuzzyDate } from "~/lib/fuzzy-date";
import {
  PERSON_SEX_OPTIONS,
  type PersonSex,
} from "~/lib/person-sex";

export type PersonFormState = {
  firstName: string;
  lastName: string;
  maidenName: string;
  nickname: string;
  sex: PersonSex;
  birthDate: FuzzyDate | null;
  deathDate: FuzzyDate | null;
  birthPlace: string;
  deathPlace: string;
  bio: string;
};

const emptyForm: PersonFormState = {
  firstName: "",
  lastName: "",
  maidenName: "",
  nickname: "",
  sex: "unknown",
  birthDate: null,
  deathDate: null,
  birthPlace: "",
  deathPlace: "",
  bio: "",
};

export function PersonFormDialog(props: {
  open: boolean;
  onClose: () => void;
  treeId: string;
  person?: GraphPerson | null;
  onSaved?: (personId: string) => void;
}) {
  const toast = useToast();
  const [form, setForm] = createStore<PersonFormState>({ ...emptyForm });
  const [error, setError] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [duplicates, setDuplicates] = createSignal<DuplicateCandidate[]>([]);
  const [allowDuplicate, setAllowDuplicate] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    const person = props.person;
    setForm(
      person
        ? {
            firstName: person.firstName,
            lastName: person.lastName,
            maidenName: person.maidenName ?? "",
            nickname: person.nickname ?? "",
            sex: person.sex,
            birthDate: person.birthDate,
            deathDate: person.deathDate,
            birthPlace: person.birthPlace ?? "",
            deathPlace: person.deathPlace ?? "",
            bio: person.bio ?? "",
          }
        : { ...emptyForm },
    );
    setError("");
    setDuplicates([]);
    setAllowDuplicate(false);
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    await save();
  }

  async function save() {
    if (pending()) return;
    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      maidenName: form.maidenName,
      nickname: form.nickname,
      sex: form.sex,
      birthDate: form.birthDate,
      deathDate: form.deathDate,
      birthPlace: form.birthPlace,
      deathPlace: form.deathPlace,
      bio: form.bio,
    };

    if (!props.person && !allowDuplicate()) {
      setPending(true);
      const check = await findPossibleDuplicates({
        treeId: props.treeId,
        ...payload,
      });
      setPending(false);
      if (!check.ok) {
        setError(check.error);
        return;
      }
      if (check.data.length) {
        setDuplicates(check.data);
        return;
      }
    }

    setPending(true);
    setError("");
    const result = await attemptAction(() =>
      props.person
        ? updatePerson({ treeId: props.treeId, personId: props.person.id, ...payload })
        : createPerson({ treeId: props.treeId, ...payload, allowDuplicate: allowDuplicate() }),
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await revalidate([getTreeGraph.key, getTreeOverview.key, getMyTrees.key]);
    track(props.person ? "person_updated" : "person_created");
    toast.show(props.person ? "Person updated." : "Person added.", "success");
    if (!props.person && result.data) {
      props.onSaved?.(result.data.id);
    }
    props.onClose();
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.person ? "Edit person" : "Add a person"}
      testId="person-form-dialog"
      description={
        props.person
          ? "Update the details that appear on the tree and in their profile."
          : "Start with a name. You can connect them to the rest of the family next."
      }
      footer={
        <>
          <Button
            variant="ghost"
            type="button"
            onClick={props.onClose}
            data-testid="person-form-cancel"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="person-form"
            disabled={pending()}
            data-testid="person-form-submit"
          >
            {pending() ? "Saving…" : props.person ? "Save changes" : "Add person"}
          </Button>
        </>
      }
    >
      <form id="person-form" class="space-y-4" onSubmit={submit} data-testid="person-form">
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label="First name" for="person-first">
            <input
              id="person-first"
              class="input"
              value={form.firstName}
              onInput={event => setForm("firstName", event.currentTarget.value)}
              maxlength={80}
              required
              autofocus
              data-testid="person-form-first-name"
            />
          </Field>
          <Field label="Last name" for="person-last">
            <input
              id="person-last"
              class="input"
              value={form.lastName}
              onInput={event => setForm("lastName", event.currentTarget.value)}
              maxlength={80}
              data-testid="person-form-last-name"
            />
          </Field>
          <Field label="Nickname" for="person-nick">
            <input
              id="person-nick"
              class="input"
              placeholder="Optional"
              value={form.nickname}
              onInput={event => setForm("nickname", event.currentTarget.value)}
              maxlength={80}
              data-testid="person-form-nickname"
            />
          </Field>
          <Field label="Maiden name" for="person-maiden">
            <input
              id="person-maiden"
              class="input"
              placeholder="Optional"
              value={form.maidenName}
              onInput={event => setForm("maidenName", event.currentTarget.value)}
              maxlength={80}
              data-testid="person-form-maiden-name"
            />
          </Field>
          <Field
            label="Sex"
            for="person-sex"
            hint="Used for father and mother labels and GEDCOM."
          >
            <select
              id="person-sex"
              class="input"
              value={form.sex}
              onChange={event =>
                setForm("sex", event.currentTarget.value as PersonSex)
              }
              data-testid="person-form-sex"
            >
              <For each={PERSON_SEX_OPTIONS}>
                {option => <option value={option.value}>{option.label}</option>}
              </For>
            </select>
          </Field>
          <Field label="Born" for="person-birth">
            <FuzzyDateField
              id="person-birth"
              testId="person-form-birth-date"
              value={form.birthDate}
              onChange={value => setForm("birthDate", value)}
            />
          </Field>
          <Field label="Died" for="person-death">
            <FuzzyDateField
              id="person-death"
              testId="person-form-death-date"
              value={form.deathDate}
              onChange={value => setForm("deathDate", value)}
            />
          </Field>
          <Field label="Birthplace" for="person-birthplace">
            <input
              id="person-birthplace"
              class="input"
              placeholder="Optional"
              value={form.birthPlace}
              onInput={event => setForm("birthPlace", event.currentTarget.value)}
              maxlength={160}
              data-testid="person-form-birthplace"
            />
          </Field>
          <Field label="Resting place" for="person-deathplace">
            <input
              id="person-deathplace"
              class="input"
              placeholder="Optional"
              value={form.deathPlace}
              onInput={event => setForm("deathPlace", event.currentTarget.value)}
              maxlength={160}
              data-testid="person-form-deathplace"
            />
          </Field>
        </div>
        <Field label="Life notes" for="person-bio" hint="Stories, occupations, places, anything worth remembering.">
          <textarea
            id="person-bio"
            class="input min-h-24"
            value={form.bio}
            onInput={event => setForm("bio", event.currentTarget.value)}
            maxlength={4000}
            data-testid="person-form-bio"
          />
        </Field>
        <Show when={duplicates().length}>
          <DuplicateWarning
            candidates={duplicates()}
            pending={pending()}
            onCancel={() => setDuplicates([])}
            onCreateAnyway={() => {
              setAllowDuplicate(true);
              setDuplicates([]);
              void save();
            }}
          />
        </Show>
        <Show when={error()}>
          <p
            class="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
            data-testid="person-form-error"
          >
            {error()}
          </p>
        </Show>
      </form>
    </Modal>
  );
}
