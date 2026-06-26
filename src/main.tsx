import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';
import { parseBlocksJson, parseMarkersJson, stringifyBlocks, stringifyMarkers, toRenderableBlocks } from './editorModel';
import type { ChordPlacement, EditorBlock, EditorDocument, EditorMarker, HomeSnapshot, ProjectDetail, ProjectRow, RecentSongRow, SongRow } from './types';

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

  const load = useCallback(async () => {
    const loaded = await window.songtools.getEditorDocument(songId);
    setDocument(loaded);
    setDraftJson(stringifyBlocks(loaded.blocks));
    setMarkersJson(stringifyMarkers(loaded.markers));
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
      <EditorCanvas blocks={document?.blocks ?? []} markers={document?.markers ?? []} />
      <section className="editor-data-panel" aria-label="Editor block data">
        <h2>Phase 3a block data</h2>
        <p className="hint">Use JSON chordLine blocks like [{'{'}"type":"chordLine","content":[{'{'}"chord":"G","offset":0{'}'}],"position":0{'}'}]. Offsets are zero-based character positions in the lyric line below.</p>
        <textarea value={draftJson} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => { setDraftJson(event.currentTarget.value); setDirty(true); }} aria-label="Editor blocks JSON" autoFocus />
        <h2>Arrangement markers</h2>
        <p className="hint">Standalone markers use targetPosition like position:2. Inline markers use the same character-position system as chords: lyricBlockId:offset.</p>
        <textarea value={markersJson} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => { setMarkersJson(event.currentTarget.value); setDirty(true); }} aria-label="Arrangement markers JSON" />
        <div className="editor-actions">
          <button className="secondary-action" onClick={() => void persistWorking().catch((problem: Error) => setMessage(problem.message))}>Save Working</button>
          <button className="secondary-action" onClick={() => void manualSave().catch((problem: Error) => setMessage(problem.message))}>Manual Save</button>
        </div>
      </section>
    </section>
  );
}

function EditorCanvas({ blocks, markers }: { blocks: EditorBlock[]; markers: EditorMarker[] }) {
  const renderBlocks = toRenderableBlocks(blocks, markers);
  return (
    <section className="editor-canvas" aria-label="Editor canvas">
      {renderBlocks.length === 0 && <div className="blank-editor-line" contentEditable suppressContentEditableWarning aria-label="Blank song canvas" />}
      {renderBlocks.map((block) => block.kind === 'section'
        ? <div key={`${block.kind}-${block.position}`}><StandaloneMarkers markers={block.standaloneMarkers} /><div className={`section-tag ${block.isFirstSection ? 'first-section' : ''}`}>{block.text}</div></div>
        : <div key={`${block.kind}-${block.position}`}><StandaloneMarkers markers={block.standaloneMarkers} /><LyricWithChords text={block.text} chords={block.chords} markers={block.inlineMarkers} /></div>)}
    </section>
  );
}


function StandaloneMarkers({ markers }: { markers: EditorMarker[] }) {
  if (markers.length === 0) return null;
  return <div className="standalone-marker-row">{markers.map((marker) => <span className="standalone-marker" key={marker.id ?? `${marker.targetPosition}-${marker.text}`}>{marker.text}</span>)}</div>;
}

function LyricWithChords({ text, chords, markers }: { text: string; chords: ChordPlacement[]; markers: EditorMarker[] }) {
  const markerOffsets = markers.map((marker) => Number(marker.targetPosition.split(':').at(-1) ?? 0));
  const columnCount = Math.max(text.length + 1, ...chords.map((placement) => placement.offset + placement.chord.length + 1), ...markerOffsets.map((offset) => offset + 1), 1);
  return (
    <div className="lyric-group" style={{ '--columns': columnCount } as React.CSSProperties}>
      {chords.length > 0 && <div className="chord-row">{chords.map((placement, index) => <span className="chord-token" key={`${placement.chord}-${placement.offset}-${index}`} style={{ gridColumn: `${placement.offset + 1} / span ${Math.max(placement.chord.length, 1)}` }}>{placement.chord}</span>)}</div>}
      <div className="inline-marker-row">{markers.map((marker, index) => <span className="inline-marker" key={`${marker.targetPosition}-${marker.text}-${index}`} style={{ gridColumn: `${Number(marker.targetPosition.split(':').at(-1) ?? 0) + 1}` }}>{marker.text}</span>)}</div>
      <div className="lyric-line">{text || '\u00a0'}</div>
    </div>
  );
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
