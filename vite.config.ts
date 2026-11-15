import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [solidStart(), tailwindcss(), nitro()],
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
