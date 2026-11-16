import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { A } from "@solidjs/router";
import { ChevronLeft, ChevronRight, FileText, X } from "lucide-solid";
import { buttonVariants } from "~/components/ui/button";
import type { DemoMedia } from "./demo-tree";

type LandingLightboxProps = {
  title: string;
  files: DemoMedia[];
  initialId?: string | null;
  onClose: () => void;
};

export function LandingLightbox(props: LandingLightboxProps) {
  const initialIndex = () => {
    const found = props.files.findIndex(file => file.id === props.initialId);
    return found >= 0 ? found : 0;
  };
  const [index, setIndex] = createSignal(initialIndex());
  const current = createMemo(() => props.files[index()] ?? props.files[0]);
  const hasMany = () => props.files.length > 1;

  function next() {
    if (!hasMany()) return;
    setIndex(value => (value + 1) % props.files.length);
  }

  function previous() {
    if (!hasMany()) return;
    setIndex(value => (value - 1 + props.files.length) % props.files.length);
  }

  onMount(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") previous();
    };
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    });
  });

  return (
    <Portal>
      <div
        class="fixed inset-0 z-[70] flex flex-col bg-[#080a07] text-white"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
      >
        <div class="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p class="truncate text-sm font-semibold text-white/80">{props.title}</p>
          <button
            type="button"
            class="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white/75 transition hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            aria-label="Close preview"
            onClick={props.onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div
          class="relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8"
          onClick={event => {
            if (event.target === event.currentTarget) props.onClose();
          }}
        >
          <Show when={current()}>
            {file => (
              <img
                src={file().fullUrl}
                alt={file().name}
                class="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
              />
            )}
          </Show>

          <Show when={hasMany()}>
            <button
              type="button"
              class="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white/75 backdrop-blur transition hover:bg-black/70 hover:text-white sm:left-6"
              aria-label="Previous photo"
              onClick={previous}
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              class="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white/75 backdrop-blur transition hover:bg-black/70 hover:text-white sm:right-6"
              aria-label="Next photo"
              onClick={next}
            >
              <ChevronRight size={22} />
            </button>
          </Show>
        </div>

        <div class="border-t border-white/10 bg-[#10140f] px-4 py-4 sm:px-6">
          <div class="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <Show when={current()?.kind === "document"}>
                  <FileText size={14} class="text-gold" />
                </Show>
                <p class="font-display text-xl leading-tight tracking-tight">
                  {current()?.name}
                </p>
              </div>
              <p class="mt-1 max-w-xl text-sm leading-relaxed text-white/55">
                {current()?.caption}
              </p>
              <Show when={hasMany()}>
                <p class="mt-1.5 text-[0.7rem] text-white/40">
                  {index() + 1} of {props.files.length}
                </p>
              </Show>
            </div>
            <A
              href="/register"
              class={buttonVariants({
                size: "sm",
                class: "shrink-0 bg-gold text-gold-foreground hover:bg-gold/90",
              })}
            >
              Start your own tree
            </A>
          </div>

          <Show when={hasMany()}>
            <div class="scroll-thin mx-auto mt-4 flex max-w-4xl gap-2 overflow-x-auto">
              <For each={props.files}>
                {(file, fileIndex) => (
                  <button
                    type="button"
                    class={`relative size-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                      fileIndex() === index()
                        ? "border-gold opacity-100"
                        : "border-white/10 opacity-50 hover:opacity-90"
                    }`}
                    aria-label={`Show ${file.name}`}
                    onClick={() => setIndex(fileIndex())}
                  >
                    <img src={file.thumbUrl} alt="" class="h-full w-full object-cover" />
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </Portal>
  );
}
