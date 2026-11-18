import { For, Show, createEffect, createSignal } from "solid-js";
import { revalidate, useNavigate } from "@solidjs/router";
import { importGedcom } from "~/api/gedcom-import-server";
import { getMyTrees } from "~/api";
import {
  parseGedcom,
  MAX_GEDCOM_CHARS,
  type GedcomImportResult,
} from "~/lib/gedcom-import";
import { attemptAction } from "~/lib/action-result";
import { track } from "~/lib/analytics";
import { Button } from "../ui/button";
import { Field } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";
import { useI18n } from "~/i18n/LocaleProvider";

export function ImportGedcomDialog(props: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const [fileName, setFileName] = createSignal("");
  const [text, setText] = createSignal("");
  const [treeName, setTreeName] = createSignal("");
  const [preview, setPreview] = createSignal<GedcomImportResult | null>(null);
  const [error, setError] = createSignal("");
  const [reading, setReading] = createSignal(false);
  const [pending, setPending] = createSignal(false);

  function reset() {
    setFileName("");
    setText("");
    setTreeName("");
    setPreview(null);
    setError("");
    setReading(false);
    setPending(false);
  }

  createEffect(() => {
    if (!props.open) reset();
  });

  async function chooseFile(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setError("");
    setPreview(null);
    setText("");
    setFileName(file.name);

    if (file.size > MAX_GEDCOM_CHARS) {
      setError(t("tree.import.errorTooLarge"));
      return;
    }

    setReading(true);
    try {
      const content = await file.text();
      const parsed = parseGedcom(content);
      setText(content);
      setPreview(parsed);
      const base = file.name
        .replace(/\.ged$/i, "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      setTreeName(base || t("tree.import.defaultName"));
      if (!parsed.people.length) {
        setError(t("tree.import.errorNoPeople"));
      }
    } catch {
      setError(t("tree.import.errorUnreadable"));
    } finally {
      setReading(false);
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (pending() || reading() || !preview() || !text()) return;
    setPending(true);
    setError("");
    const result = await attemptAction(() =>
      importGedcom({
        treeName: treeName().trim(),
        fileName: fileName() || null,
        text: text(),
      }),
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await revalidate(getMyTrees.key);
    track("tree_imported");
    toast.show(
      t("tree.import.imported", { count: result.data.people }),
      "success",
    );
    props.onClose();
    navigate(`/trees/${result.data.treeId}`);
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={t("tree.import.title")}
      description={t("tree.import.description")}
      footer={
        <>
          <Button
            variant="ghost"
            type="button"
            onClick={props.onClose}
            data-testid="gedcom-import-cancel"
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="gedcom-import-form"
            disabled={pending() || reading() || !preview() || !text()}
            data-testid="gedcom-import-submit"
          >
            {pending() ? t("tree.import.importing") : t("tree.import.submit")}
          </Button>
        </>
      }
    >
      <form id="gedcom-import-form" class="space-y-4" onSubmit={submit}>
        <Field
          label={t("tree.import.fileLabel")}
          for="gedcom-file"
          hint={t("tree.import.fileHint")}
        >
          <input
            id="gedcom-file"
            type="file"
            accept=".ged,.txt,text/plain"
            class="input file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold"
            onChange={chooseFile}
            data-testid="gedcom-import-file"
          />
        </Field>

        <Show when={fileName()}>
          <p class="text-xs text-muted-foreground" data-testid="gedcom-import-file-name">
            {fileName()}
            {reading() ? ` · ${t("tree.import.reading")}` : ""}
          </p>
        </Show>

        <Field label={t("tree.create.name")} for="gedcom-tree-name">
          <input
            id="gedcom-tree-name"
            class="input"
            placeholder={t("tree.create.namePlaceholder")}
            value={treeName()}
            onInput={event => setTreeName(event.currentTarget.value)}
            maxlength={80}
            required
            data-testid="gedcom-import-name"
          />
        </Field>

        <Show when={preview()}>
          {parsed => (
            <div
              class="rounded-2xl border border-border bg-muted/40 p-3"
              data-testid="gedcom-import-preview"
            >
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label={t("tree.import.stats.people")} value={parsed().stats.people} />
                <Stat label={t("tree.import.stats.families")} value={parsed().stats.families} />
                <Stat label={t("tree.import.stats.events")} value={parsed().stats.events} />
                <Stat label={t("tree.import.stats.warnings")} value={parsed().stats.warnings} />
              </div>

              <Show when={skippedSummary(parsed().stats, t)}>
                {summary => (
                  <p class="mt-2 text-xs text-muted-foreground">
                    {t("tree.import.skipped", { summary: summary() })}
                  </p>
                )}
              </Show>

              <Show when={parsed().warnings.length}>
                <ul class="mt-2 space-y-1" data-testid="gedcom-import-warnings">
                  <For each={parsed().warnings.slice(0, 6)}>
                    {(warning, index) => (
                      <li
                        class="text-xs text-muted-foreground"
                        data-testid={`gedcom-import-warning-${index()}`}
                      >
                        <Show when={warning.line}>
                          {line => (
                            <span class="font-mono">
                              {t("tree.import.warningLine", { line: line() })}{" "}
                            </span>
                          )}
                        </Show>
                        {warning.message}
                      </li>
                    )}
                  </For>
                </ul>
                <Show when={parsed().stats.warningsHidden > 0 || parsed().warnings.length > 6}>
                  <p class="mt-1 text-xs text-muted-foreground">
                    {t("common.moreCount", {
                      count:
                        parsed().stats.warningsHidden +
                        Math.max(0, parsed().warnings.length - 6),
                    })}.
                  </p>
                </Show>
              </Show>
            </div>
          )}
        </Show>

        <Show when={error()}>
          <p class="text-sm text-destructive" data-testid="gedcom-import-error">
            {error()}
          </p>
        </Show>
      </form>
    </Modal>
  );
}

function skippedSummary(
  stats: GedcomImportResult["stats"],
  t: ReturnType<typeof useI18n>["t"],
) {
  const parts: string[] = [];
  if (stats.media) {
    parts.push(t("tree.import.mediaReference", { count: stats.media }));
  }
  if (stats.sources) {
    parts.push(t("tree.import.source", { count: stats.sources }));
  }
  return parts.join(` ${t("common.and")} `);
}

function Stat(props: { label: string; value: number }) {
  return (
    <div class="rounded-xl border border-border bg-card px-2.5 py-2">
      <p class="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {props.label}
      </p>
      <p class="font-display text-xl leading-tight">{props.value}</p>
    </div>
  );
}
