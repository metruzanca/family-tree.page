import type { GraphPersonEvent } from "~/api/people-server";
import type { PersonFormField } from "../people/PersonFormDialog";

/**
 * Editing actions the research views can offer. The desk owns the dialogs and
 * the server enforces the editor role, so views only need to call these.
 */
export type ResearchEditing = {
  editPerson: (personId: string, focus?: PersonFormField) => void;
  addEvent: (personId: string) => void;
  editEvent: (personId: string, event: GraphPersonEvent) => void;
  deleteEvent: (personId: string, event: GraphPersonEvent) => void;
  addRelative: (personId: string) => void;
};
