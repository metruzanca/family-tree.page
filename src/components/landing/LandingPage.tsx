import { For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { A } from "@solidjs/router";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Images,
  Lock,
  Moon,
  Network,
  Rows3,
  Scale,
  Search,
  Smartphone,
  Sprout,
  Sun,
  Users,
} from "lucide-solid";
import { BrandMark } from "~/components/app/AppHeader";
import { buttonVariants } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { IconButton } from "~/components/ui/icon-button";
import { useTheme } from "~/components/ui/Theme";
import { LandingHero } from "./LandingHero";

const features = [
  {
    icon: Network,
    title: "A real graph, not a list",
    body: "People are nodes, parent and partner links are edges, and every branch stays visible at a glance.",
  },
  {
    icon: Images,
    title: "Photos live in the tree",
    body: "Portraits sit on the person. Albums, letters and documents hang off as satellite nodes you can open.",
  },
  {
    icon: Lock,
    title: "Private by default",
    body: "One owner, any number of editors and viewers. Invite by single-use link or email, and nothing is public.",
  },
  {
    icon: Rows3,
    title: "Generation-aware layouts",
    body: "Parents above children, partners on the same row, plus a freeform mode and a flip for oldest at top or bottom.",
  },
  {
    icon: CalendarDays,
    title: "Birthdays and anniversaries",
    body: "A calendar for every tree, with optional email reminders a week before, the day before, and the morning of.",
  },
  {
    icon: Users,
    title: "See who is looking",
    body: "Live presence shows who else has the tree open and which person or file they are viewing right now.",
  },
  {
    icon: Search,
    title: "Find anyone fast",
    body: "Search people and files, highlight their neighbours, then zoom straight to the branch you need.",
  },
  {
    icon: Smartphone,
    title: "Made for phones",
    body: "A person sheet, touch gestures, and a search fallback that works when a whole tree will not fit.",
  },
];

const steps = [
  {
    title: "Add the people you remember",
    body: "Start with yourself, a parent, or the person whose stories you want to keep.",
  },
  {
    title: "Connect the branches",
    body: "Add parents, partners and children. Add a child and a second parent in one step.",
  },
  {
    title: "Invite a relative",
    body: "Send a link. Editors can add people and photos, viewers can read and explore.",
  },
];

const stack = ["SolidStart", "Drizzle", "PostgreSQL", "Railway", "Tailwind"];

const repoUrl = "https://github.com/metruzanca/family-tree.page";
const licenseUrl = `${repoUrl}/blob/main/LICENSE`;

