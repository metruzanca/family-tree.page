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

type Relation = "parent" | "partner" | "child";

const parentTypeOptions = [
  { value: "biological", label: "Biological" },
  { value: "adoptive", label: "Adoptive" },
  { value: "foster", label: "Foster" },
  { value: "step", label: "Step" },
  { value: "unknown", label: "Unknown" },
];

const statusOptions = [
  { value: "partnered", label: "Partners" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "separated", label: "Separated" },
  { value: "widowed", label: "Widowed" },
  { value: "unknown", label: "Unknown" },
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
      { value: "none", label: "No other parent" },
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
      setError("Choose an existing person, or switch to New person.");
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
                birthDate: form.birthDate,
                deathDate: form.deathDate,
                maidenName: "",
                birthPlace: "",
                deathPlace: "",
                bio: "",
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
      mode() === "new" ? "Person added and connected." : "People connected.",
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
      title={props.anchor ? `Connect someone to ${props.anchor.firstName}` : "Add a relative"}
      description="Choose how they are related, then pick an existing person or create a new one."
      testId="add-relative-dialog"
      footer={
        <>
          <Button
            variant="ghost"
            type="button"
            onClick={props.onClose}
            data-testid="add-relative-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="secondary"
            type="submit"
            form="relative-form"
            data-keep-open="true"
            disabled={pending()}
            data-testid="add-relative-submit-more"
          >
            Connect and add more
          </Button>
          <Button
            type="submit"
            form="relative-form"
            disabled={pending()}
            data-testid="add-relative-submit"
          >
            {pending() ? "Connecting…" : "Connect"}
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
            label="Parent"
            hint={parentDisabled() ? "Already has two parents" : "They came before"}
            onClick={() => setRelation("parent")}
          />
          <RelationChoice
            testId="add-relative-relation-partner"
            active={relation() === "partner"}
            icon={<Heart size={17} />}
            label="Partner"
            hint="Married or together"
            onClick={() => setRelation("partner")}
          />
          <RelationChoice
            testId="add-relative-relation-child"
            active={relation() === "child"}
            icon={<ArrowDown size={17} />}
            label="Child"
            hint="They came after"
            onClick={() => setRelation("child")}
          />
        </div>

        <Show when={relation() !== "partner"}>
          <Field label="Relationship type" for="parent-type">
            <Select
              options={parentTypeOptions}
              optionValue="value"
              optionTextValue="label"
              value={parentTypeOptions.find(option => option.value === parentType())}
              onChange={option => option && setParentType(option.value)}
              itemComponent={itemProps => (
                <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
              )}
            >
              <SelectTrigger
                id="parent-type"
                class="w-full"
                aria-label="Relationship type"
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
            label="Other parent"
            for="other-parent"
            hint="Optional. Connects this child to both parents in one step."
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
                aria-label="Other parent"
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
          <Field label="Partnership" for="partner-status">
            <Select
              options={statusOptions}
              optionValue="value"
              optionTextValue="label"
              value={statusOptions.find(option => option.value === status())}
              onChange={option => option && setStatus(option.value)}
              itemComponent={itemProps => (
                <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
              )}
            >
              <SelectTrigger
                id="partner-status"
                class="w-full"
                aria-label="Partnership"
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
            Existing person
          </button>
          <button
            type="button"
            aria-pressed={mode() === "new"}
            class={`flex-1 rounded-full px-3 py-1.5 font-semibold transition ${mode() === "new" ? "border border-border/70 bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="add-relative-mode-new"
            onClick={() => setMode("new")}
          >
            New person
          </button>
        </div>

        <Show when={mode() === "existing"}>
          <div class="space-y-2">
            <label class="relative block">
              <Search size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                id="relative-search"
                class="input pl-9"
                placeholder="Search people already in this tree"
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
                      ? "There is nobody else in this tree yet. Switch to New person."
                      : "No matching people."}
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
                            Born {formatFuzzyYearRange(person.birthDate, null)}
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
            <Field label="First name" for="relative-first">
              <input
                id="relative-first"
                class="input"
                value={form.firstName}
                onInput={event => setForm("firstName", event.currentTarget.value)}
                required
                data-testid="add-relative-first-name"
              />
            </Field>
            <Field label="Last name" for="relative-last">
              <input
                id="relative-last"
                class="input"
                value={form.lastName}
                onInput={event => setForm("lastName", event.currentTarget.value)}
                data-testid="add-relative-last-name"
              />
            </Field>
            <Field label="Born" for="relative-birth">
              <FuzzyDateField
                id="relative-birth"
                testId="add-relative-birth-date"
                value={form.birthDate}
                onChange={value => setForm("birthDate", value)}
              />
            </Field>
            <Field label="Died" for="relative-death">
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
