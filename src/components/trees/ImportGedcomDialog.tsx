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

export function ImportGedcomDialog(props: {
  open: boolean;
  onClose: () => void;
}) {
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
      setError("That file is larger than 5 MB.");
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
      setTreeName(base || "Imported family tree");
      if (!parsed.people.length) {
        setError(
          "No people were found. Check that this is a GEDCOM file with INDI records.",
        );
      }
    } catch {
      setError("That file could not be read as text.");
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
      `Imported ${result.data.people} ${
        result.data.people === 1 ? "person" : "people"
      }.`,
      "success",
    );
    props.onClose();
    navigate(`/trees/${result.data.treeId}`);
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Import a GEDCOM file"
      description="Creates a new tree from a GEDCOM 5.5.1 file. Nothing in your existing trees changes. Media files and sources are not imported."
      footer={
        <>
          <Button variant="ghost" type="button" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="gedcom-import-form"
            disabled={pending() || reading() || !preview() || !text()}
            data-testid="gedcom-import-submit"
          >
            {pending() ? "Importing…" : "Create tree from file"}
          </Button>
        </>
      }
    >
      <form id="gedcom-import-form" class="space-y-4" onSubmit={submit}>
        <Field
          label="GEDCOM file"
          for="gedcom-file"
          hint="A .ged file, up to 5 MB. The app reads the text, then creates the tree on the server."
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
            {reading() ? " · reading…" : ""}
          </p>
        </Show>

        <Field label="Tree name" for="gedcom-tree-name">
          <input
            id="gedcom-tree-name"
            class="input"
            placeholder="The Zanca family"
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
                <Stat label="People" value={parsed().stats.people} />
                <Stat label="Families" value={parsed().stats.families} />
                <Stat label="Events" value={parsed().stats.events} />
                <Stat label="Warnings" value={parsed().stats.warnings} />
              </div>

              <Show when={skippedSummary(parsed().stats)}>
                {summary => (
                  <p class="mt-2 text-xs text-muted-foreground">
                    {summary()} will be skipped.
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
                          <span class="font-mono">Line {warning.line}: </span>
                        </Show>
                        {warning.message}
                      </li>
                    )}
                  </For>
                </ul>
                <Show when={parsed().stats.warningsHidden > 0 || parsed().warnings.length > 6}>
                  <p class="mt-1 text-xs text-muted-foreground">
                    and{" "}
                    {parsed().stats.warningsHidden +
                      Math.max(0, parsed().warnings.length - 6)}{" "}
                    more.
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

function skippedSummary(stats: GedcomImportResult["stats"]) {
  const parts: string[] = [];
  if (stats.media) {
    parts.push(
      `${stats.media} media ${stats.media === 1 ? "reference" : "references"}`,
    );
  }
  if (stats.sources) {
    parts.push(`${stats.sources} ${stats.sources === 1 ? "source" : "sources"}`);
  }
  return parts.join(" and ");
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
