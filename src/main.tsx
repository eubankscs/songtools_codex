import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';
import type {
  HomeSnapshot,
  ProjectDetail,
  ProjectRow,
  RecentSongRow,
  SongRow,
} from './types';

type View =
  | { name: 'home' }
  | { name: 'allProjects' }
  | { name: 'project'; projectId: string }
  | { name: 'song'; songId: string }
  | { name: 'recentlyDeleted' };

type RunAction = (action: () => Promise<void>) => Promise<void>;
type SetView = (view: View) => void;

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

  const run = useCallback(
    async (action: () => Promise<void>) => {
      try {
        setError(null);
        await action();
        await refreshHome();
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : String(problem));
      }
    },
    [refreshHome],
  );

  if (!snapshot) {
    return <main className="app-shell" aria-label="Songtools application shell" />;
  }

  return (
    <main className="app-shell">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {view.name === 'home' && (
        <HomeScreen snapshot={snapshot} run={run} setView={setView} />
      )}

      {view.name === 'allProjects' && (
        <AllProjectsView run={run} setView={setView} />
      )}

      {view.name === 'project' && (
        <ProjectView projectId={view.projectId} run={run} setView={setView} />
      )}

      {view.name === 'song' && (
        <SongPlaceholder songId={view.songId} setView={setView} />
      )}

      {view.name === 'recentlyDeleted' && (
        <RecentlyDeletedShell setView={setView} />
      )}
    </main>
  );
}

function HomeScreen({
  snapshot,
  run,
  setView,
}: {
  snapshot: HomeSnapshot;
  run: RunAction;
  setView: SetView;
}) {
  async function createSong() {
    const title = window.prompt('Song title');
    if (!title) return;

    const song = await window.songtools.createSong(title, snapshot.unassigned.id);
    setView({ name: 'song', songId: song.id });
  }

  return (
    <section className="screen home-screen">
      <button className="text-action new-song" onClick={() => void run(createSong)}>
        + New Song
      </button>

      <SectionTitle>Recent Songs</SectionTitle>

      <div className="list" aria-label="Recent Songs">
        {snapshot.recentSongs.length === 0 && (
          <p className="empty">No recent songs yet.</p>
        )}

        {snapshot.recentSongs.map((song) => (
          <RecentSongItem key={song.id} song={song} setView={setView} />
        ))}
      </div>

      <SectionTitle>Projects</SectionTitle>

      <div className="list" aria-label="Projects">
        {snapshot.displayedProjects.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            run={run}
            setView={setView}
          />
        ))}

        {snapshot.showViewAllProjects && (
          <button
            className="view-all"
            onClick={() => setView({ name: 'allProjects' })}
          >
            View All Projects
          </button>
        )}

        <SystemProjectItem project={snapshot.unassigned} setView={setView} />
      </div>

      <button
        className="secondary-action"
        onClick={() =>
          void run(async () => {
            const name = window.prompt('Project name');
            if (name) {
              await window.songtools.createProject(name);
            }
          })
        }
      >
        + New Project
      </button>

      {snapshot.recentlyDeletedCount > 0 && (
        <button
          className="recently-deleted"
          onClick={() => setView({ name: 'recentlyDeleted' })}
        >
          Recently Deleted
        </button>
      )}
    </section>
  );
}

function RecentSongItem({
  song,
  setView,
}: {
  song: RecentSongRow;
  setView: SetView;
}) {
  return (
    <button
      className="row"
      onClick={async () => {
        await window.songtools.openSong(song.id);
        setView({ name: 'song', songId: song.id });
      }}
    >
      <span className="primary">{song.title}</span>
      <span className="secondary">{song.containerName}</span>
    </button>
  );
}

