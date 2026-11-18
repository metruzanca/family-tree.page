import { createSignal } from "solid-js";
import { revalidate, useNavigate } from "@solidjs/router";
import { createTree } from "~/api/trees-server";
import { getMyTrees } from "~/api";
import { Button } from "../ui/button";
import { Field } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";
import { attemptAction } from "~/lib/action-result";
import { track } from "~/lib/analytics";
import { useI18n } from "~/i18n/LocaleProvider";

export function CreateTreeDialog(props: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
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
    const result = await attemptAction(() => createTree({ name: name(), description: description() }));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await revalidate(getMyTrees.key);
    track("tree_created");
    toast.show(t("tree.create.created"), "success");
    props.onClose();
    navigate(`/trees/${result.data.id}`);
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={t("tree.create.title")}
      description={t("tree.create.description")}
      footer={
        <>
          <Button
            variant="ghost"
            type="button"
            onClick={props.onClose}
            data-testid="tree-create-cancel"
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="create-tree-form"
            disabled={pending()}
            data-testid="tree-create-submit"
          >
            {pending() ? t("tree.create.creating") : t("tree.create.submit")}
          </Button>
        </>
      }
    >
      <form id="create-tree-form" class="space-y-4" onSubmit={submit}>
        <Field label={t("tree.create.name")} for="tree-name">
          <input
            id="tree-name"
            class="input"
            placeholder={t("tree.create.namePlaceholder")}
            value={name()}
            onInput={event => setName(event.currentTarget.value)}
            maxlength={80}
            required
            autofocus
            data-testid="tree-create-name"
          />
        </Field>
        <Field
          label={t("tree.create.descriptionLabel")}
          for="tree-description"
          hint={t("tree.create.descriptionHint")}
        >
          <textarea
            id="tree-description"
            class="input"
            placeholder={t("tree.create.descriptionPlaceholder")}
            value={description()}
            onInput={event => setDescription(event.currentTarget.value)}
            maxlength={500}
            data-testid="tree-create-description"
          />
        </Field>
        {error() && (
          <p class="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error()}
          </p>
        )}
      </form>
    </Modal>
  );
}
