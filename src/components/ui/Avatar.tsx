import { Show, createMemo } from "solid-js";

const palette = [
  ["#2f4a3a", "#e7efe2"],
  ["#8c5a3c", "#f7e9dd"],
  ["#54627a", "#e6ebf3"],
  ["#7b4b63", "#f4e5ed"],
  ["#6d6535", "#f3efd8"],
  ["#3f6360", "#e0f0ec"],
] as const;

function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function hash(name: string) {
  let value = 0;
  for (let index = 0; index < name.length; index += 1) {
    value = (value * 31 + name.charCodeAt(index)) >>> 0;
  }
  return value;
}

type AvatarProps = {
  name: string;
  fileId?: string | null;
  size?: number;
  class?: string;
  ring?: boolean;
};

export function Avatar(props: AvatarProps) {
  const size = () => props.size ?? 40;
  const colors = createMemo(() => palette[hash(props.name) % palette.length]);
  return (
    <span
      class={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${props.ring ? "ring-2 ring-raised" : ""} ${props.class ?? ""}`}
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "background-color": colors()[1],
        color: colors()[0],
        "font-size": `${Math.max(10, size() * 0.34)}px`,
      }}
      aria-hidden="true"
    >
      <Show
        when={props.fileId}
        fallback={<span class="font-semibold tracking-wide">{initials(props.name)}</span>}
      >
        <img
          src={`/api/files/${props.fileId}/thumb`}
          alt=""
          class="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
      </Show>
    </span>
  );
}
