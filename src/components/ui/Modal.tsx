import { Show, createEffect, onCleanup, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { X } from "lucide-solid";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: JSX.Element;
  footer?: JSX.Element;
  wide?: boolean;
};

export function Modal(props: ModalProps) {
  createEffect(() => {
    if (!props.open || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    });
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div class="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(5,7,4,0.52)] p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <button
            type="button"
            class="absolute inset-0 cursor-default"
            aria-label="Close dialog"
            onClick={props.onClose}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={props.title}
            class={`modal-panel relative z-10 ${props.wide ? "sm:!w-[min(48rem,calc(100vw-2rem))]" : ""}`}
          >
            <div class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-raised/95 px-5 py-4 backdrop-blur">
              <div>
                <Show when={props.title}>
                  <h2 class="font-display text-xl leading-tight">{props.title}</h2>
                </Show>
                <Show when={props.description}>
                  <p class="mt-1 text-sm text-muted">{props.description}</p>
                </Show>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-icon -mr-2 -mt-1"
                aria-label="Close"
                onClick={props.onClose}
              >
                <X size={18} />
              </button>
            </div>
            <div class="px-5 py-5">{props.children}</div>
            <Show when={props.footer}>
              <div class="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-raised/95 px-5 py-3 backdrop-blur">
                {props.footer}
              </div>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
