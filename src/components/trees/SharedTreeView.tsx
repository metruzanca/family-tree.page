import { Show, createEffect, createMemo, createSignal } from "solid-js";
import type { GraphFile, GraphPerson, TreeGraph } from "~/api/people-server";
import { GraphView, type GraphHandle } from "~/components/graph/GraphView";
import { GraphToolbar } from "~/components/graph/GraphToolbar";
import { GraphSearch } from "~/components/graph/GraphSearch";
import { PersonPanel } from "~/components/people/PersonPanel";
import { FilePanel } from "~/components/files/FilePanel";
import { MediaLightbox } from "~/components/files/MediaLightbox";
import { fileNodeId, groupNodeId } from "~/lib/graph";

type SharedTreeViewProps = {
  graph: TreeGraph;
  backHref: string;
  backLabel: string;
  badgeLabel: string;
  /** Overrides thumbnail URLs, used by demo and share routes. */
  thumbUrlFor?: (fileId: string) => string;
  /** Overrides image and download URLs, used by demo and share routes. */
  fileUrlFor?: (file: GraphFile, inline: boolean) => string;
  /** When false, media is limited to thumbnails with no download links. */
  allowDownload?: boolean;
};

/**
 * The read-only tree workspace used by the public demo and by share links. It
 * reuses the member graph, toolbar, search, and panels, with every mutation
 * affordance removed.
 */
