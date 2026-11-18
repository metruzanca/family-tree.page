import { z } from "zod";
import { API_SCOPE_VALUES } from "../lib/api";
import { PERSON_SEX_VALUES } from "../lib/person-sex";
import { MAX_GEDCOM_CHARS, MAX_IMPORT_PEOPLE } from "../lib/gedcom-import";
import {
  isValidFuzzyDate,
  isValidPartialDate,
  type FuzzyDate,
} from "../lib/fuzzy-date";
import {
  canBeHomeLink,
  MAX_PERSON_LINK_URL_LENGTH,
  MAX_PERSON_LINKS,
  normalizePersonLinkUrl,
} from "../lib/person-links";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform(value => (value ? value : null));

const partialDateSchema = z
  .object({
    year: z.number().int().min(1, "validation.yearRange").max(9999).nullable().default(null),
    month: z.number().int().min(1, "validation.monthRange").max(12).nullable().default(null),
    day: z.number().int().min(1, "validation.dayRange").max(31).nullable().default(null),
  })
  .superRefine((value, context) => {
    if (!isValidPartialDate(value)) {
      context.addIssue({
        code: "custom",
        message: "validation.dateNotExist",
      });
    }
  });

export const fuzzyDateSchema = z
  .object({
    start: partialDateSchema,
    end: partialDateSchema.nullable().optional(),
    qualifier: z.enum(["exact", "about", "before", "after", "between", "unknown"]),
  })
  .superRefine((value, context) => {
    if (value.qualifier === "between" && !value.end) {
      context.addIssue({
        code: "custom",
        path: ["end"],
        message: "validation.dateEndRequired",
      });
    }
    if (!isValidFuzzyDate(value as FuzzyDate)) {
      context.addIssue({
        code: "custom",
        message: "validation.dateInvalid",
      });
    }
  })
  .transform(
    (value): FuzzyDate => ({
      start: value.start,
      end: value.qualifier === "between" ? (value.end ?? null) : null,
      qualifier: value.qualifier,
    }),
  );

const optionalFuzzyDate = fuzzyDateSchema
  .nullable()
  .optional()
  .transform(value => value ?? null);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "validation.emailRequired")
  .max(254, "validation.emailTooLong")
  .email("validation.emailInvalid");

export const passwordSchema = z
  .string()
  .min(10, "validation.passwordTooShort")
  .max(200, "validation.passwordTooLong");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "validation.nameRequired")
  .max(80, "validation.nameTooLong");

export const registerSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  redirectTo: z.string().optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "validation.passwordRequired").max(200),
  redirectTo: z.string().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "validation.currentPasswordRequired"),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema,
});

export const emailChangeSchema = z.object({
  newEmail: emailSchema,
  currentPassword: z.string().min(1, "validation.currentPasswordRequired").max(200),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "validation.passwordRequired").max(200),
  confirmation: z.string().trim().min(1, "validation.confirmEmailRequired").max(254),
});

export const updateNotificationSettingsSchema = z.object({
  notifyBirthdayWeekBefore: z.boolean(),
  notifyBirthdayDayBefore: z.boolean(),
  notifyBirthdayDayOf: z.boolean(),
});

export const treeSchema = z.object({
  name: z.string().trim().min(1, "validation.treeNameRequired").max(80, "validation.nameTooLong"),
  description: z
    .string()
    .trim()
    .max(500, "validation.descriptionTooLong")
    .optional()
    .nullable()
    .transform(value => (value ? value : null)),
});

export const treeRoleSchema = z.enum(["owner", "editor", "viewer"]);

export const inviteSchema = z.object({
  treeId: z.string().uuid(),
  role: z.enum(["owner", "editor", "viewer"]),
  expiresInDays: z.coerce.number().int().min(1).max(30).default(7),
});

export const inviteEmailSchema = emailSchema;

export const importGedcomSchema = z.object({
  treeName: z
    .string()
    .trim()
    .min(1, "validation.importTreeNameRequired")
    .max(80, "validation.nameTooLong"),
  fileName: z
    .string()
    .trim()
    .max(255)
    .optional()
    .nullable()
    .transform(value => value || null),
  text: z
    .string()
    .min(1, "validation.gedcomRequired")
    .max(MAX_GEDCOM_CHARS, "validation.gedcomTooLarge"),
});

export const gedcomImportDecisionSchema = z.object({
  xref: z.string().trim().min(1).max(120),
  action: z.enum(["create", "merge", "skip"]),
  personId: z.string().uuid().nullable().optional(),
});

export const applyGedcomImportSchema = z.object({
  treeId: z.string().uuid(),
  fileName: z
    .string()
    .trim()
    .max(255)
    .optional()
    .nullable()
    .transform(value => value || null),
  text: z
    .string()
    .min(1, "validation.gedcomRequired")
    .max(MAX_GEDCOM_CHARS, "validation.gedcomTooLarge"),
  decisions: z
    .array(gedcomImportDecisionSchema)
    .min(1, "validation.importDecisionRequired")
    .max(MAX_IMPORT_PEOPLE),
});

