// @refresh reload
import { StartServer, createHandler } from "@solidjs/start/server";
import { optionalEnv } from "./server/config";

const themeScript = `try{const s=localStorage.getItem("family-tree-theme");const d=s==="dark"||(!s&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}`;

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
          <meta
            name="description"
            content="A private, collaborative family tree built as an interactive graph. Add people, connect parents and partners, and attach the photos and documents that hold the stories together. Free and open source."
          />
          <meta name="theme-color" content="#f6f1e7" />
          <meta property="og:type" content="website" />
          <meta property="og:title" content="family-tree: a private, collaborative family graph" />
          <meta
            property="og:description"
            content="A private, collaborative family tree built as an interactive graph. People, partners, children and media in one connected picture. Free and open source."
          />
          <meta property="og:url" content="https://family-tree.page" />
          <meta name="twitter:card" content="summary" />
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <title>family-tree: a private, collaborative family graph</title>
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
