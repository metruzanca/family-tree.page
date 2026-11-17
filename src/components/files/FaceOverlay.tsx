import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { GraphFace, GraphPerson } from "~/api/people-server";
import type { FaceBox } from "~/lib/face-box";

type FaceOverlayProps = {
  /** The rendered image the boxes must sit on. */
  img: HTMLImageElement | undefined;
  faces: GraphFace[];
  people: GraphPerson[];
  selectedFaceId: string | null;
  onSelect: (faceId: string) => void;
  drawing: boolean;
  onDrawBox: (box: FaceBox) => void;
  onCancelDraw: () => void;
};

type Rect = { left: number; top: number; width: number; height: number };

const MIN_DRAW = 0.02;

/**
 * Positions face boxes over the rendered image. The image uses max sizing, so
 * the overlay measures its real rectangle instead of assuming the container
 * matches the photo.
 */
export function FaceOverlay(props: FaceOverlayProps) {
  let overlay: HTMLDivElement | undefined;
  const [rect, setRect] = createSignal<Rect>({ left: 0, top: 0, width: 0, height: 0 });
  const [draft, setDraft] = createSignal<FaceBox | null>(null);
  let origin: { x: number; y: number } | null = null;

  function measure() {
    const img = props.img;
    if (!img || !overlay) return;
    const image = img.getBoundingClientRect();
    const frame = overlay.getBoundingClientRect();
    if (!image.width || !image.height) return;
    setRect({
      left: image.left - frame.left,
      top: image.top - frame.top,
      width: image.width,
      height: image.height,
    });
  }

  function scheduleMeasure() {
    requestAnimationFrame(measure);
  }

  createEffect(() => {
    const img = props.img;
    if (!img) return;
    scheduleMeasure();
    img.addEventListener("load", scheduleMeasure);
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(img);
    window.addEventListener("resize", scheduleMeasure);
    onCleanup(() => {
      img.removeEventListener("load", scheduleMeasure);
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    });
  });

  onMount(() => {
    if (!overlay) return;
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(overlay);
    scheduleMeasure();
    onCleanup(() => observer.disconnect());
  });

  createEffect(() => {
    if (!props.drawing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft(null);
        origin = null;
        props.onCancelDraw();
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  createEffect(() => {
    if (!props.drawing) {
      setDraft(null);
      origin = null;
    }
  });

  const visibleFaces = () => props.faces.filter(face => face.status !== "ignored");

  function personName(personId: string | null) {
    if (!personId) return null;
    return props.people.find(person => person.id === personId)?.displayName ?? "Linked";
  }

  function pointFor(event: PointerEvent) {
    if (!overlay) return { x: 0, y: 0 };
    const frame = overlay.getBoundingClientRect();
    const box = rect();
    const x = (event.clientX - frame.left - box.left) / box.width;
    const y = (event.clientY - frame.top - box.top) / box.height;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  }

  function onPointerDown(event: PointerEvent) {
    if (!props.drawing || event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget instanceof HTMLElement &&
        event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or interrupted pointers may not support capture.
    }
    origin = pointFor(event);
    setDraft({ x: origin.x, y: origin.y, width: 0, height: 0 });
  }

  function onPointerMove(event: PointerEvent) {
    if (!origin) return;
    const point = pointFor(event);
    setDraft({
      x: Math.min(origin.x, point.x),
      y: Math.min(origin.y, point.y),
      width: Math.abs(point.x - origin.x),
      height: Math.abs(point.y - origin.y),
    });
  }

  function onPointerUp(event: PointerEvent) {
    if (!origin) return;
    const box = draft();
    origin = null;
    setDraft(null);
    if (box && box.width >= MIN_DRAW && box.height >= MIN_DRAW) {
      props.onDrawBox(box);
    }
    try {
      event.currentTarget instanceof HTMLElement &&
        event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Already released.
    }
  }
  function styleFor(box: FaceBox) {
    const frame = rect();
    return {
      left: `${frame.left + box.x * frame.width}px`,
      top: `${frame.top + box.y * frame.height}px`,
      width: `${box.width * frame.width}px`,
      height: `${box.height * frame.height}px`,
    };
  }

  return (
    <div
      ref={overlay}
      class="pointer-events-none absolute inset-0 z-10"
      data-testid="face-overlay"
    >
      <For each={visibleFaces()}>
        {(face, index) => {
          const selected = () => face.id === props.selectedFaceId;
          const label = () => personName(face.personId) ?? String(index() + 1);
          return (
            <button
              type="button"
              class={`pointer-events-auto absolute rounded-md border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                face.status === "assigned"
                  ? "border-gold/80 bg-gold/5 hover:bg-gold/15"
                  : "border-dashed border-gold bg-gold/10 hover:bg-gold/20"
              } ${selected() ? "ring-2 ring-white/90 ring-offset-1 ring-offset-black/40" : ""}`}
              style={styleFor(face.box)}
              aria-label={
                face.status === "assigned"
                  ? `Face ${index() + 1}, linked to ${label()}`
                  : `Face ${index() + 1}, not linked`
              }
              data-testid={`face-box-${face.id}`}
              onClick={event => {
                event.stopPropagation();
                props.onSelect(face.id);
              }}
            >
              <span class="pointer-events-none absolute -top-3 left-0 max-w-full truncate rounded-full bg-[#080a07]/85 px-1.5 py-px text-[0.6rem] font-medium leading-tight text-white">
                {label()}
              </span>
            </button>
          );
        }}
      </For>

      <Show when={props.drawing}>
        <div
          class="pointer-events-auto absolute inset-0 cursor-crosshair touch-none"
          data-testid="face-draw-layer"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span class="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-[#080a07]/80 px-3 py-1 text-[0.7rem] font-medium text-white">
            Drag a box over a face. Esc to cancel.
          </span>
          <Show when={draft()}>
            {box => (
              <span
                class="pointer-events-none absolute rounded-md border-2 border-dashed border-white bg-white/10"
                style={styleFor(box())}
              />
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
}
