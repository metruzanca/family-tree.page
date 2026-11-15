import { A, useSearchParams, useSubmission } from "@solidjs/router";
import { Show } from "solid-js";
import { AuthLayout } from "~/components/auth/AuthLayout";
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
      title="Plant your roots"
      subtitle="Create an account to start a family tree or accept an invitation to one."
      notice={invited() ? "Create an account, then you can accept the invitation." : undefined}
      footer={
        <span>
          Already have an account?{" "}
          <A
            href={redirectTo() ? `/login?redirectTo=${encodeURIComponent(redirectTo())}` : "/login"}
            class="font-semibold text-moss underline decoration-moss/30 underline-offset-4"
          >
            Sign in
          </A>
        </span>
      }
    >
      <form action={register} method="post" class="space-y-4">
        <input type="hidden" name="redirectTo" value={redirectTo()} />
        <Field label="Your name" for="displayName">
          <input
            id="displayName"
            name="displayName"
            class="input"
            placeholder="Sam Zanca"
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
          <p class="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error()}
          </p>
        </Show>
        <button type="submit" class="btn btn-primary w-full" disabled={submission.pending}>
          {submission.pending ? "Creating account…" : "Create account"}
        </button>
        <p class="text-center text-[0.7rem] leading-relaxed text-muted">
          There is no email verification in this version. Use an email address you can remember.
        </p>
      </form>
    </AuthLayout>
  );
}