export const apiTokenSchema = z.object({
  treeId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(1, "validation.tokenNameRequired")
    .max(80, "validation.nameTooLong"),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
  scopes: z
    .array(z.enum(API_SCOPE_VALUES))
    .min(1, "tree.settings.api.scopeRequired"),
});

export const apiTokenRevokeSchema = z.object({
  treeId: z.string().uuid(),
  tokenId: z.string().uuid(),
});

export const shareLinkSchema = z.object({
  treeId: z.string().uuid(),
  label: z
    .string()
    .trim()
    .max(80, "validation.labelTooLong")
    .optional()
    .nullable()
    .transform(value => value || "Shared tree"),
  livingVisibility: z.enum(["hidden", "name", "full"]).default("name"),
  includeMedia: z.boolean().default(false),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "validation.resetLinkInvalid").max(200),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine(values => values.password === values.confirmPassword, {
    message: "validation.passwordMismatch",
    path: ["confirmPassword"],
  });

const optionalContactEmail = z
  .string()
  .trim()
  .max(254, "validation.emailTooLong")
  .optional()
  .nullable()
  .transform(value => (value ? value.toLowerCase() : null))
  .refine(value => value === null || emailSchema.safeParse(value).success, {
    message: "validation.emailInvalid",
  });

const optionalContactPhone = z
  .string()
  .trim()
  .max(50, "validation.phoneTooLong")
  .optional()
  .nullable()
  .transform(value => (value ? value : null));

const personLinkSchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1, "validation.linkRequired")
      .max(MAX_PERSON_LINK_URL_LENGTH, "validation.linkTooLong")
      .transform(value => normalizePersonLinkUrl(value) ?? value),
    isHome: z.boolean().optional().default(false),
  })
  .superRefine((link, context) => {
    if (!normalizePersonLinkUrl(link.url)) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "validation.linkInvalid",
      });
      return;
    }
    if (link.isHome && !canBeHomeLink(link.url)) {
      context.addIssue({
        code: "custom",
        path: ["isHome"],
        message: "validation.linkHomeOnly",
      });
    }
  });

const personLinksSchema = z
  .array(personLinkSchema)
  .max(MAX_PERSON_LINKS, "validation.linksTooMany")
  .superRefine((links, context) => {
    const seen = new Set<string>();
    let homeIndex = -1;
    links.forEach((link, index) => {
      const key = link.url.toLowerCase();
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: [index, "url"],
          message: "validation.linkDuplicate",
        });
      } else {
        seen.add(key);
      }
      if (link.isHome) {
        if (homeIndex >= 0) {
          context.addIssue({
            code: "custom",
            path: [index, "isHome"],
            message: "validation.linkHomeSingle",
          });
        } else {
          homeIndex = index;
        }
      }
    });
  })
  .optional()
  .default([]);

export const personSchema = z.object({
  treeId: z.string().uuid(),
  firstName: z.string().trim().min(1, "validation.firstNameRequired").max(80),
  lastName: z.string().trim().max(80).optional().default(""),
  maidenName: optionalText(80),
  nickname: optionalText(80),
  sex: z.enum(PERSON_SEX_VALUES).default("unknown"),
  birthDate: optionalFuzzyDate,
  deathDate: optionalFuzzyDate,
  birthPlace: optionalText(160),
  deathPlace: optionalText(160),
  bio: optionalText(4000),
  links: personLinksSchema,
  contactEmail: optionalContactEmail,
  contactPhone: optionalContactPhone,
});

export const personUpdateSchema = personSchema.omit({ treeId: true });

export const personEventKindSchema = z.enum([
  "residence",
  "occupation",
  "education",
  "military",
  "immigration",
  "emigration",
  "marriage",
  "divorce",
  "burial",
  "other",
]);

export const personEventInputSchema = z
  .object({
    kind: personEventKindSchema.default("other"),
    title: optionalText(120),
    place: optionalText(160),
    date: optionalFuzzyDate,
    description: optionalText(2000),
    /** The other person in a marriage or divorce, when recorded. */
    partnerPersonId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .transform(value => value ?? null),
  })
  .superRefine((value, context) => {
    if (!value.title && !value.date && !value.place) {
      context.addIssue({
        code: "custom",
        message: "validation.eventDetailRequired",
      });
    }
    if (value.kind === "other" && !value.title) {
      context.addIssue({
        code: "custom",
        path: ["title"],
        message: "validation.eventTitleRequired",
      });
    }
  });

export const personEventSchema = personEventInputSchema.and(
  z.object({
    treeId: z.string().uuid(),
    personId: z.string().uuid(),
  }),
);

export const personEventUpdateSchema = personEventInputSchema.and(
  z.object({
    treeId: z.string().uuid(),
    eventId: z.string().uuid(),
    /**
     * The timeline this edit came from. A shared event can be edited from
     * either participant, and `partnerPersonId` names the other person from
     * that side.
     */
    personId: z.string().uuid().optional(),
  }),
);

