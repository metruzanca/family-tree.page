import { createSignal } from "solid-js";
import type { GraphPerson } from "~/api/people-server";
import { FileTagList } from "./FileTagList";
import { TagPeopleDialog } from "./TagPeopleDialog";

type FilePeopleSectionProps = {
  people: GraphPerson[];
  primaryPerson?: GraphPerson;
  taggedPersonIds: string[];
  editable: boolean;
  pending?: boolean;
  onSave: (personIds: string[]) => void;
};

export function FilePeopleSection(props: FilePeopleSectionProps) {
  const [open, setOpen] = createSignal(false);

  return (
    <>
      <FileTagList
        people={props.people}
        taggedPersonIds={props.taggedPersonIds}
        editable={props.editable}
        pending={props.pending}
        onEdit={() => setOpen(true)}
        onRemove={personId =>
          props.onSave(props.taggedPersonIds.filter(id => id !== personId))
        }
      />
      <TagPeopleDialog
        open={open()}
        onClose={() => setOpen(false)}
        people={props.people}
        primaryPerson={props.primaryPerson}
        selectedIds={props.taggedPersonIds}
        pending={props.pending}
        onSave={personIds => {
          props.onSave(personIds);
          setOpen(false);
        }}
      />
    </>
  );
}
