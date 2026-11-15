import type { ComponentProps } from "solid-js";
import { Show, splitProps } from "solid-js";
import type { VariantProps } from "cva";
import { buttonVariants } from "./button";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "./tooltip";
import { cx } from "~/lib/utils";

export function IconButton(
  props: ComponentProps<"button"> & {
    label: string;
    variant?: VariantProps<typeof buttonVariants>["variant"];
    size?: VariantProps<typeof buttonVariants>["size"];
    tooltip?: boolean;
  },
) {
  const [local, rest] = splitProps(props, [
    "label",
    "class",
    "variant",
    "size",
    "tooltip",
    "children",
  ]);

  const classes = () =>
    cx(
      buttonVariants({
        variant: local.variant ?? "ghost",
        size: local.size ?? "icon",
      }),
      local.class,
    );

  return (
    <Show
      when={local.tooltip !== false}
      fallback={
        <button {...rest} type={(rest.type as "button" | "submit" | "reset") ?? "button"} aria-label={local.label} class={classes()}>
          {local.children}
        </button>
      }
    >
      <Tooltip placement="bottom">
        <TooltipTrigger
          as="button"
          {...rest}
          type={(rest.type as "button" | "submit" | "reset") ?? "button"}
          aria-label={local.label}
          class={classes()}
        >
          {local.children}
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>{local.label}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </Show>
  );
}
