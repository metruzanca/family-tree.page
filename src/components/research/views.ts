export const RESEARCH_VIEWS = [
  { value: "sheet", label: "Family sheet", description: "One couple and their children" },
  { value: "dossier", label: "Dossier", description: "Everything known about one person" },
  { value: "pedigree", label: "Pedigree", description: "Ancestors with Ahnentafel numbers" },
  { value: "register", label: "Descendants", description: "Register and NGSQ numbering" },
  { value: "surnames", label: "Surnames", description: "Spellings grouped together" },
  { value: "places", label: "Places", description: "Records grouped by place" },
  { value: "issues", label: "Issues", description: "Contradictions and gaps to chase" },
] as const;

export type ResearchView = (typeof RESEARCH_VIEWS)[number]["value"];

export const DEFAULT_RESEARCH_VIEW: ResearchView = "sheet";

export function isResearchView(value: unknown): value is ResearchView {
  return (
    typeof value === "string" &&
    RESEARCH_VIEWS.some(view => view.value === value)
  );
}

export function researchViewLabel(view: ResearchView) {
  return RESEARCH_VIEWS.find(entry => entry.value === view)?.label ?? "Research";
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
