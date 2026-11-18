import { translate, type Locale, type TranslationKey } from "~/i18n";
import type { ParentType, PartnershipStatus } from "~/lib/research/graph";

export const RESEARCH_VIEWS = [
  { value: "sheet", labelKey: "research.view.sheet.label", descriptionKey: "research.view.sheet.description" },
  { value: "dossier", labelKey: "research.view.dossier.label", descriptionKey: "research.view.dossier.description" },
  { value: "pedigree", labelKey: "research.view.pedigree.label", descriptionKey: "research.view.pedigree.description" },
  { value: "register", labelKey: "research.view.register.label", descriptionKey: "research.view.register.description" },
  { value: "surnames", labelKey: "research.view.surnames.label", descriptionKey: "research.view.surnames.description" },
  { value: "places", labelKey: "research.view.places.label", descriptionKey: "research.view.places.description" },
  { value: "issues", labelKey: "research.view.issues.label", descriptionKey: "research.view.issues.description" },
] as const;

export type ResearchView = (typeof RESEARCH_VIEWS)[number]["value"];

export const DEFAULT_RESEARCH_VIEW: ResearchView = "sheet";

export function isResearchView(value: unknown): value is ResearchView {
  return (
    typeof value === "string" &&
    RESEARCH_VIEWS.some(view => view.value === value)
  );
}

export function researchViewLabelKey(view: ResearchView): TranslationKey {
  return (
    RESEARCH_VIEWS.find(entry => entry.value === view)?.labelKey ??
    "research.view.fallback"
  );
}

export function researchViewDescriptionKey(view: ResearchView): TranslationKey {
  return (
    RESEARCH_VIEWS.find(entry => entry.value === view)?.descriptionKey ??
    "research.view.fallback"
  );
}

export function researchViewLabel(view: ResearchView, locale: Locale = "en") {
  return translate(locale, researchViewLabelKey(view));
}

const PARTNERSHIP_STATUS_KEYS: Record<PartnershipStatus, TranslationKey> = {
  married: "person.partnership.married",
  partnered: "person.partnership.partnered",
  divorced: "person.partnership.divorced",
  separated: "person.partnership.separated",
  widowed: "person.partnership.widowed",
  unknown: "research.partnership.unknown",
};

export function partnershipStatusKey(status: PartnershipStatus): TranslationKey {
  return PARTNERSHIP_STATUS_KEYS[status] ?? "research.partnership.unknown";
}

const PARENT_TYPE_KEYS: Record<ParentType, TranslationKey> = {
  biological: "person.parentType.biological",
  adoptive: "person.parentType.adoptive",
  foster: "person.parentType.foster",
  step: "person.parentType.step",
  unknown: "common.unknown",
};

export function parentTypeKey(parentType: ParentType): TranslationKey {
  return PARENT_TYPE_KEYS[parentType] ?? "common.unknown";
}

export function researchHref(
  treeId: string,
  view: ResearchView,
  personId?: string | null,
) {
  const params = new URLSearchParams({ view });
  if (personId) params.set("person", personId);
  return `/trees/${treeId}/research?${params.toString()}`;
}

/** Stable, readable test ids and anchors for values with no record id. */
export function slugify(value: string, fallback = "item") {
  const slug = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}
