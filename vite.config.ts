import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

const sentryOrg = process.env.SENTRY_ORG?.trim();
const sentryProject = process.env.SENTRY_PROJECT?.trim();
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();

const sentryPlugins =
  sentryOrg && sentryProject && sentryAuthToken
    ? [
        sentryVitePlugin({
          org: sentryOrg,
          project: sentryProject,
          authToken: sentryAuthToken,
          telemetry: false,
          sourcemaps: {
            assets: ["./.output/public/**"],
            filesToDeleteAfterUpload: ["./.output/public/**/*.map"],
          },
        }),
      ]
    : [];

export default defineConfig({
  build: {
    // Only generate maps when the Sentry plugin will upload and delete them.
    sourcemap: sentryPlugins.length ? "hidden" : false,
  },
  plugins: [solidStart(), tailwindcss(), nitro(), ...sentryPlugins],
  nitro: {
    serverDir: "./server",
    features: {
      websocket: true,
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    watch: {
      ignored: ["**/.dev/**", "**/.output/**", "**/test-results/**"],
    },
  },
  ssr: {
    external: ["drizzle-orm", "pg"],
  },
});
