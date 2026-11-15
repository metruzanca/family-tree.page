import { Show } from "solid-js";
import { Download, FileText, Image as ImageIcon, Trash2, UserRound } from "lucide-solid";
import type { GraphFile } from "~/api/people-server";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

export function FilePreviewDialog(props: {
  file: GraphFile | null;
  editable: boolean;
  onClose: () => void;
  onSetAvatar: (fileId: string | null) => void;
  onDelete: (file: GraphFile) => void;
}) {
  return (
    <Modal
      open={Boolean(props.file)}
      onClose={props.onClose}
      title={props.file?.name}
      wide
      footer={
        <Show when={props.file}>
          {file => (
            <>
              <a
                href={`/api/files/${file().id}/download`}
                class="btn btn-secondary btn-sm"
                download={file().name}
              >
                <Download size={14} />
                Download
              </a>
              <Show when={props.editable && file().kind === "image"}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    props.onSetAvatar(file().isAvatar ? null : file().id);
                    props.onClose();
                  }}
                >
                  <UserRound size={14} />
                  {file().isAvatar ? "Remove portrait" : "Use as portrait"}
                </Button>
              </Show>
              <Show when={props.editable}>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    props.onDelete(file());
                    props.onClose();
                  }}
                >
                  <Trash2 size={14} />
                  Delete
                </Button>
              </Show>
            </>
          )}
        </Show>
      }
    >
      <Show when={props.file}>
        {file => (
          <div class="space-y-3">
            <Show
              when={file().kind === "image"}
              fallback={
                <div class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-paper px-6 py-16 text-center">
                  <FileText size={38} class="text-muted" />
                  <p class="max-w-sm text-sm text-muted">
                    This file is downloaded rather than previewed. It stays private to this tree.
                  </p>
                </div>
              }
            >
              <div class="flex max-h-[60dvh] items-center justify-center overflow-hidden rounded-2xl bg-black/80">
                <img
                  src={`/api/files/${file().id}/download?inline=1`}
                  alt={file().name}
                  class="max-h-[60dvh] w-auto max-w-full object-contain"
                />
              </div>
            </Show>
            <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span class="badge">{file().kind}</span>
              <span>{file().mimeType}</span>
              <Show when={file().isAvatar}>
                <span class="badge">Portrait</span>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </Modal>
  );
}
