import { A, createAsync, useParams, useSubmission } from "@solidjs/router";
import { Show } from "solid-js";
import { CircleAlert, Clock, LockKeyhole } from "lucide-solid";
import { AuthLayout } from "~/components/auth/AuthLayout";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Field } from "~/components/ui/Field";
import { Skeleton } from "~/components/ui/skeleton";
import { getPasswordResetPreview, resetPassword } from "~/api";

export const route = {
  preload: ({ params }: { params: { token: string } }) =>
    getPasswordResetPreview(params.token),
};

export default function ResetPasswordPage() {
  return (
    <AppErrorBoundary
      title="We could not check this link"
      message="The link may still be good. Try again, or request a new one."
      revalidateKeys={[getPasswordResetPreview.key]}
      back={{ href: "/forgot-password", label: "Request a new link" }}
    >
      <ResetPasswordInner />
    </AppErrorBoundary>
  );
}

function ResetPasswordInner() {
  const params = useParams<{ token: string }>();
  const preview = createAsync(() => getPasswordResetPreview(params.token));
  const submission = useSubmission(resetPassword);
  const error = () => (submission.result instanceof Error ? submission.result.message : "");

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Your reset link works once. After this, every other device is signed out."
      footer={
        <span>
          Need a new link?{" "}
          <A
            href="/forgot-password"
            class="font-semibold text-primary underline decoration-primary/30 underline-offset-4"
          >
            Request another
          </A>
        </span>
      }
    >
      <Show
        when={preview()}
        fallback={
          <Card class="gap-3 p-6">
            <Skeleton class="h-10 w-full rounded-lg" />
            <Skeleton class="h-10 w-full rounded-lg" />
            <Skeleton class="h-10 w-36 rounded-lg" />
          </Card>
        }
      >
        {state => (
          <Show
            when={state().status === "ok"}
            fallback={
              <Card class="items-center gap-0 p-7 text-center sm:p-8">
                <div class="grid size-14 place-items-center rounded-2xl bg-background text-muted-foreground">
                  <Clock size={26} />
                </div>
                <h2 class="mt-5 font-display text-2xl tracking-tight">
                  This link cannot be used
                </h2>
                <p class="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {state().status === "expired"
                    ? "This reset link has expired."
                    : state().status === "used"
                      ? "This reset link has already been used."
                      : "This reset link is not valid."}
                </p>
                <A
                  href="/forgot-password"
                  class={buttonVariants({ class: "mt-6" })}
                >
                  Request a new link
                </A>
              </Card>
            }
          >
            <Card class="gap-0 p-5 sm:p-6">
              <form action={resetPassword} method="post" class="space-y-4">
                <input type="hidden" name="token" value={params.token} />
                <Field label="New password" for="password" hint="At least 10 characters.">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    class="input"
                    placeholder="Choose a password"
                    autocomplete="new-password"
                    minlength={10}
                    required
                    autofocus
                  />
                </Field>
                <Field label="Confirm password" for="confirmPassword">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    class="input"
                    placeholder="Type it again"
                    autocomplete="new-password"
                    minlength={10}
                    required
                  />
                </Field>
                <Show when={error()}>
                  <Alert variant="destructive" class="rounded-xl py-2.5">
                    <CircleAlert />
                    <AlertDescription>{error()}</AlertDescription>
                  </Alert>
                </Show>
                <Button type="submit" class="w-full" disabled={submission.pending}>
                  {submission.pending ? "Saving…" : "Save new password"}
                </Button>
                <p class="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                  <LockKeyhole size={12} />
                  Resetting your password signs you out everywhere else.
                </p>
              </form>
            </Card>
          </Show>
        )}
      </Show>
    </AuthLayout>
  );
}
