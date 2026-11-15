import { Show, createEffect, createSignal } from "solid-js";
import { createAsync, revalidate } from "@solidjs/router";
import { KeyRound, UserRound } from "lucide-solid";
import { changePassword, updateProfile } from "~/api/auth-server";
import { getUser, requireUserPage } from "~/api";
import { AppHeader } from "~/components/app/AppHeader";
import { Button } from "~/components/ui/Button";
import { Field } from "~/components/ui/Field";
import { LoadingScreen } from "~/components/ui/Loading";
import { useToast } from "~/components/ui/Toast";

export const route = {
  preload: () => requireUserPage(),
};

export default function AccountSettingsPage() {
  return (
    <Show when={true} fallback={<LoadingScreen />}>
      <AccountSettingsInner />
    </Show>
  );
}

function AccountSettingsInner() {
  const user = createAsync(() => requireUserPage());
  const toast = useToast();
  const [displayName, setDisplayName] = createSignal("");
  const [profilePending, setProfilePending] = createSignal(false);
  const [currentPassword, setCurrentPassword] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [passwordPending, setPasswordPending] = createSignal(false);

  createEffect(() => {
    const current = user();
    if (current) setDisplayName(current.displayName);
  });

  async function saveProfile(event: SubmitEvent) {
    event.preventDefault();
    if (profilePending()) return;
    setProfilePending(true);
    const result = await updateProfile({ displayName: displayName() });
    setProfilePending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate(getUser.key);
    toast.show("Profile updated.", "success");
  }

  async function savePassword(event: SubmitEvent) {
    event.preventDefault();
    if (passwordPending()) return;
    setPasswordPending(true);
    const result = await changePassword({
      currentPassword: currentPassword(),
      newPassword: newPassword(),
    });
    setPasswordPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    toast.show("Password changed.", "success");
  }

  return (
    <Show when={user()}>
      {current => (
        <div class="page-shell min-h-[100dvh]">
          <AppHeader user={current()} back={{ href: "/trees", label: "Back to trees" }} />
          <main class="mx-auto max-w-2xl px-4 pb-20 pt-10 sm:px-6">
            <p class="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-moss">Account</p>
            <h1 class="font-display text-4xl tracking-tight">Your details</h1>
            <p class="mt-2 text-sm text-muted">
              Signed in as <span class="font-medium text-ink">{current().email}</span>
            </p>

            <section class="paper-card mt-8 p-5 sm:p-6">
              <div class="mb-4 flex items-center gap-3">
                <span class="grid h-9 w-9 place-items-center rounded-xl bg-moss-soft text-moss">
                  <UserRound size={17} />
                </span>
                <div>
                  <h2 class="font-display text-xl">Profile</h2>
                  <p class="text-xs text-muted">The name shown to people you share a tree with.</p>
                </div>
              </div>
              <form class="space-y-4" onSubmit={saveProfile}>
                <Field label="Display name" for="account-name">
                  <input
                    id="account-name"
                    class="input"
                    value={displayName()}
                    onInput={event => setDisplayName(event.currentTarget.value)}
                    maxlength={80}
                    required
                  />
                </Field>
                <Field label="Email" for="account-email" hint="Email changes are not available in this version.">
                  <input id="account-email" class="input" value={current().email} disabled />
                </Field>
                <Button type="submit" disabled={profilePending()}>
                  {profilePending() ? "Saving…" : "Save profile"}
                </Button>
              </form>
            </section>

            <section class="paper-card mt-5 p-5 sm:p-6">
              <div class="mb-4 flex items-center gap-3">
                <span class="grid h-9 w-9 place-items-center rounded-xl bg-moss-soft text-moss">
                  <KeyRound size={17} />
                </span>
                <div>
                  <h2 class="font-display text-xl">Password</h2>
                  <p class="text-xs text-muted">At least 10 characters.</p>
                </div>
              </div>
              <form class="space-y-4" onSubmit={savePassword}>
                <Field label="Current password" for="current-password">
                  <input
                    id="current-password"
                    type="password"
                    class="input"
                    autocomplete="current-password"
                    value={currentPassword()}
                    onInput={event => setCurrentPassword(event.currentTarget.value)}
                    required
                  />
                </Field>
                <Field label="New password" for="new-password">
                  <input
                    id="new-password"
                    type="password"
                    class="input"
                    autocomplete="new-password"
                    minlength={10}
                    value={newPassword()}
                    onInput={event => setNewPassword(event.currentTarget.value)}
                    required
                  />
                </Field>
                <Button type="submit" disabled={passwordPending()}>
                  {passwordPending() ? "Changing…" : "Change password"}
                </Button>
              </form>
            </section>

            <p class="mt-6 text-center text-[0.7rem] leading-relaxed text-muted">
              Password reset by email is not available yet. If you forget your password, there is no
              self-service recovery in this version.
            </p>
          </main>
        </div>
      )}
    </Show>
  );
}
