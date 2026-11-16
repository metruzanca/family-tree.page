export const PERSON_EVENT_KINDS = [
  "residence",
  "occupation",
  "education",
  "military",
  "immigration",
  "emigration",
  "burial",
  "other",
] as const;

export type PersonEventKind = (typeof PERSON_EVENT_KINDS)[number];

export const PERSON_EVENT_OPTIONS: { value: PersonEventKind; label: string }[] = [
  { value: "residence", label: "Residence" },
  { value: "occupation", label: "Occupation" },
  { value: "education", label: "Education" },
  { value: "military", label: "Military service" },
  { value: "immigration", label: "Immigration" },
  { value: "emigration", label: "Emigration" },
  { value: "burial", label: "Burial" },
  { value: "other", label: "Other" },
];

export function personEventKindLabel(kind: PersonEventKind) {
  return PERSON_EVENT_OPTIONS.find(option => option.value === kind)?.label ?? "Event";
}
