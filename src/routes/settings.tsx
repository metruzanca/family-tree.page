import { Show, For, createEffect, createSignal } from "solid-js";
import { A, createAsync, revalidate } from "@solidjs/router";
import {
  BellRing,
  CalendarPlus,
  CircleCheck,
  Copy,
  Download,
  ExternalLink,
  HardDrive,
  KeyRound,
  Languages,
  Mail,
  RotateCw,
  ShieldAlert,
  Trash2,
  UserRound,
} from "lucide-solid";
import {
  changePassword,
  updateNotificationSettings,
  updateProfile,
} from "~/api/auth-server";
import {
  cancelEmailChange,
  deleteAccount,
  requestEmailChange,
} from "~/api/account-server";
import { createCalendarFeed, disableCalendarFeed } from "~/api/calendar-server";
import { getCalendarFeed, getPendingEmailChange, getUsage, getUser, requireUserPage } from "~/api";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { AppHeader } from "~/components/app/AppHeader";
import { VerifyEmailNotice } from "~/components/auth/VerifyEmailNotice";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { Field } from "~/components/ui/Field";
import { Modal } from "~/components/ui/Modal";
import { formatBytes, formatRelative } from "~/lib/format";
import {
  Switch,
  SwitchControl,
  SwitchDescription,
  SwitchInput,
  SwitchLabel,
  SwitchThumb,
} from "~/components/ui/switch";
import { useToast } from "~/components/ui/Toast";
import { attemptAction } from "~/lib/action-result";
import { track } from "~/lib/analytics";
import { useI18n } from "~/i18n/LocaleProvider";
import { Trans } from "~/i18n/Trans";
import { LOCALES } from "~/i18n";
import { LOCALE_NAMES } from "~/i18n/LocaleSwitcher";

export const route = {
  preload: () => {
    requireUserPage();
    getCalendarFeed();
    getPendingEmailChange();
    getUsage();
  },
};

export default function AccountSettingsPage() {
  const { t } = useI18n();
  return (
    <AppErrorBoundary
      title={t("settings.error.title")}
      message={t("settings.error.message")}
      revalidateKeys={[
        requireUserPage.key,
        getUser.key,
        getCalendarFeed.key,
        getPendingEmailChange.key,
        getUsage.key,
      ]}
      back={{ href: "/trees", label: t("notFound.back") }}
    >
      <AccountSettingsInner />
    </AppErrorBoundary>
  );
}

