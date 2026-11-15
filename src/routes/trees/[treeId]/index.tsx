import { Show, Suspense, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { createAsync, revalidate, useParams, useSearchParams } from "@solidjs/router";
import { Plus, Sprout } from "lucide-solid";
import type { GraphFile, GraphPerson, GraphRelationship } from "~/api/people-server";
import { deleteParentChild, deletePartnership, deletePerson } from "~/api/people-server";
import { deleteFile, setAvatar } from "~/api/files-server";
import { getMyTrees, getTreeGraph, getTreeOverview } from "~/api";
import { GraphView, type GraphHandle } from "~/components/graph/GraphView";
import { GraphToolbar } from "~/components/graph/GraphToolbar";
import { GraphSearch } from "~/components/graph/GraphSearch";
import { PersonPanel } from "~/components/people/PersonPanel";
import { PersonFormDialog } from "~/components/people/PersonFormDialog";
import { AddRelativeDialog } from "~/components/people/AddRelativeDialog";
import { FilePreviewDialog } from "~/components/files/FilePreviewDialog";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { Button } from "~/components/ui/Button";
import { useToast } from "~/components/ui/Toast";
import { uploadPersonFile } from "~/lib/upload";
import { mimeForFile } from "~/lib/image-thumb";

export const route = {
  preload: ({ params }: { params: { treeId: string } }) => getTreeGraph(params.treeId),
};

export default function TreePage() {
  return (
    <Suspense fallback={<GraphLoading />}>
      <TreePageInner />
    </Suspense>
  );
}

function TreePageInner() {
  const params = useParams<{ treeId: string }>();
  const toast = useToast();
  const data = createAsync(() => getTreeGraph(params.treeId));
  const [searchParams, setSearchParams] = useSearchParams();
  const [handle, setHandle] = createSignal<GraphHandle>();
  const [showMedia, setShowMedia] = createSignal(true);
  const [layout, setLayout] = createSignal<"generations" | "freeform">("generations");
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [addPersonOpen, setAddPersonOpen] = createSignal(false);
  const [editPersonOpen, setEditPersonOpen] = createSignal(false);
  const [addRelativeOpen, setAddRelativeOpen] = createSignal(false);
  const [deletePersonOpen, setDeletePersonOpen] = createSignal(false);
  const [previewFile, setPreviewFile] = createSignal<GraphFile | null>(null);
  const [deleteFileTarget, setDeleteFileTarget] = createSignal<GraphFile | null>(null);
  const [pendingDelete, setPendingDelete] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  const [uploadProgress, setUploadProgress] = createSignal(0);

  const selectedId = createMemo(() => {
    const value = searchParams.person;
    return typeof value === "string" ? value : null;
  });
  const selectedPerson = createMemo(
    () => data()?.people.find(person => person.id === selectedId()) ?? null,
  );
  const editable = () => data()?.role === "owner" || data()?.role === "editor";

  onMount(() => {
    const storedLayout = localStorage.getItem("roots-layout");
    if (storedLayout === "freeform") setLayout("freeform");
    if (localStorage.getItem("roots-media") === "off") setShowMedia(false);

    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (typing) return;
      if (event.key === "/") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "f") handle()?.fit();
    };
    window.addEventListener("keydown", listener);
    onCleanup(() => window.removeEventListener("keydown", listener));
  });

  function selectPerson(id: string | null) {
    setSearchParams({ person: id ?? undefined }, { replace: true });
  }

  function focusPerson(id: string) {
    selectPerson(id);
    setTimeout(() => handle()?.focus(id), 50);
  }

  function toggleMedia() {
    const next = !showMedia();
    setShowMedia(next);
    localStorage.setItem("roots-media", next ? "on" : "off");
  }

  function toggleLayout() {
    const next = layout() === "generations" ? "freeform" : "generations";
    setLayout(next);
    localStorage.setItem("roots-layout", next);
  }

  async function handleUpload(files: File[]) {
    const person = selectedPerson();
    if (!person) return;
    setUploading(true);
    setUploadProgress(0);
    let uploaded = 0;
    let needsAvatar = !person.avatarFileId;
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const result = await uploadPersonFile({
          treeId: params.treeId,
          personId: person.id,
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
        if (needsAvatar && mimeForFile(file).startsWith("image/")) {
          needsAvatar = false;
          const avatarResult = await setAvatar({
            treeId: params.treeId,
            personId: person.id,
            fileId: result.fileId,
          });
          if (!avatarResult.ok) toast.show(avatarResult.error, "error");
        }
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
    await revalidate([getTreeGraph.key, getTreeOverview.key, getMyTrees.key]);
    if (uploaded) {
      toast.show(`${uploaded} file${uploaded === 1 ? "" : "s"} added.`, "success");
    }
  }

  async function handleSetAvatar(fileId: string | null) {
    const person = selectedPerson();
    if (!person) return;
    const result = await setAvatar({ treeId: params.treeId, personId: person.id, fileId });
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate(getTreeGraph.key);
    toast.show(fileId ? "Portrait updated." : "Portrait removed.", "success");
  }

  async function handleDeleteFile() {
    const file = deleteFileTarget();
    if (!file) return;
    setPendingDelete(true);
    const result = await deleteFile({ treeId: params.treeId, fileId: file.id });
    setPendingDelete(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setDeleteFileTarget(null);
    setPreviewFile(null);
    await revalidate([getTreeGraph.key, getTreeOverview.key, getMyTrees.key]);
    toast.show("File deleted.", "success");
  }

  async function handleDeletePerson() {
    const person = selectedPerson();
    if (!person) return;
    setPendingDelete(true);
    const result = await deletePerson({ treeId: params.treeId, personId: person.id });
    setPendingDelete(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setDeletePersonOpen(false);
    selectPerson(null);
    await revalidate([getTreeGraph.key, getTreeOverview.key, getMyTrees.key]);
    toast.show("Person removed.", "success");
  }

  async function handleRemoveRelationship(relationship: GraphRelationship) {
    const result =
      relationship.type === "parent"
        ? await deleteParentChild({ treeId: params.treeId, relationshipId: relationship.id })
        : await deletePartnership({ treeId: params.treeId, relationshipId: relationship.id });
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate([getTreeGraph.key, getTreeOverview.key, getMyTrees.key]);
    toast.show("Connection removed.", "success");
  }

  function openFile(file: GraphFile) {
    setPreviewFile(file);
    if (file.personId !== selectedId()) focusPerson(file.personId);
  }

  return (
    <Show when={data()} fallback={<GraphLoading />}>
      {graph => (
        <div class="relative h-[100dvh] w-full overflow-hidden bg-graph-bg">
          <GraphView
            data={graph()}
            role={graph().role}
            selectedId={selectedId()}
            showMedia={showMedia()}
            layout={layout()}
            onSelect={selectPerson}
            onFileOpen={id => {
              const file = graph().files.find(candidate => candidate.id === id);
              if (file) openFile(file);
            }}
            onReady={setHandle}
          />

          <GraphToolbar
            treeId={params.treeId}
            treeName={graph().tree.name}
            peopleCount={graph().people.length}
            role={graph().role}
            showMedia={showMedia()}
            layout={layout()}
            onToggleMedia={toggleMedia}
            onToggleLayout={toggleLayout}
            onSearch={() => setSearchOpen(true)}
            onFit={() => handle()?.fit()}
            onZoomIn={() => handle()?.zoomBy(1.25)}
            onZoomOut={() => handle()?.zoomBy(0.8)}
            onAddPerson={() => setAddPersonOpen(true)}
          />

          <Show when={graph().people.length === 0}>
            <div class="pointer-events-none absolute inset-0 z-10 grid place-items-center px-6">
              <div class="pointer-events-auto w-full max-w-md rounded-3xl border border-white/10 bg-black/45 p-7 text-center text-white/85 shadow-2xl backdrop-blur-xl">
                <div class="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-white/10 text-gold">
                  <Sprout size={27} />
                </div>
                <h1 class="mt-5 font-display text-3xl tracking-tight">An empty branch</h1>
                <p class="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/55">
                  {editable()
                    ? "Add the first person. From there you can connect parents, partners and children."
                    : "The people who manage this tree have not added anyone yet."}
                </p>
                <Show when={editable()}>
                  <Button class="mt-6" onClick={() => setAddPersonOpen(true)}>
                    <Plus size={16} />
                    Add the first person
                  </Button>
                </Show>
              </div>
            </div>
          </Show>

          <Show when={selectedPerson()}>
            {person => (
              <PersonPanel
                person={person()}
                data={graph()}
                role={graph().role}
                uploading={uploading()}
                uploadProgress={uploadProgress()}
                onClose={() => selectPerson(null)}
                onEdit={() => setEditPersonOpen(true)}
                onDelete={() => setDeletePersonOpen(true)}
                onAddRelative={() => setAddRelativeOpen(true)}
                onSelectPerson={focusPerson}
                onPreviewFile={openFile}
                onSetAvatar={handleSetAvatar}
                onDeleteFile={file => setDeleteFileTarget(file)}
                onUpload={handleUpload}
                onRemoveRelationship={handleRemoveRelationship}
              />
            )}
          </Show>

          <div class="pointer-events-none absolute bottom-4 left-4 z-10 hidden items-center gap-3 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[0.65rem] text-white/45 backdrop-blur sm:flex">
            <span class="flex items-center gap-1.5">
              <span class="h-1.5 w-4 rounded-full bg-[#66735f]" /> Parent
            </span>
            <span class="flex items-center gap-1.5">
              <span class="h-px w-4 border-t border-dashed border-[#b97c63]" /> Partner
            </span>
            <span class="flex items-center gap-1.5">
              <span class="h-1.5 w-4 rounded-full bg-[#8d846c]" /> File
            </span>
          </div>

          <Show when={editable()}>
            <button
              type="button"
              class="absolute bottom-5 right-5 z-20 grid h-14 w-14 place-items-center rounded-full bg-gold text-[#161a12] shadow-2xl transition hover:scale-105 sm:hidden"
              aria-label="Add a person"
              onClick={() => setAddPersonOpen(true)}
            >
              <Plus size={24} />
            </button>
          </Show>

          <GraphSearch
            open={searchOpen()}
            onClose={() => setSearchOpen(false)}
            data={graph()}
            onPerson={person => focusPerson(person.id)}
            onFile={openFile}
          />

          <PersonFormDialog
            open={addPersonOpen()}
            onClose={() => setAddPersonOpen(false)}
            treeId={params.treeId}
            onSaved={focusPerson}
          />

          <PersonFormDialog
            open={editPersonOpen()}
            onClose={() => setEditPersonOpen(false)}
            treeId={params.treeId}
            person={selectedPerson()}
          />

          <AddRelativeDialog
            open={addRelativeOpen()}
            onClose={() => setAddRelativeOpen(false)}
            treeId={params.treeId}
            anchor={selectedPerson()}
            people={graph().people}
            onAdded={focusPerson}
          />

          <FilePreviewDialog
            file={previewFile()}
            editable={editable()}
            onClose={() => setPreviewFile(null)}
            onSetAvatar={handleSetAvatar}
            onDelete={file => setDeleteFileTarget(file)}
          />

          <ConfirmDialog
            open={deletePersonOpen()}
            onClose={() => setDeletePersonOpen(false)}
            title={`Delete ${selectedPerson()?.displayName ?? "this person"}?`}
            message={
              <>
                This removes the person, their connections, and every file attached to them. This
                cannot be undone.
              </>
            }
            confirmLabel="Delete person"
            danger
            pending={pendingDelete()}
            onConfirm={handleDeletePerson}
          />

          <ConfirmDialog
            open={Boolean(deleteFileTarget())}
            onClose={() => setDeleteFileTarget(null)}
            title={`Delete ${deleteFileTarget()?.name ?? "this file"}?`}
            message="The file will be removed from storage and from this person's profile."
            confirmLabel="Delete file"
            danger
            pending={pendingDelete()}
            onConfirm={handleDeleteFile}
          />
        </div>
      )}
    </Show>
  );
}

function GraphLoading() {
  return (
    <div class="graph-shell grid place-items-center">
      <div class="flex items-center gap-3 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs text-white/60 backdrop-blur">
        <span class="h-2 w-2 animate-pulse rounded-full bg-gold" />
        Finding the branches…
      </div>
    </div>
  );
}
