import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { BookOpen, ExternalLink } from "lucide-solid";
import specJson from "../../../openapi/roots-v1.json";
import { BrandMark } from "~/components/app/AppHeader";
import { Badge } from "~/components/ui/badge";
import { buttonVariants } from "~/components/ui/button";
import { API_SCOPES } from "~/lib/api";

type Parameter = {
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: { type?: string; enum?: string[]; default?: unknown };
  $ref?: string;
};

type Operation = {
  tags?: string[];
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  responses?: Record<string, { description?: string; $ref?: string }>;
};

type Spec = {
  info: { title: string; version: string; description?: string };
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, Operation>>;
  components?: {
    parameters?: Record<string, Parameter>;
    responses?: Record<string, { description?: string }>;
  };
};

const spec = specJson as unknown as Spec;
const METHODS = new Set(["get", "post", "put", "patch", "delete"]);

function resolveParameter(parameter: Parameter): Parameter {
  if (!parameter.$ref) return parameter;
  const name = parameter.$ref.split("/").pop() ?? "";
  return spec.components?.parameters?.[name] ?? parameter;
}

function responseDescription(response: { description?: string; $ref?: string }) {
  if (response.description) return response.description;
  if (response.$ref) {
    const name = response.$ref.split("/").pop() ?? "";
    return spec.components?.responses?.[name]?.description ?? "Response";
  }
  return "Response";
}

const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
  Object.entries(item)
    .filter(([method]) => METHODS.has(method))
    .map(([method, operation]) => ({ path, method, operation })),
);

const groups = (spec.tags ?? []).map(tag => ({
  tag,
  operations: operations.filter(entry => entry.operation.tags?.includes(tag.name)),
}));

