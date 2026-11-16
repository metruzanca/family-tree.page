import { A, useNavigate } from "@solidjs/router";
import { Show, type JSX } from "solid-js";
import { LogOut, Moon, Settings, Sun } from "lucide-solid";
import type { PublicUser } from "~/server/auth-service";
import { logout } from "~/api";
import { Avatar } from "../ui/Avatar";
import { buttonVariants } from "../ui/button";
import { IconButton } from "../ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
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
        family-tree
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
  const navigate = useNavigate();
  let signOutForm: HTMLFormElement | undefined;

  return (
    <header class="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div class="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Show when={props.back} fallback={<BrandMark compact />}>
          <A
            href={props.back!.href}
            class={buttonVariants({ variant: "ghost", size: "sm", class: "-ml-2 gap-1.5" })}
          >
            <span aria-hidden="true">←</span>
            <span class="hidden sm:inline">{props.back!.label}</span>
          </A>
          <Show when={props.center}>
            <span class="hidden h-5 w-px bg-border sm:block" />
            <span class="hidden truncate text-sm font-semibold sm:inline">{props.center}</span>
          </Show>
        </Show>
        <Show when={props.center && props.back}>
          <span class="min-w-0 flex-1 truncate text-sm font-semibold sm:hidden">
            {props.center}
          </span>
        </Show>
        <div class="ml-auto flex items-center gap-1.5">
          {props.actions}
          <IconButton
            label={theme() === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            onClick={toggle}
          >
            <Show when={theme() === "dark"} fallback={<Moon />}>
              <Sun />
            </Show>
          </IconButton>

          <DropdownMenu placement="bottom-end">
            <DropdownMenuTrigger
              class="rounded-full p-0.5 outline-hidden transition hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/35"
              aria-label="Account menu"
            >
              <Avatar name={props.user.displayName} size={34} />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-64 rounded-2xl p-1.5">
              <div class="px-3 py-2">
                <p class="truncate text-sm font-semibold">{props.user.displayName}</p>
                <p class="truncate text-xs text-muted-foreground">{props.user.email}</p>
              </div>
              <DropdownMenuSeparator class="my-1" />
              <DropdownMenuItem
                class="gap-2 rounded-xl px-3 py-2"
                onSelect={() => navigate("/settings")}
              >
                <Settings />
                Account settings
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                class="gap-2 rounded-xl px-3 py-2"
                onSelect={() => signOutForm?.requestSubmit()}
              >
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <form ref={signOutForm} action={logout} method="post" class="hidden" />
        </div>
      </div>
    </header>
  );
}
