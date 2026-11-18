import { For, Show } from "solid-js";
import { formatFuzzyYearRange } from "~/lib/fuzzy-date";
import { personName } from "~/lib/research/graph";
import type {
  DescendantEntry,
  DescendantRegister,
  RegisterMode,
} from "~/lib/research/numbering";
import { researchHref } from "./views";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

export function DescendantRegisterView(props: {
  treeId: string;
  register: DescendantRegister;
  mode: RegisterMode;
  onModeChange: (mode: RegisterMode) => void;
}) {
  return (
    <div class="space-y-4" data-testid="research-register">
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <p class="max-w-2xl text-sm text-muted-foreground">
          {props.mode === "register"
            ? "Register system: only the people whose line continues get a number. Children keep lowercase Roman labels in birth order."
            : "NGSQ system: everyone gets a number in reading order, and a plus marks a line that continues."}
        </p>
        <div class="flex gap-1 rounded-full border border-border bg-muted/60 p-1">
          <Button
            type="button"
            size="sm"
            variant={props.mode === "register" ? "default" : "ghost"}
            class="rounded-full"
            onClick={() => props.onModeChange("register")}
            data-testid="research-register-mode-register"
          >
            Register
          </Button>
          <Button
            type="button"
            size="sm"
            variant={props.mode === "ngsq" ? "default" : "ghost"}
            class="rounded-full"
            onClick={() => props.onModeChange("ngsq")}
            data-testid="research-register-mode-ngsq"
          >
            NGSQ
          </Button>
        </div>
      </div>

      <Show when={props.register.truncated}>
        <p class="text-xs text-muted-foreground">
          The list stops after {maxGeneration(props.register.root)} generations.
        </p>
      </Show>

      <section class="rounded-3xl border border-border bg-card p-4 shadow-card">
        <ol class="space-y-1">
          <RegisterNode
            entry={props.register.root}
            treeId={props.treeId}
            mode={props.mode}
          />
        </ol>
      </section>
    </div>
  );
}

function maxGeneration(entry: DescendantEntry): number {
  return entry.children.reduce(
    (deepest, child) => Math.max(deepest, maxGeneration(child)),
    entry.generation,
  );
}

function RegisterNode(props: {
  entry: DescendantEntry;
  treeId: string;
  mode: RegisterMode;
}) {
  const entry = () => props.entry;
  return (
    <li data-testid={`research-register-entry-${entry().person.id}`}>
      <div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-xl px-2 py-1.5 hover:bg-accent/40">
        <Show when={entry().number !== null}>
          <span class="inline-flex min-w-7 justify-end rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">
            {entry().number}
          </span>
        </Show>
        <Show when={entry().number === null}>
          <span class="inline-flex min-w-7 justify-end px-1.5 font-mono text-xs text-muted-foreground">
            {entry().childLabel ?? ""}
          </span>
        </Show>

        <Show when={entry().childLabel && entry().number !== null}>
          <span class="font-mono text-xs text-muted-foreground">{entry().childLabel}</span>
        </Show>

        <a
          href={researchHref(props.treeId, "dossier", entry().person.id)}
          class="text-sm font-semibold hover:underline"
          data-testid={`research-register-person-${entry().person.id}`}
        >
          {personName(entry().person)}
        </a>

        <Show when={props.mode === "ngsq" && entry().hasDescendants}>
          <Badge variant="secondary" aria-label="Line continues">
            +
          </Badge>
        </Show>

        <span class="text-xs text-muted-foreground">
          {formatFuzzyYearRange(entry().person.birthDate, entry().person.deathDate)}
        </span>

        <Show when={entry().person.birthPlace}>
          <span class="text-xs text-muted-foreground">{entry().person.birthPlace}</span>
        </Show>
      </div>

      <Show when={entry().children.length}>
        <ol class="ml-4 space-y-0.5 border-l border-border pl-3">
          <For each={entry().children}>
            {child => (
              <RegisterNode entry={child} treeId={props.treeId} mode={props.mode} />
            )}
          </For>
        </ol>
      </Show>
    </li>
  );
}
