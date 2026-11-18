import { For, Show, createEffect, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { revalidate } from "@solidjs/router";
import { House, Plus, Trash2 } from "lucide-solid";
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
import {
  canBeHomeLink,
  MAX_PERSON_LINKS,
  type PersonLink,
} from "~/lib/person-links";
import { PersonLinkGlyph } from "./PersonLinks";
import { useI18n } from "~/i18n/LocaleProvider";
import type { TranslationKey } from "~/i18n";

const SEX_KEYS: Record<PersonSex, TranslationKey> = {
  female: "person.sex.female",
  male: "person.sex.male",
  other: "person.sex.other",
  unknown: "common.unknown",
};

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
  links: PersonLink[];
  contactEmail: string;
  contactPhone: string;
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
  links: [],
  contactEmail: "",
  contactPhone: "",
};

export function PersonFormDialog(props: {
  open: boolean;
  onClose: () => void;
  treeId: string;
  person?: GraphPerson | null;
  onSaved?: (personId: string) => void;
}) {
  const { t } = useI18n();
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
            links: (person.links ?? []).map(link => ({ ...link })),
            contactEmail: person.contactEmail ?? "",
            contactPhone: person.contactPhone ?? "",
          }
        : { ...emptyForm, links: [] },
    );
    setError("");
    setDuplicates([]);
    setAllowDuplicate(false);
  });

  function addLink() {
    if (form.links.length >= MAX_PERSON_LINKS) return;
    setForm("links", [...form.links, { url: "", isHome: false }]);
  }

  function removeLink(index: number) {
    setForm(
      "links",
      form.links.filter((_, current) => current !== index),
    );
  }

  function updateLinkUrl(index: number, url: string) {
    setForm("links", index, "url", url);
    if (form.links[index]?.isHome && !canBeHomeLink(url)) {
      setForm("links", index, "isHome", false);
    }
  }

  function toggleHome(index: number) {
    const next = !form.links[index]?.isHome;
    setForm(
      "links",
      form.links.map((link, current) => ({
        ...link,
        isHome: current === index ? next : false,
      })),
    );
  }

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
      links: form.links
        .map(link => ({ url: link.url.trim(), isHome: link.isHome }))
        .filter(link => link.url.length > 0),
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
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
    toast.show(
      props.person ? t("person.form.updated") : t("person.form.created"),
      "success",
    );
    if (!props.person && result.data) {
      props.onSaved?.(result.data.id);
    }
    props.onClose();
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.person ? t("person.form.editTitle") : t("person.form.addTitle")}
      testId="person-form-dialog"
      description={
        props.person
          ? t("person.form.editDescription")
          : t("person.form.addDescription")
      }
      footer={
        <>
          <Button
            variant="ghost"
            type="button"
            onClick={props.onClose}
            data-testid="person-form-cancel"
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="person-form"
            disabled={pending()}
            data-testid="person-form-submit"
          >
            {pending()
              ? t("person.form.saving")
              : props.person
                ? t("person.form.saveChanges")
                : t("person.form.submit")}
          </Button>
        </>
      }
    >
      <form id="person-form" class="space-y-4" onSubmit={submit} data-testid="person-form">
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label={t("person.field.firstName")} for="person-first">
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
          <Field label={t("person.field.lastName")} for="person-last">
            <input
              id="person-last"
              class="input"
              value={form.lastName}
              onInput={event => setForm("lastName", event.currentTarget.value)}
              maxlength={80}
              data-testid="person-form-last-name"
            />
          </Field>
          <Field label={t("person.field.nickname")} for="person-nick">
            <input
              id="person-nick"
              class="input"
              placeholder={t("common.optional")}
              value={form.nickname}
              onInput={event => setForm("nickname", event.currentTarget.value)}
              maxlength={80}
              data-testid="person-form-nickname"
            />
          </Field>
          <Field label={t("person.field.maidenName")} for="person-maiden">
            <input
              id="person-maiden"
              class="input"
              placeholder={t("common.optional")}
              value={form.maidenName}
              onInput={event => setForm("maidenName", event.currentTarget.value)}
              maxlength={80}
              data-testid="person-form-maiden-name"
            />
          </Field>
          <Field
            label={t("person.field.sex")}
            for="person-sex"
            hint={t("person.field.sexHint")}
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
                {option => <option value={option.value}>{t(SEX_KEYS[option.value])}</option>}
              </For>
            </select>
          </Field>
          <Field label={t("person.field.born")} for="person-birth">
            <FuzzyDateField
              id="person-birth"
              testId="person-form-birth-date"
              value={form.birthDate}
              onChange={value => setForm("birthDate", value)}
            />
          </Field>
          <Field label={t("person.field.died")} for="person-death">
            <FuzzyDateField
              id="person-death"
              testId="person-form-death-date"
              value={form.deathDate}
              onChange={value => setForm("deathDate", value)}
            />
          </Field>
          <Field label={t("person.field.birthPlace")} for="person-birthplace">
            <input
              id="person-birthplace"
              class="input"
              placeholder={t("common.optional")}
              value={form.birthPlace}
              onInput={event => setForm("birthPlace", event.currentTarget.value)}
              maxlength={160}
              data-testid="person-form-birthplace"
            />
          </Field>
          <Field label={t("person.field.deathPlace")} for="person-deathplace">
            <input
              id="person-deathplace"
              class="input"
              placeholder={t("common.optional")}
              value={form.deathPlace}
              onInput={event => setForm("deathPlace", event.currentTarget.value)}
              maxlength={160}
              data-testid="person-form-deathplace"
            />
          </Field>
        </div>
        <Field
          label={t("person.field.bio")}
          for="person-bio"
          hint={t("person.field.bioHint")}
        >
          <textarea
            id="person-bio"
            class="input min-h-24"
            value={form.bio}
            onInput={event => setForm("bio", event.currentTarget.value)}
            maxlength={4000}
            data-testid="person-form-bio"
          />
        </Field>

        <section
          class="space-y-3 rounded-xl border border-border bg-secondary/20 p-3"
          data-testid="person-form-links"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <h3 class="field-label">{t("person.links.title")}</h3>
              <p class="mt-0.5 text-[0.7rem] leading-relaxed text-muted-foreground">
                {t("person.form.linksHint")}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={addLink}
              disabled={form.links.length >= MAX_PERSON_LINKS}
              data-testid="person-form-add-link"
            >
              <Plus size={13} />
              {t("person.links.add")}
            </Button>
          </div>

          <Show
            when={form.links.length}
            fallback={
              <p
                class="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground"
                data-testid="person-form-links-empty"
              >
                {t("person.links.empty")}
              </p>
            }
          >
            <div class="space-y-2">
              <For each={form.links}>
                {(link, index) => (
                  <div
                    class="flex items-center gap-2"
                    data-testid={`person-form-link-${index()}`}
                  >
                    <span
                      class="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground"
                      data-testid={`person-form-link-preview-${index()}`}
                    >
                      <PersonLinkGlyph link={link} size={16} />
                    </span>
                    <input
                      class="input min-w-0 flex-1"
                      placeholder="https://instagram.com/name"
                      value={link.url}
                      onInput={event =>
                        updateLinkUrl(index(), event.currentTarget.value)
                      }
                      maxlength={2048}
                      aria-label={t("person.links.address")}
                      data-testid={`person-form-link-url-${index()}`}
                    />
                    <Show
                      when={
                        link.url.trim() &&
                        (canBeHomeLink(link.url) || link.isHome)
                      }
                    >
                      <button
                        type="button"
                        class={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition hover:bg-primary/5 ${
                          link.isHome
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                        aria-pressed={link.isHome}
                        aria-label={
                          link.isHome
                            ? t("person.links.removeHome")
                            : t("person.links.useAsHome")
                        }
                        onClick={() => toggleHome(index())}
                        data-testid={`person-form-link-home-${index()}`}
                      >
                        <House size={15} />
                      </button>
                    </Show>
                    <button
                      type="button"
                      class="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                      aria-label={t("person.links.remove")}
                      onClick={() => removeLink(index())}
                      data-testid={`person-form-link-remove-${index()}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <div class="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("person.field.contactEmail")}
              for="person-contact-email"
              hint={t("person.field.contactHint")}
            >
              <input
                id="person-contact-email"
                class="input"
                type="email"
                placeholder={t("common.optional")}
                value={form.contactEmail}
                onInput={event =>
                  setForm("contactEmail", event.currentTarget.value)
                }
                maxlength={254}
                data-testid="person-form-contact-email"
              />
            </Field>
            <Field
              label={t("person.field.contactPhone")}
              for="person-contact-phone"
              hint={t("person.field.contactHint")}
            >
              <input
                id="person-contact-phone"
                class="input"
                type="tel"
                placeholder={t("common.optional")}
                value={form.contactPhone}
                onInput={event =>
                  setForm("contactPhone", event.currentTarget.value)
                }
                maxlength={50}
                data-testid="person-form-contact-phone"
              />
            </Field>
          </div>
        </section>
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
