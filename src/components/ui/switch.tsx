import type { ComponentProps, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"
import { Switch as SwitchPrimitive } from "@kobalte/core/switch"

import { cx } from "~/lib/utils"

export type SwitchProps<T extends ValidComponent = "div"> = ComponentProps<
  typeof SwitchPrimitive<T>
>

export const Switch = <T extends ValidComponent = "div">(props: SwitchProps<T>) => {
  const [, rest] = splitProps(props as SwitchProps, ["class"])

  return (
    <SwitchPrimitive
      data-slot="switch"
      class={cx("peer inline-flex shrink-0 items-center", props.class)}
      {...rest}
    />
  )
}

export type SwitchControlProps<T extends ValidComponent = "button"> = ComponentProps<
  typeof SwitchPrimitive.Control<T>
>

export const SwitchControl = <T extends ValidComponent = "button">(
  props: SwitchControlProps<T>,
) => {
  const [, rest] = splitProps(props as SwitchControlProps, ["class"])

  return (
    <SwitchPrimitive.Control
      data-slot="switch-control"
      class={cx(
        "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border bg-muted p-0.5 transition-colors data-[checked]:border-primary data-[checked]:bg-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50",
        props.class,
      )}
      {...rest}
    />
  )
}

export type SwitchInputProps<T extends ValidComponent = "input"> = ComponentProps<
  typeof SwitchPrimitive.Input<T>
>

export const SwitchInput = <T extends ValidComponent = "input">(props: SwitchInputProps<T>) => {
  return <SwitchPrimitive.Input data-slot="switch-input" {...props} />
}

export type SwitchThumbProps<T extends ValidComponent = "div"> = ComponentProps<
  typeof SwitchPrimitive.Thumb<T>
>

export const SwitchThumb = <T extends ValidComponent = "div">(props: SwitchThumbProps<T>) => {
  const [, rest] = splitProps(props as SwitchThumbProps, ["class"])

  return (
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      class={cx(
        "pointer-events-none block size-5 rounded-full bg-card shadow-xs transition-transform data-[checked]:translate-x-5",
        props.class,
      )}
      {...rest}
    />
  )
}

export type SwitchLabelProps<T extends ValidComponent = "label"> = ComponentProps<
  typeof SwitchPrimitive.Label<T>
>

export const SwitchLabel = <T extends ValidComponent = "label">(props: SwitchLabelProps<T>) => {
  const [, rest] = splitProps(props as SwitchLabelProps, ["class"])

  return (
    <SwitchPrimitive.Label
      data-slot="switch-label"
      class={cx("text-sm font-semibold", props.class)}
      {...rest}
    />
  )
}

export type SwitchDescriptionProps<T extends ValidComponent = "div"> = ComponentProps<
  typeof SwitchPrimitive.Description<T>
>

export const SwitchDescription = <T extends ValidComponent = "div">(
  props: SwitchDescriptionProps<T>,
) => {
  const [, rest] = splitProps(props as SwitchDescriptionProps, ["class"])

  return (
    <SwitchPrimitive.Description
      data-slot="switch-description"
      class={cx("text-xs leading-relaxed text-muted-foreground", props.class)}
      {...rest}
    />
  )
}
