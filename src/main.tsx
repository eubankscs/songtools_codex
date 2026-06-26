import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';
import { parseBlocksJson, parseMarkersJson, stringifyBlocks, stringifyMarkers, toRenderableBlocks } from './editorModel';
import type { AnnotationRow, ChordPlacement, EditorBlock, EditorDocument, EditorMarker, EditorialSnapshot, HomeSnapshot, ProjectDetail, ProjectRow, RecentSongRow, SongRow } from './types';

type View = { name: 'home' } | { name: 'allProjects' } | { name: 'project'; projectId: string } | { name: 'song'; songId: string } | { name: 'recentlyDeleted' };

function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshHome = useCallback(async () => {
    setSnapshot(await window.songtools.getHomeSnapshot());
  }, []);

  useEffect(() => {
    refreshHome().catch((problem: Error) => setError(problem.message));
  }, [refreshHome]);

  const run = useCallback(async (action: () => Promise<void>) => {
    try {
      setError(null);
      await action();
      await refreshHome();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  }, [refreshHome]);

  if (!snapshot) return <main className="app-shell" aria-label="Songtools application shell" />;

  return (
    <main className="app-shell">
      {error && <p className="error" role="alert">{error}</p>}
      {view.name === 'home' && <HomeScreen snapshot={snapshot} run={run} setView={setView} />}
      {view.name === 'allProjects' && <AllProjectsView run={run} setView={setView} />}
      {view.name === 'project' && <ProjectView projectId={view.projectId} run={run} setView={setView} />}
      {view.name === 'song' && <SongPlaceholder songId={view.songId} setView={setView} />}
      {view.name === 'recentlyDeleted' && <RecentlyDeletedShell setView={setView} />}
    </main>
  );
}

function HomeScreen({ snapshot, run, setView }: { snapshot: HomeSnapshot; run: (action: () => Promise<void>) => Promise<void>; setView: (view: View) => void }) {
  async function createSong() {
    const title = window.prompt('Song title');
    if (title === null) return;
    const song = await window.songtools.createSong(title, snapshot.unassigned.id);
    setView({ name: 'song', songId: song.id });
  }

  return (
    <section className="screen home-screen">
      <button className="text-action new-song" onClick={() => void run(createSong)}>+ New Song</button>
      <SectionTitle>Recent Songs</SectionTitle>
      <div className="list" aria-label="Recent Songs">
        {snapshot.recentSongs.length === 0 && <p className="empty">No recent songs yet.</p>}
        {snapshot.recentSongs.map((song) => <RecentSongItem key={song.id} song={song} setView={setView} />)}
      </div>

      <SectionTitle>Projects</SectionTitle>
      <div className="list" aria-label="Projects">
        {snapshot.displayedProjects.map((project) => <ProjectItem key={project.id} project={project} run={run} setView={setView} />)}
        {snapshot.showViewAllProjects && <button className="view-all" onClick={() => setView({ name: 'allProjects' })}>View All Projects</button>}
        <SystemProjectItem project={snapshot.unassigned} setView={setView} />
      </div>

      <button className="secondary-action" onClick={() => void run(async () => { const name = window.prompt('Project name'); if (name) await window.songtools.createProject(name); })}>+ New Project</button>
      {snapshot.recentlyDeletedCount > 0 && <button className="recently-deleted" onClick={() => setView({ name: 'recentlyDeleted' })}>Recently Deleted</button>}
    </section>
  );
}

function RecentSongItem({ song, setView }: { song: RecentSongRow; setView: (view: View) => void }) {
  return (
    <button className="row" onClick={async () => { await window.songtools.openSong(song.id); setView({ name: 'song', songId: song.id }); }}>
      <span className="primary">{song.title}</span>
      <span className="secondary">{song.containerName}</span>
    </button>
  );
}

