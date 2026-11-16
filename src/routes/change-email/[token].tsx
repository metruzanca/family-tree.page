import { A, createAsync, revalidate, useParams } from "@solidjs/router";
import { Match, Show, Switch, createSignal } from "solid-js";
import { CircleAlert, Clock, MailCheck, ShieldCheck } from "lucide-solid";
import { getEmailChangePreview, getUser, getPendingEmailChange, logout } from "~/api";
import { confirmEmailChange } from "~/api/account-server";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { BrandMark } from "~/components/app/AppHeader";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { attemptAction } from "~/lib/action-result";

export const route = {
  preload: ({ params }: { params: { token: string } }) =>
    getEmailChangePreview(params.token),
};

export default function ChangeEmailPage() {
  return (
    <AppErrorBoundary
      title="We could not check this link"
      message="The link may still be good. Try again, or request a new change from account settings."
      revalidateKeys={[getEmailChangePreview.key, getUser.key]}
      back={{ href: "/settings", label: "Account settings" }}
    >
      <ChangeEmailInner />
    </AppErrorBoundary>
  );
}

function ChangeEmailInner() {
  const params = useParams<{ token: string }>();
  const preview = createAsync(() => getEmailChangePreview(params.token));
  const user = createAsync(() => getUser());
  const valid = () => {
    const value = preview();
    return value?.status === "valid" ? value : null;
  };
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  const [changedTo, setChangedTo] = createSignal<string | null>(null);

  async function confirm() {
    if (pending()) return;
    setPending(true);
    setError("");
    const result = await attemptAction(() => confirmEmailChange(params.token));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setChangedTo(result.data.email);
    await revalidate([
      getUser.key,
      getPendingEmailChange.key,
      getEmailChangePreview.key,
    ]);
  }

  return (
    <main class="page-shell flex min-h-[100dvh] flex-col">
      <div class="flex items-center justify-between px-5 py-5 sm:px-8">
        <BrandMark />
        <Show when={user()}>
          <A href="/settings" class={buttonVariants({ variant: "ghost", size: "sm" })}>
            Account settings
          </A>
        </Show>
      </div>
      <div class="flex flex-1 items-center justify-center px-4 pb-16">
        <Card class="w-full max-w-lg items-center gap-0 p-7 text-center sm:p-10">
          <Show
            when={preview()}
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
                <Match when={changedTo()}>
                  <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-accent text-primary">
                    <MailCheck size={30} />
                  </div>
                  <p class="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    Email changed
                  </p>
                  <h1 class="mt-2 font-display text-4xl tracking-tight">You're all set</h1>
                  <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Your account now uses{" "}
                    <span class="font-medium text-foreground">{changedTo()}</span> for sign-in,
                    invitations, and reminders.
                  </p>
                  <A href="/settings" class={buttonVariants({ class: "mt-7" })}>
                    Back to account settings
                  </A>
                </Match>

                <Match when={state().status === "valid"}>
                  <Show
                    when={valid()?.matchesUser}
                    fallback={
                      <Show
                        when={valid()?.signedIn}
                        fallback={
                          <>
                            <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-accent text-primary">
                              <ShieldCheck size={30} />
                            </div>
                            <h1 class="mt-6 font-display text-3xl tracking-tight">
                              Sign in to confirm
                            </h1>
                            <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                              This link changes the email address on your account. Sign in as the
                              account owner to finish the change.
                            </p>
                            <A
                              href={`/login?redirectTo=${encodeURIComponent(`/change-email/${params.token}`)}`}
                              class={buttonVariants({ class: "mt-7" })}
                            >
                              Sign in
                            </A>
                          </>
                        }
                      >
                        <>
                          <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-background text-muted-foreground">
                            <CircleAlert size={30} />
                          </div>
                          <h1 class="mt-6 font-display text-3xl tracking-tight">
                            Wrong account
                          </h1>
                          <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                            This link belongs to a different family-tree account. Sign out and sign
                            back in as the account that requested the change.
                          </p>
                          <form action={logout} method="post" class="mt-7">
                            <Button type="submit" variant="secondary">
                              Sign out
                            </Button>
                          </form>
                        </>
                      </Show>
                    }
                  >
                    <>
                      <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-accent text-primary">
                        <MailCheck size={30} />
                      </div>
                      <p class="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                        Confirm the change
                      </p>
                      <h1 class="mt-2 font-display text-4xl tracking-tight">
                        Use a new email?
                      </h1>
                      <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                        Your account will switch to{" "}
                        <span class="font-medium text-foreground">{valid()?.newEmail}</span>.
                        Your current address stops working for sign-in as soon as you confirm.
                      </p>
                      <Show when={error()}>
                        <Alert variant="destructive" class="mt-5 w-full rounded-xl py-2.5 text-left">
                          <CircleAlert />
                          <AlertDescription>{error()}</AlertDescription>
                        </Alert>
                      </Show>
                      <div class="mt-7 flex flex-wrap items-center justify-center gap-2">
                        <Button
                          type="button"
                          disabled={pending()}
                          onClick={confirm}
                        >
                          {pending() ? "Changing…" : "Confirm new email"}
                        </Button>
                        <A href="/settings" class={buttonVariants({ variant: "ghost" })}>
                          Cancel
                        </A>
                      </div>
                    </>
                  </Show>
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
                      ? "This email change link has expired. Request a new one from account settings."
                      : state().status === "used"
                        ? "This email change link has already been used."
                        : "This email change link is not valid."}
                  </p>
                  <A
                    href={user() ? "/settings" : "/login"}
                    class={buttonVariants({ variant: "secondary", class: "mt-7" })}
                  >
                    {user() ? "Open account settings" : "Sign in"}
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
