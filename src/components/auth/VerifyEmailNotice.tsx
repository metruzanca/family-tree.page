import { revalidate } from "@solidjs/router";
import { createSignal } from "solid-js";
import { Mail } from "lucide-solid";
import { resendVerificationEmail } from "~/api/auth-server";
import { getUser, requireUserPage } from "~/api";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/Toast";
import { attemptAction } from "~/lib/action-result";
import { useI18n } from "~/i18n/LocaleProvider";
import { Trans } from "~/i18n/Trans";

export function VerifyEmailNotice(props: { email: string; class?: string }) {
  const toast = useToast();
  const { t } = useI18n();
  const [pending, setPending] = createSignal(false);

  async function resend() {
    if (pending()) return;
    setPending(true);
    const result = await attemptAction(() => resendVerificationEmail());
    setPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate([getUser.key, requireUserPage.key]);
    if (result.data.simulated) {
      toast.show(t("auth.verifyNotice.simulated"), "info");
      return;
    }
    toast.show(
      result.data.delivered
        ? t("auth.verifyNotice.sent")
        : t("auth.verifyNotice.failed"),
      result.data.delivered ? "success" : "error",
    );
  }

  return (
    <div
      class={`flex flex-wrap items-center gap-3 rounded-2xl border border-primary/25 bg-accent/70 px-4 py-3 ${props.class ?? ""}`}
      data-testid="verify-email-notice"
    >
      <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-card text-primary">
        <Mail size={17} />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold">{t("auth.verifyNotice.title")}</p>
        <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          <Trans
            key="auth.verifyNotice.body"
            components={{
              email: <span class="font-medium text-foreground">{props.email}</span>,
            }}
          />
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={resend}
        disabled={pending()}
        data-testid="verify-email-resend"
      >
        {pending() ? t("auth.sending") : t("auth.verifyNotice.resend")}
      </Button>
    </div>
  );
}
