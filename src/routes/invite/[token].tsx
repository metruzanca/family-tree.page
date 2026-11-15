import { A, createAsync, revalidate, useNavigate, useParams } from "@solidjs/router";
import { Match, Show, Switch, createSignal } from "solid-js";
import { ArrowRight, Clock, Leaf, LockKeyhole } from "lucide-solid";
import { getInvitePreview, getUser, getMyTrees } from "~/api";
import { acceptInvite } from "~/api/trees-server";
import { BrandMark } from "~/components/app/AppHeader";
import { Button } from "~/components/ui/Button";
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
          <A href="/trees" class="btn btn-ghost btn-sm">
            Your trees
          </A>
        </Show>
      </div>
      <div class="flex flex-1 items-center justify-center px-4 pb-16">
        <div class="paper-card w-full max-w-lg p-7 text-center sm:p-10">
          <Show when={preview()}>
            {invite => (
              <Switch>
                <Match when={invite().status === "valid" && invite()}>
                  {valid => (
                    <>
                      <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-moss-soft text-moss">
                        <Leaf size={28} />
                      </div>
                      <p class="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-moss">
                        You are invited
                      </p>
                      <h1 class="mt-2 font-display text-4xl tracking-tight">
                        {(valid() as any).treeName}
                      </h1>
                      <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
                        {(valid() as any).inviterName} invited you to join as{" "}
                        <span class="font-semibold text-ink">{roleLabel((valid() as any).role)}</span>.
                      </p>
                      <div class="mt-6 flex items-center justify-center gap-2 text-xs text-muted">
                        <Clock size={13} />
                        Expires {formatDate((valid() as any).expiresAt)}
                      </div>

                      <Show
                        when={user()}
                        fallback={
                          <div class="mt-8 space-y-3">
                            <A
                              href={`/login?redirectTo=${encodeURIComponent(redirectTo())}`}
                              class="btn btn-primary w-full"
                            >
                              Sign in to join
                              <ArrowRight size={16} />
                            </A>
                            <A
                              href={`/register?redirectTo=${encodeURIComponent(redirectTo())}`}
                              class="btn btn-secondary w-full"
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
                      <p class="mt-5 flex items-center justify-center gap-1.5 text-[0.7rem] text-muted">
                        <LockKeyhole size={12} />
                        This link works once. The tree stays private to its members.
                      </p>
                    </>
                  )}
                </Match>
                <Match when={true}>
                  <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-paper text-muted">
                    <Clock size={28} />
                  </div>
                  <h1 class="mt-6 font-display text-3xl tracking-tight">This invite is not usable</h1>
                  <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
                    {invite().status === "used"
                      ? "This link has already been used."
                      : invite().status === "expired"
                        ? "This invite has expired."
                        : invite().status === "revoked"
                          ? "The tree owner revoked this invite."
                          : "This invite link does not exist."}
                  </p>
                  <p class="mt-2 text-xs text-muted">Ask the tree owner for a new link.</p>
                  <A href={user() ? "/trees" : "/login"} class="btn btn-secondary mt-7">
                    {user() ? "Go to your trees" : "Sign in"}
                  </A>
                </Match>
              </Switch>
            )}
          </Show>
          <Show when={preview() === undefined}>
            <div class="skeleton mx-auto h-16 w-16 rounded-3xl" />
            <div class="skeleton mx-auto mt-6 h-8 w-56" />
            <div class="skeleton mx-auto mt-3 h-4 w-72" />
          </Show>
        </div>
      </div>
    </main>
  );
}
