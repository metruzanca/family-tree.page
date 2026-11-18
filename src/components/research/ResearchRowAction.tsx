import { Pencil, Plus, Trash2 } from "lucide-solid";
import { cx } from "~/lib/utils";

const ICONS = {
  edit: Pencil,
  add: Plus,
  delete: Trash2,
} as const;

/**
 * A compact action for a research row. It stays quiet until the row is
 * hovered, mirrors the person panel on the graph, and never prints.
 */
export function ResearchRowAction(props: {
  icon: keyof typeof ICONS;
  label: string;
  onClick: () => void;
  testId: string;
  reveal?: boolean;
  class?: string;
}) {
  const Icon = ICONS[props.icon];
  return (
    <button
      type="button"
      class={cx(
        "grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition print:hidden",
        props.icon === "delete"
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-primary/10 hover:text-foreground",
        props.reveal &&
          "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
        props.class,
      )}
      title={props.label}
      aria-label={props.label}
      data-testid={props.testId}
      onClick={event => {
        event.stopPropagation();
        props.onClick();
      }}
    >
      <Icon size={13} />
    </button>
  );
}
