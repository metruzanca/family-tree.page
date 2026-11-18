import { A, createAsync, revalidate, useNavigate, useParams } from "@solidjs/router";
import { Match, Show, Switch, createSignal } from "solid-js";
import { ArrowRight, Clock, Leaf, LockKeyhole } from "lucide-solid";
import { getInvitePreview, getUser, getMyTrees } from "~/api";
import { acceptInvite } from "~/api/trees-server";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { BrandMark } from "~/components/app/AppHeader";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { useToast } from "~/components/ui/Toast";
import { useI18n } from "~/i18n/LocaleProvider";
import { LocaleSwitcher } from "~/i18n/LocaleSwitcher";
import { Trans } from "~/i18n/Trans";
import { attemptAction } from "~/lib/action-result";
import { formatDate, roleKey } from "~/lib/format";
import { track } from "~/lib/analytics";

export const route = {
  preload: ({ params }: { params: { token: string } }) => getInvitePreview(params.token),
};

export default function InvitePage() {
  const { t } = useI18n();
  return (
    <AppErrorBoundary
      title={t("invite.error.title")}
      message={t("invite.error.message")}
      revalidateKeys={[getInvitePreview.key, getUser.key]}
      back={{ href: "/trees", label: t("auth.verify.goToTrees") }}
    >
      <InviteInner />
    </AppErrorBoundary>
  );
}

function InviteInner() {
  const params = useParams<{ token: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { t, locale } = useI18n();
  const preview = createAsync(() => getInvitePreview(params.token));
  const user = createAsync(() => getUser());
  const [pending, setPending] = createSignal(false);
  const redirectTo = () => `/invite/${params.token}`;

  async function join() {
    if (pending()) return;
    setPending(true);
    const result = await attemptAction(() => acceptInvite(params.token));
    setPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate([getMyTrees.key, getInvitePreview.key]);
    track("invite_accepted");
    toast.show(t("invite.valid.joined"), "success");
    navigate(`/trees/${result.data.treeId}`);
  }

  return (
    <main class="page-shell flex min-h-[100dvh] flex-col">
      <div class="flex items-center justify-between px-5 py-5 sm:px-8">
        <BrandMark />
        <div class="flex items-center gap-2">
          <LocaleSwitcher variant="text" />
          <Show when={user()}>
            <A href="/trees" class={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t("auth.yourTrees")}
            </A>
          </Show>
        </div>
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
                        {t("invite.valid.eyebrow")}
                      </p>
                      <h1 class="mt-2 font-display text-4xl tracking-tight">
                        {(valid() as any).treeName}
                      </h1>
                      <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                        <Trans
                          key="invite.valid.invitedBy"
                          components={{
                            name: <>{(valid() as any).inviterName}</>,
                            role: (
                              <span class="font-semibold text-foreground">
                                {t(roleKey((valid() as any).role))}
                              </span>
                            ),
                          }}
                        />
                      </p>
                      <Show when={(valid() as any).email}>
                        <p class="mt-2 text-xs text-muted-foreground">
                          <Trans
                            key="invite.valid.sentTo"
                            components={{
                              email: (
                                <span class="font-medium text-foreground">
                                  {(valid() as any).email}
                                </span>
                              ),
                            }}
                          />
                        </p>
                      </Show>
                      <div class="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <Clock size={13} />
                        {t("tree.settings.share.expiresIn", {
                          when: formatDate((valid() as any).expiresAt, locale()),
                        })}
                      </div>

                      <Show
                        when={user()}
                        fallback={
                          <div class="mt-8 space-y-3">
                            <A
                              href={`/login?redirectTo=${encodeURIComponent(redirectTo())}`}
                              class={buttonVariants({ class: "w-full" })}
                            >
                              {t("invite.valid.signIn")}
                              <ArrowRight size={16} />
                            </A>
                            <A
                              href={`/register?redirectTo=${encodeURIComponent(redirectTo())}`}
                              class={buttonVariants({ variant: "secondary", class: "w-full" })}
                            >
                              {t("auth.createAccount")}
                            </A>
                          </div>
                        }
                      >
                        <Button class="mt-8 w-full" onClick={join} disabled={pending()}>
                          {pending()
                            ? t("invite.valid.joining")
                            : t("invite.valid.join", { name: (valid() as any).treeName })}
                        </Button>
                      </Show>
                      <p class="mt-5 flex items-center justify-center gap-1.5 text-[0.7rem] text-muted-foreground">
                        <LockKeyhole size={12} />
                        {t("invite.valid.once")}
                      </p>
                    </>
                  )}
                </Match>
                <Match when={true}>
                  <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-background text-muted-foreground">
                    <Clock size={28} />
                  </div>
                  <h1 class="mt-6 font-display text-3xl tracking-tight">
                    {t("invite.invalid.title")}
                  </h1>
                  <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    {invite().status === "used"
                      ? t("invite.invalid.used")
                      : invite().status === "expired"
                        ? t("invite.invalid.expired")
                        : invite().status === "revoked"
                          ? t("invite.invalid.revoked")
                          : t("invite.invalid.missing")}
                  </p>
                  <p class="mt-2 text-xs text-muted-foreground">{t("invite.invalid.askOwner")}</p>
                  <A href={user() ? "/trees" : "/login"} class={buttonVariants({ variant: "secondary", class: "mt-7" })}>
                    {user() ? t("auth.verify.goToTrees") : t("auth.signIn")}
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