function ProjectItem({
  project,
  run,
  setView,
}: {
  project: ProjectRow;
  run: RunAction;
  setView: SetView;
}) {
  async function openProjectActions(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();

    const action = window.prompt('Project action: rename, move, or delete');

    if (action === 'rename') {
      const name = window.prompt('Rename project', project.name);
      if (name) {
        await window.songtools.renameProject(project.id, name);
      }
    }

    if (action === 'move') {
      await window.songtools.deleteProject(project.id, 'moveSongsToUnassigned');
    }

    if (action === 'delete') {
      await window.songtools.deleteProject(project.id, 'deleteSongs');
    }
  }

return (
  <button
    className="row project-row"
    onClick={() => setView({ name: 'project', projectId: project.id })}
    onContextMenu={(event: React.MouseEvent<HTMLButtonElement>) =>
      void run(() => openProjectActions(event))
    }
  >
    <span className="primary">{project.name}</span>
    <span className="secondary">
      {project.songCount} {project.songCount === 1 ? 'song' : 'songs'}
    </span>
  </button>
);
}

function SystemProjectItem({
  project,
  setView,
}: {
  project: ProjectRow;
  setView: SetView;
}) {
  return (
    <button
      className="row project-row system-project"
      onClick={() => setView({ name: 'project', projectId: project.id })}
    >
      <span className="primary">{project.name}</span>
      <span className="secondary">
        {project.songCount} {project.songCount === 1 ? 'song' : 'songs'}
      </span>
    </button>
  );
}

function AllProjectsView({
  run,
  setView,
}: {
  run: RunAction;
  setView: SetView;
}) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);

  const load = useCallback(async () => {
    setProjects(await window.songtools.listProjects());
  }, []);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  return (
    <section className="screen">
      <button className="back" onClick={() => setView({ name: 'home' })}>
        ← Home
      </button>

      <h1>All Projects</h1>

      <div className="list">
        {projects.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            run={async (action) => {
              await run(action);
              await load();
            }}
            setView={setView}
          />
        ))}
      </div>
    </section>
  );
}

function ProjectView({
  projectId,
  run,
  setView,
}: {
  projectId: string;
  run: RunAction;
  setView: SetView;
}) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);

  const load = useCallback(async () => {
    setDetail(await window.songtools.getProject(projectId));
  }, [projectId]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const isSystem = Boolean(detail?.project.isSystemProject);

  return (
    <section className="screen">
      <button className="back" onClick={() => setView({ name: 'home' })}>
        ← Home
      </button>

      <h1>{detail?.project.name ?? 'Project'}</h1>

      <button
        className="secondary-action"
        onClick={() =>
          void run(async () => {
            const title = window.prompt('Song title');

            if (title) {
              const song = await window.songtools.createSong(title, projectId);
              setView({ name: 'song', songId: song.id });
            }
          })
        }
      >
        + New Song
      </button>

      {!isSystem && (
        <p className="hint">
          Right-click actions are represented as Rename/Delete controls in this
          desktop shell.
        </p>
      )}

      <SongList songs={detail?.songs ?? []} setView={setView} />
    </section>
  );
}

function SongList({ songs, setView }: { songs: SongRow[]; setView: SetView }) {
  return (
    <div className="list">
      {songs.map((song) => (
        <button
          className="row title-only"
          key={song.id}
          onClick={async () => {
            await window.songtools.openSong(song.id);
            setView({ name: 'song', songId: song.id });
          }}
        >
          {song.title}
        </button>
      ))}
    </div>
  );
}

function SongPlaceholder({
  songId,
  setView,
}: {
  songId: string;
  setView: SetView;
}) {
  return (
    <section className="screen">
      <button className="back" onClick={() => setView({ name: 'home' })}>
        ← Home
      </button>

      <h1>Song Editor</h1>

      <p className="empty">Editor implementation starts in Phase 3.</p>
      <p className="empty">Opened song ID: {songId}</p>
    </section>
  );
}

function RecentlyDeletedShell({ setView }: { setView: SetView }) {
  return (
    <section className="modal-shell" role="dialog" aria-modal="true">
      <button className="close" onClick={() => setView({ name: 'home' })}>
        ×
      </button>

      <h1>Recently Deleted</h1>

      <p>Restore and permanent delete actions are scheduled for Phase 5.</p>
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="section-title">{children}</h2>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
