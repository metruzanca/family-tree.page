import { Show } from "solid-js";
import { A } from "@solidjs/router";
import type { GraphPerson } from "~/api/people-server";
import { formatFuzzyYearRange } from "~/lib/fuzzy-date";
import { personName } from "~/lib/research/graph";
import { useI18n } from "~/i18n/LocaleProvider";
import { Avatar } from "../ui/Avatar";

export function PersonLine(props: {
  person: GraphPerson;
  href: string;
  note?: string;
  testId?: string;
  compact?: boolean;
}) {
  const { locale } = useI18n();
  const years = () =>
    formatFuzzyYearRange(props.person.birthDate, props.person.deathDate);

  return (
    <A
      href={props.href}
      class="group flex min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1 transition-colors hover:bg-accent/60"
      data-testid={props.testId}
    >
      <Avatar
        name={props.person.displayName}
        fileId={props.person.avatarFileId}
        size={props.compact ? 26 : 32}
      />
      <span class="min-w-0">
        <span class="block truncate text-sm font-medium group-hover:underline">
          {personName(props.person, locale())}
        </span>
        <Show when={props.note || years()}>
          <span class="block truncate text-xs text-muted-foreground">
            {props.note ?? years()}
          </span>
        </Show>
      </span>
    </A>
  );
}
