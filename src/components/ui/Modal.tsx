import { Show, type JSX } from "solid-js";
import { X } from "lucide-solid";
import { Button } from "./button";
import { useI18n } from "~/i18n/LocaleProvider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
} from "./dialog";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: JSX.Element;
  footer?: JSX.Element;
  wide?: boolean;
  testId?: string;
};

export function Modal(props: ModalProps) {
  const { t } = useI18n();
  let body: HTMLDivElement | undefined;

  function focusFirstField(event: Event) {
    const target =
      body?.querySelector<HTMLElement>("[autofocus]") ??
      body?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select");
    if (!target) return;
    event.preventDefault();
    target.focus();
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={open => {
        if (!open) props.onClose();
      }}
    >
      <DialogPortal>
        <DialogContent
          showCloseButton={false}
          onOpenAutoFocus={focusFirstField}
          data-testid={props.testId}
          class={`flex max-h-[min(88dvh,52rem)] flex-col gap-0 overflow-hidden rounded-[1.35rem] border-border bg-card p-0 shadow-[var(--shadow-soft)] ${
            props.wide ? "sm:max-w-2xl" : "sm:max-w-lg"
          }`}
        >
          <DialogHeader class="flex-row items-start justify-between gap-4 border-b border-border bg-card/95 px-5 py-4 text-left backdrop-blur">
            <div class="min-w-0">
              <Show
                when={props.title}
                fallback={<DialogTitle class="sr-only">{t("common.dialog")}</DialogTitle>}
              >
                <DialogTitle class="font-display text-xl leading-tight tracking-tight">
                  {props.title}
                </DialogTitle>
              </Show>
              <Show when={props.description}>
                <DialogDescription class="mt-1 text-sm text-muted-foreground">
                  {props.description}
                </DialogDescription>
              </Show>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              aria-label={t("common.closeDialog")}
              class="-mr-1.5 -mt-1"
              onClick={props.onClose}
            >
              <X />
            </Button>
          </DialogHeader>

          <div ref={body} class="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {props.children}
          </div>

          <Show when={props.footer}>
            <DialogFooter class="border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
              {props.footer}
            </DialogFooter>
          </Show>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
