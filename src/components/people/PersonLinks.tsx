import { For, Show, createMemo } from "solid-js";
import { Globe, House, Mail, Phone } from "lucide-solid";
import { resolvePersonLink, type PersonLink } from "~/lib/person-links";
import { useI18n } from "~/i18n/LocaleProvider";

export function PersonLinkGlyph(props: { link: PersonLink; size?: number }) {
  const icon = createMemo(() => resolvePersonLink(props.link.url, props.link.isHome));
  const size = () => props.size ?? 17;

  const content = () => {
    const resolved = icon();
    if (resolved.kind === "home") {
      return <House size={size()} aria-hidden="true" />;
    }
    if (resolved.kind === "brand") {
      return (
        <svg
          viewBox="0 0 24 24"
          width={size()}
          height={size()}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d={resolved.icon.path} />
        </svg>
      );
    }
    return <Globe size={size()} aria-hidden="true" />;
  };

  return <>{content()}</>;
}

export function PersonLinksSection(props: { links: PersonLink[] }) {
  const { t, locale } = useI18n();
  const ordered = createMemo(() =>
    props.links
      .map((link, index) => ({ link, index }))
      .sort(
        (a, b) =>
          Number(b.link.isHome) - Number(a.link.isHome) || a.index - b.index,
      )
      .map(entry => entry.link),
  );

  return (
    <section class="mb-5" data-testid="person-panel-links">
      <h3 class="field-label">{t("person.links.title")}</h3>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <For each={ordered()}>
          {(link, index) => (
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              class="grid h-9 w-9 place-items-center rounded-full border border-border bg-card/60 text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label={t("person.links.opensInNewTab", {
                label: resolvePersonLink(link.url, link.isHome, locale()).label,
              })}
              data-testid={`person-panel-link-${index()}`}
            >
              <PersonLinkGlyph link={link} />
            </a>
          )}
        </For>
      </div>
    </section>
  );
}

export function PersonContactSection(props: {
  email: string | null;
  phone: string | null;
}) {
  const { t } = useI18n();
  const telHref = () =>
    props.phone ? `tel:${props.phone.replace(/[^\d+]/g, "")}` : "";

  return (
    <section class="mb-5" data-testid="person-panel-contact">
      <h3 class="field-label">{t("person.contact.title")}</h3>
      <ul class="mt-2 space-y-1.5 text-sm">
        <Show when={props.email}>
          <li class="flex items-center gap-2" data-testid="person-panel-contact-email">
            <Mail size={13} class="shrink-0 text-muted-foreground" aria-hidden="true" />
            <a
              href={`mailto:${props.email}`}
              class="min-w-0 break-all text-foreground/90 transition hover:text-primary"
            >
              {props.email}
            </a>
          </li>
        </Show>
        <Show when={props.phone}>
          <li class="flex items-center gap-2" data-testid="person-panel-contact-phone">
            <Phone size={13} class="shrink-0 text-muted-foreground" aria-hidden="true" />
            <a
              href={telHref()}
              class="min-w-0 break-all text-foreground/90 transition hover:text-primary"
            >
              {props.phone}
            </a>
          </li>
        </Show>
      </ul>
    </section>
  );
}
