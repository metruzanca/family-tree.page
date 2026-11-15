import { A } from "@solidjs/router";
import { Sprout } from "lucide-solid";

export default function NotFound() {
  return (
    <main class="page-shell grid min-h-[100dvh] place-items-center px-6">
      <div class="paper-card max-w-md p-8 text-center">
        <div class="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-moss-soft text-moss">
          <Sprout size={26} />
        </div>
        <h1 class="mt-5 font-display text-3xl tracking-tight">This branch does not exist</h1>
        <p class="mt-2 text-sm leading-relaxed text-muted">
          The page may have moved, or the tree may have been deleted.
        </p>
        <A href="/trees" class="btn btn-primary mt-6">
          Back to your trees
        </A>
      </div>
    </main>
  );
}
