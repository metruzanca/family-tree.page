import { createSignal } from "solid-js";
import { revalidate, useNavigate } from "@solidjs/router";
import { createTree } from "~/api/trees-server";
import { getMyTrees } from "~/api";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";
import { track } from "~/lib/analytics";

export function CreateTreeDialog(props: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [error, setError] = createSignal("");
  const [pending, setPending] = createSignal(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (pending()) return;
    setPending(true);
    setError("");
    const result = await createTree({ name: name(), description: description() });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await revalidate(getMyTrees.key);
    track("tree_created");
    toast.show("Tree created. Add your first person.", "success");
    props.onClose();
    navigate(`/trees/${result.data.id}`);
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Start a family tree"
      description="Give this branch a name. You can invite relatives once it exists."
      footer={
        <>
          <Button variant="ghost" type="button" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-tree-form" disabled={pending()}>
            {pending() ? "Creating…" : "Create tree"}
          </Button>
        </>
      }
    >
      <form id="create-tree-form" class="space-y-4" onSubmit={submit}>
        <Field label="Tree name" for="tree-name">
          <input
            id="tree-name"
            class="input"
            placeholder="The Zanca family"
            value={name()}
            onInput={event => setName(event.currentTarget.value)}
            maxlength={80}
            required
            autofocus
          />
        </Field>
        <Field label="Description" for="tree-description" hint="Optional. A few words about this branch.">
          <textarea
            id="tree-description"
            class="input"
            placeholder="From the old country to here."
            value={description()}
            onInput={event => setDescription(event.currentTarget.value)}
            maxlength={500}
          />
        </Field>
        {error() && (
          <p class="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error()}
          </p>
        )}
      </form>
    </Modal>
  );
}
