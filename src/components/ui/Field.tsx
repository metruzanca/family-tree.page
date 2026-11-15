import { Show, splitProps, type JSX } from "solid-js";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  for?: string;
  class?: string;
  children: JSX.Element;
};

export function Field(props: FieldProps) {
  const [local, rest] = splitProps(props, ["label", "hint", "error", "for", "class", "children"]);
  return (
    <div class={`field ${local.class ?? ""}`}>
      <label class="label" for={local.for}>
        {local.label}
      </label>
      {local.children}
      <Show when={local.hint && !local.error}>
        <span class="text-[0.72rem] text-muted">{local.hint}</span>
      </Show>
      <Show when={local.error}>
        <span class="text-[0.72rem] text-danger" role="alert">
          {local.error}
        </span>
      </Show>
    </div>
  );
}
