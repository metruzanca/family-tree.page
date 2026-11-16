import { revalidate } from "@solidjs/router";
import { createSignal } from "solid-js";
import { Mail } from "lucide-solid";
import { resendVerificationEmail } from "~/api/auth-server";
import { getUser, requireUserPage } from "~/api";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/Toast";

export function VerifyEmailNotice(props: { email: string; class?: string }) {
  const toast = useToast();
  const [pending, setPending] = createSignal(false);

  async function resend() {
    if (pending()) return;
    setPending(true);
    const result = await resendVerificationEmail();
    setPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate([getUser.key, requireUserPage.key]);
    if (result.data.simulated) {
      toast.show(
        "Verification email printed to the server console. Resend configured servers deliver it by email.",
        "info",
      );
      return;
    }
    toast.show(
      result.data.delivered
        ? "Verification link sent. Check your inbox."
        : "The email could not be sent. Try again later.",
      result.data.delivered ? "success" : "error",
    );
  }

  return (
    <div
      class={`flex flex-wrap items-center gap-3 rounded-2xl border border-primary/25 bg-accent/70 px-4 py-3 ${props.class ?? ""}`}
    >
      <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-card text-primary">
        <Mail size={17} />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold">Confirm your email address</p>
        <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          We sent a link to <span class="font-medium text-foreground">{props.email}</span>. Confirm
          it to send invitations by email. You can keep using Roots in the meantime.
        </p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={resend} disabled={pending()}>
        {pending() ? "Sending…" : "Resend link"}
      </Button>
    </div>
  );
}
