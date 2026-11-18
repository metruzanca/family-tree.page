import { For, createMemo } from "solid-js";
import type { GraphPerson } from "~/api/people-server";
import { personName } from "~/lib/research/graph";
import { useI18n } from "~/i18n/LocaleProvider";

export function PersonPicker(props: {
  people: GraphPerson[];
  personId: string | null;
  onChange: (personId: string) => void;
}) {
  const { t } = useI18n();
  const people = createMemo(() =>
    [...props.people].sort((left, right) =>
      personName(left).localeCompare(personName(right)),
    ),
  );

  return (
    <label class="flex min-w-0 flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
      {t("research.picker.focusPerson")}
      <select
        class="input min-w-[13rem] text-sm normal-case tracking-normal"
        value={props.personId ?? ""}
        onChange={event => {
          if (event.currentTarget.value) props.onChange(event.currentTarget.value);
        }}
        data-testid="research-person-picker"
      >
        <For each={people()}>
          {person => (
            <option
              value={person.id}
              selected={person.id === props.personId}
            >
              {personName(person)}
              {person.birthDate?.start.year ? ` (${person.birthDate.start.year})` : ""}
            </option>
          )}
        </For>
      </select>
    </label>
  );
}
