// @refresh reload
import { StartServer, createHandler } from "@solidjs/start/server";
import { optionalEnv, publicOrigin } from "./server/config";
import { resolveLocaleFromHeaders, translate, cookieValue, LOCALE_COOKIE, LOCALE_MAX_AGE } from "./i18n";

const themeScript = `try{const s=localStorage.getItem("family-tree-theme");const d=s==="dark"||(!s&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}`;

const umamiScriptUrl = optionalEnv("UMAMI_SCRIPT_URL", "").trim();
const umamiWebsiteId = optionalEnv("UMAMI_WEBSITE_ID", "").trim();
const umamiDomain = (() => {
  try {
    return new URL(publicOrigin()).hostname;
  } catch {
    return "";
  }
})();
const umami =
  umamiScriptUrl && umamiWebsiteId
    ? { scriptUrl: umamiScriptUrl, websiteId: umamiWebsiteId, domain: umamiDomain }
    : null;

export default createHandler(context => {
  const locale = resolveLocaleFromHeaders(context.request.headers);
  if (!cookieValue(context.request.headers.get("cookie"), LOCALE_COOKIE)) {
    context.response.headers.append(
      "set-cookie",
      `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_MAX_AGE}; SameSite=Lax`,
    );
  }
  return (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang={locale}>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <meta
            name="description"
            content={translate(locale, "meta.description")}
          />
          <meta name="theme-color" content="#f6f1e7" />
          <meta property="og:type" content="website" />
          <meta property="og:title" content={translate(locale, "meta.title")} />
          <meta
            property="og:description"
            content={translate(locale, "meta.description")}
          />
          <meta property="og:url" content="https://family-tree.page" />
          <meta name="twitter:card" content="summary" />
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <title>{translate(locale, "meta.title")}</title>
          {umami && (
            <script
              defer
              src={umami.scriptUrl}
              data-website-id={umami.websiteId}
              data-auto-pageview="false"
              data-do-not-track="true"
              data-exclude-search="true"
              data-exclude-hash="true"
              data-salt-rotation="daily"
              data-domains={umami.domain || undefined}
            />
          )}
          <script innerHTML={themeScript} />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
  );
});