function ProjectItem({ project, run, setView }: { project: ProjectRow; run: (action: () => Promise<void>) => Promise<void>; setView: (view: View) => void }) {
  async function openProjectActions(event: React.MouseEvent) {
    event.preventDefault();
    const action = window.prompt('Project action: rename, move, or delete');
    if (action === 'rename') {
      const name = window.prompt('Rename project', project.name);
      if (name) await window.songtools.renameProject(project.id, name);
    }
    if (action === 'move') await window.songtools.deleteProject(project.id, 'moveSongsToUnassigned');
    if (action === 'delete') await window.songtools.deleteProject(project.id, 'deleteSongs');
  }

  return (
    <button className="row project-row" onClick={() => setView({ name: 'project', projectId: project.id })} onContextMenu={(event: React.MouseEvent) => void run(() => openProjectActions(event))}>
      <span className="primary">{project.name}</span>
      <span className="secondary">{project.songCount} {project.songCount === 1 ? 'song' : 'songs'}</span>
    </button>
  );
}

function SystemProjectItem({ project, setView }: { project: ProjectRow; setView: (view: View) => void }) {
  return (
    <button className="row project-row system-project" onClick={() => setView({ name: 'project', projectId: project.id })}>
      <span className="primary">{project.name}</span>
      <span className="secondary">{project.songCount} {project.songCount === 1 ? 'song' : 'songs'}</span>
    </button>
  );
}

function AllProjectsView({ run, setView }: { run: (action: () => Promise<void>) => Promise<void>; setView: (view: View) => void }) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const load = useCallback(async () => setProjects(await window.songtools.listProjects()), []);
  useEffect(() => { load().catch(console.error); }, [load]);
  return (
    <section className="screen">
      <button className="back" onClick={() => setView({ name: 'home' })}>← Home</button>
      <h1>All Projects</h1>
      <div className="list">{projects.map((project) => <ProjectItem key={project.id} project={project} run={async (action) => { await run(action); await load(); }} setView={setView} />)}</div>
    </section>
  );
}

function ProjectView({ projectId, run, setView }: { projectId: string; run: (action: () => Promise<void>) => Promise<void>; setView: (view: View) => void }) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const load = useCallback(async () => setDetail(await window.songtools.getProject(projectId)), [projectId]);
  useEffect(() => { load().catch(console.error); }, [load]);
  const isSystem = Boolean(detail?.project.isSystemProject);
  return (
    <section className="screen">
      <button className="back" onClick={() => setView({ name: 'home' })}>← Home</button>
      <h1>{detail?.project.name ?? 'Project'}</h1>
      <button className="secondary-action" onClick={() => void run(async () => { const title = window.prompt('Song title'); if (title !== null) { const song = await window.songtools.createSong(title, projectId); setView({ name: 'song', songId: song.id }); } })}>+ New Song</button>
      {!isSystem && <p className="hint">Right-click actions are represented as Rename/Delete controls in this desktop shell.</p>}
      <SongList songs={detail?.songs ?? []} setView={setView} />
    </section>
  );
}

function SongList({ songs, setView }: { songs: SongRow[]; setView: (view: View) => void }) {
  return <div className="list">{songs.map((song) => <button className="row title-only" key={song.id} onClick={async () => { await window.songtools.openSong(song.id); setView({ name: 'song', songId: song.id }); }}>{song.title}</button>)}</div>;
}

