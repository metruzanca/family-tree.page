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
    <div class={`flex flex-col gap-1.5 ${local.class ?? ""}`} {...rest}>
      <label class="field-label" for={local.for}>
        {local.label}
      </label>
      {local.children}
      <Show when={local.hint && !local.error}>
        <span class="text-xs text-muted-foreground">{local.hint}</span>
      </Show>
      <Show when={local.error}>
        <span class="text-xs font-medium text-destructive" role="alert">
          {local.error}
        </span>
      </Show>
    </div>
  );
}