export function SharedTreeView(props: SharedTreeViewProps) {
  const [handle, setHandle] = createSignal<GraphHandle>();
  const [selectedPersonId, setSelectedPersonId] = createSignal<string | null>(null);
  const [selectedFileId, setSelectedFileId] = createSignal<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = createSignal<string | null>(null);
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [showMedia, setShowMedia] = createSignal(true);
  const [ageOrder, setAgeOrder] = createSignal(true);

  const selectedPerson = createMemo(
    () => props.graph.people.find(person => person.id === selectedPersonId()) ?? null,
  );
  const selectedFile = createMemo(
    () => props.graph.files.find(file => file.id === selectedFileId()) ?? null,
  );
  const effectiveGroup = createMemo(() => {
    const groupId = selectedGroupId() ?? selectedFile()?.groupId;
    if (!groupId) return null;
    return props.graph.groups.find(group => group.id === groupId) ?? null;
  });
  const groupFiles = createMemo(() =>
    effectiveGroup()
      ? props.graph.files.filter(file => file.groupId === effectiveGroup()!.id)
      : [],
  );
  const activeMediaPerson = createMemo<GraphPerson | undefined>(() => {
    const personId = effectiveGroup()?.personId ?? selectedFile()?.personId ?? null;
    return props.graph.people.find(person => person.id === personId);
  });
  const selectedNodeId = createMemo(() => {
    if (selectedPerson()) return selectedPerson()!.id;
    if (selectedGroupId()) return groupNodeId(selectedGroupId()!);
    if (selectedFile()) return fileNodeId(selectedFile()!.id);
    return null;
  });
  const [lastHighlightedId, setLastHighlightedId] = createSignal<string | null>(null);
  createEffect(() => {
    const id = selectedNodeId();
    if (id) setLastHighlightedId(id);
  });
  const highlightedNodeId = () => selectedNodeId() ?? lastHighlightedId();
  function closePanels() {
    setSelectedPersonId(null);
    setSelectedFileId(null);
    setSelectedGroupId(null);
  }

  function focusPerson(id: string | null) {
    if (!id) {
      closePanels();
      return;
    }
    setSelectedPersonId(id);
    setSelectedFileId(null);
    setSelectedGroupId(null);
    setTimeout(() => handle()?.focus(id), 80);
  }

  function handleGraphSelection(id: string | null) {
    if (id) {
      focusPerson(id);
      return;
    }
    // Clicking the canvas should not dismiss the person panel; it stays open
    // until the close button is used.
    if (selectedPerson()) return;
    closePanels();
  }

  function focusFile(id: string) {
    const file = props.graph.files.find(candidate => candidate.id === id);
    if (!file) return;
    setSelectedPersonId(null);
    setSelectedFileId(id);
    setSelectedGroupId(file.groupId ?? null);
    const nodeId = file.groupId ? groupNodeId(file.groupId) : fileNodeId(id);
    setTimeout(() => handle()?.focus(nodeId), 80);
  }

  function focusGroup(id: string, fileId?: string | null) {
    setSelectedPersonId(null);
    setSelectedGroupId(id);
    setSelectedFileId(fileId ?? null);
    setTimeout(() => handle()?.focus(groupNodeId(id)), 80);
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

  const noop = () => undefined;

  return (
    <div
      class="relative h-[100dvh] w-full overflow-hidden bg-graph-bg"
      data-testid="shared-tree-view"
    >
      <GraphView
        data={props.graph}
        role="viewer"
        selectedId={selectedNodeId()}
        highlightId={highlightedNodeId()}
        showMedia={showMedia()}
        ageOrder={ageOrder()}
        thumbUrlFor={props.thumbUrlFor}
        onSelect={handleGraphSelection}
        onFileSelect={focusFile}
        onGroupSelect={focusGroup}
        onReady={setHandle}
      />

      <GraphToolbar
        treeId={props.graph.tree.id}
        treeName={props.graph.tree.name}
        role="viewer"
        showMedia={showMedia()}
        ageOrder={ageOrder()}
        focus={{
          personName: null,
          radius: "all",
          visibleCount: props.graph.people.length,
          total: props.graph.people.length,
        }}
        onFocusRadius={noop}
        onChangeFocusPerson={noop}
        resolveNode={() => null}
        showFocus={false}
        showTreeLinks={false}
        backHref={props.backHref}
        backLabel={props.backLabel}
        badgeLabel={props.badgeLabel}
        onToggleMedia={() => setShowMedia(value => !value)}
        onToggleAgeOrder={() => setAgeOrder(value => !value)}
        onSearch={() => setSearchOpen(true)}
        onFit={() => handle()?.fit()}
        onZoomIn={() => handle()?.zoomBy(1.25)}
        onZoomOut={() => handle()?.zoomBy(0.8)}
      />

      <Show when={selectedPerson()}>
        {person => (
          <PersonPanel
            person={person()}
            data={props.graph}
            role="viewer"
            readOnly
            thumbUrlFor={props.thumbUrlFor}
            uploading={false}
            uploadProgress={0}
            onClose={closePanels}
            onEdit={noop}
            onDelete={noop}
            onAddRelative={noop}
            isViewer={false}
            onSelectPerson={focusPerson}
            onSelectFile={file => focusFile(file.id)}
            onSelectGroup={groupId => focusGroup(groupId)}
            onSetAvatar={noop}
            onDeleteFile={noop}
            onUpload={noop}
            onRemoveRelationship={noop}
            onAddEvent={noop}
            onEditEvent={noop}
            onDeleteEvent={noop}
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
          people={props.graph.people}
          role="viewer"
          allowDownload={props.allowDownload ?? false}
          fileUrlFor={props.fileUrlFor}
          thumbUrlFor={props.thumbUrlFor}
          onClose={closePanels}
          onSelectPerson={focusPerson}
          onSetAvatar={noop}
          onSaveTags={noop}
          onSetTakenAt={noop}
          onDeleteFile={noop}
        />
      </Show>

      <Show when={showFilePanel() ? selectedFile() : null}>
        {file => (
          <FilePanel
            file={file()}
            person={activeMediaPerson()}
            people={props.graph.people}
            role="viewer"
            allowDownload={props.allowDownload ?? false}
            thumbUrlFor={props.thumbUrlFor}
            onClose={closePanels}
            onPreview={() => undefined}
            onSelectPerson={focusPerson}
            onSetAvatar={noop}
            onSaveTags={noop}
            onSetTakenAt={noop}
            onDelete={noop}
          />
        )}
      </Show>

      <GraphSearch
        open={searchOpen()}
        onClose={() => setSearchOpen(false)}
        data={props.graph}
        isOutsideFocus={() => false}
        onPerson={person => focusPerson(person.id)}
        onFile={file => focusFile(file.id)}
      />
    </div>
  );
}
