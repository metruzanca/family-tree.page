import {
  For,
  Show,
  Suspense,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { createAsync, revalidate, useParams, useSearchParams } from "@solidjs/router";
import { Plus, Sprout, Target, TriangleAlert, X } from "lucide-solid";
import type {
  GraphFile,
  GraphFileGroup,
  GraphPerson,
  GraphPersonEvent,
  GraphRelationship,
} from "~/api/people-server";
import {
  deleteParentChild,
  deletePartnership,
  deletePerson,
  deletePersonEvent,
  setMyPerson,
} from "~/api/people-server";
import {
  createFileGroup,
  deleteFile,
  deleteFileGroup,
  renameFileGroup,
  setAvatar,
  updateFileTags,
  updateFileTakenAt,
} from "~/api/files-server";
import {
  getMyTrees,
  getTreeGraph,
  getTreeMembers,
  getTreeOverview,
} from "~/api";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { GraphView, type GraphHandle } from "~/components/graph/GraphView";
import { GraphToolbar } from "~/components/graph/GraphToolbar";
import { GraphSearch } from "~/components/graph/GraphSearch";
import { PersonPanel } from "~/components/people/PersonPanel";
import { FocusPersonDialog } from "~/components/people/FocusPersonDialog";
import { PersonFormDialog } from "~/components/people/PersonFormDialog";
import { PersonEventDialog } from "~/components/people/PersonEventDialog";
import { AddRelativeDialog } from "~/components/people/AddRelativeDialog";
import { FilePanel } from "~/components/files/FilePanel";
import { MediaLightbox } from "~/components/files/MediaLightbox";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/Toast";
import { uploadPersonFile } from "~/lib/upload";
import { attemptAction, friendlyMessage } from "~/lib/action-result";
import type { FuzzyDate } from "~/lib/fuzzy-date";
import { fileNodeId, groupNodeId, type GenerationDirection } from "~/lib/graph";
import {
  defaultFocusRadius,
  parseFocusRadius,
  resolveFocus,
  shortestPath,
  SMALL_TREE_SIZE,
  type FocusRadius,
  type FocusView,
} from "~/lib/focus";
import { analyzeRelationships, type RelationshipConflict } from "~/lib/relationships";
import { sizeBucket, track } from "~/lib/analytics";
import { createTreePresence } from "~/lib/presence";

export const route = {
  preload: ({ params }: { params: { treeId: string } }) => getTreeGraph(params.treeId),
};

export default function TreePage() {
  return (
    <Suspense fallback={<GraphLoading />}>
      <AppErrorBoundary
        title="We could not load this tree"
        message="The tree may be temporarily unavailable. Try again, or head back to your trees."
        variant="graph"
        revalidateKeys={[getTreeGraph.key, getTreeOverview.key, getMyTrees.key]}
        back={{ href: "/trees", label: "Back to your trees" }}
      >
        <TreePageInner />
      </AppErrorBoundary>
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
  const [generationDirection, setGenerationDirection] = createSignal<GenerationDirection>(
    "oldest-top",
  );
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [addPersonOpen, setAddPersonOpen] = createSignal(false);
  const [editPersonOpen, setEditPersonOpen] = createSignal(false);
  const [addRelativeOpen, setAddRelativeOpen] = createSignal(false);
  const [eventDialogOpen, setEventDialogOpen] = createSignal(false);
  const [eventTarget, setEventTarget] = createSignal<GraphPersonEvent | null>(null);
  const [deleteEventTarget, setDeleteEventTarget] = createSignal<GraphPersonEvent | null>(null);
  const [pendingDeleteEvent, setPendingDeleteEvent] = createSignal(false);
  const [deletePersonOpen, setDeletePersonOpen] = createSignal(false);
  const [deleteFileTarget, setDeleteFileTarget] = createSignal<GraphFile | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = createSignal<GraphFileGroup | null>(null);
  const [pendingDelete, setPendingDelete] = createSignal(false);
  const [tagPending, setTagPending] = createSignal(false);
  const [takenAtPending, setTakenAtPending] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  const [uploadProgress, setUploadProgress] = createSignal(0);

  const selectedId = createMemo(() => {
    const value = searchParams.person;
    return typeof value === "string" ? value : null;
  });
  const selectedFileId = createMemo(() => {
    const value = searchParams.file;
    return typeof value === "string" ? value : null;
  });
  const selectedGroupId = createMemo(() => {
    const value = searchParams.album;
    return typeof value === "string" ? value : null;
  });
  const selectedPerson = createMemo(() =>
    selectedFileId() || selectedGroupId()
      ? null
      : (data()?.people.find(person => person.id === selectedId()) ?? null),
  );
  const selectedFile = createMemo(
    () => data()?.files.find(file => file.id === selectedFileId()) ?? null,
  );
  const selectedGroup = createMemo(
    () => data()?.groups.find(group => group.id === selectedGroupId()) ?? null,
  );
  const effectiveGroup = createMemo(
    () =>
      selectedGroup() ??
      (selectedFile()?.groupId
        ? (data()?.groups.find(group => group.id === selectedFile()!.groupId) ?? null)
        : null),
  );
  const groupFiles = createMemo(() => {
    const group = effectiveGroup();
    if (!group) return [];
    return data()?.files.filter(file => file.groupId === group.id) ?? [];
  });
  const activeMediaPerson = createMemo(() => {
    const personId = effectiveGroup()?.personId ?? selectedFile()?.personId;
    return data()?.people.find(person => person.id === personId) ?? undefined;
  });
  const selectedNodeId = createMemo(() => {
    const group = effectiveGroup();
    if (group) return groupNodeId(group.id);
    if (selectedPerson()) return selectedPerson()!.id;
    if (selectedFile()) return fileNodeId(selectedFile()!.id);
    return null;
  });
  const editable = () => data()?.role === "owner" || data()?.role === "editor";

  const [focusRadius, setFocusRadius] = createSignal<FocusRadius | null>(null);
  const [pinnedPeople, setPinnedPeople] = createSignal<string[]>([]);
  const [focusPersonOpen, setFocusPersonOpen] = createSignal(false);
  const [claimingPerson, setClaimingPerson] = createSignal(false);
  const [focusPromptDismissed, setFocusPromptDismissed] = createSignal(true);

  const focusStorageKey = () => `family-tree-focus-radius:${params.treeId}`;
  const focusPromptKey = () => `family-tree-focus-prompt:${params.treeId}`;

  const viewerPersonId = () => data()?.viewerPersonId ?? null;
  const viewerPerson = () =>
    data()?.people.find(person => person.id === viewerPersonId()) ?? null;

  const effectiveFocusRadius = (): FocusRadius => {
    const stored = focusRadius();
    if (stored) return stored;
    const graph = data();
    if (!graph || !graph.viewerPersonId) return "all";
    return defaultFocusRadius(graph.people.length);
  };

  const focus = createMemo<FocusView>(() => {
    const graph = data();
    if (!graph) {
      return {
        visible: new Set<string>(),
        distances: new Map(),
        nextRadius: null,
        nextRingCount: 0,
        total: 0,
      };
    }
    return resolveFocus(graph.people, graph.relationships, {
      focusId: graph.viewerPersonId,
      radius: effectiveFocusRadius(),
      pinned: pinnedPeople(),
    });
  });

  const hiddenCount = () => Math.max(0, focus().total - focus().visible.size);
  const canShowMore = () =>
    Boolean(viewerPersonId()) && hiddenCount() > 0 && focus().nextRadius != null;
  const showFocusPrompt = () =>
    !viewerPersonId() &&
    (data()?.people.length ?? 0) >= SMALL_TREE_SIZE &&
    !focusPromptDismissed();

  function chooseFocusRadius(radius: FocusRadius) {
    setFocusRadius(radius);
    localStorage.setItem(focusStorageKey(), String(radius));
    track("focus_radius_changed", { radius: String(radius) });
    setTimeout(() => handle()?.fit(), 160);
  }

  function showMore() {
    const next = focus().nextRadius;
    if (next) chooseFocusRadius(next);
  }

  function revealPerson(id: string) {
    const graph = data();
    const focusId = graph?.viewerPersonId;
    if (!graph || !focusId || id === focusId) return;
    if (focus().visible.has(id)) return;
    const path = shortestPath(graph.relationships, focusId, id);
    if (!path || path.length < 2) return;
    setPinnedPeople(current => {
      const next = new Set(current);
      let changed = false;
      for (const pathId of path) {
        if (next.has(pathId)) continue;
        next.add(pathId);
        changed = true;
      }
      return changed ? [...next] : current;
    });
  }

  function dismissFocusPrompt() {
    setFocusPromptDismissed(true);
    localStorage.setItem(focusPromptKey(), "off");
  }

  async function saveViewerPerson(personId: string | null) {
    setClaimingPerson(true);
    const result = await attemptAction(() =>
      setMyPerson({ treeId: params.treeId, personId }),
    );
    setClaimingPerson(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setFocusPersonOpen(false);
    setPinnedPeople([]);
    if (!personId) {
      setFocusRadius("all");
    } else if (!focusRadius()) {
      setFocusRadius(defaultFocusRadius(data()?.people.length ?? 0));
    }
    await revalidate([getTreeGraph.key, getTreeMembers.key]);
    track(personId ? "focus_identity_claimed" : "focus_identity_cleared");
    toast.show(
      personId
        ? "Your place in the tree is saved. The graph now opens around you."
        : "Your link to this tree was cleared. Everyone is visible again.",
      "success",
    );
  }

  const selectedParentCount = createMemo(() => {
    const person = selectedPerson();
    const graph = data();
    if (!person || !graph) return 0;
    return graph.relationships.filter(
      relationship =>
        relationship.type === "parent" && relationship.target === person.id,
    ).length;
  });

  const conflicts = createMemo<RelationshipConflict[]>(() => {
    const graph = data();
    if (!graph) return [];
    return analyzeRelationships(graph.people, graph.relationships).conflicts;
  });

  function conflictPersonName(personId: string) {
    return data()?.people.find(person => person.id === personId)?.displayName ?? "Someone";
  }

  function conflictTitle(conflict: RelationshipConflict) {
    if (conflict.kind === "partner-ancestor") {
      const [first, second] = conflict.personIds;
      return `${conflictPersonName(first)} is both partner and ancestor of ${conflictPersonName(second)}.`;
    }
    return `A parent loop connects ${conflict.personIds
      .map(conflictPersonName)
      .join(", ")}.`;
  }

  const presence = createTreePresence({
    treeId: params.treeId,
    nodeId: () => selectedNodeId(),
  });

  function nodeLabel(nodeId: string | null) {
    const graph = data();
    if (!nodeId || !graph) return null;
    if (nodeId.startsWith("file:")) {
      const fileId = nodeId.slice("file:".length);
      return graph.files.find(file => file.id === fileId)?.name ?? null;
    }
    if (nodeId.startsWith("group:")) {
      const groupId = nodeId.slice("group:".length);
      return graph.groups.find(group => group.id === groupId)?.name ?? null;
    }
    return graph.people.find(person => person.id === nodeId)?.displayName ?? null;
  }

  onMount(() => {
    const storedLayout = localStorage.getItem("family-tree-layout");
    if (storedLayout === "freeform") setLayout("freeform");
    if (localStorage.getItem("family-tree-media") === "off") setShowMedia(false);
    if (localStorage.getItem("family-tree-generation-direction") === "oldest-bottom") {
      setGenerationDirection("oldest-bottom");
    }
    const storedFocus = parseFocusRadius(localStorage.getItem(focusStorageKey()));
    if (storedFocus) setFocusRadius(storedFocus);
    setFocusPromptDismissed(localStorage.getItem(focusPromptKey()) === "off");

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
      if (event.key === "+" || event.key === "=") handle()?.zoomBy(1.25);
      if (event.key === "-" || event.key === "_") handle()?.zoomBy(0.8);
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", listener);
    onCleanup(() => window.removeEventListener("keydown", listener));
  });

  function selectPerson(id: string | null) {
    setSearchParams(
      { person: id ?? undefined, file: undefined, album: undefined },
      { replace: true },
    );
  }

  function selectFile(id: string) {
    setSearchParams({ file: id, person: undefined, album: undefined }, { replace: true });
  }

  function selectGroup(id: string, fileId?: string | null) {
    setSearchParams(
      { album: id, file: fileId ?? undefined, person: undefined },
      { replace: true },
    );
  }

  function focusPerson(id: string) {
    revealPerson(id);
    selectPerson(id);
    setTimeout(() => handle()?.focus(id), 80);
  }

  function focusGroup(id: string, fileId?: string | null) {
    const group = data()?.groups.find(candidate => candidate.id === id);
    if (group) revealPerson(group.personId);
    selectGroup(id, fileId);
    setTimeout(() => handle()?.focus(groupNodeId(id)), 80);
  }

  function focusFile(id: string) {
    const file = data()?.files.find(candidate => candidate.id === id);
    if (file) revealPerson(file.personId);
    if (file?.groupId) {
      focusGroup(file.groupId, file.id);
      return;
    }
    selectFile(id);
    setTimeout(() => handle()?.focus(fileNodeId(id)), 80);
  }

  // A deep link or a search result can point at someone outside the focus.
  // Reveal the chain from the viewer to that person so they arrive in context.
  createEffect(() => {
    const id = selectedId();
    if (id && data()) revealPerson(id);
  });

  function handleGraphSelection(id: string | null) {
    if (id) {
      focusPerson(id);
    } else {
      selectPerson(null);
    }
  }

  function toggleMedia() {
    const next = !showMedia();
    setShowMedia(next);
    localStorage.setItem("family-tree-media", next ? "on" : "off");
  }

  function toggleLayout() {
    const next = layout() === "generations" ? "freeform" : "generations";
    setLayout(next);
    localStorage.setItem("family-tree-layout", next);
  }

  function flipGenerationDirection() {
    const next =
      generationDirection() === "oldest-top" ? "oldest-bottom" : "oldest-top";
    setGenerationDirection(next);
    localStorage.setItem("family-tree-generation-direction", next);
  }

  async function handleUpload(files: File[]) {
    const person = selectedPerson();
    if (!person) return;
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let groupId: string | null = null;
    if (files.length > 1) {
      const albumName = `Album · ${new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      }).format(new Date())}`;
      const groupResult = await attemptAction(() =>
        createFileGroup({
          treeId: params.treeId,
          personId: person.id,
          name: albumName,
        }),
      );
      if (!groupResult.ok) {
        toast.show(groupResult.error, "error");
        return;
      }
      groupId = groupResult.data.id;
    }
    setUploading(true);
    setUploadProgress(0);
    let uploaded = 0;
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const result = await uploadPersonFile({
          treeId: params.treeId,
          personId: person.id,
          groupId,
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
    } catch (error) {
      toast.show(friendlyMessage(error), "error");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
    if (!uploaded && groupId) {
      await attemptAction(() => deleteFileGroup(groupId));
    }
    await revalidate([getTreeGraph.key, getTreeOverview.key, getMyTrees.key]);
    if (uploaded) {
      track("media_uploaded", {
        count: uploaded,
        album: Boolean(groupId),
        size_bucket: sizeBucket(totalBytes),
      });
      toast.show(
        groupId
          ? `${uploaded} files added to an album.`
          : `${uploaded} file${uploaded === 1 ? "" : "s"} added.`,
        "success",
      );
    }
  }

  async function handleSetAvatar(personId: string, fileId: string | null) {
    const result = await attemptAction(() =>
      setAvatar({ treeId: params.treeId, personId, fileId }),
    );
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate(getTreeGraph.key);
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
    await revalidate(getTreeGraph.key);
    track("file_people_tagged", { count: result.data.length });
    toast.show("Photo tags updated.", "success");
  }

  async function handleSetTakenAt(fileId: string, value: FuzzyDate | null) {
    setTakenAtPending(true);
    const result = await attemptAction(() =>
      updateFileTakenAt({ treeId: params.treeId, fileId, takenAt: value }),
    );
    setTakenAtPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate(getTreeGraph.key);
    track("file_date_taken_set", { cleared: !value });
    toast.show(value ? "Date taken updated." : "Date taken cleared.", "success");
  }

  async function handleDeleteFile() {
    const file = deleteFileTarget();
    if (!file) return;
    setPendingDelete(true);
    const result = await attemptAction(() => deleteFile({ treeId: params.treeId, fileId: file.id }));
    setPendingDelete(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    if (selectedFileId() === file.id) {
      const group = effectiveGroup();
      if (group) {
        selectGroup(group.id);
      } else {
        selectPerson(null);
      }
    }
    setDeleteFileTarget(null);
    track("file_deleted", { album: Boolean(file.groupId) });
    await revalidate([getTreeGraph.key, getTreeOverview.key, getMyTrees.key]);
    toast.show("File deleted.", "success");
  }

  async function handleDeleteGroup() {
    const group = deleteGroupTarget();
    if (!group) return;
    setPendingDelete(true);
    const result = await attemptAction(() => deleteFileGroup(group.id));
    setPendingDelete(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setDeleteGroupTarget(null);
    selectPerson(null);
    track("album_deleted");
    await revalidate([getTreeGraph.key, getTreeOverview.key, getMyTrees.key]);
    toast.show("Album deleted.", "success");
  }

  async function handleRenameGroup(name: string) {
    const group = effectiveGroup();
    if (!group) return;
    const result = await attemptAction(() => renameFileGroup({ groupId: group.id, name }));
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate(getTreeGraph.key);
    track("album_renamed");
    toast.show("Album renamed.", "success");
  }

  async function handleDeletePerson() {
    const person = selectedPerson();
    if (!person) return;
    setPendingDelete(true);
    const result = await attemptAction(() =>
      deletePerson({ treeId: params.treeId, personId: person.id }),
    );
    setPendingDelete(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setDeletePersonOpen(false);
    selectPerson(null);
    track("person_deleted");
    await revalidate([getTreeGraph.key, getTreeOverview.key, getMyTrees.key]);
    toast.show("Person removed.", "success");
  }

  async function handleRemoveRelationship(relationship: GraphRelationship) {
    const result = await attemptAction(() =>
      relationship.type === "parent"
        ? deleteParentChild({ treeId: params.treeId, relationshipId: relationship.id })
        : deletePartnership({ treeId: params.treeId, relationshipId: relationship.id }),
    );
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate([getTreeGraph.key, getTreeOverview.key, getMyTrees.key]);
    track("relationship_removed", { relation: relationship.type });
    toast.show("Connection removed.", "success");
  }

  function openAddEvent() {
    setEventTarget(null);
    setEventDialogOpen(true);
  }

  function openEditEvent(event: GraphPersonEvent) {
    setEventTarget(event);
    setEventDialogOpen(true);
  }

  async function handleDeleteEvent() {
    const event = deleteEventTarget();
    if (!event) return;
    setPendingDeleteEvent(true);
    const result = await attemptAction(() =>
      deletePersonEvent({ treeId: params.treeId, eventId: event.id }),
    );
    setPendingDeleteEvent(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setDeleteEventTarget(null);
    await revalidate(getTreeGraph.key);
    toast.show("Event removed.", "success");
  }

  const lightboxFiles = createMemo(() => {
    if (effectiveGroup()) return groupFiles();
    const file = selectedFile();
    return file ? [file] : [];
  });
  const lightboxTitle = createMemo(
    () => effectiveGroup()?.name ?? selectedFile()?.name ?? "",
  );
  const showLightbox = () =>
    Boolean(effectiveGroup() || (selectedFile() && selectedFile()!.kind === "image"));
  const showFilePanel = () =>
    Boolean(selectedFile() && !effectiveGroup() && selectedFile()!.kind !== "image");

  return (
    <Show when={data()} fallback={<GraphLoading />}>
      {graph => (
        <div class="relative h-[100dvh] w-full overflow-hidden bg-graph-bg">
          <GraphView
            data={graph()}
            role={graph().role}
            selectedId={selectedNodeId()}
            showMedia={showMedia()}
            visible={focus().visible}
            fitPadding={canShowMore() || showFocusPrompt() ? 190 : 110}
            layout={layout()}
            generationDirection={generationDirection()}
            presence={presence.peers()}
            selfPeerId={presence.selfPeerId()}
            onSelect={handleGraphSelection}
            onFileSelect={focusFile}
            onGroupSelect={focusGroup}
            onReady={setHandle}
          />

          <Show when={conflicts().length}>
            <div class="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center px-3">
              <Alert
                variant="destructive"
                class="pointer-events-auto max-w-xl border-destructive/30 bg-card/95 shadow-xl backdrop-blur"
              >
                <TriangleAlert size={16} />
                <AlertTitle>Some relationships contradict each other</AlertTitle>
                <AlertDescription class="text-xs">
                  <p>
                    The graph may look wrong until {editable() ? "you fix" : "an editor fixes"} one
                    of these links.
                  </p>
                  <ul class="mt-1 space-y-1">
                    <For each={conflicts()}>
                      {conflict => (
                        <li>
                          <button
                            type="button"
                            class="text-left underline decoration-destructive/40 underline-offset-2 hover:text-foreground"
                            onClick={() => focusPerson(conflict.personIds[0])}
                          >
                            {conflictTitle(conflict)}
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </AlertDescription>
              </Alert>
            </div>
          </Show>

          <GraphToolbar
            treeId={params.treeId}
            treeName={graph().tree.name}
            role={graph().role}
            showMedia={showMedia()}
            layout={layout()}
            generationDirection={generationDirection()}
            focus={{
              personName: viewerPerson()?.displayName ?? null,
              radius: effectiveFocusRadius(),
              visibleCount: focus().visible.size,
              total: focus().total,
            }}
            onFocusRadius={chooseFocusRadius}
            onChangeFocusPerson={() => setFocusPersonOpen(true)}
            presence={{
              status: presence.status(),
              peers: presence.peers(),
              selfPeerId: presence.selfPeerId(),
            }}
            resolveNode={nodeLabel}
            onToggleMedia={toggleMedia}
            onToggleLayout={toggleLayout}
            onFlipDirection={flipGenerationDirection}
            onResetLayout={() => handle()?.reset()}
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
                isViewer={viewerPersonId() === person().id}
                onClaimPerson={() => saveViewerPerson(person().id)}
                onSelectPerson={focusPerson}
                onSelectFile={file => focusFile(file.id)}
                onSelectGroup={groupId => focusGroup(groupId)}
                onSetAvatar={fileId => handleSetAvatar(person().id, fileId)}
                onDeleteFile={file => setDeleteFileTarget(file)}
                onUpload={handleUpload}
                onRemoveRelationship={handleRemoveRelationship}
                onAddEvent={openAddEvent}
                onEditEvent={openEditEvent}
                onDeleteEvent={event => setDeleteEventTarget(event)}
              />
            )}
          </Show>

          <Show when={showLightbox()}>
            <MediaLightbox
              files={lightboxFiles()}
              initialFileId={selectedFileId()}
              title={lightboxTitle()}
              group={effectiveGroup()}
              person={activeMediaPerson()}
              people={graph().people}
              role={graph().role}
              tagPending={tagPending()}
              takenAtPending={takenAtPending()}
              onClose={() => selectPerson(null)}
              onSelectPerson={focusPerson}
              onSetAvatar={handleSetAvatar}
              onSaveTags={handleSaveTags}
              onSetTakenAt={handleSetTakenAt}
              onDeleteFile={file => setDeleteFileTarget(file)}
              onRenameGroup={handleRenameGroup}
              onDeleteGroup={() => {
                const group = effectiveGroup();
                if (group) setDeleteGroupTarget(group);
              }}
            />
          </Show>

          <Show when={showFilePanel() ? selectedFile() : null}>
            {file => (
              <FilePanel
                file={file()}
                person={activeMediaPerson()}
                people={graph().people}
                role={graph().role}
                tagPending={tagPending()}
                takenAtPending={takenAtPending()}
                onClose={() => selectPerson(null)}
                onPreview={() => undefined}
                onSelectPerson={focusPerson}
                onSetAvatar={fileId => handleSetAvatar(file().personId, fileId)}
                onSaveTags={personIds => handleSaveTags(file().id, personIds)}
                onSetTakenAt={value => handleSetTakenAt(file().id, value)}
                onDelete={() => setDeleteFileTarget(file())}
              />
            )}
          </Show>

          <div class="pointer-events-none absolute bottom-4 left-4 z-10 hidden items-center gap-3 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[0.65rem] text-white/45 backdrop-blur sm:flex">
            <span class="rounded-full bg-white/10 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-white/60">
              {layout() === "generations"
                ? generationDirection() === "oldest-top"
                  ? "Oldest at top"
                  : "Oldest at bottom"
                : "Freeform"}
            </span>
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

          <Show when={canShowMore()}>
            <div class="pointer-events-none absolute inset-x-0 bottom-20 z-20 flex justify-center px-4 sm:bottom-24">
              <div class="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 py-1.5 pl-3 pr-1.5 text-xs text-white/80 shadow-xl backdrop-blur-md">
                <Target size={14} class="text-gold" />
                <span class="pr-1">
                  {focus().nextRingCount} more{" "}
                  {focus().nextRingCount === 1 ? "relative" : "relatives"}
                </span>
                <button
                  type="button"
                  class="rounded-full bg-white/10 px-3 py-1 font-semibold text-white transition hover:bg-white/20"
                  onClick={showMore}
                >
                  Show more
                </button>
                <button
                  type="button"
                  class="rounded-full px-2.5 py-1 text-white/55 transition hover:text-white"
                  onClick={() => chooseFocusRadius("all")}
                >
                  Everyone
                </button>
              </div>
            </div>
          </Show>

          <Show when={showFocusPrompt()}>
            <div class="pointer-events-none absolute inset-x-0 bottom-20 z-20 flex justify-center px-4 sm:bottom-24">
              <div class="pointer-events-auto relative w-full max-w-md rounded-2xl border border-white/10 bg-black/60 p-4 pr-10 text-white/85 shadow-xl backdrop-blur-md">
                <button
                  type="button"
                  class="absolute right-2 top-2 grid size-7 place-items-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
                  aria-label="Dismiss"
                  onClick={dismissFocusPrompt}
                >
                  <X size={15} />
                </button>
                <p class="text-sm font-semibold">Who are you in this tree?</p>
                <p class="mt-1 text-xs leading-relaxed text-white/55">
                  Pick yourself and the tree will open around your part of the family.
                  Everyone can still see the whole tree with one click.
                </p>
                <Button
                  size="sm"
                  class="mt-3"
                  onClick={() => setFocusPersonOpen(true)}
                >
                  <Target size={14} />
                  Find yourself
                </Button>
              </div>
            </div>
          </Show>

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
            isOutsideFocus={personId => !focus().visible.has(personId)}
            onPerson={person => focusPerson(person.id)}
            onFile={file => focusFile(file.id)}
          />

          <FocusPersonDialog
            open={focusPersonOpen()}
            onClose={() => setFocusPersonOpen(false)}
            people={graph().people}
            viewerPersonId={graph().viewerPersonId}
            pending={claimingPerson()}
            onSave={saveViewerPerson}
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
            relationships={graph().relationships}
            anchorParentCount={selectedParentCount()}
            onAdded={focusPerson}
          />

          <Show when={selectedPerson()}>
            {person => (
              <PersonEventDialog
                open={eventDialogOpen()}
                onClose={() => setEventDialogOpen(false)}
                treeId={params.treeId}
                person={person()}
                event={eventTarget()}
              />
            )}
          </Show>

          <ConfirmDialog
            open={Boolean(deleteEventTarget())}
            onClose={() => setDeleteEventTarget(null)}
            title={`Delete ${deleteEventTarget()?.title ?? "this event"}?`}
            message="The life event will be removed from this person's timeline."
            confirmLabel="Delete event"
            danger
            pending={pendingDeleteEvent()}
            onConfirm={handleDeleteEvent}
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

          <ConfirmDialog
            open={Boolean(deleteGroupTarget())}
            onClose={() => setDeleteGroupTarget(null)}
            title={`Delete ${deleteGroupTarget()?.name ?? "this album"}?`}
            message="Every file in this album will be removed from storage. This cannot be undone."
            confirmLabel="Delete album"
            danger
            pending={pendingDelete()}
            onConfirm={handleDeleteGroup}
          />
        </div>
      )}
    </Show>
  );
}

function GraphLoading() {
  return (
    <div class="graph-shell relative">
      <div class="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 sm:p-4">
        <div class="flex items-center gap-2">
          <div class="h-10 w-24 animate-pulse rounded-full border border-white/10 bg-black/35 backdrop-blur" />
          <div class="h-10 w-52 animate-pulse rounded-full border border-white/10 bg-black/35 backdrop-blur" />
          <div class="ml-auto flex items-center gap-1.5">
            <div class="size-10 animate-pulse rounded-full border border-white/10 bg-black/35 backdrop-blur" />
            <div class="h-10 w-32 animate-pulse rounded-full border border-white/10 bg-black/35 backdrop-blur" />
            <div class="hidden size-10 animate-pulse rounded-full border border-white/10 bg-black/35 backdrop-blur sm:block" />
          </div>
        </div>
      </div>
      <div class="grid h-full place-items-center">
        <div class="flex items-center gap-3 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs text-white/60 backdrop-blur">
          <span class="size-2 animate-pulse rounded-full bg-gold" />
          Finding the branches…
        </div>
      </div>
    </div>
  );
}
