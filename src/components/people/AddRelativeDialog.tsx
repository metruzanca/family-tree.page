import { For, Show, createEffect, createMemo, createSignal, on } from "solid-js";
import { createStore } from "solid-js/store";
import { revalidate } from "@solidjs/router";
import { ArrowDown, ArrowUp, Heart, Search } from "lucide-solid";
import type { GraphPerson, GraphRelationship } from "~/api/people-server";
import { addRelative, findPossibleDuplicates } from "~/api/people-server";
import type { DuplicateCandidate } from "~/lib/duplicates";
import { DuplicateWarning } from "./DuplicateWarning";
import { getMyTrees, getTreeGraph, getTreeOverview } from "~/api";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/button";
import { Field } from "../ui/Field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectPortal,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";
import { FuzzyDateField } from "../ui/FuzzyDateField";
import { attemptAction } from "~/lib/action-result";
import { track } from "~/lib/analytics";
import { formatFuzzyYearRange, type FuzzyDate } from "~/lib/fuzzy-date";
import { useI18n } from "~/i18n/LocaleProvider";
import type { TranslationKey } from "~/i18n";

type Relation = "parent" | "partner" | "child";

const PARENT_TYPE_OPTIONS: { value: string; key: TranslationKey }[] = [
  { value: "biological", key: "person.parentType.biological" },
  { value: "adoptive", key: "person.parentType.adoptive" },
  { value: "foster", key: "person.parentType.foster" },
  { value: "step", key: "person.parentType.step" },
  { value: "unknown", key: "common.unknown" },
];

const STATUS_OPTIONS: { value: string; key: TranslationKey }[] = [
  { value: "partnered", key: "person.partnership.partnered" },
  { value: "married", key: "person.partnership.married" },
  { value: "divorced", key: "person.partnership.divorced" },
  { value: "separated", key: "person.partnership.separated" },
  { value: "widowed", key: "person.partnership.widowed" },
  { value: "unknown", key: "common.unknown" },
];

