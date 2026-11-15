import type { ComponentProps, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";
import { Root as ButtonPrimitive } from "@kobalte/core/button";
import type { VariantProps } from "cva";

import { cva, cx } from "~/lib/utils";

export const buttonVariants = cva({
  base: [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold",
    "transition-[color,background-color,border-color,box-shadow,transform] duration-150",
    "outline-hidden focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35",
    "disabled:pointer-events-none disabled:opacity-55",
    "active:translate-y-px",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/25",
  ],
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
      secondary:
        "border border-border bg-card text-foreground shadow-xs hover:border-primary/35 hover:bg-accent/70",
      outline:
        "border border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
      ghost: "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
      destructive:
        "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
      link: "text-primary underline-offset-4 hover:underline",
    },
    size: {
      default: "h-10 px-5 py-2",
      sm: "h-8 gap-1.5 px-3.5 text-[0.82rem]",
      lg: "h-11 px-6",
      icon: "size-10",
      "icon-sm": "size-8",
      "icon-lg": "size-11",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export type ButtonProps<T extends ValidComponent = "button"> = ComponentProps<
  typeof ButtonPrimitive<T>
> &
  VariantProps<typeof buttonVariants>;

export const Button = <T extends ValidComponent = "button">(props: ButtonProps<T>) => {
  const [, rest] = splitProps(props as ButtonProps, ["class", "variant", "size"]);

  return (
    <ButtonPrimitive
      data-slot="button"
      class={cx(buttonVariants({ variant: props.variant, size: props.size }), props.class)}
      {...rest}
    />
  );
};
