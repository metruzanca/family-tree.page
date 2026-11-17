// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";
import { initClientSentry } from "./lib/sentry-client";
import { installRequestTracking } from "./lib/request-tracking";

initClientSentry();
installRequestTracking();

mount(() => <StartClient />, document.getElementById("app")!);
