import { Show, Suspense, createMemo, createSignal } from "solid-js";
import { createAsync, revalidate, useNavigate, useParams, useSearchParams } from "@solidjs/router";
import type { GraphFile } from "~/api/people-server";
import {
  assignFilesToPerson,
  deleteFiles,
  setAvatar,
  updateFileTags,
  updateFileTakenAt,
} from "~/api/files-server";
import {
  addManualFileFace,
  assignFileFace,
  deleteFileFace,
  setFileFaceIgnored,
  unlinkFileFace,
} from "~/api/faces-server";
import { getTreeGraph, requireUserPage } from "~/api";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { AppHeader } from "~/components/app/AppHeader";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { LoadingScreen } from "~/components/ui/Loading";
import { useToast } from "~/components/ui/Toast";
import { MediaGallery } from "~/components/files/MediaGallery";
import { MediaLightbox } from "~/components/files/MediaLightbox";
import { uploadFile } from "~/lib/upload";
import { scanFileForFaces } from "~/lib/face-scan";
import type { FaceBox } from "~/lib/face-box";
import { attemptAction } from "~/lib/action-result";
import { sizeBucket, track } from "~/lib/analytics";

export const route = {
  preload: ({ params }: { params: { treeId: string } }) => {
    requireUserPage();
    getTreeGraph(params.treeId);
  },
};

export default function TreeMediaPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AppErrorBoundary
        title="We could not load these photos"
        message="The tree may be temporarily unavailable. Try again in a moment."
        revalidateKeys={[requireUserPage.key, getTreeGraph.key]}
        back={{ href: "/trees", label: "Back to your trees" }}
      >
        <TreeMediaInner />
      </AppErrorBoundary>
    </Suspense>
  );
}

