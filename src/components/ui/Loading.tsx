export function LoadingScreen(props: { label?: string }) {
  return (
    <div class="flex min-h-[60dvh] items-center justify-center px-6">
      <div class="flex items-center gap-3 text-sm text-muted">
        <span class="h-2.5 w-2.5 animate-pulse rounded-full bg-moss" />
        <span>{props.label ?? "Growing your tree…"}</span>
      </div>
    </div>
  );
}

export function LoadingRows(props: { count?: number }) {
  return (
    <div class="space-y-2">
      {Array.from({ length: props.count ?? 4 }).map(() => (
        <div class="skeleton h-14 w-full" />
      ))}
    </div>
  );
}
