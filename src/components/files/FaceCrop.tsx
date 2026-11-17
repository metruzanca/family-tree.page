import { Show } from "solid-js";
import { UserRound } from "lucide-solid";
import { faceCropRect, type FaceBox } from "~/lib/face-box";

type FaceCropProps = {
  thumbUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  box: FaceBox;
  size: number;
  class?: string;
  alt?: string;
  testId?: string;
};

/**
 * A square crop of one face, cut out with CSS from the photo thumbnail. No
 * extra image is generated or stored.
 */
export function FaceCrop(props: FaceCropProps) {
  const rect = () =>
    faceCropRect(props.box, props.imageWidth ?? 1, props.imageHeight ?? 1, props.size);

  return (
    <span
      class={`relative block shrink-0 overflow-hidden bg-background ${props.class ?? ""}`}
      style={{ width: `${props.size}px`, height: `${props.size}px` }}
      data-testid={props.testId ?? "face-crop"}
    >
      <Show
        when={props.thumbUrl && props.imageWidth && props.imageHeight}
        fallback={
          <span class="grid h-full w-full place-items-center text-muted-foreground">
            <UserRound size={Math.max(14, props.size * 0.4)} />
          </span>
        }
      >
        <img
          src={props.thumbUrl!}
          alt={props.alt ?? ""}
          class="absolute max-w-none select-none"
          style={{
            width: `${rect().width}px`,
            height: `${rect().height}px`,
            left: `${rect().left}px`,
            top: `${rect().top}px`,
          }}
          draggable={false}
        />
      </Show>
    </span>
  );
}
