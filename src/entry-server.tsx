// @refresh reload
import { StartServer, createHandler } from "@solidjs/start/server";
import { optionalEnv } from "./server/config";

const themeScript = `try{const s=localStorage.getItem("roots-theme");const d=s==="dark"||(!s&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}`;

const umamiScriptUrl = optionalEnv("UMAMI_SCRIPT_URL", "").trim();
const umamiWebsiteId = optionalEnv("UMAMI_WEBSITE_ID", "").trim();
const umami =
  umamiScriptUrl && umamiWebsiteId
    ? { scriptUrl: umamiScriptUrl, websiteId: umamiWebsiteId }
    : null;

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <meta name="description" content="Roots is a private, collaborative family tree." />
          <meta name="robots" content="noindex, nofollow" />
          <meta name="theme-color" content="#f6f1e7" />
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <title>Roots</title>
          {umami && (
            <script
              defer
              src={umami.scriptUrl}
              data-website-id={umami.websiteId}
              data-exclude-search="true"
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
));
