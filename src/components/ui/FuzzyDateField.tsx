import { For, Show, createMemo } from "solid-js";
import {
  daysInMonth,
  emptyPartialDate,
  formatFuzzyDate,
  isValidFuzzyDate,
  type FuzzyDate,
  type FuzzyDateQualifier,
  type PartialDate,
} from "~/lib/fuzzy-date";
import { useI18n } from "~/i18n/LocaleProvider";
import { localeTag, type TranslationKey } from "~/i18n";

const qualifierOptions: { value: FuzzyDateQualifier; labelKey: TranslationKey }[] = [
  { value: "exact", labelKey: "date.qualifier.exact" },
  { value: "about", labelKey: "date.qualifier.about" },
  { value: "before", labelKey: "date.qualifier.before" },
  { value: "after", labelKey: "date.qualifier.after" },
  { value: "between", labelKey: "date.qualifier.between" },
  { value: "unknown", labelKey: "date.qualifier.unknown" },
];

type FuzzyDateFieldProps = {
  value: FuzzyDate | null;
  onChange: (value: FuzzyDate | null) => void;
  id?: string;
  testId?: string;
  compact?: boolean;
  disabled?: boolean;
};

export function FuzzyDateField(props: FuzzyDateFieldProps) {
  const { t, locale } = useI18n();
  const value = () => props.value ?? { start: emptyPartialDate(), qualifier: "exact" as const };
  const qualifier = () => value().qualifier;
  const start = () => value().start;
  const end = () => value().end ?? emptyPartialDate();

  const preview = createMemo(() => {
    const current = props.value;
    if (!current) return "";
    return formatFuzzyDate(current, { locale: locale() });
  });

  const invalid = createMemo(() => Boolean(props.value) && !isValidFuzzyDate(props.value!));

  function emit(next: Partial<Pick<FuzzyDate, "start" | "end" | "qualifier">>) {
    const merged: FuzzyDate = {
      start: next.start ?? start(),
      end: next.end !== undefined ? next.end : qualifier() === "between" ? end() : null,
      qualifier: next.qualifier ?? qualifier(),
    };

    if (merged.qualifier !== "between") merged.end = null;
    if (merged.qualifier === "between" && !merged.end) merged.end = emptyPartialDate();

    if (
      merged.qualifier === "exact" &&
      merged.start.year === null &&
      merged.start.month === null &&
      merged.start.day === null
    ) {
      props.onChange(null);
      return;
    }

    props.onChange(merged);
  }

  function changeQualifier(next: FuzzyDateQualifier) {
    if (next === "unknown") {
      props.onChange({ start: emptyPartialDate(), qualifier: "unknown" });
      return;
    }
    emit({
      qualifier: next,
      end: next === "between" ? (props.value?.end ?? emptyPartialDate()) : null,
      start: props.value?.start ?? emptyPartialDate(),
    });
  }

  function updatePart(target: "start" | "end", field: keyof PartialDate, raw: string) {
    const current = target === "start" ? start() : end();
    let next: PartialDate = { ...current };

    if (field === "month") {
      next.month = raw ? Number(raw) : null;
      if (next.month === null) next.day = null;
    } else if (field === "day") {
      next.day = raw ? Number(raw) : null;
    } else {
      next.year = raw ? Number(raw) : null;
    }

    if (field === "year" && next.year === null && next.month === null) {
      next.day = null;
    }

    emit(target === "start" ? { start: next } : { end: next });
  }

  return (
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <select
          class={`input ${props.compact ? "!py-1 text-xs" : ""}`}
          value={qualifier()}
          disabled={props.disabled}
          aria-label={t("date.type")}
          data-testid={props.testId ? `${props.testId}-qualifier` : undefined}
          onChange={event =>
            changeQualifier(event.currentTarget.value as FuzzyDateQualifier)
          }
        >
          <For each={qualifierOptions}>
            {option => <option value={option.value}>{t(option.labelKey)}</option>}
          </For>
        </select>
      </div>

      <Show when={qualifier() !== "unknown"}>
        <DatePartsInputs
          id={props.id}
          testId={props.testId}
          parts={start()}
          compact={props.compact}
          disabled={props.disabled}
          onChange={(field, raw) => updatePart("start", field, raw)}
        />

        <Show when={qualifier() === "between"}>
          <div class="flex items-center gap-2">
            <span class="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("date.to")}
            </span>
            <span class="h-px flex-1 bg-border" />
          </div>
          <DatePartsInputs
            testId={props.testId ? `${props.testId}-end` : undefined}
            parts={end()}
            compact={props.compact}
            disabled={props.disabled}
            onChange={(field, raw) => updatePart("end", field, raw)}
          />
        </Show>
      </Show>

      <Show when={preview()}>
        <p
          class="text-xs leading-snug text-muted-foreground"
          data-testid={props.testId ? `${props.testId}-preview` : undefined}
        >
          {preview()}
        </p>
      </Show>

      <Show when={invalid()}>
        <p class="text-xs text-destructive">{t("date.invalid")}</p>
      </Show>
    </div>
  );
}

function DatePartsInputs(props: {
  parts: PartialDate;
  id?: string;
  testId?: string;
  compact?: boolean;
  disabled?: boolean;
  onChange: (field: keyof PartialDate, raw: string) => void;
}) {
  const { t, locale } = useI18n();
  const monthOptions = createMemo(() =>
    Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(2000, index, 1));
      return new Intl.DateTimeFormat(localeTag(locale()), {
        month: "long",
        timeZone: "UTC",
      }).format(date);
    }),
  );
  const inputClass = () => `input min-w-0 ${props.compact ? "!py-1 text-xs" : ""}`;
  const maxDay = () =>
    props.parts.month ? daysInMonth(props.parts.year, props.parts.month) : 31;

  return (
    <div class="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.8fr)] gap-2">
      <input
        id={props.id}
        type="number"
        class={inputClass()}
        placeholder={t("date.year")}
        min={1}
        max={9999}
        inputmode="numeric"
        value={props.parts.year ?? ""}
        disabled={props.disabled}
        aria-label={t("date.year")}
        data-testid={props.testId}
        onInput={event => props.onChange("year", event.currentTarget.value)}
      />
      <select
        class={inputClass()}
        value={props.parts.month ?? ""}
        disabled={props.disabled}
        aria-label={t("date.month")}
        data-testid={props.testId ? `${props.testId}-month` : undefined}
        onChange={event => props.onChange("month", event.currentTarget.value)}
      >
        <option value="">{t("date.month")}</option>
        <For each={monthOptions()}>
          {(month, index) => <option value={index() + 1}>{month}</option>}
        </For>
      </select>
      <input
        type="number"
        class={inputClass()}
        placeholder={t("date.day")}
        min={1}
        max={maxDay()}
        inputmode="numeric"
        value={props.parts.day ?? ""}
        disabled={props.disabled || props.parts.month === null}
        aria-label={t("date.day")}
        data-testid={props.testId ? `${props.testId}-day` : undefined}
        onInput={event => props.onChange("day", event.currentTarget.value)}
      />
    </div>
  );
}