export default function ApiDocsPage() {
  return (
    <div class="page-shell min-h-[100dvh]" data-testid="api-docs-page">
      <header class="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-xl">
        <div class="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <BrandMark />
          <div class="ml-auto flex items-center gap-2">
            <A
              href="/"
              class={buttonVariants({ variant: "ghost", size: "sm" })}
              data-testid="api-docs-home"
            >
              Home
            </A>
            <A
              href="/trees"
              class={buttonVariants({ variant: "secondary", size: "sm" })}
              data-testid="api-docs-open-app"
            >
              Open the app
            </A>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-6">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p class="eyebrow mb-2 flex items-center gap-1.5">
              <BookOpen size={13} />
              Developer API
            </p>
            <h1 class="font-display text-4xl tracking-tight">{spec.info.title}</h1>
            <p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {spec.info.description}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <Badge variant="outline">v{spec.info.version}</Badge>
            <Badge variant="secondary">OpenAPI 3.1</Badge>
            <A
              href="/api/v1/openapi.json"
              target="_blank"
              rel="noreferrer"
              class={buttonVariants({ variant: "secondary", size: "sm" })}
              data-testid="api-docs-spec-link"
            >
              <ExternalLink size={14} />
              openapi.json
            </A>
          </div>
        </div>

        <section class="mt-8 grid gap-4 lg:grid-cols-2">
          <div class="rounded-3xl border border-border bg-card p-5 shadow-card">
            <h2 class="font-display text-2xl tracking-tight">Authentication</h2>
            <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
              Create a read-only token in a tree's settings under Sharing. A token
              is bound to that tree and can read it in full, including living
              relatives. Send it as a bearer token:
            </p>
            <pre class="mt-3 overflow-x-auto rounded-xl bg-muted px-3 py-2.5 text-xs">
              <code>{`curl -H "Authorization: Bearer $ROOTS_TOKEN" \\
  "$ROOTS_ORIGIN/api/v1/me"`}</code>
            </pre>
            <A
              href="/trees"
              class="mt-3 inline-flex text-sm font-semibold text-primary hover:underline"
              data-testid="api-docs-token-hint"
            >
              Open a tree to create a token
            </A>
          </div>

          <div class="rounded-3xl border border-border bg-card p-5 shadow-card">
            <h2 class="font-display text-2xl tracking-tight">Scopes</h2>
            <ul class="mt-2 space-y-2">
              <For each={API_SCOPES}>
                {scope => (
                  <li class="text-sm">
                    <code class="rounded-md bg-muted px-1.5 py-0.5 text-xs">
                      {scope.value}
                    </code>
                    <span class="ml-2 text-muted-foreground">{scope.description}</span>
                  </li>
                )}
              </For>
            </ul>
            <p class="mt-3 text-xs leading-relaxed text-muted-foreground">
              Requests are limited to 120 per minute per token. Exports are limited
              to 10 per hour per token. A browser client on another origin needs
              that origin added to the server's <code>API_ALLOWED_ORIGINS</code>.
            </p>
          </div>
        </section>

        <section class="mt-4 rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Lists use opaque cursors ordered by <code>updatedAt</code> and <code>id</code>.
          Follow <code>nextCursor</code> until <code>hasMore</code> is false. Collections
          and exports support <code>ETag</code> and <code>If-None-Match</code>.
          Timestamps are ISO 8601 in UTC.
        </section>

        <For each={groups}>
          {group => (
            <Show when={group.operations.length}>
              <section class="mt-10" data-testid={`api-docs-group-${group.tag.name.toLowerCase()}`}>
                <h2 class="font-display text-3xl tracking-tight">{group.tag.name}</h2>
                <Show when={group.tag.description}>
                  <p class="mt-1 text-sm text-muted-foreground">{group.tag.description}</p>
                </Show>

                <div class="mt-4 space-y-3">
                  <For each={group.operations}>
                    {entry => (
                      <article
                        class="rounded-2xl border border-border bg-card p-4"
                        data-testid={`api-docs-operation-${entry.operation.operationId ?? entry.path}`}
                      >
                        <div class="flex flex-wrap items-baseline gap-2">
                          <Badge variant="secondary" class="font-mono uppercase">
                            {entry.method}
                          </Badge>
                          <code class="text-sm font-semibold">{entry.path}</code>
                          <span class="text-xs text-muted-foreground">
                            {entry.operation.operationId}
                          </span>
                        </div>
                        <h3 class="mt-2 text-sm font-semibold">{entry.operation.summary}</h3>
                        <Show when={entry.operation.description}>
                          <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {entry.operation.description}
                          </p>
                        </Show>

                        <Show when={entry.operation.parameters?.length}>
                          <div class="mt-3">
                            <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Parameters
                            </h4>
                            <ul class="mt-1 space-y-1">
                              <For each={entry.operation.parameters?.map(resolveParameter) ?? []}>
                                {parameter => (
                                  <li class="text-xs text-muted-foreground">
                                    <code class="text-foreground">{parameter.name}</code>
                                    <span> ({parameter.in})</span>
                                    <Show when={parameter.required}>
                                      <span class="text-destructive"> required</span>
                                    </Show>
                                    <Show when={parameter.description}>
                                      <span>: {parameter.description}</span>
                                    </Show>
                                    <Show when={parameter.schema?.enum}>
                                      <span>
                                        {" "}
                                        One of{" "}
                                        {parameter.schema!.enum!.map(value => (
                                          <code class="ml-1 rounded bg-muted px-1">{value}</code>
                                        ))}
                                      </span>
                                    </Show>
                                  </li>
                                )}
                              </For>
                            </ul>
                          </div>
                        </Show>

                        <div class="mt-3">
                          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Responses
                          </h4>
                          <ul class="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                            <For each={Object.entries(entry.operation.responses ?? {})}>
                              {([status, response]) => (
                                <li class="text-xs">
                                  <span class="font-mono font-semibold">{status}</span>
                                  <span class="text-muted-foreground">
                                    {" "}
                                    {responseDescription(response)}
                                  </span>
                                </li>
                              )}
                            </For>
                          </ul>
                        </div>
                      </article>
                    )}
                  </For>
                </div>
              </section>
            </Show>
          )}
        </For>

        <footer class="mt-12 border-t border-border pt-5 text-xs text-muted-foreground">
          v1 is additive only. Breaking changes ship as a new major version, with
          both versions live for a stated window.
        </footer>
      </main>
    </div>
  );
}
