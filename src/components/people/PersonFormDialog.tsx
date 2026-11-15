import { Show, createEffect, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { revalidate } from "@solidjs/router";
import type { GraphPerson } from "~/api/people-server";
import { createPerson, updatePerson } from "~/api/people-server";
import { getMyTrees, getTreeGraph, getTreeOverview } from "~/api";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";
import { track } from "~/lib/analytics";

export type PersonFormState = {
  firstName: string;
  lastName: string;
  maidenName: string;
  nickname: string;
  birthDate: string;
  deathDate: string;
  birthPlace: string;
  deathPlace: string;
  bio: string;
};

const emptyForm: PersonFormState = {
  firstName: "",
  lastName: "",
  maidenName: "",
  nickname: "",
  birthDate: "",
  deathDate: "",
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
            birthDate: person.birthDate ?? "",
            deathDate: person.deathDate ?? "",
            birthPlace: person.birthPlace ?? "",
            deathPlace: person.deathPlace ?? "",
            bio: person.bio ?? "",
          }
        : { ...emptyForm },
    );
    setError("");
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (pending()) return;
    setPending(true);
    setError("");
    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      maidenName: form.maidenName,
      nickname: form.nickname,
      birthDate: form.birthDate,
      deathDate: form.deathDate,
      birthPlace: form.birthPlace,
      deathPlace: form.deathPlace,
      bio: form.bio,
    };
    const result = props.person
      ? await updatePerson({ treeId: props.treeId, personId: props.person.id, ...payload })
      : await createPerson({ treeId: props.treeId, ...payload });
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
      description={
        props.person
          ? "Update the details that appear on the tree and in their profile."
          : "Start with a name. You can connect them to the rest of the family next."
      }
      footer={
        <>
          <Button variant="ghost" type="button" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" form="person-form" disabled={pending()}>
            {pending() ? "Saving…" : props.person ? "Save changes" : "Add person"}
          </Button>
        </>
      }
    >
      <form id="person-form" class="space-y-4" onSubmit={submit}>
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
            />
          </Field>
          <Field label="Last name" for="person-last">
            <input
              id="person-last"
              class="input"
              value={form.lastName}
              onInput={event => setForm("lastName", event.currentTarget.value)}
              maxlength={80}
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
            />
          </Field>
          <Field label="Born" for="person-birth">
            <input
              id="person-birth"
              type="date"
              class="input"
              value={form.birthDate}
              onInput={event => setForm("birthDate", event.currentTarget.value)}
            />
          </Field>
          <Field label="Died" for="person-death">
            <input
              id="person-death"
              type="date"
              class="input"
              value={form.deathDate}
              onInput={event => setForm("deathDate", event.currentTarget.value)}
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
          />
        </Field>
        <Show when={error()}>
          <p class="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error()}
          </p>
        </Show>
      </form>
    </Modal>
  );
}
