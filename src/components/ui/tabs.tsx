import type { ComponentProps, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"
import { Tabs as TabsPrimitive } from "@kobalte/core/tabs"

import { cx } from "~/lib/utils"

export type TabsProps<T extends ValidComponent = "div"> = ComponentProps<
  typeof TabsPrimitive<T>
>

export const Tabs = <T extends ValidComponent = "div">(props: TabsProps<T>) => {
  const [, rest] = splitProps(props as TabsProps, ["class"])

  return (
    <TabsPrimitive
      data-slot="tabs"
      class={cx(
        "flex flex-col gap-2",
        "data-[orientation=vertical]:flex-row",
        props.class,
      )}
      {...rest}
    />
  )
}

export type TabsListProps<T extends ValidComponent = "div"> = ComponentProps<
  typeof TabsPrimitive.List<T>
>

export const TabsList = <T extends ValidComponent = "div">(
  props: TabsListProps<T>,
) => {
  const [, rest] = splitProps(props as TabsListProps, ["class"])

  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      class={cx(
        "relative flex h-10 w-fit items-center justify-center gap-1 rounded-full border border-border bg-muted/70 p-1 text-muted-foreground",
        "data-[orientation=vertical]:mt-[3px] data-[orientation=vertical]:size-full data-[orientation=vertical]:flex-col",
        props.class,
      )}
      {...rest}
    />
  )
}

export type TabsTriggerProps<T extends ValidComponent = "button"> =
  ComponentProps<typeof TabsPrimitive.Trigger<T>>

export const TabsTrigger = <T extends ValidComponent = "button">(
  props: TabsTriggerProps<T>,
) => {
  const [, rest] = splitProps(props as TabsTriggerProps, ["class"])

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      class={cx(
        "peer relative z-10 inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground data-[selected]:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class,
      )}
      {...rest}
    />
  )
}

export type TabsContentProps<T extends ValidComponent = "div"> = ComponentProps<
  typeof TabsPrimitive.Content<T>
>

export const TabsContent = <T extends ValidComponent = "div">(
  props: TabsContentProps<T>,
) => {
  const [, rest] = splitProps(props as TabsContentProps, ["class"])

  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      class={cx("flex-1 outline-none", props.class)}
      {...rest}
    />
  )
}

export type TabsIndicatorProps<T extends ValidComponent = "div"> =
  ComponentProps<typeof TabsPrimitive.Indicator<T>>

export const TabsIndicator = <T extends ValidComponent = "div">(
  props: TabsIndicatorProps<T>,
) => {
  const [, rest] = splitProps(props as TabsIndicatorProps, ["class"])

  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      class={cx(
        "absolute inset-0 rounded-full border border-border/70 bg-card shadow-xs transition-[box-shadow,transform,width,height] duration-200 peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/35",
        props.class,
      )}
      {...rest}
    />
  )
}
