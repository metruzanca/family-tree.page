export const PERSON_SEX_OPTIONS = [
  {
    value: "female",
    label: "Female",
    description: "Used for mother labels and GEDCOM SEX F.",
    gedcom: "F",
  },
  {
    value: "male",
    label: "Male",
    description: "Used for father labels and GEDCOM SEX M.",
    gedcom: "M",
  },
  {
    value: "other",
    label: "Other",
    description: "Exports as GEDCOM SEX U and neutral parent labels.",
    gedcom: "U",
  },
  {
    value: "unknown",
    label: "Unknown",
    description: "The default. Exports as GEDCOM SEX U.",
    gedcom: "U",
  },
] as const;

export type PersonSex = (typeof PERSON_SEX_OPTIONS)[number]["value"];

export const PERSON_SEX_VALUES = PERSON_SEX_OPTIONS.map(
  option => option.value,
) as [PersonSex, ...PersonSex[]];

export function isPersonSex(value: unknown): value is PersonSex {
  return (
    typeof value === "string" &&
    PERSON_SEX_OPTIONS.some(option => option.value === value)
  );
}

export function personSexLabel(sex: PersonSex) {
  return PERSON_SEX_OPTIONS.find(option => option.value === sex)?.label ?? "Unknown";
}

/** GEDCOM 5.5.1 only has M, F, and U. */
export function gedcomSex(sex: PersonSex) {
  return PERSON_SEX_OPTIONS.find(option => option.value === sex)?.gedcom ?? "U";
}
