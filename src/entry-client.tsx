// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";
import { initClientSentry } from "./lib/sentry-client";

initClientSentry();

mount(() => <StartClient />, document.getElementById("app")!);
