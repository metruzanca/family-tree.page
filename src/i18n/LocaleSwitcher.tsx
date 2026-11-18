import { For, Show } from "solid-js";
import { Check, Languages } from "lucide-solid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cx } from "~/lib/utils";
import { useI18n } from "./LocaleProvider";
import { LOCALES, type Locale } from "./index";

/** Language names stay in their own language, as language pickers usually do. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  it: "Italiano",
};

export function LocaleSwitcher(props: {
  variant?: "icon" | "text";
  class?: string;
}) {
  const { locale, setLocale, t } = useI18n();

  return (
    <DropdownMenu placement="bottom-end">
      <DropdownMenuTrigger
        class={cx(
          "inline-flex items-center justify-center gap-1.5 rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35",
          props.variant === "text"
            ? "h-9 px-3 text-xs font-semibold"
            : "size-9",
          props.class,
        )}
        aria-label={t("common.language")}
        data-testid="locale-switcher"
      >
        <Languages size={17} />
        <Show when={props.variant === "text"}>
          <span>{LOCALE_NAMES[locale()]}</span>
        </Show>
      </DropdownMenuTrigger>
      <DropdownMenuContent class="w-44 rounded-xl p-1.5">
        <For each={LOCALES}>
          {option => (
            <DropdownMenuItem
              class="gap-2 rounded-lg px-3 py-2 text-sm"
              onSelect={() => setLocale(option)}
              data-testid={`locale-option-${option}`}
            >
              <Show when={locale() === option} fallback={<span class="size-4" />}>
                <Check size={16} />
              </Show>
              {LOCALE_NAMES[option]}
            </DropdownMenuItem>
          )}
        </For>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
