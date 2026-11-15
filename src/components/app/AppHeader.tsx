import { A } from "@solidjs/router";
import { Show, type JSX } from "solid-js";
import { LogOut, Moon, Settings, Sun } from "lucide-solid";
import type { PublicUser } from "~/server/auth-service";
import { logout } from "~/api";
import { Avatar } from "../ui/Avatar";
import { useTheme } from "../ui/Theme";

export function BrandMark(props: { compact?: boolean }) {
  return (
    <A href="/trees" class="inline-flex items-center gap-2.5">
      <span class="grid h-9 w-9 place-items-center rounded-xl bg-[#22331f] text-[#f5efe2] shadow-sm">
        <svg viewBox="0 0 64 64" class="h-5 w-5" aria-hidden="true">
          <path d="M32 52V30" stroke="currentColor" stroke-width="6" stroke-linecap="round" />
          <path d="M32 33c0-9-7-16-16-16 0 9 7 16 16 16Z" fill="#c49a45" />
          <path d="M32 29c0-8 6-14 14-14 0 8-6 14-14 14Z" fill="#8fa98f" />
          <path d="M32 39c-7 0-12 4-14 10 7 1 12-3 14-10Z" fill="#bf6247" />
        </svg>
      </span>
      <span class={`font-display text-xl tracking-tight ${props.compact ? "hidden sm:inline" : ""}`}>
        Roots
      </span>
    </A>
  );
}

export function AppHeader(props: {
  user: PublicUser;
  actions?: JSX.Element;
  back?: { href: string; label: string };
  center?: JSX.Element;
}) {
  const { theme, toggle } = useTheme();
  return (
    <header class="sticky top-0 z-30 border-b border-line/80 bg-paper/85 backdrop-blur-xl">
      <div class="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Show when={props.back} fallback={<BrandMark compact />}>
          <A
            href={props.back!.href}
            class="btn btn-ghost btn-sm -ml-2 gap-1.5 text-muted hover:text-ink"
          >
            <span aria-hidden="true">←</span>
            <span class="hidden sm:inline">{props.back!.label}</span>
          </A>
          <span class="hidden h-5 w-px bg-line sm:block" />
          <span class="hidden text-sm font-semibold sm:inline">{props.center}</span>
        </Show>
        <Show when={props.center && props.back}>
          <span class="min-w-0 flex-1 truncate text-sm font-semibold sm:hidden">
            {props.center}
          </span>
        </Show>
        <div class="ml-auto flex items-center gap-1.5">
          {props.actions}
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            aria-label="Toggle theme"
            onClick={toggle}
          >
            <Show when={theme() === "dark"} fallback={<Moon size={17} />}>
              <Sun size={17} />
            </Show>
          </button>
          <details class="group relative">
            <summary class="flex cursor-pointer list-none items-center gap-2 rounded-full p-0.5 hover:bg-moss/10 [&::-webkit-details-marker]:hidden">
              <Avatar name={props.user.displayName} size={34} />
            </summary>
            <div class="absolute right-0 top-11 w-56 overflow-hidden rounded-2xl border border-line bg-raised p-1.5 shadow-xl">
              <div class="px-3 py-2">
                <p class="truncate text-sm font-semibold">{props.user.displayName}</p>
                <p class="truncate text-xs text-muted">{props.user.email}</p>
              </div>
              <hr class="divider my-1" />
              <A
                href="/settings"
                class="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-moss/8"
              >
                <Settings size={15} />
                Account settings
              </A>
              <form action={logout} method="post">
                <button
                  type="submit"
                  class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </form>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
