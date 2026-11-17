import { For, Show } from "solid-js";
import type { DuplicateCandidate } from "~/lib/duplicates";
import { formatFuzzyYearRange } from "~/lib/fuzzy-date";
import { Button } from "../ui/button";

export function DuplicateWarning(props: {
  candidates: DuplicateCandidate[];
  onCancel: () => void;
  onCreateAnyway: () => void;
  onUseExisting?: (candidate: DuplicateCandidate) => void;
  pending?: boolean;
}) {
  return (
    <div
      class="rounded-xl border border-warning/35 bg-warning/10 px-3.5 py-3"
      data-testid="duplicate-warning"
    >
      <p class="text-sm font-semibold">Is this someone who is already here?</p>
      <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
        We found a similar person. Check before adding a duplicate.
      </p>
      <ul class="mt-3 space-y-2">
        <For each={props.candidates}>
          {candidate => (
            <li
              class="rounded-xl border border-warning/25 bg-card/70 px-3 py-2"
              data-testid={`duplicate-warning-candidate-${candidate.id}`}
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">{candidate.displayName}</p>
                  <Show when={formatFuzzyYearRange(candidate.birthDate, candidate.deathDate)}>
                    <p class="text-xs text-muted-foreground">
                      {formatFuzzyYearRange(candidate.birthDate, candidate.deathDate)}
                    </p>
                  </Show>
                  <p class="mt-0.5 text-[0.66rem] uppercase tracking-wide text-muted-foreground">
                    {candidate.reasons.join(" · ")}
                  </p>
                </div>
                <Show when={props.onUseExisting}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    data-testid={`duplicate-warning-use-${candidate.id}`}
                    onClick={() => props.onUseExisting?.(candidate)}
                  >
                    Use this person
                  </Button>
                </Show>
              </div>
            </li>
          )}
        </For>
      </ul>
      <div class="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={props.onCancel}
          data-testid="duplicate-warning-back"
        >
          Go back
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={props.pending}
          onClick={props.onCreateAnyway}
          data-testid="duplicate-warning-add-anyway"
        >
          Add anyway
        </Button>
      </div>
    </div>
  );
}
