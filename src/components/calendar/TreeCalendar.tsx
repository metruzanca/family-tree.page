import { For, Show, createMemo, createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { Cake, ChevronLeft, ChevronRight, Flower2, Sparkles } from "lucide-solid";
import type { GraphPerson } from "~/api/people-server";
import {
  calendarEvents,
  eventsOnDay,
  formatMonthDay,
  monthGrid,
  partsFromDate,
  sameDate,
  upcomingBirthdays,
  type CalendarEvent,
  type DateParts,
} from "~/lib/calendar";
import { formatFuzzyYearRange } from "~/lib/fuzzy-date";
import { localeTag } from "~/i18n";
import type { TranslationKey, TranslationParams } from "~/i18n";
import { useI18n } from "~/i18n/LocaleProvider";
import { cx } from "~/lib/utils";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/button";

type TreeCalendarProps = {
  treeId: string;
  people: GraphPerson[];
};

export function TreeCalendar(props: TreeCalendarProps) {
  const { t, locale } = useI18n();
  const today = partsFromDate(new Date());
  const [view, setView] = createSignal({ year: today.year, month: today.month });
  const [selected, setSelected] = createSignal<DateParts | null>(null);

  const events = createMemo(() => calendarEvents(props.people, view().year));
  const grid = createMemo(() => monthGrid(view().year, view().month));
  const upcoming = createMemo(() => upcomingBirthdays(props.people, today, 10));
  const livingCount = createMemo(() => props.people.filter(person => !person.deathDate).length);
  const monthBirthdays = createMemo(
    () =>
      events().filter(event => event.kind === "birth" && event.date.month === view().month)
        .length,
  );

  const agendaDay = createMemo<DateParts>(() => {
    const chosen = selected();
    if (chosen) return chosen;
    if (view().year === today.year && view().month === today.month) return today;
    return { year: view().year, month: view().month, day: 1 };
  });
  const agendaEvents = createMemo(() => eventsOnDay(events(), agendaDay()));

  function shiftMonth(delta: number) {
    const date = new Date(view().year, view().month + delta, 1);
    setView({ year: date.getFullYear(), month: date.getMonth() });
    setSelected(null);
  }

  function jumpToToday() {
    setView({ year: today.year, month: today.month });
    setSelected(today);
  }

  const monthLabel = createMemo(() =>
    new Intl.DateTimeFormat(localeTag(locale()), { month: "long", year: "numeric" }).format(
      new Date(view().year, view().month, 1),
    ),
  );

  const weekdays = createMemo(() => {
    const formatter = new Intl.DateTimeFormat(localeTag(locale()), {
      weekday: "short",
    });
    // 1 January 2024 was a Monday, so the week starts there.
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(2024, 0, 1 + index)),
    );
  });

  return (
    <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <section class="min-w-0 rounded-3xl border border-border bg-card shadow-card">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <div>
            <h2 class="font-display text-2xl tracking-tight">{monthLabel()}</h2>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {t("tree.calendar.living", { count: livingCount() })}
              <Show when={monthBirthdays()}>
                {" "}
                · {t("tree.calendar.birthdaysThisMonth", { count: monthBirthdays() })}
              </Show>
            </p>
          </div>
          <div class="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("tree.calendar.previousMonth")}
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={jumpToToday}>
              {t("tree.calendar.today")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("tree.calendar.nextMonth")}
              onClick={() => shiftMonth(1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>

        <div class="grid grid-cols-7 border-b border-border bg-muted/40">
          <For each={weekdays()}>
            {day => (
              <div class="px-1 py-2 text-center text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {day}
              </div>
            )}
          </For>
        </div>

        <div class="grid grid-cols-7">
          <For each={grid()}>
            {cell => {
              const dayEvents = () => eventsOnDay(events(), cell.date);
              const isToday = () => sameDate(cell.date, today);
              const isSelected = () => sameDate(cell.date, agendaDay());
              return (
                <div
                  class={cx(
                    "relative flex min-h-14 cursor-pointer flex-col gap-1 border-b border-r border-border/70 p-1.5 text-left align-top transition last:border-r-0 sm:min-h-24 sm:p-2",
                    cell.inMonth
                      ? "bg-card hover:bg-accent/40"
                      : "bg-muted/25 text-muted-foreground hover:bg-accent/20",
                    isSelected() && "ring-2 ring-inset ring-primary/45",
                  )}
                  onClick={() => setSelected(cell.date)}
                >
                  <button
                    type="button"
                    class={cx(
                      "grid size-6 place-items-center rounded-full text-xs font-semibold",
                      isToday()
                        ? "bg-primary text-primary-foreground"
                        : cell.inMonth
                          ? "text-foreground"
                          : "text-muted-foreground",
                    )}
                    aria-label={t("tree.calendar.selectDay", {
                      date: formatMonthDay(cell.date, locale()),
                    })}
                    onClick={event => {
                      event.stopPropagation();
                      setSelected(cell.date);
                    }}
                  >
                    {cell.date.day}
                  </button>

                  <span class="hidden flex-1 flex-col gap-1 sm:flex">
                    <For each={dayEvents().slice(0, 2)}>
                      {event => (
                        <EventChip event={event} treeId={props.treeId} compact />
                      )}
                    </For>
                    <Show when={dayEvents().length > 2}>
                      <span class="pl-1 text-[0.62rem] font-medium text-muted-foreground">
                        {t("tree.calendar.more", { count: dayEvents().length - 2 })}
                      </span>
                    </Show>
                  </span>

                  <span class="mt-auto flex items-center gap-0.5 sm:hidden">
                    <For each={dayEvents().slice(0, 4)}>
                      {event => (
                        <span
                          class={cx(
                            "size-1.5 rounded-full",
                            event.kind === "death"
                              ? "bg-destructive"
                              : event.person.deathDate
                                ? "bg-muted-foreground/60"
                                : "bg-warning",
                          )}
                        />
                      )}
                    </For>
                  </span>
                </div>
              );
            }}
          </For>
        </div>

        <div class="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5 text-[0.65rem] text-muted-foreground sm:px-5">
          <span class="flex items-center gap-1.5">
            <span class="size-2 rounded-full bg-warning" />{" "}
            {t("tree.calendar.legend.living")}
          </span>
          <span class="flex items-center gap-1.5">
            <span class="size-2 rounded-full bg-muted-foreground/60" />{" "}
            {t("tree.calendar.legend.remembrance")}
          </span>
          <span class="flex items-center gap-1.5">
            <span class="size-2 rounded-full bg-destructive" />{" "}
            {t("tree.calendar.legend.death")}
          </span>
        </div>
      </section>

      <div class="grid gap-5">
        <section class="rounded-3xl border border-border bg-card p-4 shadow-card sm:p-5">
          <div class="flex items-center gap-2">
            <span class="grid size-8 place-items-center rounded-xl bg-accent text-accent-foreground">
              <Cake size={16} />
            </span>
            <div>
              <h2 class="font-display text-xl tracking-tight">
                {t("tree.calendar.upcoming.title")}
              </h2>
              <p class="text-[0.68rem] text-muted-foreground">
                {t("tree.calendar.upcoming.subtitle")}
              </p>
            </div>
          </div>

          <Show
            when={upcoming().length}
            fallback={
              <p class="mt-4 rounded-2xl border border-dashed border-border px-3 py-5 text-center text-xs leading-relaxed text-muted-foreground">
                {t("tree.calendar.upcoming.empty")}
              </p>
            }
          >
            <ul class="mt-3 divide-y divide-border">
              <For each={upcoming()}>
                {entry => (
                  <li>
                    <A
                      href={`/trees/${props.treeId}?person=${entry.person.id}`}
                      class="flex items-center gap-3 py-2.5 transition hover:text-primary"
                    >
                      <Avatar
                        name={entry.person.displayName}
                        fileId={entry.person.avatarFileId}
                        size={34}
                      />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-semibold">
                          {entry.person.displayName}
                        </span>
                        <span class="block text-xs text-muted-foreground">
                          {formatMonthDay(entry.date, locale())}
                          {entry.age === null
                            ? ` · ${t("tree.calendar.birthday")}`
                            : ` · ${t("tree.calendar.turns", { age: entry.age })}`}
                        </span>
                      </span>
                      <span class="shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-[0.65rem] font-semibold text-warning">
                        {relativeDay(entry.daysAway, t)}
                      </span>
                    </A>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>

        <section class="rounded-3xl border border-border bg-card p-4 shadow-card sm:p-5">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-display text-xl tracking-tight">
              {formatMonthDay(agendaDay(), locale())}
            </h2>
            <span class="text-[0.68rem] font-medium text-muted-foreground">
              {t("tree.calendar.eventCount", { count: agendaEvents().length })}
            </span>
          </div>
          <Show
            when={agendaEvents().length}
            fallback={
              <p class="mt-3 rounded-2xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                {t("tree.calendar.emptyDay")}
              </p>
            }
          >
            <ul class="mt-2 space-y-1.5">
              <For each={agendaEvents()}>
                {event => <EventChip event={event} treeId={props.treeId} />}
              </For>
            </ul>
          </Show>
        </section>

        <Show when={props.people.length === 0}>
          <div class="rounded-3xl border border-dashed border-border p-6 text-center">
            <Sparkles class="mx-auto text-muted-foreground" />
            <p class="mt-2 text-sm text-muted-foreground">
              {t("tree.calendar.noPeople")}
            </p>
          </div>
        </Show>
      </div>
    </div>
  );
}

function EventChip(props: { event: CalendarEvent; treeId: string; compact?: boolean }) {
  const { t, locale } = useI18n();
  const living = () => !props.event.person.deathDate;
  const isDeath = () => props.event.kind === "death";
  const color = () =>
    isDeath()
      ? "border-destructive/20 bg-destructive/10 text-destructive"
      : living()
        ? "border-warning/20 bg-warning/10 text-warning"
        : "border-border bg-muted/60 text-muted-foreground";

  const detail = () => {
    if (isDeath()) {
      return t("tree.calendar.event.died", {
        years: formatFuzzyYearRange(props.event.person.deathDate, null, locale()),
      });
    }
    if (!living()) {
      return t("tree.calendar.event.born", {
        years: formatFuzzyYearRange(props.event.person.birthDate, null, locale()),
      });
    }
    return props.event.years === null
      ? t("tree.calendar.event.birthday")
      : t("tree.calendar.event.turns", { years: props.event.years });
  };

  return (
    <A
      href={`/trees/${props.treeId}?person=${props.event.person.id}`}
      class={cx(
        "flex min-w-0 items-center gap-1.5 rounded-lg border px-1.5 py-1 text-[0.68rem] font-medium transition hover:brightness-95",
        color(),
        props.compact && "block truncate px-1 py-0.5 text-[0.62rem]",
      )}
      title={t("tree.calendar.event.title", {
        name: props.event.person.displayName,
        detail: detail(),
      })}
    >
      <Show
        when={!props.compact}
        fallback={<span class="block truncate">{props.event.person.displayName}</span>}
      >
        <Show when={isDeath()} fallback={<Cake size={12} class="shrink-0" />}>
          <Flower2 size={12} class="shrink-0" />
        </Show>
        <span class="min-w-0 flex-1 truncate">{props.event.person.displayName}</span>
        <span class="shrink-0 text-[0.62rem] opacity-80">{detail()}</span>
      </Show>
    </A>
  );
}

function relativeDay(
  daysAway: number,
  t: (key: TranslationKey, params?: TranslationParams) => string,
) {
  if (daysAway <= 0) return t("tree.calendar.relative.today");
  if (daysAway === 1) return t("tree.calendar.relative.tomorrow");
  return t("tree.calendar.inDays", { count: daysAway });
}