function AccountSettingsInner() {
  const user = createAsync(() => requireUserPage());
  const toast = useToast();
  const { t, locale, setLocale } = useI18n();
  const [displayName, setDisplayName] = createSignal("");
  const [profilePending, setProfilePending] = createSignal(false);
  const [currentPassword, setCurrentPassword] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [passwordPending, setPasswordPending] = createSignal(false);
  const [notifications, setNotifications] = createSignal({
    weekBefore: false,
    dayBefore: false,
    dayOf: true,
  });
  const [notificationsPending, setNotificationsPending] = createSignal(false);
  const feed = createAsync(() => getCalendarFeed());
  const usage = createAsync(() => getUsage());
  const [feedPending, setFeedPending] = createSignal(false);
  const [feedConfirm, setFeedConfirm] = createSignal<"rotate" | "disable" | null>(null);
  const pendingEmailChange = createAsync(() => getPendingEmailChange());
  const [emailFormOpen, setEmailFormOpen] = createSignal(false);
  const [newEmail, setNewEmail] = createSignal("");
  const [emailPassword, setEmailPassword] = createSignal("");
  const [emailPending, setEmailPending] = createSignal(false);
  const [deleteOpen, setDeleteOpen] = createSignal(false);
  const [deletePassword, setDeletePassword] = createSignal("");
  const [deleteConfirmation, setDeleteConfirmation] = createSignal("");
  const [deletePending, setDeletePending] = createSignal(false);

  createEffect(() => {
    const current = user();
    if (current) setDisplayName(current.displayName);
  });

  createEffect(() => {
    const current = user();
    if (!current) return;
    setNotifications({
      weekBefore: current.notifyBirthdayWeekBefore,
      dayBefore: current.notifyBirthdayDayBefore,
      dayOf: current.notifyBirthdayDayOf,
    });
  });

  async function saveProfile(event: SubmitEvent) {
    event.preventDefault();
    if (profilePending()) return;
    setProfilePending(true);
    const result = await attemptAction(() => updateProfile({ displayName: displayName() }));
    setProfilePending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate([getUser.key, requireUserPage.key]);
    toast.show(t("settings.profile.updated"), "success");
  }

  async function savePassword(event: SubmitEvent) {
    event.preventDefault();
    if (passwordPending()) return;
    setPasswordPending(true);
    const result = await attemptAction(() =>
      changePassword({
        currentPassword: currentPassword(),
        newPassword: newPassword(),
      }),
    );
    setPasswordPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    toast.show(t("settings.password.changed"), "success");
  }

  async function toggleNotification(
    key: "weekBefore" | "dayBefore" | "dayOf",
    value: boolean,
  ) {
    if (notificationsPending()) return;
    const previous = notifications();
    const next = { ...previous, [key]: value };
    setNotifications(next);
    setNotificationsPending(true);
    const result = await attemptAction(() =>
      updateNotificationSettings({
        notifyBirthdayWeekBefore: next.weekBefore,
        notifyBirthdayDayBefore: next.dayBefore,
        notifyBirthdayDayOf: next.dayOf,
      }),
    );
    setNotificationsPending(false);
    if (!result.ok) {
      setNotifications(previous);
      toast.show(result.error, "error");
      return;
    }
    await revalidate([getUser.key, requireUserPage.key]);
  }

  async function copyCalendarUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.show(t("settings.calendar.copied"), "success");
    } catch {
      window.prompt(t("settings.calendar.copyPrompt"), url);
    }
  }

  async function applyFeedChange(kind: "create" | "rotate" | "disable") {
    if (feedPending()) return;
    setFeedPending(true);
    const result = await attemptAction(() =>
      kind === "disable" ? disableCalendarFeed() : createCalendarFeed(),
    );
    setFeedPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setFeedConfirm(null);
    await revalidate(getCalendarFeed.key);
    track(kind === "disable" ? "calendar_feed_disabled" : "calendar_feed_created");
    toast.show(
      kind === "disable"
        ? t("settings.calendar.disabled")
        : kind === "rotate"
          ? t("settings.calendar.rotated")
          : t("settings.calendar.created"),
      "success",
    );
  }

  async function saveEmail(event: SubmitEvent) {
    event.preventDefault();
    if (emailPending()) return;
    setEmailPending(true);
    const result = await attemptAction(() =>
      requestEmailChange({
        newEmail: newEmail(),
        currentPassword: emailPassword(),
      }),
    );
    setEmailPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setEmailFormOpen(false);
    setNewEmail("");
    setEmailPassword("");
    await revalidate([
      getPendingEmailChange.key,
      getUser.key,
      requireUserPage.key,
    ]);
    toast.show(
      result.data.emailSimulated
        ? t("settings.email.simulated")
        : t("settings.email.sent"),
      "success",
    );
  }

  async function cancelPendingEmail() {
    const result = await attemptAction(() => cancelEmailChange());
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate(getPendingEmailChange.key);
    toast.show(t("settings.email.cancelled"), "success");
  }

  async function confirmDeleteAccount(event: SubmitEvent) {
    event.preventDefault();
    if (deletePending()) return;
    setDeletePending(true);
    const result = await attemptAction(() =>
      deleteAccount({
        password: deletePassword(),
        confirmation: deleteConfirmation(),
      }),
    );
    setDeletePending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    window.location.assign("/");
  }

  return (
    <Show when={user()}>
      {current => (
        <div class="page-shell min-h-[100dvh]">
          <AppHeader
            user={current()}
            back={{ href: "/trees", label: t("settings.backToTrees") }}
          />
          <main class="mx-auto max-w-2xl px-4 pb-20 pt-10 sm:px-6">
            <p class="eyebrow mb-2">{t("settings.eyebrow")}</p>
            <h1 class="font-display text-4xl tracking-tight">{t("settings.title")}</h1>
            <p class="mt-2 text-sm text-muted-foreground">
              <Trans
                key="settings.signedInAs"
                components={{
                  email: (
                    <span class="font-medium text-foreground">{current().email}</span>
                  ),
                }}
              />
            </p>

            <Card class="mt-8 gap-4 py-5 sm:py-6">
              <CardHeader class="gap-1 px-5 sm:px-6">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <UserRound size={17} />
                  </span>
                  <div>
                    <CardTitle class="font-display text-xl">
                      {t("settings.profile.title")}
                    </CardTitle>
                    <CardDescription class="text-xs">
                      {t("settings.profile.description")}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="px-5 sm:px-6">
                <form class="space-y-4" onSubmit={saveProfile}>
                  <Field label={t("settings.profile.displayName")} for="account-name">
                    <input
                      id="account-name"
                      class="input"
                      value={displayName()}
                      onInput={event => setDisplayName(event.currentTarget.value)}
                      maxlength={80}
                      required
                      data-testid="settings-profile-name"
                    />
                  </Field>
                  <Button
                    type="submit"
                    disabled={profilePending()}
                    data-testid="settings-profile-save"
                  >
                    {profilePending() ? t("auth.saving") : t("settings.profile.save")}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card
              class="mt-5 gap-4 py-5 sm:py-6"
              data-testid="settings-language-card"
            >
              <CardHeader class="gap-1 px-5 sm:px-6">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <Languages size={17} />
                  </span>
                  <div>
                    <CardTitle class="font-display text-xl">
                      {t("settings.language.title")}
                    </CardTitle>
                    <CardDescription class="text-xs">
                      {t("settings.language.description")}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="px-5 sm:px-6">
                <div
                  class="flex flex-wrap gap-2"
                  role="group"
                  aria-label={t("common.language")}
                >
                  <For each={LOCALES}>
                    {code => (
                      <Button
                        type="button"
                        variant={locale() === code ? "default" : "secondary"}
                        onClick={() => setLocale(code)}
                        data-testid={`settings-language-${code}`}
                      >
                        {LOCALE_NAMES[code]}
                      </Button>
                    )}
                  </For>
                </div>
              </CardContent>
            </Card>

            <Card class="mt-5 gap-4 py-5 sm:py-6">
              <CardHeader class="gap-1 px-5 sm:px-6">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <Mail size={17} />
                  </span>
                  <div>
                    <CardTitle class="font-display text-xl">
                      {t("settings.email.title")}
                    </CardTitle>
                    <CardDescription class="text-xs">
                      {t("settings.email.description")}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="space-y-4 px-5 sm:px-6">
                <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-3.5 py-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-foreground">{current().email}</p>
                    <p class="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Show
                        when={current().emailVerified}
                        fallback={t("settings.email.notConfirmed")}
                      >
                        <>
                          <CircleCheck size={13} class="text-primary" />
                          {t("settings.email.confirmed")}
                        </>
                      </Show>
                    </p>
                  </div>
                  <Show when={!emailFormOpen()}>
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      onClick={() => setEmailFormOpen(true)}
                      data-testid="settings-email-change"
                    >
                      {t("settings.email.change")}
                    </Button>
                  </Show>
                </div>

                <Show when={pendingEmailChange()}>
                  {pending => (
                    <div class="rounded-xl border border-gold/40 bg-gold/10 px-3.5 py-3">
                      <p class="text-xs leading-relaxed text-foreground">
                        <Trans
                          key="settings.email.pending"
                          params={{
                            when: formatRelative(pending().expiresAt, locale()),
                          }}
                          components={{
                            email: (
                              <span class="font-medium">{pending().newEmail}</span>
                            ),
                          }}
                        />
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        class="mt-1.5 -ml-2"
                        onClick={() => void cancelPendingEmail()}
                        data-testid="settings-email-cancel-pending"
                      >
                        {t("settings.email.cancelChange")}
                      </Button>
                    </div>
                  )}
                </Show>

                <Show when={emailFormOpen()}>
                  <form class="space-y-4" onSubmit={saveEmail}>
                    <Field
                      label={t("settings.email.newEmail")}
                      for="new-email"
                      hint={t("settings.email.newHint")}
                    >
                      <input
                        id="new-email"
                        type="email"
                        class="input"
                        autocomplete="email"
                        value={newEmail()}
                        onInput={event => setNewEmail(event.currentTarget.value)}
                        required
                        data-testid="settings-email-new"
                      />
                    </Field>
                    <Field
                      label={t("settings.password.current")}
                      for="email-password"
                    >
                      <input
                        id="email-password"
                        type="password"
                        class="input"
                        autocomplete="current-password"
                        value={emailPassword()}
                        onInput={event => setEmailPassword(event.currentTarget.value)}
                        required
                        data-testid="settings-email-password"
                      />
                    </Field>
                    <div class="flex flex-wrap gap-2">
                      <Button
                        type="submit"
                        disabled={emailPending()}
                        data-testid="settings-email-send"
                      >
                        {emailPending() ? t("auth.sending") : t("settings.email.send")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setEmailFormOpen(false);
                          setNewEmail("");
                          setEmailPassword("");
                        }}
                        data-testid="settings-email-cancel"
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </form>
                </Show>

                <Show when={!current().emailVerified}>
                  <VerifyEmailNotice email={current().email} />
                </Show>
              </CardContent>
            </Card>

            <Card id="usage" class="mt-5 scroll-mt-24 gap-4 py-5 sm:py-6">
              <CardHeader class="gap-1 px-5 sm:px-6">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <HardDrive size={17} />
                  </span>
                  <div>
                    <CardTitle class="font-display text-xl">
                      {t("settings.usage.title")}
                    </CardTitle>
                    <CardDescription class="text-xs">
                      {t("settings.usage.description")}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="px-5 sm:px-6">
                <Show
                  when={usage()}
                  fallback={
                    <p class="text-sm text-muted-foreground">
                      {t("settings.usage.loading")}
                    </p>
                  }
                >
                  {currentUsage => (
                    <div class="space-y-5">
                      <div>
                        <div class="flex items-baseline justify-between gap-3 text-xs">
                          <span class="font-medium text-foreground">
                            {t("settings.usage.storage")}
                          </span>
                          <span class="text-muted-foreground">
                            {t("settings.usage.ofQuota", {
                              used: formatBytes(currentUsage().storageBytes),
                              quota: formatBytes(currentUsage().storageQuotaBytes),
                            })}
                          </span>
                        </div>
                        <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary/15">
                          <div
                            class="h-full rounded-full bg-primary transition-[width]"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (currentUsage().storageBytes /
                                    Math.max(1, currentUsage().storageQuotaBytes)) *
                                    100,
                                ),
                              )}%`,
                            }}
                          />
                        </div>
                        <p class="mt-2 text-xs leading-relaxed text-muted-foreground">
                          {t("settings.usage.storageHint")}
                          <Show when={currentUsage().pendingUploads > 0}>
                            {" "}
                            {t("settings.usage.pendingUpload", {
                              count: currentUsage().pendingUploads,
                            })}
                          </Show>
                        </p>
                      </div>

                      <div class="border-t border-border pt-4">
                        <div class="flex items-baseline justify-between gap-3 text-xs">
                          <span class="font-medium text-foreground">
                            {t("settings.usage.people")}
                          </span>
                          <span class="text-muted-foreground">
                            {t("settings.usage.ofQuota", {
                              used: currentUsage().peopleCreated,
                              quota: currentUsage().peopleQuota,
                            })}
                          </span>
                        </div>
                        <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary/15">
                          <div
                            class="h-full rounded-full bg-primary transition-[width]"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (currentUsage().peopleCreated /
                                    Math.max(1, currentUsage().peopleQuota)) *
                                    100,
                                ),
                              )}%`,
                            }}
                          />
                        </div>
                        <p class="mt-2 text-xs leading-relaxed text-muted-foreground">
                          {t("settings.usage.peopleHint")}
                        </p>
                      </div>

                      <p class="rounded-xl border border-border bg-muted/35 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
                        <Trans
                          key="settings.usage.support"
                          components={{
                            emailUs: (
                              <a
                                class="font-medium text-primary underline decoration-primary/30 underline-offset-4"
                                href={`mailto:${currentUsage().supportEmail}?subject=Increase%20my%20family-tree%20limits`}
                                data-testid="settings-usage-support"
                              >
                                {t("settings.usage.emailUs")}
                              </a>
                            ),
                          }}
                        />
                      </p>
                    </div>
                  )}
                </Show>
              </CardContent>
            </Card>

            <Card class="mt-5 gap-4 py-5 sm:py-6">
              <CardHeader class="gap-1 px-5 sm:px-6">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <BellRing size={17} />
                  </span>
                  <div>
                    <CardTitle class="font-display text-xl">
                      {t("settings.notifications.title")}
                    </CardTitle>
                    <CardDescription class="text-xs">
                      {t("settings.notifications.description")}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="px-5 sm:px-6">
                <div class="divide-y divide-border">
                  <NotificationToggle
                    label={t("settings.notifications.weekBefore.label")}
                    description={t("settings.notifications.weekBefore.description")}
                    checked={notifications().weekBefore}
                    disabled={!current().emailVerified || notificationsPending()}
                    onChange={value => toggleNotification("weekBefore", value)}
                    testId="settings-notifications-week-before"
                  />
                  <NotificationToggle
                    label={t("settings.notifications.dayBefore.label")}
                    description={t("settings.notifications.dayBefore.description")}
                    checked={notifications().dayBefore}
                    disabled={!current().emailVerified || notificationsPending()}
                    onChange={value => toggleNotification("dayBefore", value)}
                    testId="settings-notifications-day-before"
                  />
                  <NotificationToggle
                    label={t("settings.notifications.dayOf.label")}
                    description={t("settings.notifications.dayOf.description")}
                    checked={notifications().dayOf}
                    disabled={!current().emailVerified || notificationsPending()}
                    onChange={value => toggleNotification("dayOf", value)}
                    testId="settings-notifications-day-of"
                  />
                </div>
                <Show
                  when={current().emailVerified}
                  fallback={
                    <p class="mt-4 rounded-xl border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      {t("settings.notifications.confirmFirst")}
                    </p>
                  }
                >
                  <p class="mt-4 text-xs leading-relaxed text-muted-foreground">
                    <Trans
                      key="settings.notifications.footer"
                      components={{
                        email: (
                          <span class="font-medium text-foreground">
                            {current().email}
                          </span>
                        ),
                      }}
                    />
                  </p>
                </Show>
              </CardContent>
            </Card>

            <Card id="calendar-subscription" class="mt-5 scroll-mt-24 gap-4 py-5 sm:py-6">
              <CardHeader class="gap-1 px-5 sm:px-6">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <CalendarPlus size={17} />
                  </span>
                  <div>
                    <CardTitle class="font-display text-xl">
                      {t("settings.calendar.title")}
                    </CardTitle>
                    <CardDescription class="text-xs">
                      {t("settings.calendar.description")}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="px-5 sm:px-6">
                <Show
                  when={feed()}
                  fallback={
                    <div>
                      <p class="text-sm leading-relaxed text-muted-foreground">
                        {t("settings.calendar.intro")}
                      </p>
                      <Button
                        class="mt-4"
                        variant="secondary"
                        type="button"
                        disabled={feedPending()}
                        onClick={() => void applyFeedChange("create")}
                        data-testid="settings-calendar-create"
                      >
                        <CalendarPlus />
                        {t("settings.calendar.create")}
                      </Button>
                    </div>
                  }
                >
                  {currentFeed => (
                    <div class="space-y-3">
                      <Field
                        label={t("settings.calendar.urlLabel")}
                        for="calendar-feed-url"
                        hint={t("settings.calendar.urlHint")}
                      >
                        <div class="flex flex-col gap-2 sm:flex-row">
                          <input
                            id="calendar-feed-url"
                            class="input min-w-0 flex-1 font-mono text-xs"
                            readonly
                            value={currentFeed().url}
                            onFocus={event => event.currentTarget.select()}
                            data-testid="settings-calendar-url"
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            type="button"
                            class="self-start sm:self-auto"
                            onClick={() => copyCalendarUrl(currentFeed().url)}
                            data-testid="settings-calendar-copy"
                          >
                            <Copy />
                            {t("common.copy")}
                          </Button>
                        </div>
                      </Field>

                      <div class="flex flex-wrap gap-2">
                        <a
                          href={currentFeed().webcalUrl}
                          class={buttonVariants({ variant: "secondary", size: "sm" })}
                          data-testid="settings-calendar-open"
                        >
                          <ExternalLink />
                          {t("settings.calendar.open")}
                        </a>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={feedPending()}
                          onClick={() => setFeedConfirm("rotate")}
                          data-testid="settings-calendar-rotate"
                        >
                          <RotateCw />
                          {t("settings.calendar.newLink")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          disabled={feedPending()}
                          onClick={() => setFeedConfirm("disable")}
                          data-testid="settings-calendar-disable"
                        >
                          <Trash2 />
                          {t("settings.calendar.turnOff")}
                        </Button>
                      </div>

                      <div class="rounded-xl border border-border bg-muted/35 px-3.5 py-3">
                        <p class="text-xs font-semibold text-foreground">
                          {t("settings.calendar.howTo")}
                        </p>
                        <ul class="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                          <li>
                            <Trans
                              key="settings.calendar.howTo.google"
                              components={{
                                app: (
                                  <span class="font-medium text-foreground">
                                    Google Calendar
                                  </span>
                                ),
                              }}
                            />
                          </li>
                          <li>
                            <Trans
                              key="settings.calendar.howTo.apple"
                              components={{
                                app: (
                                  <span class="font-medium text-foreground">
                                    Apple Calendar
                                  </span>
                                ),
                              }}
                            />
                          </li>
                          <li>
                            <Trans
                              key="settings.calendar.howTo.outlook"
                              components={{
                                app: (
                                  <span class="font-medium text-foreground">Outlook</span>
                                ),
                              }}
                            />
                          </li>
                        </ul>
                      </div>

                      <p class="text-xs leading-relaxed text-muted-foreground">
                        {t("settings.calendar.refreshNote")}
                      </p>
                    </div>
                  )}
                </Show>
              </CardContent>
            </Card>

            <ConfirmDialog
              open={feedConfirm() !== null}
              title={
                feedConfirm() === "disable"
                  ? t("settings.calendar.confirmDisableTitle")
                  : t("settings.calendar.confirmRotateTitle")
              }
              message={
                feedConfirm() === "disable"
                  ? t("settings.calendar.confirmDisableMessage")
                  : t("settings.calendar.confirmRotateMessage")
              }
              confirmLabel={
                feedConfirm() === "disable"
                  ? t("settings.calendar.turnOff")
                  : t("settings.calendar.createNew")
              }
              danger={feedConfirm() === "disable"}
              pending={feedPending()}
              testId="settings-calendar-confirm"
              onClose={() => setFeedConfirm(null)}
              onConfirm={() => {
                const kind = feedConfirm();
                if (kind) void applyFeedChange(kind);
              }}
            />

            <Card class="mt-5 gap-4 py-5 sm:py-6">
              <CardHeader class="gap-1 px-5 sm:px-6">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <KeyRound size={17} />
                  </span>
                  <div>
                    <CardTitle class="font-display text-xl">{t("auth.password")}</CardTitle>
                    <CardDescription class="text-xs">
                      {t("auth.passwordHint")}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="px-5 sm:px-6">
                <form class="space-y-4" onSubmit={savePassword}>
                  <Field
                    label={t("settings.password.current")}
                    for="current-password"
                  >
                    <input
                      id="current-password"
                      type="password"
                      class="input"
                      autocomplete="current-password"
                      value={currentPassword()}
                      onInput={event => setCurrentPassword(event.currentTarget.value)}
                      required
                      data-testid="settings-password-current"
                    />
                  </Field>
                  <Field label={t("auth.newPassword")} for="new-password">
                    <input
                      id="new-password"
                      type="password"
                      class="input"
                      autocomplete="new-password"
                      minlength={10}
                      value={newPassword()}
                      onInput={event => setNewPassword(event.currentTarget.value)}
                      required
                      data-testid="settings-password-new"
                    />
                  </Field>
                  <Button
                    type="submit"
                    disabled={passwordPending()}
                    data-testid="settings-password-submit"
                  >
                    {passwordPending()
                      ? t("settings.password.changing")
                      : t("settings.password.submit")}
                  </Button>
                  <p class="text-xs leading-relaxed text-muted-foreground">
                    {t("settings.password.note")}
                  </p>
                </form>
              </CardContent>
            </Card>

            <Card class="mt-5 gap-4 border-destructive/30 py-5 sm:py-6">
              <CardHeader class="gap-1 px-5 sm:px-6">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-xl bg-destructive/10 text-destructive">
                    <ShieldAlert size={17} />
                  </span>
                  <div>
                    <CardTitle class="font-display text-xl">
                      {t("settings.data.title")}
                    </CardTitle>
                    <CardDescription class="text-xs">
                      {t("settings.data.description")}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="space-y-3 px-5 sm:px-6">
                <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-3.5 py-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-foreground">
                      {t("settings.data.downloadTitle")}
                    </p>
                    <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {t("settings.data.downloadHint")}
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <a
                      href="/api/account/export"
                      download="family-tree-export.zip"
                      class={buttonVariants({ variant: "secondary", size: "sm" })}
                      data-testid="settings-data-export"
                    >
                      <Download />
                      {t("settings.data.downloadData")}
                    </a>
                    <a
                      href="/api/account/export?media=1"
                      download="family-tree-export-with-files.zip"
                      class={buttonVariants({ variant: "secondary", size: "sm" })}
                      data-testid="settings-data-export-files"
                    >
                      <Download />
                      {t("settings.data.downloadFiles")}
                    </a>
                  </div>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-destructive">
                      {t("settings.data.deleteTitle")}
                    </p>
                    <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {t("settings.data.deleteHint")}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    data-testid="settings-data-delete"
                  >
                    <Trash2 />
                    {t("settings.data.deleteTitle")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <p class="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
              {t("settings.forgotPassword")}
            </p>

            <p class="mt-3 text-center text-[0.7rem] leading-relaxed text-muted-foreground">
              <Trans
                key="auth.layout.legal"
                components={{
                  privacy: (
                    <A
                      href="/privacy"
                      class="underline decoration-border underline-offset-2 hover:text-foreground"
                      data-testid="settings-legal-privacy"
                    >
                      {t("auth.layout.privacyPolicy")}
                    </A>
                  ),
                  terms: (
                    <A
                      href="/terms"
                      class="underline decoration-border underline-offset-2 hover:text-foreground"
                      data-testid="settings-legal-terms"
                    >
                      {t("auth.layout.terms")}
                    </A>
                  ),
                }}
              />
            </p>
          </main>

          <Modal
            open={deleteOpen()}
            onClose={() => setDeleteOpen(false)}
            title={t("settings.delete.title")}
            description={t("settings.delete.description")}
          >
            <form class="space-y-4" onSubmit={confirmDeleteAccount}>
              <div class="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
                {t("settings.delete.warning")}
              </div>
              <Field label={t("settings.delete.password")} for="delete-password">
                <input
                  id="delete-password"
                  type="password"
                  class="input"
                  autocomplete="current-password"
                  value={deletePassword()}
                  onInput={event => setDeletePassword(event.currentTarget.value)}
                  required
                  data-testid="settings-delete-password"
                />
              </Field>
              <Field
                label={t("settings.delete.confirmLabel")}
                for="delete-confirmation"
                hint={t("settings.delete.confirmHint", { email: current().email })}
              >
                <input
                  id="delete-confirmation"
                  class="input"
                  autocomplete="off"
                  value={deleteConfirmation()}
                  onInput={event => setDeleteConfirmation(event.currentTarget.value)}
                  required
                  data-testid="settings-delete-confirmation"
                />
              </Field>
              <div class="flex flex-wrap justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDeleteOpen(false)}
                  data-testid="settings-delete-cancel"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={deletePending()}
                  data-testid="settings-delete-submit"
                >
                  {deletePending()
                    ? t("settings.delete.deleting")
                    : t("settings.delete.submit")}
                </Button>
              </div>
            </form>
          </Modal>
        </div>
      )}
    </Show>
  );
}

function NotificationToggle(props: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  testId: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <Switch
      class="flex w-full items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
      checked={props.checked}
      disabled={props.disabled}
      onChange={props.onChange}
    >
      <SwitchInput data-testid={props.testId} />
      <div class="min-w-0">
        <SwitchLabel>{props.label}</SwitchLabel>
        <SwitchDescription class="mt-0.5">{props.description}</SwitchDescription>
      </div>
      <SwitchControl aria-label={props.label}>
        <SwitchThumb />
      </SwitchControl>
    </Switch>
  );
}