export function AddRelativeDialog(props: {
  open: boolean;
  onClose: () => void;
  treeId: string;
  anchor: GraphPerson | null;
  people: GraphPerson[];
  relationships: GraphRelationship[];
  anchorParentCount: number;
  onAdded?: (personId: string) => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [relation, setRelation] = createSignal<Relation>("parent");
  const [mode, setMode] = createSignal<"existing" | "new">("existing");
  const [search, setSearch] = createSignal("");
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [otherParentId, setOtherParentId] = createSignal("none");
  const [parentType, setParentType] = createSignal("biological");
  const [status, setStatus] = createSignal("partnered");
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  const [duplicates, setDuplicates] = createSignal<DuplicateCandidate[]>([]);
  const [allowDuplicate, setAllowDuplicate] = createSignal(false);
  const [form, setForm] = createStore({
    firstName: "",
    lastName: "",
    nickname: "",
    birthDate: null as FuzzyDate | null,
    deathDate: null as FuzzyDate | null,
  });

  const parentDisabled = () => props.anchorParentCount >= 2;

  const parentTypeOptions = createMemo(() =>
    PARENT_TYPE_OPTIONS.map(option => ({ value: option.value, label: t(option.key) })),
  );
  const statusOptions = createMemo(() =>
    STATUS_OPTIONS.map(option => ({ value: option.value, label: t(option.key) })),
  );

  const partnerIds = createMemo(() => {
    const anchorId = props.anchor?.id;
    const found = new Set<string>();
    if (!anchorId) return found;
    for (const relationship of props.relationships) {
      if (relationship.type !== "partner") continue;
      if (relationship.source === anchorId) found.add(relationship.target);
      if (relationship.target === anchorId) found.add(relationship.source);
    }
    return found;
  });

  const otherParentOptions = createMemo(() => {
    const excluded = new Set<string>();
    if (props.anchor) excluded.add(props.anchor.id);
    if (mode() === "existing" && selectedId()) excluded.add(selectedId()!);
    const candidates = props.people.filter(person => !excluded.has(person.id));
    const partners = candidates.filter(person => partnerIds().has(person.id));
    const others = candidates.filter(person => !partnerIds().has(person.id));
    return [
      { value: "none", label: t("people.relative.noOtherParent") },
      ...[...partners, ...others].map(person => ({
        value: person.id,
        label: person.displayName,
      })),
    ];
  });

  const otherParentOption = createMemo(
    () =>
      otherParentOptions().find(option => option.value === otherParentId()) ??
      otherParentOptions()[0],
  );

  const options = createMemo(() =>
    props.people
      .filter(person => person.id !== props.anchor?.id)
      .filter(person =>
        !search().trim()
          ? true
          : person.displayName.toLowerCase().includes(search().trim().toLowerCase()),
      )
      .slice(0, 60),
  );

  createEffect(
    on(
      () => props.open,
      open => {
        if (!open) return;
        setSearch("");
        setSelectedId(null);
        setOtherParentId("none");
        setError("");
        setDuplicates([]);
        setAllowDuplicate(false);
        setMode("existing");
        setRelation(parentDisabled() ? "child" : "parent");
        setForm({ firstName: "", lastName: "", nickname: "", birthDate: null, deathDate: null });
      },
    ),
  );

  function resetForNext() {
    setSearch("");
    setSelectedId(null);
    setError("");
    setDuplicates([]);
    setAllowDuplicate(false);
    setForm({ firstName: "", lastName: "", nickname: "", birthDate: null, deathDate: null });
    requestAnimationFrame(() => {
      const target =
        mode() === "new"
          ? document.getElementById("relative-first")
          : document.getElementById("relative-search");
      target?.focus();
    });
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    await save(
      (event.submitter as HTMLButtonElement | null)?.dataset.keepOpen === "true",
    );
  }

  async function save(keepOpen: boolean) {
    const anchor = props.anchor;
    if (!anchor || pending()) return;
    if (mode() === "existing" && !selectedId()) {
      setError(t("people.relative.chooseExisting"));
      return;
    }

    if (mode() === "new" && !allowDuplicate()) {
      setPending(true);
      const check = await findPossibleDuplicates({
        treeId: props.treeId,
        firstName: form.firstName,
        lastName: form.lastName,
        nickname: form.nickname,
        birthDate: form.birthDate,
        deathDate: form.deathDate,
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
      addRelative({
        mode: mode(),
        treeId: props.treeId,
        anchorPersonId: anchor.id,
        relation: relation(),
        personId: selectedId() ?? undefined,
        otherParentId:
          relation() === "child" && otherParentId() !== "none" ? otherParentId() : undefined,
        person:
          mode() === "new"
            ? {
                firstName: form.firstName,
                lastName: form.lastName,
                nickname: form.nickname,
                sex: "unknown",
                birthDate: form.birthDate,
                deathDate: form.deathDate,
                maidenName: "",
                birthPlace: "",
                deathPlace: "",
                bio: "",
                links: [],
                contactEmail: "",
                contactPhone: "",
              }
            : undefined,
        parentType: parentType() as "biological" | "adoptive" | "foster" | "step" | "unknown",
        status: status() as
          | "married"
          | "partnered"
          | "divorced"
          | "separated"
          | "widowed"
          | "unknown",
        allowDuplicate: allowDuplicate(),
      }),
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await revalidate([getTreeGraph.key, getTreeOverview.key, getMyTrees.key]);
    track("relationship_added", { relation: relation(), mode: mode() });
    toast.show(
      mode() === "new"
        ? t("people.relative.addedAndConnected")
        : t("people.relative.connected"),
      "success",
    );
    if (keepOpen) {
      resetForNext();
      return;
    }
    props.onAdded?.(result.data.personId);
    props.onClose();
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={
        props.anchor
          ? t("people.relative.connectTitle", { name: props.anchor.firstName })
          : t("people.relative.title")
      }
      description={t("people.relative.description")}
      testId="add-relative-dialog"
      footer={
        <>
          <Button
            variant="ghost"
            type="button"
            onClick={props.onClose}
            data-testid="add-relative-cancel"
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="secondary"
            type="submit"
            form="relative-form"
            data-keep-open="true"
            disabled={pending()}
            data-testid="add-relative-submit-more"
          >
            {t("people.relative.connectMore")}
          </Button>
          <Button
            type="submit"
            form="relative-form"
            disabled={pending()}
            data-testid="add-relative-submit"
          >
            {pending() ? t("people.relative.connecting") : t("people.relative.connect")}
          </Button>
        </>
      }
    >
      <form id="relative-form" class="space-y-5" onSubmit={submit} data-testid="add-relative-form">
        <div class="grid grid-cols-3 gap-2">
          <RelationChoice
            testId="add-relative-relation-parent"
            active={relation() === "parent"}
            disabled={parentDisabled()}
            icon={<ArrowUp size={17} />}
            label={t("person.relation.parent")}
            hint={
              parentDisabled()
                ? t("people.relative.parentFull")
                : t("people.relative.parentHint")
            }
            onClick={() => setRelation("parent")}
          />
          <RelationChoice
            testId="add-relative-relation-partner"
            active={relation() === "partner"}
            icon={<Heart size={17} />}
            label={t("person.relation.partner")}
            hint={t("people.relative.partnerHint")}
            onClick={() => setRelation("partner")}
          />
          <RelationChoice
            testId="add-relative-relation-child"
            active={relation() === "child"}
            icon={<ArrowDown size={17} />}
            label={t("person.relation.child")}
            hint={t("people.relative.childHint")}
            onClick={() => setRelation("child")}
          />
        </div>

        <Show when={relation() !== "partner"}>
          <Field label={t("people.relative.relationshipType")} for="parent-type">
            <Select
              options={parentTypeOptions()}
              optionValue="value"
              optionTextValue="label"
              value={parentTypeOptions().find(option => option.value === parentType())}
              onChange={option => option && setParentType(option.value)}
              itemComponent={itemProps => (
                <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
              )}
            >
              <SelectTrigger
                id="parent-type"
                class="w-full"
                aria-label={t("people.relative.relationshipType")}
                data-testid="add-relative-parent-type"
              >
                <SelectValue<{ value: string; label: string }>>
                  {state => state.selectedOption().label}
                </SelectValue>
              </SelectTrigger>
              <SelectPortal>
                <SelectContent />
              </SelectPortal>
            </Select>
          </Field>
        </Show>

        <Show when={relation() === "child"}>
          <Field
            label={t("people.relative.otherParent")}
            for="other-parent"
            hint={t("people.relative.otherParentHint")}
          >
            <Select
              options={otherParentOptions()}
              optionValue="value"
              optionTextValue="label"
              value={otherParentOption()}
              onChange={option => option && setOtherParentId(option.value)}
              itemComponent={itemProps => (
                <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
              )}
            >
              <SelectTrigger
                id="other-parent"
                class="w-full"
                aria-label={t("people.relative.otherParent")}
                data-testid="add-relative-other-parent"
              >
                <SelectValue<{ value: string; label: string }>>
                  {state => state.selectedOption().label}
                </SelectValue>
              </SelectTrigger>
              <SelectPortal>
                <SelectContent />
              </SelectPortal>
            </Select>
          </Field>
        </Show>

        <Show when={relation() === "partner"}>
          <Field label={t("people.relative.partnership")} for="partner-status">
            <Select
              options={statusOptions()}
              optionValue="value"
              optionTextValue="label"
              value={statusOptions().find(option => option.value === status())}
              onChange={option => option && setStatus(option.value)}
              itemComponent={itemProps => (
                <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
              )}
            >
              <SelectTrigger
                id="partner-status"
                class="w-full"
                aria-label={t("people.relative.partnership")}
                data-testid="add-relative-partner-status"
              >
                <SelectValue<{ value: string; label: string }>>
                  {state => state.selectedOption().label}
                </SelectValue>
              </SelectTrigger>
              <SelectPortal>
                <SelectContent />
              </SelectPortal>
            </Select>
          </Field>
        </Show>

        <div class="flex gap-1 rounded-full border border-border bg-muted/70 p-1 text-sm">
          <button
            type="button"
            aria-pressed={mode() === "existing"}
            class={`flex-1 rounded-full px-3 py-1.5 font-semibold transition ${mode() === "existing" ? "border border-border/70 bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="add-relative-mode-existing"
            onClick={() => setMode("existing")}
          >
            {t("people.relative.modeExisting")}
          </button>
          <button
            type="button"
            aria-pressed={mode() === "new"}
            class={`flex-1 rounded-full px-3 py-1.5 font-semibold transition ${mode() === "new" ? "border border-border/70 bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="add-relative-mode-new"
            onClick={() => setMode("new")}
          >
            {t("people.relative.modeNew")}
          </button>
        </div>

        <Show when={mode() === "existing"}>
          <div class="space-y-2">
            <label class="relative block">
              <Search size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                id="relative-search"
                class="input pl-9"
                placeholder={t("people.relative.searchPlaceholder")}
                value={search()}
                onInput={event => setSearch(event.currentTarget.value)}
                data-testid="add-relative-search"
              />
            </label>
            <div class="scroll-thin max-h-52 space-y-1 overflow-y-auto rounded-2xl border border-border p-1.5">
              <Show
                when={options().length}
                fallback={
                  <p
                    class="px-3 py-8 text-center text-xs leading-relaxed text-muted-foreground"
                    data-testid="add-relative-people-empty"
                  >
                    {props.people.length <= 1
                      ? t("people.relative.nobodyElse")
                      : t("people.relative.noMatches")}
                  </p>
                }
              >
                <For each={options()}>
                  {person => (
                    <button
                      type="button"
                      class={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                        selectedId() === person.id ? "bg-accent" : "hover:bg-primary/5"
                      }`}
                      data-testid={`add-relative-person-${person.id}`}
                      onClick={() => setSelectedId(person.id)}
                    >
                      <Avatar name={person.displayName} fileId={person.avatarFileId} size={32} />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-medium">{person.displayName}</span>
                        <Show when={person.birthDate}>
                          <span class="block text-[0.7rem] text-muted-foreground">
                            {t("date.born", {
                              years: formatFuzzyYearRange(person.birthDate, null, locale()),
                            })}
                          </span>
                        </Show>
                      </span>
                    </button>
                  )}
                </For>
              </Show>
            </div>
          </div>
        </Show>

        <Show when={mode() === "new"}>
          <div class="grid gap-3 sm:grid-cols-2">
            <Field label={t("person.field.firstName")} for="relative-first">
              <input
                id="relative-first"
                class="input"
                value={form.firstName}
                onInput={event => setForm("firstName", event.currentTarget.value)}
                required
                data-testid="add-relative-first-name"
              />
            </Field>
            <Field label={t("person.field.lastName")} for="relative-last">
              <input
                id="relative-last"
                class="input"
                value={form.lastName}
                onInput={event => setForm("lastName", event.currentTarget.value)}
                data-testid="add-relative-last-name"
              />
            </Field>
            <Field label={t("person.field.born")} for="relative-birth">
              <FuzzyDateField
                id="relative-birth"
                testId="add-relative-birth-date"
                value={form.birthDate}
                onChange={value => setForm("birthDate", value)}
              />
            </Field>
            <Field label={t("person.field.died")} for="relative-death">
              <FuzzyDateField
                id="relative-death"
                testId="add-relative-death-date"
                value={form.deathDate}
                onChange={value => setForm("deathDate", value)}
              />
            </Field>
          </div>
        </Show>

        <Show when={duplicates().length}>
          <DuplicateWarning
            candidates={duplicates()}
            pending={pending()}
            onCancel={() => setDuplicates([])}
            onUseExisting={candidate => {
              setDuplicates([]);
              setMode("existing");
              setSelectedId(candidate.id);
              setSearch(candidate.displayName);
            }}
            onCreateAnyway={() => {
              setAllowDuplicate(true);
              setDuplicates([]);
              void save(false);
            }}
          />
        </Show>
        <Show when={error()}>
          <p
            class="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
            data-testid="add-relative-error"
          >
            {error()}
          </p>
        </Show>
      </form>
    </Modal>
  );
}

function RelationChoice(props: {
  testId: string;
  active: boolean;
  icon: any;
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-disabled={props.disabled}
      data-testid={props.testId}
      class={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center transition ${
        props.disabled
          ? "cursor-not-allowed border-border bg-muted/40 text-muted-foreground/50"
          : props.active
            ? "border-primary bg-accent text-foreground"
            : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
      }`}
      onClick={() => {
        if (props.disabled) return;
        props.onClick();
      }}
    >
      <span class={props.active && !props.disabled ? "text-primary" : ""}>{props.icon}</span>
      <span class="text-sm font-semibold">{props.label}</span>
      <span class="text-[0.62rem] leading-tight">{props.hint}</span>
    </button>
  );
}
