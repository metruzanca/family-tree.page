import { Show, type JSX } from "solid-js";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  message: JSX.Element;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant={props.danger ? "danger" : "primary"}
            type="button"
            disabled={props.pending}
            onClick={props.onConfirm}
          >
            {props.pending ? "Working…" : props.confirmLabel ?? "Confirm"}
          </Button>
        </>
      }
    >
      <Show when={props.message}>
        <div class="text-sm leading-relaxed text-muted">{props.message}</div>
      </Show>
    </Modal>
  );
}