function TreeMediaInner() {
  const params = useParams<{ treeId: string }>();
  const [searchParams] = useSearchParams<{ person?: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const user = createAsync(() => requireUserPage());
  const data = createAsync(() => getTreeGraph(params.treeId));

  const [uploading, setUploading] = createSignal(false);
  const [uploadProgress, setUploadProgress] = createSignal(0);
  const [lightboxIds, setLightboxIds] = createSignal<string[] | null>(null);
  const [lightboxInitialId, setLightboxInitialId] = createSignal<string | null>(null);
  const [lightboxCurrentId, setLightboxCurrentId] = createSignal<string | null>(null);
  const [deleteIds, setDeleteIds] = createSignal<string[]>([]);
  const [pendingDelete, setPendingDelete] = createSignal(false);
  const [tagPending, setTagPending] = createSignal(false);
  const [takenAtPending, setTakenAtPending] = createSignal(false);
  const [facePending, setFacePending] = createSignal(false);
  const [faceScanPending, setFaceScanPending] = createSignal(false);

  const peopleById = createMemo(
    () => new Map((data()?.people ?? []).map(person => [person.id, person])),
  );
  const lightboxFiles = createMemo(() => {
    const ids = lightboxIds();
    if (!ids) return [];
    const byId = new Map((data()?.files ?? []).map(file => [file.id, file]));
    return ids
      .map(id => byId.get(id))
      .filter((file): file is GraphFile => Boolean(file));
  });
  const lightboxFile = createMemo(() => {
    const id = lightboxCurrentId() ?? lightboxInitialId();
    return (data()?.files ?? []).find(file => file.id === id) ?? null;
  });
  const lightboxPerson = createMemo(() => {
    const personId = lightboxFile()?.personId;
    return personId ? peopleById().get(personId) : undefined;
  });

  async function refresh() {
    await revalidate(getTreeGraph.key);
  }

  async function handleUpload(files: File[], personId: string | null) {
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    setUploading(true);
    setUploadProgress(0);
    let uploaded = 0;
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const result = await uploadFile({
          treeId: params.treeId,
          personId,
          file,
          onProgress: fraction => {
            setUploadProgress((index + fraction) / files.length);
          },
        });
        if (!result.ok) {
          toast.show(result.error, "error");
          continue;
        }
        uploaded += 1;
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
    await refresh();
    if (!uploaded) return;
    track("media_uploaded", {
      count: uploaded,
      album: false,
      size_bucket: sizeBucket(totalBytes),
    });
    toast.show(
      `${uploaded} ${uploaded === 1 ? "photo" : "photos"} added to ${
        personId ? "their folder" : "the inbox"
      }.`,
      "success",
    );
  }

  async function handleAssign(fileIds: string[], personId: string | null) {
    const result = await attemptAction(() =>
      assignFilesToPerson({ treeId: params.treeId, fileIds, personId }),
    );
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setLightboxIds(null);
    await refresh();
    const count = result.data.moved;
    if (!count) {
      toast.show("Those photos are already filed there.", "info");
      return;
    }
    track("media_filed", { count, inbox: !personId });
    toast.show(
      personId
        ? `${count} ${count === 1 ? "photo" : "photos"} filed under ${
            peopleById().get(personId)?.displayName ?? "that person"
          }.`
        : `${count} ${count === 1 ? "photo" : "photos"} moved to the inbox.`,
      "success",
    );
  }

  function requestDelete(fileIds: string[]) {
    setDeleteIds(fileIds);
  }

  async function confirmDelete() {
    const fileIds = deleteIds();
    if (!fileIds.length) return;
    setPendingDelete(true);
    const result = await attemptAction(() =>
      deleteFiles({ treeId: params.treeId, fileIds }),
    );
    setPendingDelete(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setDeleteIds([]);
    setLightboxIds(null);
    await refresh();
    track("file_deleted", { album: false });
    toast.show(
      result.data.deleted === 1
        ? "Photo deleted."
        : `${result.data.deleted} photos deleted.`,
      "success",
    );
  }

  async function handleSetAvatar(personId: string, fileId: string | null) {
    const result = await attemptAction(() =>
      setAvatar({ treeId: params.treeId, personId, fileId }),
    );
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await refresh();
    track(fileId ? "portrait_set" : "portrait_removed");
    toast.show(fileId ? "Portrait updated." : "Portrait removed.", "success");
  }

  async function handleSaveTags(fileId: string, personIds: string[]) {
    setTagPending(true);
    const result = await attemptAction(() =>
      updateFileTags({ treeId: params.treeId, fileId, personIds }),
    );
    setTagPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await refresh();
    track("file_people_tagged", { count: result.data.length });
    toast.show("Photo tags updated.", "success");
  }

  async function handleSetTakenAt(fileId: string, value: Parameters<typeof updateFileTakenAt>[0]["takenAt"]) {
    setTakenAtPending(true);
    const result = await attemptAction(() =>
      updateFileTakenAt({ treeId: params.treeId, fileId, takenAt: value }),
    );
    setTakenAtPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await refresh();
    track("file_date_taken_set", { cleared: !value });
    toast.show(value ? "Date taken updated." : "Date taken cleared.", "success");
  }

  async function handleAssignFace(fileId: string, faceId: string, personId: string) {
    setFacePending(true);
    const result = await attemptAction(() =>
      assignFileFace({ treeId: params.treeId, fileId, faceId, personId }),
    );
    setFacePending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await refresh();
    track("face_linked");
    toast.show("Face linked.", "success");
  }

  async function handleUnlinkFace(fileId: string, faceId: string) {
    setFacePending(true);
    const result = await attemptAction(() =>
      unlinkFileFace({ treeId: params.treeId, fileId, faceId }),
    );
    setFacePending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await refresh();
    toast.show("Face link removed.", "success");
  }

  async function handleSetFaceIgnored(fileId: string, faceId: string, ignored: boolean) {
    setFacePending(true);
    const result = await attemptAction(() =>
      setFileFaceIgnored({ treeId: params.treeId, fileId, faceId, ignored }),
    );
    setFacePending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await refresh();
    toast.show(ignored ? "Face ignored." : "Face restored.", "success");
  }

  async function handleDeleteFace(fileId: string, faceId: string) {
    setFacePending(true);
    const result = await attemptAction(() =>
      deleteFileFace({ treeId: params.treeId, fileId, faceId }),
    );
    setFacePending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await refresh();
    toast.show("Face box removed.", "success");
  }

  async function handleAddFace(fileId: string, personId: string, box: FaceBox) {
    setFacePending(true);
    const result = await attemptAction(() =>
      addManualFileFace({ treeId: params.treeId, fileId, personId, box }),
    );
    setFacePending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await refresh();
    track("face_linked");
    toast.show("Face added.", "success");
  }

  async function handleScanFaces(fileId: string) {
    setFaceScanPending(true);
    const result = await scanFileForFaces(params.treeId, fileId);
    setFaceScanPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await refresh();
    track("faces_scanned", { count: result.count });
    toast.show(
      result.count === 0
        ? "No faces found in this photo."
        : `${result.count} face${result.count === 1 ? "" : "s"} found.`,
      "success",
    );
  }

  function openLightbox(file: GraphFile, files: GraphFile[]) {
    setLightboxIds(files.map(candidate => candidate.id));
    setLightboxInitialId(file.id);
    setLightboxCurrentId(file.id);
  }

  return (
    <Show when={user()}>
      {currentUser => (
        <Show when={data()}>
          {graph => (
            <div class="page-shell min-h-[100dvh]">
              <AppHeader
                user={currentUser()}
                back={{ href: `/trees/${params.treeId}`, label: "Back to tree" }}
                center={graph().tree.name}
              />
              <main class="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6">
                <MediaGallery
                  treeId={params.treeId}
                  data={graph()}
                  role={graph().role}
                  uploading={uploading()}
                  uploadProgress={uploadProgress()}
                  initialLocation={
                    typeof searchParams.person === "string"
                      ? searchParams.person
                      : "all"
                  }
                  onUpload={handleUpload}
                  onOpenFile={openLightbox}
                  onAssign={handleAssign}
                  onDelete={requestDelete}
                />
              </main>

              <Show when={lightboxIds()?.length && lightboxFile()}>
                <MediaLightbox
                  files={lightboxFiles()}
                  initialFileId={lightboxInitialId()}
                  title="Photos"
                  person={lightboxPerson()}
                  people={graph().people}
                  role={graph().role}
                  tagPending={tagPending()}
                  takenAtPending={takenAtPending()}
                  facePending={facePending()}
                  faceScanPending={faceScanPending()}
                  onClose={() => {
                    setLightboxIds(null);
                    setLightboxInitialId(null);
                    setLightboxCurrentId(null);
                  }}
                  onCurrentChange={file => setLightboxCurrentId(file.id)}
                  onSelectPerson={personId =>
                    navigate(`/trees/${params.treeId}?person=${personId}`)
                  }
                  onSetAvatar={handleSetAvatar}
                  onSaveTags={handleSaveTags}
                  onSetTakenAt={handleSetTakenAt}
                  onDeleteFile={file => requestDelete([file.id])}
                  onAssignFace={handleAssignFace}
                  onUnlinkFace={handleUnlinkFace}
                  onSetFaceIgnored={handleSetFaceIgnored}
                  onDeleteFace={handleDeleteFace}
                  onAddFace={handleAddFace}
                  onScanFaces={handleScanFaces}
                />
              </Show>

              <ConfirmDialog
                open={deleteIds().length > 0}
                onClose={() => setDeleteIds([])}
                title={
                  deleteIds().length === 1
                    ? "Delete this photo?"
                    : `Delete ${deleteIds().length} photos?`
                }
                message="The files are removed from storage and from this tree. This cannot be undone."
                confirmLabel={
                  deleteIds().length === 1 ? "Delete photo" : "Delete photos"
                }
                danger
                pending={pendingDelete()}
                testId="media-confirm-delete"
                onConfirm={confirmDelete}
              />
            </div>
          )}
        </Show>
      )}
    </Show>
  );
}
