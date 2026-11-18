import type { TranslationKey } from "../i18n";

export type ActivityAction =
  | "person.created"
  | "person.updated"
  | "person.deleted"
  | "relationship.created"
  | "relationship.removed"
  | "event.created"
  | "event.updated"
  | "event.deleted"
  | "file.uploaded"
  | "file.updated"
  | "file.deleted"
  | "group.renamed"
  | "group.deleted"
  | "member.role_changed"
  | "member.removed"
  | "member.left"
  | "invite.created"
  | "invite.revoked"
  | "invite.accepted"
  | "tree.updated"
  | "tree.deletion_requested"
  | "tree.deletion_approved"
  | "tree.deletion_cancelled"
  | "tree.deletion_scheduled"
  | "tree.restored"
  | "tree.imported";

export type ActivityEntityType =
  | "person"
  | "relationship"
  | "event"
  | "file"
  | "file_group"
  | "member"
  | "invite"
  | "tree";

export type ActivityGroup = "people" | "relationships" | "events" | "media" | "members" | "tree";

export type ActivityChange = {
  /** English label, kept for older rows and API consumers. */
  label: string;
  /** Dictionary key for the same label; preferred by the UI. */
  labelKey?: TranslationKey;
  from: string | null;
  to: string | null;
};

export type ActivitySummaryParams = Record<string, string | number>;

export type ActivityItem = {
  id: string;
  actorUserId: string | null;
  actorName: string;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string | null;
  personId: string | null;
  /** English summary, kept for exports, older rows, and API consumers. */
  summary: string;
  summaryKey?: TranslationKey | null;
  summaryParams?: ActivitySummaryParams | null;
  changes: ActivityChange[] | null;
  createdAt: Date;
};

export const ACTIVITY_GROUP_ACTIONS: Record<ActivityGroup, ActivityAction[]> = {
  people: ["person.created", "person.updated", "person.deleted"],
  relationships: ["relationship.created", "relationship.removed"],
  events: ["event.created", "event.updated", "event.deleted"],
  media: [
    "file.uploaded",
    "file.updated",
    "file.deleted",
    "group.renamed",
    "group.deleted",
  ],
  members: [
    "member.role_changed",
    "member.removed",
    "member.left",
    "invite.created",
    "invite.revoked",
    "invite.accepted",
  ],
  tree: [
    "tree.updated",
    "tree.deletion_requested",
    "tree.deletion_approved",
    "tree.deletion_cancelled",
    "tree.deletion_scheduled",
    "tree.restored",
  ],
};

export const ACTIVITY_GROUPS: { value: ActivityGroup | ""; label: string }[] = [
  { value: "", label: "Everything" },
  { value: "people", label: "People" },
  { value: "relationships", label: "Relationships" },
  { value: "events", label: "Life events" },
  { value: "media", label: "Photos and files" },
  { value: "members", label: "Members" },
  { value: "tree", label: "Tree" },
];

export function activityGroupFor(action: ActivityAction): ActivityGroup {
  if (action.startsWith("person.")) return "people";
  if (action.startsWith("relationship.")) return "relationships";
  if (action.startsWith("event.")) return "events";
  if (action.startsWith("file.") || action.startsWith("group.")) return "media";
  if (action.startsWith("member.") || action.startsWith("invite.")) return "members";
  return "tree";
}

export function activityActionKey(action: ActivityAction): TranslationKey {
  switch (action) {
    case "person.created":
      return "tree.activity.action.personCreated";
    case "person.updated":
      return "tree.activity.action.personUpdated";
    case "person.deleted":
      return "tree.activity.action.personDeleted";
    case "relationship.created":
      return "tree.activity.action.relationshipCreated";
    case "relationship.removed":
      return "tree.activity.action.relationshipRemoved";
    case "event.created":
      return "tree.activity.action.eventCreated";
    case "event.updated":
      return "tree.activity.action.eventUpdated";
    case "event.deleted":
      return "tree.activity.action.eventDeleted";
    case "file.uploaded":
      return "tree.activity.action.fileUploaded";
    case "file.updated":
      return "tree.activity.action.fileUpdated";
    case "file.deleted":
      return "tree.activity.action.fileDeleted";
    case "group.renamed":
      return "tree.activity.action.groupRenamed";
    case "group.deleted":
      return "tree.activity.action.groupDeleted";
    case "member.role_changed":
      return "tree.activity.action.memberRoleChanged";
    case "member.removed":
      return "tree.activity.action.memberRemoved";
    case "member.left":
      return "tree.activity.action.memberLeft";
    case "invite.created":
      return "tree.activity.action.inviteCreated";
    case "invite.revoked":
      return "tree.activity.action.inviteRevoked";
    case "invite.accepted":
      return "tree.activity.action.inviteAccepted";
    case "tree.updated":
      return "tree.activity.action.treeUpdated";
    case "tree.deletion_requested":
      return "tree.activity.action.treeDeletionRequested";
    case "tree.deletion_approved":
      return "tree.activity.action.treeDeletionApproved";
    case "tree.deletion_cancelled":
      return "tree.activity.action.treeDeletionCancelled";
    case "tree.deletion_scheduled":
      return "tree.activity.action.treeDeletionScheduled";
    case "tree.restored":
      return "tree.activity.action.treeRestored";
    case "tree.imported":
      return "tree.activity.action.treeImported";
  }
}

export function activityGroupKey(group: ActivityGroup | ""): TranslationKey {
  switch (group) {
    case "":
      return "tree.activity.group.all";
    case "people":
      return "tree.activity.group.people";
    case "relationships":
      return "tree.activity.group.relationships";
    case "events":
      return "tree.activity.group.events";
    case "media":
      return "tree.activity.group.media";
    case "members":
      return "tree.activity.group.members";
    case "tree":
      return "tree.activity.group.tree";
  }
}

export function activityActionLabel(action: ActivityAction) {
  switch (action) {
    case "person.created":
      return "Person added";
    case "person.updated":
      return "Person updated";
    case "person.deleted":
      return "Person deleted";
    case "relationship.created":
      return "Relationship added";
    case "relationship.removed":
      return "Relationship removed";
    case "event.created":
      return "Life event added";
    case "event.updated":
      return "Life event updated";
    case "event.deleted":
      return "Life event deleted";
    case "file.uploaded":
      return "File uploaded";
    case "file.updated":
      return "File updated";
    case "file.deleted":
      return "File deleted";
    case "group.renamed":
      return "Album renamed";
    case "group.deleted":
      return "Album deleted";
    case "member.role_changed":
      return "Member role changed";
    case "member.removed":
      return "Member removed";
    case "member.left":
      return "Member left";
    case "invite.created":
      return "Invite created";
    case "invite.revoked":
      return "Invite revoked";
    case "invite.accepted":
      return "Invite accepted";
    case "tree.updated":
      return "Tree updated";
    case "tree.deletion_requested":
      return "Deletion requested";
    case "tree.deletion_approved":
      return "Deletion approved";
    case "tree.deletion_cancelled":
      return "Deletion request cancelled";
    case "tree.deletion_scheduled":
      return "Tree scheduled for deletion";
    case "tree.restored":
      return "Tree restored";
    case "tree.imported":
      return "Tree imported";
  }
}
