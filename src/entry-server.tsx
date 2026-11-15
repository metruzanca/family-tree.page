// @refresh reload
import { StartServer, createHandler } from "@solidjs/start/server";

const themeScript = `try{const s=localStorage.getItem("roots-theme");const d=s==="dark"||(!s&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}`;

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
          {import.meta.env.PROD && (
            <script
              defer
              src="https://analytics.zanca.dev/script.js"
              data-website-id="f2a5b922-2a17-432f-8e5e-b4a0c61578b3"
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
