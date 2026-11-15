import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { revalidate } from "@solidjs/router";
import { ArrowDown, ArrowUp, Heart, Search } from "lucide-solid";
import type { GraphPerson } from "~/api/people-server";
import { addRelative } from "~/api/people-server";
import { getMyTrees, getTreeGraph, getTreeOverview } from "~/api";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

type Relation = "parent" | "partner" | "child";

export function AddRelativeDialog(props: {
  open: boolean;
  onClose: () => void;
  treeId: string;
  anchor: GraphPerson | null;
  people: GraphPerson[];
  onAdded?: (personId: string) => void;
}) {
  const toast = useToast();
  const [relation, setRelation] = createSignal<Relation>("parent");
  const [mode, setMode] = createSignal<"existing" | "new">("existing");
  const [search, setSearch] = createSignal("");
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [parentType, setParentType] = createSignal("biological");
  const [status, setStatus] = createSignal("partnered");
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  const [form, setForm] = createStore({
    firstName: "",
    lastName: "",
    nickname: "",
    birthDate: "",
    deathDate: "",
  });

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

  createEffect(() => {
    if (!props.open) return;
    setSearch("");
    setSelectedId(null);
    setError("");
    setMode("existing");
    setRelation("parent");
    setForm({ firstName: "", lastName: "", nickname: "", birthDate: "", deathDate: "" });
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!props.anchor || pending()) return;
    if (mode() === "existing" && !selectedId()) {
      setError("Choose an existing person, or switch to New person.");
      return;
    }
    setPending(true);
    setError("");
    const result = await addRelative({
      mode: mode(),
      treeId: props.treeId,
      anchorPersonId: props.anchor.id,
      relation: relation(),
      personId: selectedId() ?? undefined,
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
      status: status() as "married" | "partnered" | "divorced" | "separated" | "widowed" | "unknown",
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await revalidate([getTreeGraph.key, getTreeOverview.key, getMyTrees.key]);
    toast.show(
      mode() === "new" ? "Person added and connected." : "People connected.",
      "success",
    );
    props.onAdded?.(result.data.personId);
    props.onClose();
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.anchor ? `Connect someone to ${props.anchor.firstName}` : "Add a relative"}
      description="Choose how they are related, then pick an existing person or create a new one."
      footer={
        <>
          <Button variant="ghost" type="button" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" form="relative-form" disabled={pending()}>
            {pending() ? "Connecting…" : "Connect"}
          </Button>
        </>
      }
    >
      <form id="relative-form" class="space-y-5" onSubmit={submit}>
        <div class="grid grid-cols-3 gap-2">
          <RelationChoice
            active={relation() === "parent"}
            icon={<ArrowUp size={17} />}
            label="Parent"
            hint="They came before"
            onClick={() => setRelation("parent")}
          />
          <RelationChoice
            active={relation() === "partner"}
            icon={<Heart size={17} />}
            label="Partner"
            hint="Married or together"
            onClick={() => setRelation("partner")}
          />
          <RelationChoice
            active={relation() === "child"}
            icon={<ArrowDown size={17} />}
            label="Child"
            hint="They came after"
            onClick={() => setRelation("child")}
          />
        </div>

        <Show when={relation() !== "partner"}>
          <Field label="Relationship type" for="parent-type">
            <select
              id="parent-type"
              class="input"
              value={parentType()}
              onChange={event => setParentType(event.currentTarget.value)}
            >
              <option value="biological">Biological</option>
              <option value="adoptive">Adoptive</option>
              <option value="foster">Foster</option>
              <option value="step">Step</option>
              <option value="unknown">Unknown</option>
            </select>
          </Field>
        </Show>

        <Show when={relation() === "partner"}>
          <Field label="Partnership" for="partner-status">
            <select
              id="partner-status"
              class="input"
              value={status()}
              onChange={event => setStatus(event.currentTarget.value)}
            >
              <option value="partnered">Partners</option>
              <option value="married">Married</option>
              <option value="divorced">Divorced</option>
              <option value="separated">Separated</option>
              <option value="widowed">Widowed</option>
              <option value="unknown">Unknown</option>
            </select>
          </Field>
        </Show>

        <div class="flex gap-1 rounded-full border border-line bg-paper p-1 text-sm">
          <button
            type="button"
            class={`flex-1 rounded-full px-3 py-1.5 font-semibold transition ${mode() === "existing" ? "bg-raised text-ink shadow-sm" : "text-muted"}`}
            onClick={() => setMode("existing")}
          >
            Existing person
          </button>
          <button
            type="button"
            class={`flex-1 rounded-full px-3 py-1.5 font-semibold transition ${mode() === "new" ? "bg-raised text-ink shadow-sm" : "text-muted"}`}
            onClick={() => setMode("new")}
          >
            New person
          </button>
        </div>

        <Show when={mode() === "existing"}>
          <div class="space-y-2">
            <label class="relative block">
              <Search size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                class="input pl-9"
                placeholder="Search people already in this tree"
                value={search()}
                onInput={event => setSearch(event.currentTarget.value)}
              />
            </label>
            <div class="scroll-thin max-h-52 space-y-1 overflow-y-auto rounded-2xl border border-line p-1.5">
              <Show
                when={options().length}
                fallback={
                  <p class="px-3 py-8 text-center text-xs leading-relaxed text-muted">
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
                        selectedId() === person.id ? "bg-moss-soft" : "hover:bg-moss/5"
                      }`}
                      onClick={() => setSelectedId(person.id)}
                    >
                      <Avatar name={person.displayName} fileId={person.avatarFileId} size={32} />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-medium">{person.displayName}</span>
                        <Show when={person.birthDate}>
                          <span class="block text-[0.7rem] text-muted">
                            Born {person.birthDate!.slice(0, 4)}
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
              />
            </Field>
            <Field label="Last name" for="relative-last">
              <input
                id="relative-last"
                class="input"
                value={form.lastName}
                onInput={event => setForm("lastName", event.currentTarget.value)}
              />
            </Field>
            <Field label="Born" for="relative-birth">
              <input
                id="relative-birth"
                type="date"
                class="input"
                value={form.birthDate}
                onInput={event => setForm("birthDate", event.currentTarget.value)}
              />
            </Field>
            <Field label="Died" for="relative-death">
              <input
                id="relative-death"
                type="date"
                class="input"
                value={form.deathDate}
                onInput={event => setForm("deathDate", event.currentTarget.value)}
              />
            </Field>
          </div>
        </Show>

        <Show when={error()}>
          <p class="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error()}
          </p>
        </Show>
      </form>
    </Modal>
  );
}

function RelationChoice(props: {
  active: boolean;
  icon: any;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      class={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center transition ${
        props.active
          ? "border-moss bg-moss-soft text-ink"
          : "border-line bg-paper text-muted hover:border-moss/30 hover:text-ink"
      }`}
      onClick={props.onClick}
    >
      <span class={props.active ? "text-moss" : ""}>{props.icon}</span>
      <span class="text-sm font-semibold">{props.label}</span>
      <span class="text-[0.62rem] leading-tight">{props.hint}</span>
    </button>
  );
}
