import { splitProps, type JSX } from "solid-js";

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["variant", "size", "class", "children"]);
  return (
    <button
      {...rest}
      class={`btn btn-${local.variant ?? "primary"} ${local.size === "sm" ? "btn-sm" : ""} ${local.class ?? ""}`}
    >
      {local.children}
    </button>
  );
}

export function IconButton(props: ButtonProps & { label: string }) {
  const [local, rest] = splitProps(props, ["label", "class", "children"]);
  return (
    <button
      {...rest}
      aria-label={local.label}
      title={local.label}
      class={`btn btn-ghost btn-icon ${local.class ?? ""}`}
    >
      {local.children}
    </button>
  );
}