export function LandingPage() {
  const { theme, toggle } = useTheme();

  return (
    <div class="page-shell min-h-[100dvh]">
      <header class="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-xl">
        <div class="mx-auto flex h-16 max-w-[86rem] items-center gap-3 px-4 sm:px-6">
          <BrandMark href="/" />

          <nav class="ml-6 hidden items-center gap-1 text-sm text-muted-foreground md:flex">
            <a
              href="#features"
              class="rounded-full px-3 py-1.5 transition hover:bg-accent/70 hover:text-foreground"
            >
              Features
            </a>
            <a
              href="#open-source"
              class="rounded-full px-3 py-1.5 transition hover:bg-accent/70 hover:text-foreground"
            >
              Open source
            </a>
          </nav>

          <div class="ml-auto flex items-center gap-1.5">
            <IconButton
              label={theme() === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              onClick={toggle}
            >
              <Show when={theme() === "dark"} fallback={<Moon size={18} />}>
                <Sun size={18} />
              </Show>
            </IconButton>
            <A
              href="/login"
              class={buttonVariants({ variant: "ghost", size: "sm", class: "hidden sm:inline-flex" })}
            >
              Sign in
            </A>
            <A href="/register" class={buttonVariants({ size: "sm" })}>
              Start free
            </A>
          </div>
        </div>
      </header>

      <main>
        <LandingHero />

        <section
          id="features"
          class="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20"
        >
          <div class="max-w-2xl">
            <p class="eyebrow">What is inside</p>
            <h2 class="mt-3 font-display text-3xl tracking-tight sm:text-4xl">
              A tree you can actually wander.
            </h2>
            <p class="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              The graph is the main view, not a list. People, partners, children and media all live
              in one connected picture, so the shape of a family stays visible.
            </p>
          </div>

          <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <For each={features}>
              {feature => (
                <Card class="h-full gap-0 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-card)]">
                  <span class="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <Dynamic component={feature.icon} size={19} />
                  </span>
                  <h3 class="mt-4 text-sm font-semibold">{feature.title}</h3>
                  <p class="mt-1.5 text-[0.82rem] leading-relaxed text-muted-foreground">
                    {feature.body}
                  </p>
                </Card>
              )}
            </For>
          </div>
        </section>

        <section class="border-y border-border bg-card/40">
          <div class="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <div class="grid gap-8 sm:grid-cols-3">
              <For each={steps}>
                {(step, index) => (
                  <div class="flex gap-4">
                    <span class="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-background font-display text-lg text-primary">
                      {index() + 1}
                    </span>
                    <div>
                      <h3 class="font-display text-xl leading-tight tracking-tight">
                        {step.title}
                      </h3>
                      <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {step.body}
                      </p>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </section>

        <section
          id="open-source"
          class="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20"
        >
          <div class="relative overflow-hidden rounded-[1.75rem] border border-[#2b3427] bg-[#151a12] px-6 py-10 text-[#f5efe2] sm:rounded-[2.25rem] sm:px-10 lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-12 lg:py-14">
            <div class="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-gold/15 blur-3xl" />
            <div class="relative">
              <p class="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-gold">
                Free and open source
              </p>
              <h2 class="mt-3 font-display text-3xl leading-[1.1] tracking-tight sm:text-4xl">
                Free to use. Open to read.
              </h2>
              <p class="mt-4 max-w-lg text-sm leading-relaxed text-[#b9c2b0]">
                The whole app is MIT licensed. Run it on Railway, keep your data in your own
                Postgres, and change anything you like. No paywall, no locked features.
              </p>
              <div class="mt-7 flex flex-wrap items-center gap-3">
                <a
                  href={repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  class={buttonVariants({
                    size: "lg",
                    class: "bg-gold text-gold-foreground hover:bg-gold/90",
                  })}
                >
                  <GithubMark size={16} />
                  View the source
                  <ArrowUpRight size={15} />
                </a>
                <a
                  href={licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                  class={buttonVariants({
                    variant: "secondary",
                    size: "lg",
                    class:
                      "border-white/15 bg-white/5 text-[#f5efe2] hover:border-white/25 hover:bg-white/10",
                  })}
                >
                  <Scale size={16} />
                  MIT license
                </a>
              </div>
            </div>

            <div class="relative mt-9 overflow-hidden rounded-2xl border border-white/10 bg-black/30 lg:mt-0">
              <div class="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
                <span class="size-2 rounded-full bg-[#bf6247]" />
                <span class="size-2 rounded-full bg-gold" />
                <span class="size-2 rounded-full bg-[#8fa98f]" />
                <span class="ml-2 text-[0.65rem] uppercase tracking-[0.12em] text-white/35">
                  terminal
                </span>
              </div>
              <div class="scroll-thin overflow-x-auto px-4 py-4 font-mono text-[0.72rem] leading-6 whitespace-nowrap text-white/70">
                <p class="text-white/30"># clone and run it yourself</p>
                <p>
                  <span class="text-gold">git clone</span> git@github.com:metruzanca/family-tree.page.git
                </p>
                <p>
                  <span class="text-gold">cd</span> family-tree.page
                </p>
                <p>
                  <span class="text-gold">pnpm install</span>
                </p>
                <p>
                  <span class="text-gold">pnpm db:migrate</span> &&{" "}
                  <span class="text-gold">pnpm dev</span>
                </p>
              </div>
              <div class="flex flex-wrap gap-1.5 border-t border-white/10 px-4 py-3">
                <For each={stack}>
                  {item => (
                    <span class="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.62rem] text-white/50">
                      {item}
                    </span>
                  )}
                </For>
              </div>
            </div>
          </div>
        </section>

        <section class="mx-auto max-w-4xl px-4 pb-20 pt-4 text-center sm:px-6">
          <div class="mx-auto grid size-14 place-items-center rounded-3xl bg-accent text-primary">
            <Sprout size={26} />
          </div>
          <h2 class="mt-6 font-display text-4xl tracking-tight sm:text-5xl">
            Plant your first tree.
          </h2>
          <p class="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            Add the people you remember, connect the branches, then invite a relative to help fill
            in the rest.
          </p>
          <div class="mt-7 flex flex-wrap items-center justify-center gap-3">
            <A href="/register" class={buttonVariants({ size: "lg" })}>
              Create an account
              <ArrowRight size={16} />
            </A>
            <A href="/login" class={buttonVariants({ variant: "secondary", size: "lg" })}>
              Sign in
            </A>
          </div>
          <p class="mt-4 text-xs text-muted-foreground">Free to use. No credit card needed.</p>
        </section>
      </main>

      <footer class="border-t border-border bg-background/60">
        <div class="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 sm:px-6">
          <div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <BrandMark href="/" />
            <nav class="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <a href="#features" class="transition hover:text-foreground">
                Features
              </a>
              <a href="#open-source" class="transition hover:text-foreground">
                Open source
              </a>
              <a href={repoUrl} target="_blank" rel="noreferrer" class="transition hover:text-foreground">
                GitHub
              </a>
              <A href="/login" class="transition hover:text-foreground">
                Sign in
              </A>
              <A href="/register" class="transition hover:text-foreground">
                Start free
              </A>
            </nav>
          </div>
          <p class="text-[0.68rem] leading-relaxed text-muted-foreground">
            Fictional demo data inspired by The Simpsons. Not affiliated with its rights
            holders. Portraits and photographs are original SVG approximations.
          </p>
        </div>
      </footer>
    </div>
  );
}

function GithubMark(props: { size?: number }) {
  const size = () => props.size ?? 16;
  return (
    <svg
      viewBox="0 0 16 16"
      width={size()}
      height={size()}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
