import { For, type Component } from "solid-js";
import { A } from "@solidjs/router";
import {
  BookOpen,
  GitBranch,
  ListTree,
  MapPin,
  TriangleAlert,
  UserRound,
  Users,
} from "lucide-solid";
import { cx } from "~/lib/utils";
import { useI18n } from "~/i18n/LocaleProvider";
import {
  RESEARCH_VIEWS,
  researchHref,
  researchViewDescriptionKey,
  type ResearchView,
} from "./views";

const ICONS: Record<ResearchView, Component<{ size?: number }>> = {
  sheet: Users,
  dossier: UserRound,
  pedigree: GitBranch,
  register: ListTree,
  surnames: BookOpen,
  places: MapPin,
  issues: TriangleAlert,
};

export function ResearchNav(props: {
  treeId: string;
  view: ResearchView;
  personId: string | null;
}) {
  const { t } = useI18n();
  return (
    <nav
      class="scroll-thin flex gap-1 overflow-x-auto rounded-full border border-border bg-muted/60 p-1"
      aria-label={t("research.nav.aria")}
      data-testid="research-nav"
    >
      <For each={RESEARCH_VIEWS}>
        {item => {
          const Icon = ICONS[item.value];
          const active = () => props.view === item.value;
          return (
            <A
              href={researchHref(props.treeId, item.value, props.personId)}
              class={cx(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                active()
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={active() ? "page" : undefined}
              data-testid={`research-view-tab-${item.value}`}
            >
              <Icon size={15} />
              {t(item.labelKey)}
            </A>
          );
        }}
      </For>
    </nav>
  );
}

export function ResearchViewIntro(props: { view: ResearchView }) {
  const { t } = useI18n();
  return (
    <p class="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="research-view-description">
      {t(researchViewDescriptionKey(props.view))}
    </p>
  );
}
