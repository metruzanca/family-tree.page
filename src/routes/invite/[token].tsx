import { A, createAsync, revalidate, useNavigate, useParams } from "@solidjs/router";
import { Match, Show, Switch, createSignal } from "solid-js";
import { ArrowRight, Clock, Leaf, LockKeyhole } from "lucide-solid";
import { getInvitePreview, getUser, getMyTrees } from "~/api";
import { acceptInvite } from "~/api/trees-server";
import { BrandMark } from "~/components/app/AppHeader";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { LoadingScreen } from "~/components/ui/Loading";
import { useToast } from "~/components/ui/Toast";
import { formatDate, roleLabel } from "~/lib/format";
import { track } from "~/lib/analytics";

export const route = {
  preload: ({ params }: { params: { token: string } }) => getInvitePreview(params.token),
};

export default function InvitePage() {
  return (
    <Show when={true} fallback={<LoadingScreen />}>
      <InviteInner />
    </Show>
  );
}

function InviteInner() {
  const params = useParams<{ token: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const preview = createAsync(() => getInvitePreview(params.token));
  const user = createAsync(() => getUser());
  const [pending, setPending] = createSignal(false);
  const redirectTo = () => `/invite/${params.token}`;

  async function join() {
    if (pending()) return;
    setPending(true);
    const result = await acceptInvite(params.token);
    setPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate([getMyTrees.key, getInvitePreview.key]);
    track("invite_accepted");
    toast.show("You joined the tree.", "success");
    navigate(`/trees/${result.data.treeId}`);
  }

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
          <Show when={preview()}>
            {invite => (
              <Switch>
                <Match when={invite().status === "valid" && invite()}>
                  {valid => (
                    <>
                      <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-accent text-primary">
                        <Leaf size={28} />
                      </div>
                      <p class="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                        You are invited
                      </p>
                      <h1 class="mt-2 font-display text-4xl tracking-tight">
                        {(valid() as any).treeName}
                      </h1>
                      <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                        {(valid() as any).inviterName} invited you to join as{" "}
                        <span class="font-semibold text-foreground">{roleLabel((valid() as any).role)}</span>.
                      </p>
                      <div class="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <Clock size={13} />
                        Expires {formatDate((valid() as any).expiresAt)}
                      </div>

                      <Show
                        when={user()}
                        fallback={
                          <div class="mt-8 space-y-3">
                            <A
                              href={`/login?redirectTo=${encodeURIComponent(redirectTo())}`}
                              class={buttonVariants({ class: "w-full" })}
                            >
                              Sign in to join
                              <ArrowRight size={16} />
                            </A>
                            <A
                              href={`/register?redirectTo=${encodeURIComponent(redirectTo())}`}
                              class={buttonVariants({ variant: "secondary", class: "w-full" })}
                            >
                              Create an account
                            </A>
                          </div>
                        }
                      >
                        <Button class="mt-8 w-full" onClick={join} disabled={pending()}>
                          {pending() ? "Joining…" : `Join ${(valid() as any).treeName}`}
                        </Button>
                      </Show>
                      <p class="mt-5 flex items-center justify-center gap-1.5 text-[0.7rem] text-muted-foreground">
                        <LockKeyhole size={12} />
                        This link works once. The tree stays private to its members.
                      </p>
                    </>
                  )}
                </Match>
                <Match when={true}>
                  <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-background text-muted-foreground">
                    <Clock size={28} />
                  </div>
                  <h1 class="mt-6 font-display text-3xl tracking-tight">This invite is not usable</h1>
                  <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    {invite().status === "used"
                      ? "This link has already been used."
                      : invite().status === "expired"
                        ? "This invite has expired."
                        : invite().status === "revoked"
                          ? "The tree owner revoked this invite."
                          : "This invite link does not exist."}
                  </p>
                  <p class="mt-2 text-xs text-muted-foreground">Ask the tree owner for a new link.</p>
                  <A href={user() ? "/trees" : "/login"} class={buttonVariants({ variant: "secondary", class: "mt-7" })}>
                    {user() ? "Go to your trees" : "Sign in"}
                  </A>
                </Match>
              </Switch>
            )}
          </Show>
          <Show when={preview() === undefined}>
            <Skeleton class="mx-auto size-16 rounded-3xl" />
            <Skeleton class="mx-auto mt-6 h-8 w-56 rounded-lg" />
            <Skeleton class="mx-auto mt-3 h-4 w-72 rounded-md" />
          </Show>
        </Card>
      </div>
    </main>
  );
}
