import { A, createAsync, useParams } from "@solidjs/router";
import { Match, Switch, Show } from "solid-js";
import { CircleCheck, Clock } from "lucide-solid";
import { getUser, verifyEmail } from "~/api";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { BrandMark } from "~/components/app/AppHeader";
import { buttonVariants } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

export const route = {
  preload: ({ params }: { params: { token: string } }) => verifyEmail(params.token),
};

export default function VerifyEmailPage() {
  return (
    <AppErrorBoundary
      title="We could not check this link"
      message="The link may still be good. Try again, or request a new one from account settings."
      revalidateKeys={[verifyEmail.key, getUser.key]}
      back={{ href: "/login", label: "Back to sign in" }}
    >
      <VerifyEmailInner />
    </AppErrorBoundary>
  );
}

function VerifyEmailInner() {
  const params = useParams<{ token: string }>();
  const result = createAsync(() => verifyEmail(params.token));
  const user = createAsync(() => getUser());

  return (
    <main class="page-shell flex min-h-[100dvh] flex-col">
      <div class="flex items-center justify-between px-5 py-5 sm:px-8">
        <BrandMark />
        <Show when={user()}>
          <A href="/trees" class={buttonVariants({ variant: "ghost", size: "sm" })}>
            Your trees
          </A>
        </Show>
      </div>
      <div class="flex flex-1 items-center justify-center px-4 pb-16">
        <Card class="w-full max-w-lg items-center gap-0 p-7 text-center sm:p-10">
          <Show
            when={result()}
            fallback={
              <>
                <Skeleton class="mx-auto size-16 rounded-3xl" />
                <Skeleton class="mx-auto mt-6 h-8 w-56 rounded-lg" />
                <Skeleton class="mx-auto mt-3 h-4 w-72 rounded-md" />
              </>
            }
          >
            {state => (
              <Switch>
                <Match when={state().status === "verified" || state().status === "already"}>
                  <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-accent text-primary">
                    <CircleCheck size={30} />
                  </div>
                  <p class="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    Email confirmed
                  </p>
                  <h1 class="mt-2 font-display text-4xl tracking-tight">
                    {state().status === "already" ? "Already confirmed" : "You're all set"}
                  </h1>
                  <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    <Show
                      when={user()}
                      fallback="Your email address is verified. Sign in to start building your family trees."
                    >
                      Your email address is verified. You can now send invitations to relatives.
                    </Show>
                  </p>
                  <A
                    href={user() ? "/trees" : "/login"}
                    class={buttonVariants({ class: "mt-7" })}
                  >
                    {user() ? "Go to your trees" : "Sign in"}
                  </A>
                </Match>
                <Match when={true}>
                  <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-background text-muted-foreground">
                    <Clock size={28} />
                  </div>
                  <h1 class="mt-6 font-display text-3xl tracking-tight">
                    This link cannot be used
                  </h1>
                  <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    {state().status === "expired"
                      ? "This verification link has expired. Sign in and ask for a new one."
                      : "This verification link is not valid. It may have been used already."}
                  </p>
                  <A
                    href={user() ? "/settings" : "/login"}
                    class={buttonVariants({ variant: "secondary", class: "mt-7" })}
                  >
                    {user() ? "Resend from your account" : "Sign in"}
                  </A>
                </Match>
              </Switch>
            )}
          </Show>
        </Card>
      </div>
    </main>
  );
}