export const parentTypeSchema = z.enum([
  "biological",
  "adoptive",
  "foster",
  "step",
  "unknown",
]);

export const partnershipStatusSchema = z.enum([
  "married",
  "partnered",
  "divorced",
  "separated",
  "widowed",
  "unknown",
]);

export const parentChildSchema = z.object({
  treeId: z.string().uuid(),
  parentId: z.string().uuid(),
  childId: z.string().uuid(),
  parentType: parentTypeSchema.default("biological"),
});

export const partnershipSchema = z.object({
  treeId: z.string().uuid(),
  personAId: z.string().uuid(),
  personBId: z.string().uuid(),
  status: partnershipStatusSchema.default("partnered"),
  startDate: optionalFuzzyDate,
  endDate: optionalFuzzyDate,
});

export const addRelativeSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("existing"),
    treeId: z.string().uuid(),
    anchorPersonId: z.string().uuid(),
    relation: z.enum(["parent", "child", "partner"]),
    personId: z.string().uuid(),
    otherParentId: z.string().uuid().optional(),
    parentType: parentTypeSchema.default("biological"),
    status: partnershipStatusSchema.default("partnered"),
    allowDuplicate: z.boolean().optional(),
  }),
  z.object({
    mode: z.literal("new"),
    treeId: z.string().uuid(),
    anchorPersonId: z.string().uuid(),
    relation: z.enum(["parent", "child", "partner"]),
    otherParentId: z.string().uuid().optional(),
    person: personUpdateSchema,
    parentType: parentTypeSchema.default("biological"),
    status: partnershipStatusSchema.default("partnered"),
    allowDuplicate: z.boolean().optional(),
  }),
]);

export const fileGroupSchema = z.object({
  treeId: z.string().uuid(),
  personId: z.string().uuid(),
  name: z.string().trim().min(1, "validation.albumNameRequired").max(80, "validation.nameTooLong"),
});

export const renameFileGroupSchema = z.object({
  groupId: z.string().uuid(),
  name: z.string().trim().min(1, "validation.albumNameRequired").max(80, "validation.nameTooLong"),
});

export const prepareUploadSchema = z.object({
  treeId: z.string().uuid(),
  personId: z.string().uuid().optional().nullable(),
  groupId: z.string().uuid().optional().nullable(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  thumbSizeBytes: z.number().int().positive().optional().nullable(),
  thumbMime: z.enum(["image/webp", "image/jpeg"]).optional().nullable(),
  width: z.number().int().positive().max(50_000).optional().nullable(),
  height: z.number().int().positive().max(50_000).optional().nullable(),
  takenAt: optionalFuzzyDate,
});

export const fileIdsSchema = z.object({
  treeId: z.string().uuid(),
  fileIds: z
    .array(z.string().uuid())
    .min(1, "validation.fileRequired")
    .max(200, "validation.filesTooMany")
    .transform(ids => [...new Set(ids)]),
});

export const assignFilesSchema = fileIdsSchema.extend({
  personId: z.string().uuid().nullable(),
});

export const fileTagsSchema = z.object({
  treeId: z.string().uuid(),
  fileId: z.string().uuid(),
  personIds: z
    .array(z.string().uuid())
    .max(50, "validation.peopleTooMany")
    .default([])
    .transform(ids => [...new Set(ids)]),
});

export const fileTakenAtSchema = z.object({
  treeId: z.string().uuid(),
  fileId: z.string().uuid(),
  takenAt: optionalFuzzyDate,
});

/**
 * Boxes are normalized to the image, so every value is a fraction. A face
 * smaller than two percent of the image is not worth storing.
 */
const MIN_FACE_SIDE = 0.02;

export const faceBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(MIN_FACE_SIDE).max(1),
    height: z.number().min(MIN_FACE_SIDE).max(1),
  })
  .refine(box => box.x + box.width <= 1.001 && box.y + box.height <= 1.001, {
    message: "validation.faceBoxOutside",
  });

const detectedFaceSchema = z.object({
  box: faceBoxSchema,
  confidence: z.number().min(0).max(1).optional().nullable(),
});

export const recordFacesSchema = z.object({
  treeId: z.string().uuid(),
  fileId: z.string().uuid(),
  faces: z
    .array(detectedFaceSchema)
    .max(25, "validation.facesTooMany")
    .default([]),
});

export const faceTargetSchema = z.object({
  treeId: z.string().uuid(),
  fileId: z.string().uuid(),
  faceId: z.string().uuid(),
});

export const assignFaceSchema = faceTargetSchema.extend({
  personId: z.string().uuid(),
});

export const ignoreFaceSchema = faceTargetSchema.extend({
  ignored: z.boolean().default(true),
});

export const addManualFaceSchema = z.object({
  treeId: z.string().uuid(),
  fileId: z.string().uuid(),
  personId: z.string().uuid(),
  box: faceBoxSchema,
});

export type RecordedFaceInput = z.infer<typeof detectedFaceSchema>;

export type PersonInput = z.infer<typeof personUpdateSchema>;
export type PersonEventInput = z.infer<typeof personEventInputSchema>;
