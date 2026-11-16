import { For, Show, createMemo, createSignal, onMount, type JSX } from "solid-js";
import { A } from "@solidjs/router";
import {
  ArrowRight,
  Check,
  ImageOff,
  Images,
  Maximize2,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-solid";
import { GraphView, type GraphHandle } from "~/components/graph/GraphView";
import { buttonVariants } from "~/components/ui/button";
import { LandingLightbox } from "./LandingLightbox";
import { LandingPersonCard } from "./LandingPersonCard";
import {
  demoAlbum,
  demoLayout,
  demoMediaById,
  demoPeople,
  demoPersonAvatar,
  demoThumbUrl,
  demoTree,
  type DemoMedia,
} from "./demo-tree";

type LightboxState = {
  title: string;
  files: DemoMedia[];
  initialId?: string | null;
};

export function LandingHero() {
  const isNarrow =
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
  const [selectedPersonId, setSelectedPersonId] = createSignal<string | null>(null);
  const [lightbox, setLightbox] = createSignal<LightboxState | null>(null);
  const [peopleOpen, setPeopleOpen] = createSignal(false);
  const [showMedia, setShowMedia] = createSignal(true);
  const [handle, setHandle] = createSignal<GraphHandle>();
  const [hintVisible, setHintVisible] = createSignal(true);

  const selectedPerson = createMemo(
    () => demoPeople.find(person => person.id === selectedPersonId()) ?? null,
  );

  onMount(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setShowMedia(false);
  });

  function acknowledge() {
    setHintVisible(false);
  }

  function selectPerson(id: string, focus = false) {
    acknowledge();
    setPeopleOpen(false);
    setLightbox(null);
    setSelectedPersonId(id);
    if (focus) handle()?.focus(id);
  }

  function handleCanvasSelect(id: string | null) {
    if (id) {
      selectPerson(id);
      return;
    }
    setSelectedPersonId(null);
    setPeopleOpen(false);
  }

  function openFile(fileId: string) {
    const file = demoMediaById[fileId];
    if (!file) return;
    acknowledge();
    setPeopleOpen(false);
    setSelectedPersonId(null);
    setLightbox({ title: file.name, files: [file], initialId: file.id });
  }

  function openGroup(groupId: string) {
    if (groupId !== demoAlbum.id) return;
    acknowledge();
    setPeopleOpen(false);
    setSelectedPersonId(null);
    setLightbox({
      title: demoAlbum.name,
      files: demoAlbum.files,
      initialId: demoAlbum.files[0]?.id ?? null,
    });
  }

  function toggleMedia() {
    acknowledge();
    setShowMedia(value => !value);
  }

  return (
    <section class="mx-auto max-w-[86rem] px-4 pt-5 sm:px-6 sm:pt-8">
      <div class="relative overflow-hidden rounded-[1.75rem] border border-[#2b3427] bg-[#151a12] text-[#f5efe2] shadow-[var(--shadow-soft)] sm:rounded-[2.25rem]">
        <div class="pointer-events-none absolute -left-24 -top-20 size-80 rounded-full bg-gold/15 blur-3xl" />
        <div class="pointer-events-none absolute -right-24 bottom-0 size-96 rounded-full bg-[#8fa98f]/10 blur-3xl" />

        <div class="relative grid lg:grid-cols-[0.88fr_1.12fr]">
          <div class="relative z-10 flex flex-col justify-center px-6 py-10 sm:px-10 lg:py-14 xl:px-14">
            <p class="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[#cfd6c6]">
              <span class="size-1.5 rounded-full bg-gold" />
              Private family trees
            </p>

            <h1 class="mt-5 max-w-xl font-display text-[2.35rem] leading-[1.04] tracking-tight sm:text-5xl xl:text-6xl">
              Every family has a shape.{" "}
              <span class="text-gold">Map yours together.</span>
            </h1>

            <p class="mt-5 max-w-lg text-sm leading-relaxed text-[#b9c2b0] sm:text-base">
              A private, collaborative family tree built as a living graph. Add people, connect
              parents and partners, and attach the photographs and documents that hold the stories
              together.
            </p>

            <div class="mt-7 flex flex-wrap items-center gap-3">
              <A
                href="/register"
                class={buttonVariants({
                  size: "lg",
                  class: "bg-gold text-gold-foreground shadow-sm hover:bg-gold/90",
                })}
              >
                Start your family tree
                <ArrowRight size={16} />
              </A>
              <A
                href="/login"
                class={buttonVariants({
                  variant: "secondary",
                  size: "lg",
                  class:
                    "border-white/15 bg-white/5 text-[#f5efe2] hover:border-white/25 hover:bg-white/10",
                })}
              >
                Sign in
              </A>
            </div>

            <p class="mt-4 text-xs leading-relaxed text-[#8d9a85]">
              Free to use and open source. Your tree stays private to the people you invite.
            </p>

            <ul class="mt-8 grid max-w-md grid-cols-2 gap-x-4 gap-y-2.5 text-xs text-[#b9c2b0]">
              <For
                each={["Free to use", "MIT licensed", "Private by default", "Works on mobile"]}
              >
                {item => (
                  <li class="flex items-center gap-2">
                    <Check size={14} class="shrink-0 text-gold" />
                    {item}
                  </li>
                )}
              </For>
            </ul>
          </div>

          <div class="relative min-h-[360px] border-t border-white/10 bg-graph-bg sm:min-h-[580px] lg:min-h-[680px] lg:border-l lg:border-t-0">
            <div class="absolute inset-0">
              <GraphView
                data={demoTree}
                role="viewer"
                selectedId={selectedPersonId()}
                showMedia={showMedia()}
                layout="generations"
                generationDirection="oldest-top"
                class="landing-graph !h-full"
                thumbUrlFor={demoThumbUrl}
                fitPadding={isNarrow ? 8 : 64}
                warmupTicks={0}
                fixedLayout={demoLayout}
                nodeLabel={node =>
                  node.kind === "person" ? node.person?.firstName ?? node.name : node.name
                }
                onSelect={handleCanvasSelect}
                onFileSelect={openFile}
                onGroupSelect={openGroup}
                onReady={setHandle}
              />
            </div>

            <div class="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start gap-2 p-3 sm:p-4">
              <div class="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-white/70 backdrop-blur-md">
                <span class="size-1.5 animate-pulse rounded-full bg-gold" />
                Live demo
                <span class="hidden text-white/40 sm:inline">The Simpsons</span>
              </div>

              <div class="pointer-events-auto ml-auto flex items-center gap-1.5">
                <ChromeButton
                  label="Browse people"
                  active={peopleOpen()}
                  onClick={() => setPeopleOpen(value => !value)}
                >
                  <Users size={16} />
                </ChromeButton>
                <ChromeButton
                  label={showMedia() ? "Hide photos" : "Show photos"}
                  active={showMedia()}
                  onClick={toggleMedia}
                >
                  <Show when={showMedia()} fallback={<ImageOff size={16} />}>
                    <Images size={16} />
                  </Show>
                </ChromeButton>
                <ChromeButton label="Zoom out" onClick={() => handle()?.zoomBy(0.8)}>
                  <ZoomOut size={16} />
                </ChromeButton>
                <ChromeButton label="Zoom in" onClick={() => handle()?.zoomBy(1.25)}>
                  <ZoomIn size={16} />
                </ChromeButton>
                <ChromeButton label="Fit tree" onClick={() => handle()?.fit()}>
                  <Maximize2 size={16} />
                </ChromeButton>
              </div>
            </div>

            <Show when={peopleOpen()}>
              <div class="absolute inset-x-3 bottom-14 z-30 overflow-hidden rounded-2xl border border-white/10 bg-[#141811]/95 text-white shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-20 sm:w-72">
                <div class="flex items-center justify-between border-b border-white/10 px-3 py-2">
                  <p class="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-white/45">
                    People
                  </p>
                  <button
                    type="button"
                    class="grid size-6 place-items-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
                    aria-label="Close people list"
                    onClick={() => setPeopleOpen(false)}
                  >
                    <X size={13} />
                  </button>
                </div>
                <ul class="scroll-thin max-h-64 overflow-y-auto p-1.5">
                  <For each={demoPeople}>
                    {person => (
                      <li>
                        <button
                          type="button"
                          class="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                          onClick={() => selectPerson(person.id, true)}
                        >
                          <img
                            src={demoPersonAvatar(person) ?? undefined}
                            alt=""
                            class="size-7 shrink-0 rounded-full border border-white/10 bg-[#efe8da] object-cover"
                            draggable={false}
                          />
                          <span class="min-w-0 flex-1 truncate text-sm text-white/80">
                            {person.displayName}
                          </span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>

            <Show when={selectedPerson()}>
              {person => (
                <LandingPersonCard
                  person={person()}
                  data={demoTree}
                  onClose={() => setSelectedPersonId(null)}
                  onSelectPerson={id => selectPerson(id, true)}
                />
              )}
            </Show>

            <Show when={hintVisible()}>
              <div class="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
                <p class="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[0.66rem] text-white/60 backdrop-blur-md">
                  Click a face or a photo to look closer
                </p>
              </div>
            </Show>
          </div>
        </div>
      </div>

      <Show when={lightbox()}>
        {state => (
          <LandingLightbox
            title={state().title}
            files={state().files}
            initialId={state().initialId}
            onClose={() => setLightbox(null)}
          />
        )}
      </Show>
    </section>
  );
}

function ChromeButton(props: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      class={`grid size-8 place-items-center rounded-full border backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:size-9 ${
        props.active
          ? "border-white/25 bg-white/15 text-white"
          : "border-white/10 bg-black/35 text-white/60 hover:bg-black/55 hover:text-white"
      }`}
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
