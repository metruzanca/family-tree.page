import {
  For,
  Show,
  createContext,
  createSignal,
  onCleanup,
  useContext,
  type JSX,
} from "solid-js";
import { Portal } from "solid-js/web";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-solid";
import { useI18n } from "~/i18n/LocaleProvider";

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; message: string; tone: ToastTone };

const ToastContext = createContext<{ show: (message: string, tone?: ToastTone) => void }>();

export function ToastProvider(props: { children: JSX.Element }) {
  const { t } = useI18n();
  const [items, setItems] = createSignal<ToastItem[]>([]);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  onCleanup(() => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  });

  function dismiss(id: number) {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
    setItems(current => current.filter(item => item.id !== id));
  }

  function show(message: string, tone: ToastTone = "info") {
    const id = Date.now() + Math.random();
    setItems(current => [...current, { id, message, tone }]);
    const timer = setTimeout(() => dismiss(id), 4600);
    timers.set(id, timer);
  }

  return (
    <ToastContext.Provider value={{ show }}>
      {props.children}
      <Portal>
        <div
          class="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6"
          role="status"
          aria-live="polite"
        >
          <For each={items()}>
            {item => (
              <div class="animate-in fade-in-0 slide-in-from-bottom-2 pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground shadow-[var(--shadow-soft)]">
                <span
                  class={`mt-0.5 shrink-0 ${
                    item.tone === "success"
                      ? "text-success"
                      : item.tone === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  <Show
                    when={item.tone === "success"}
                    fallback={
                      <Show when={item.tone === "error"} fallback={<Info size={17} />}>
                        <CircleAlert size={17} />
                      </Show>
                    }
                  >
                    <CheckCircle2 size={17} />
                  </Show>
                </span>
                <span class="flex-1 leading-snug">{item.message}</span>
                <button
                  type="button"
                  class="rounded-full p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  aria-label={t("common.dismissNotification")}
                  onClick={() => dismiss(item.id)}
                >
                  <X size={15} />
                </button>
              </div>
            )}
          </For>
        </div>
      </Portal>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      show: (message: string) => {
        if (typeof console !== "undefined") console.info(message);
      },
    };
  }
  return context;
}
