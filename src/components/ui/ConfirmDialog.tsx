import { Show, type JSX } from "solid-js";
import { Button } from "./button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPortal,
  AlertDialogTitle,
} from "./alert-dialog";

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
    <AlertDialog
      open={props.open}
      onOpenChange={open => {
        if (!open) props.onClose();
      }}
    >
      <AlertDialogPortal>
        <AlertDialogContent
          class="gap-5 rounded-[1.35rem] border-border bg-card shadow-[var(--shadow-soft)]"
          data-testid="confirm-dialog"
        >
          <AlertDialogHeader class="gap-2">
            <AlertDialogTitle class="font-display text-xl leading-tight tracking-tight">
              {props.title}
            </AlertDialogTitle>
            <Show when={props.message}>
              <AlertDialogDescription as="div" class="text-sm leading-relaxed text-muted-foreground">
                {props.message}
              </AlertDialogDescription>
            </Show>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="ghost"
              type="button"
              onClick={props.onClose}
              data-testid="confirm-dialog-cancel"
            >
              Cancel
            </Button>
            <Button
              variant={props.danger ? "destructive" : "default"}
              type="button"
              disabled={props.pending}
              data-testid="confirm-dialog-confirm"
              onClick={props.onConfirm}
            >
              {props.pending ? "Working…" : (props.confirmLabel ?? "Confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
}