function SongPlaceholder({ songId, setView }: { songId: string; setView: (view: View) => void }) {
  const [document, setDocument] = useState<EditorDocument | null>(null);
  const [draftJson, setDraftJson] = useState('');
  const [markersJson, setMarkersJson] = useState('');
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editorial, setEditorial] = useState<EditorialSnapshot | null>(null);
  const [sidePanel, setSidePanel] = useState<'notes' | 'review' | 'tags' | null>(null);

  const load = useCallback(async () => {
    const loaded = await window.songtools.getEditorDocument(songId);
    setDocument(loaded);
    setDraftJson(stringifyBlocks(loaded.blocks));
    setMarkersJson(stringifyMarkers(loaded.markers));
    setEditorial(await window.songtools.getEditorialSnapshot(songId));
  }, [songId]);

  useEffect(() => { load().catch((problem: Error) => setMessage(problem.message)); }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const timeout = window.setTimeout(() => {
      void persistWorking('Auto-saved working changes.');
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [dirty, draftJson, markersJson]);

  useEffect(() => {
    if (!dirty) return;
    const flush = () => { void persistWorking('Saved working changes.'); };
    window.addEventListener('blur', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('blur', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [dirty, draftJson, markersJson]);

  async function persistWorking(successMessage = 'Saved and reloaded exact chord offsets.') {
    const blocks = parseBlocksJson(draftJson);
    const markers = parseMarkersJson(markersJson);
    const saved = await window.songtools.saveEditorDocument(songId, blocks, markers);
    setDocument(saved);
    setDraftJson(stringifyBlocks(saved.blocks));
    setMarkersJson(stringifyMarkers(saved.markers));
    setDirty(false);
    setMessage(successMessage);
  }

  async function navigateHome() {
    if (dirty) await persistWorking('Saved working changes before navigation.');
    setView({ name: 'home' });
  }

  async function refreshEditorial() {
    setEditorial(await window.songtools.getEditorialSnapshot(songId));
  }

  async function addNote() {
    const noteTypeInput = window.prompt('Note type: song, line, or section', 'song');
    if (noteTypeInput !== 'song' && noteTypeInput !== 'line' && noteTypeInput !== 'section') return;
    const targetId = noteTypeInput === 'song' ? null : window.prompt('Target content block id');
    if (noteTypeInput !== 'song' && !targetId) return;
    const body = window.prompt('Note body');
    if (!body) return;
    await window.songtools.upsertNote(songId, { noteType: noteTypeInput, targetId, body });
    await refreshEditorial();
  }

  async function addAnnotation() {
    const blockId = window.prompt('Lyric block id');
    if (!blockId) return;
    const start = Number(window.prompt('Start offset') ?? '0');
    const end = Number(window.prompt('End offset') ?? `${start}`);
    const body = window.prompt('Annotation text') ?? '';
    const tagId = window.prompt('Optional tag id') || null;
    await window.songtools.upsertAnnotation(songId, { targetRange: { blockId, start, end }, body, tagId });
    await refreshEditorial();
  }

  async function addTag() {
    const name = window.prompt('Tag name');
    if (!name) return;
    const color = window.prompt('Tag color, blank for none') || null;
    const createsReviewItem = window.confirm('Should this tag create a Placeholder lyric review item?');
    await window.songtools.upsertTag({ name, color, createsReviewItem });
    await refreshEditorial();
  }

  async function createReviewTrigger(type: string) {
    const messageText = window.prompt(`${type} review message`) ?? type;
    await window.songtools.createReviewItem(songId, null, type, messageText);
    await refreshEditorial();
  }

  async function manualSave() {
    if (dirty) await persistWorking('Saved working changes before manual save.');
    const saved = await window.songtools.manualSave(songId);
    setDocument(saved);
    setDraftJson(stringifyBlocks(saved.blocks));
    setMarkersJson(stringifyMarkers(saved.markers));
    setDirty(false);
    setMessage('Manual save committed working changes.');
  }

  return (
    <section className="editor-screen">
      <header className="editor-header">
        <button className="hamburger" aria-label="Editor menu">☰</button>
        <h1>{(dirty || document?.hasWorkingChanges) ? '• ' : ''}{document?.song.title ?? 'Song Editor'}</h1>
      </header>
      <button className="back" onClick={() => void navigateHome()}>← Home</button>
      {message && <p className="hint">{message}</p>}
      <EditorCanvas blocks={document?.blocks ?? []} markers={document?.markers ?? []} annotations={editorial?.annotations ?? []} />
      <div className="utility-icons">
        {(editorial?.notes.length ?? 0) > 0 && <button onClick={() => setSidePanel(sidePanel === 'notes' ? null : 'notes')}>Notes {editorial?.notes.length}</button>}
        {(editorial?.reviewQueue.length ?? 0) > 0 && <button onClick={() => setSidePanel(sidePanel === 'review' ? null : 'review')}>Review {editorial?.reviewQueue.length}</button>}
      </div>
      {sidePanel === 'notes' && editorial && <NotesPanel snapshot={editorial} onAdd={addNote} onClose={() => setSidePanel(null)} />}
      {sidePanel === 'review' && editorial && <ReviewPanel snapshot={editorial} onRefresh={refreshEditorial} onClose={() => setSidePanel(null)} />}
      <section className="editor-data-panel" aria-label="Editor block data">
        <h2>Phase 3a block data</h2>
        <p className="hint">Use JSON chordLine blocks like [{'{'}"type":"chordLine","content":[{'{'}"chord":"G","offset":0{'}'}],"position":0{'}'}]. Offsets are zero-based character positions in the lyric line below.</p>
        <textarea value={draftJson} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => { setDraftJson(event.currentTarget.value); setDirty(true); }} aria-label="Editor blocks JSON" autoFocus />
        <h2>Arrangement markers</h2>
        <p className="hint">Standalone markers use targetPosition like position:2. Inline markers use the same character-position system as chords: lyricBlockId:offset.</p>
        <textarea value={markersJson} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => { setMarkersJson(event.currentTarget.value); setDirty(true); }} aria-label="Arrangement markers JSON" />
        <div className="editor-actions">
          <button className="secondary-action" onClick={() => void addNote().catch((problem: Error) => setMessage(problem.message))}>Add Note</button>
          <button className="secondary-action" onClick={() => void addAnnotation().catch((problem: Error) => setMessage(problem.message))}>Add Annotation</button>
          <button className="secondary-action" onClick={() => setSidePanel(sidePanel === 'tags' ? null : 'tags')}>Manage Tags</button>
          <button className="secondary-action" onClick={() => void addTag().catch((problem: Error) => setMessage(problem.message))}>Quick Add Tag</button>
          {['Unknown chord', 'Section conflict', 'Broken section link', 'Ambiguous transpose', 'Manual user flag'].map((type) => <button className="secondary-action" key={type} onClick={() => void createReviewTrigger(type).catch((problem: Error) => setMessage(problem.message))}>{type}</button>)}
          <button className="secondary-action" onClick={() => void persistWorking().catch((problem: Error) => setMessage(problem.message))}>Save Working</button>
          <button className="secondary-action" onClick={() => void manualSave().catch((problem: Error) => setMessage(problem.message))}>Manual Save</button>
        </div>
      </section>
      {sidePanel === 'tags' && editorial && <TagsPanel snapshot={editorial} onRefresh={refreshEditorial} onClose={() => setSidePanel(null)} />}
    </section>
  );
}

function EditorCanvas({ blocks, markers, annotations }: { blocks: EditorBlock[]; markers: EditorMarker[]; annotations: AnnotationRow[] }) {
  const renderBlocks = toRenderableBlocks(blocks, markers);
  return (
    <section className="editor-canvas" aria-label="Editor canvas">
      {renderBlocks.length === 0 && <div className="blank-editor-line" contentEditable suppressContentEditableWarning aria-label="Blank song canvas" />}
      {renderBlocks.map((block) => block.kind === 'section'
        ? <div key={`${block.kind}-${block.position}`}><StandaloneMarkers markers={block.standaloneMarkers} /><div className={`section-tag ${block.isFirstSection ? 'first-section' : ''}`}>{block.text}</div></div>
        : <div key={`${block.kind}-${block.position}`}><StandaloneMarkers markers={block.standaloneMarkers} /><LyricWithChords text={block.text} blockId={block.id} chords={block.chords} markers={block.inlineMarkers} annotations={annotations.filter((annotation) => annotation.parsedRange.blockId === block.id)} /></div>)}
    </section>
  );
}


function StandaloneMarkers({ markers }: { markers: EditorMarker[] }) {
  if (markers.length === 0) return null;
  return <div className="standalone-marker-row">{markers.map((marker) => <span className="standalone-marker" key={marker.id ?? `${marker.targetPosition}-${marker.text}`}>{marker.text}</span>)}</div>;
}

function LyricWithChords({ text, blockId, chords, markers, annotations }: { text: string; blockId?: string; chords: ChordPlacement[]; markers: EditorMarker[]; annotations: AnnotationRow[] }) {
  const markerOffsets = markers.map((marker) => Number(marker.targetPosition.split(':').at(-1) ?? 0));
  const columnCount = Math.max(text.length + 1, ...chords.map((placement) => placement.offset + placement.chord.length + 1), ...markerOffsets.map((offset) => offset + 1), 1);
  return (
    <div className="lyric-group" style={{ '--columns': columnCount } as React.CSSProperties}>
      {chords.length > 0 && <div className="chord-row">{chords.map((placement, index) => <span className="chord-token" key={`${placement.chord}-${placement.offset}-${index}`} style={{ gridColumn: `${placement.offset + 1} / span ${Math.max(placement.chord.length, 1)}` }}>{placement.chord}</span>)}</div>}
      <div className="inline-marker-row">{markers.map((marker, index) => <span className="inline-marker" key={`${marker.targetPosition}-${marker.text}-${index}`} style={{ gridColumn: `${Number(marker.targetPosition.split(':').at(-1) ?? 0) + 1}` }}>{marker.text}</span>)}</div>
      <div className="lyric-line">{renderAnnotatedText(text, annotations)}</div>
    </div>
  );
}


function renderAnnotatedText(text: string, annotations: AnnotationRow[]) {
  if (!text) return '\u00a0';
  const sorted = [...annotations].sort((left, right) => left.parsedRange.start - right.parsedRange.start);
  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((annotation) => {
    const start = Math.max(cursor, annotation.parsedRange.start);
    const end = Math.min(text.length, annotation.parsedRange.end);
    if (start > cursor) pieces.push(text.slice(cursor, start));
    if (end > start) pieces.push(<span className="annotation" title={annotation.body} style={{ textDecorationColor: annotation.tagColor ?? 'currentColor' }} key={annotation.id}>{text.slice(start, end)}</span>);
    cursor = Math.max(cursor, end);
  });
  if (cursor < text.length) pieces.push(text.slice(cursor));
  return pieces;
}

function NotesPanel({ snapshot, onAdd, onClose }: { snapshot: EditorialSnapshot; onAdd: () => Promise<void>; onClose: () => void }) {
  return <aside className="side-panel"><button className="close" onClick={onClose}>×</button><h2>Song Notes</h2><button className="secondary-action" onClick={() => void onAdd()}>Add Note</button>{snapshot.notes.map((note) => <article key={note.id}><strong>{note.noteType}</strong><p>{note.body}</p></article>)}</aside>;
}

function ReviewPanel({ snapshot, onRefresh, onClose }: { snapshot: EditorialSnapshot; onRefresh: () => Promise<void>; onClose: () => void }) {
  return <aside className="side-panel"><button className="close" onClick={onClose}>×</button><h2>Review Queue</h2>{snapshot.reviewQueue.map((item) => <article key={item.id}><strong>{item.type}</strong><p>{item.message}</p><button onClick={async () => { await window.songtools.resolveReviewItem(item.id); await onRefresh(); }}>Resolve</button><button onClick={async () => { await window.songtools.ignoreReviewItem(item.id); await onRefresh(); }}>Ignore</button></article>)}</aside>;
}

function TagsPanel({ snapshot, onRefresh, onClose }: { snapshot: EditorialSnapshot; onRefresh: () => Promise<void>; onClose: () => void }) {
  return <aside className="side-panel"><button className="close" onClick={onClose}>×</button><h2>Manage Tags</h2>{snapshot.tags.map((tag) => <article key={tag.id}><strong>{tag.name}</strong><p>{tag.color ?? 'No color'} · creates review: {tag.createsReviewItem ? 'yes' : 'no'}</p><button onClick={async () => { await window.songtools.deleteTag(tag.id); await onRefresh(); }}>Delete</button></article>)}</aside>;
}

function RecentlyDeletedShell({ setView }: { setView: (view: View) => void }) {
  return <section className="modal-shell" role="dialog" aria-modal="true"><button className="close" onClick={() => setView({ name: 'home' })}>×</button><h1>Recently Deleted</h1><p>Restore and permanent delete actions are scheduled for Phase 5.</p></section>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="section-title">{children}</h2>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
