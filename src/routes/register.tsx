import { A, useSearchParams, useSubmission } from "@solidjs/router";
import { Show } from "solid-js";
import { CircleAlert } from "lucide-solid";
import { AuthLayout } from "~/components/auth/AuthLayout";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Field } from "~/components/ui/Field";
import { register } from "~/api";

export default function RegisterPage() {
  const submission = useSubmission(register);
  const [searchParams] = useSearchParams();
  const redirectTo = () => {
    const value = searchParams.redirectTo;
    return typeof value === "string" ? value : "";
  };
  const error = () => (submission.result instanceof Error ? submission.result.message : "");
  const invited = () => redirectTo().startsWith("/invite/");

  return (
    <AuthLayout
      title="Start your family tree"
      subtitle="Create an account to start a family tree or accept an invitation to one."
      notice={invited() ? "Create an account, then you can accept the invitation." : undefined}
      footer={
        <span>
          Already have an account?{" "}
          <A
            href={redirectTo() ? `/login?redirectTo=${encodeURIComponent(redirectTo())}` : "/login"}
            class="font-semibold text-primary underline decoration-primary/30 underline-offset-4"
          >
            Sign in
          </A>
        </span>
      }
    >
      <Card class="gap-0 p-5 sm:p-6">
        <form action={register} method="post" class="space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo()} />
          <Field label="Your name" for="displayName">
            <input
              id="displayName"
              name="displayName"
              class="input"
              placeholder="Bart Simpson"
              autocomplete="name"
              required
              autofocus
            />
          </Field>
          <Field label="Email" for="email">
            <input
              id="email"
              name="email"
              type="email"
              class="input"
              placeholder="you@example.com"
              autocomplete="email"
              required
            />
          </Field>
          <Field label="Password" for="password" hint="At least 10 characters.">
            <input
              id="password"
              name="password"
              type="password"
              class="input"
              placeholder="Choose a password"
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
            {submission.pending ? "Creating account…" : "Create account"}
          </Button>
          <p class="text-center text-xs leading-relaxed text-muted-foreground">
            We will send a link to confirm your email address. Your family data stays private in the
            meantime.
          </p>
          <p class="text-center text-[0.7rem] leading-relaxed text-muted-foreground">
            By creating an account you agree to the{" "}
            <A href="/terms" class="underline decoration-border underline-offset-2 hover:text-foreground">
              Terms of Service
            </A>{" "}
            and the{" "}
            <A href="/privacy" class="underline decoration-border underline-offset-2 hover:text-foreground">
              Privacy Policy
            </A>
            .
          </p>
        </form>
      </Card>
    </AuthLayout>
  );
}
