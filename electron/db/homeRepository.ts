import type Database from 'better-sqlite3';
import type { Project, Song } from './models.js';

export const UNASSIGNED_PROJECT_ID = 'system-unassigned-songs';
export const UNASSIGNED_PROJECT_NAME = 'Unassigned Songs';

type ProjectRow = Project & { songCount: number };
type RecentSongRow = Song & { containerName: string };

export interface HomeSnapshot {
  recentSongs: RecentSongRow[];
  displayedProjects: ProjectRow[];
  allUserProjects: ProjectRow[];
  unassigned: ProjectRow;
  showViewAllProjects: boolean;
  recentlyDeletedCount: number;
}

export interface ProjectDetail {
  project: ProjectRow;
  songs: Song[];
}

export class DuplicateNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateNameError';
  }
}

export class SystemProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SystemProjectError';
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(): string {
  return globalThis.crypto.randomUUID();
}

export class HomeRepository {
  constructor(private readonly database: Database.Database) {}

  ensureSystemContainers(): void {
    this.database.prepare(
      `INSERT OR IGNORE INTO projects (id, name, createdOn, lastUsedOn, isSystemProject)
       VALUES (?, ?, ?, ?, 1)`
    ).run(UNASSIGNED_PROJECT_ID, UNASSIGNED_PROJECT_NAME, nowIso(), nowIso());
  }

  getHomeSnapshot(): HomeSnapshot {
    this.ensureSystemContainers();
    const userProjects = this.listUserProjects();
    const showViewAllProjects = userProjects.length >= 6;
    return {
      recentSongs: this.database.prepare(
        `SELECT songs.*, projects.name AS containerName
         FROM songs
         JOIN projects ON projects.id = songs.projectId
         WHERE songs.deletedOn IS NULL AND songs.lastOpenedOn IS NOT NULL
         ORDER BY songs.lastOpenedOn DESC
         LIMIT 5`
      ).all() as RecentSongRow[],
      displayedProjects: showViewAllProjects ? userProjects.slice(0, 4) : userProjects,
      allUserProjects: userProjects,
      unassigned: this.getProjectRow(UNASSIGNED_PROJECT_ID),
      showViewAllProjects,
      recentlyDeletedCount: Number((this.database.prepare('SELECT COUNT(*) AS count FROM songs WHERE deletedOn IS NOT NULL').get() as { count: number }).count)
    };
  }

  listUserProjects(): ProjectRow[] {
    return this.database.prepare(
      `SELECT projects.*, COUNT(songs.id) AS songCount
       FROM projects
       LEFT JOIN songs ON songs.projectId = projects.id AND songs.deletedOn IS NULL
       WHERE projects.isSystemProject = 0
       GROUP BY projects.id
       ORDER BY projects.lastUsedOn DESC, projects.createdOn DESC, projects.name ASC`
    ).all() as ProjectRow[];
  }

  getProjectDetail(projectId: string): ProjectDetail {
    this.touchProject(projectId);
    return {
      project: this.getProjectRow(projectId),
      songs: this.database.prepare(
        `SELECT * FROM songs
         WHERE projectId = ? AND deletedOn IS NULL
         ORDER BY title COLLATE NOCASE ASC`
      ).all(projectId) as Song[]
    };
  }

  createProject(name: string): ProjectRow {
    const trimmed = this.normalizeRequiredName(name, 'Project name');
    if (this.projectNameExists(trimmed)) throw new DuplicateNameError(`A project named "${trimmed}" already exists.`);
    const id = randomId();
    const timestamp = nowIso();
    this.database.prepare(
      `INSERT INTO projects (id, name, createdOn, lastUsedOn, isSystemProject)
       VALUES (?, ?, ?, ?, 0)`
    ).run(id, trimmed, timestamp, timestamp);
    return this.getProjectRow(id);
  }

  renameProject(projectId: string, name: string): ProjectRow {
    const project = this.getProjectRow(projectId);
    if (project.isSystemProject) throw new SystemProjectError('System containers cannot be renamed.');
    const trimmed = this.normalizeRequiredName(name, 'Project name');
    if (this.projectNameExists(trimmed, projectId)) throw new DuplicateNameError(`A project named "${trimmed}" already exists.`);
    this.database.prepare('UPDATE projects SET name = ?, lastUsedOn = ? WHERE id = ?').run(trimmed, nowIso(), projectId);
    return this.getProjectRow(projectId);
  }

  deleteProject(projectId: string, mode: 'moveSongsToUnassigned' | 'deleteSongs'): void {
    const project = this.getProjectRow(projectId);
    if (project.isSystemProject) throw new SystemProjectError('System containers cannot be deleted.');
    const timestamp = nowIso();
    const apply = this.database.transaction(() => {
      if (mode === 'moveSongsToUnassigned') {
        this.database.prepare('UPDATE songs SET projectId = ?, updatedOn = ? WHERE projectId = ? AND deletedOn IS NULL')
          .run(UNASSIGNED_PROJECT_ID, timestamp, projectId);
      } else {
        this.database.prepare('UPDATE songs SET deletedOn = ?, originalProjectId = COALESCE(originalProjectId, projectId), updatedOn = ? WHERE projectId = ? AND deletedOn IS NULL')
          .run(timestamp, timestamp, projectId);
      }
      this.database.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    });
    apply();
  }

  createSong(title: string | null | undefined, projectId = UNASSIGNED_PROJECT_ID): Song {
    this.ensureSystemContainers();
    const trimmed = title?.trim() ? title.trim() : this.nextUntitledSongTitle(projectId);
    if (this.songTitleExists(projectId, trimmed)) throw new DuplicateNameError(`A song named "${trimmed}" already exists in this container.`);
    const id = randomId();
    const timestamp = nowIso();
    this.database.prepare(
      `INSERT INTO songs (id, title, projectId, createdOn, updatedOn, lastOpenedOn, deletedOn, originalProjectId)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`
    ).run(id, trimmed, projectId, timestamp, timestamp, timestamp);
    this.touchProject(projectId);
    return this.getSong(id);
  }

  renameSong(songId: string, title: string): Song {
    const song = this.getSong(songId);
    const trimmed = this.normalizeRequiredName(title, 'Song title');
    if (this.songTitleExists(song.projectId, trimmed, songId)) throw new DuplicateNameError(`A song named "${trimmed}" already exists in this container.`);
    this.database.prepare('UPDATE songs SET title = ?, updatedOn = ? WHERE id = ?').run(trimmed, nowIso(), songId);
    return this.getSong(songId);
  }

  openSong(songId: string): Song {
    const timestamp = nowIso();
    this.database.prepare('UPDATE songs SET lastOpenedOn = ? WHERE id = ? AND deletedOn IS NULL').run(timestamp, songId);
    const song = this.getSong(songId);
    this.touchProject(song.projectId);
    return song;
  }


  private nextUntitledSongTitle(projectId: string): string {
    const rows = this.database.prepare(
      "SELECT title FROM songs WHERE projectId = ? AND deletedOn IS NULL AND (title = 'Untitled Song' OR title GLOB 'Untitled Song [0-9]*')"
    ).all(projectId) as { title: string }[];
    const used = new Set<number>();
    for (const row of rows) {
      if (row.title === 'Untitled Song') used.add(1);
      const match = /^Untitled Song (\d+)$/.exec(row.title);
      if (match) used.add(Number(match[1]));
    }
    let slot = 1;
    while (used.has(slot)) slot += 1;
    return slot === 1 ? 'Untitled Song' : `Untitled Song ${slot}`;
  }

  private getProjectRow(projectId: string): ProjectRow {
    const row = this.database.prepare(
      `SELECT projects.*, COUNT(songs.id) AS songCount
       FROM projects
       LEFT JOIN songs ON songs.projectId = projects.id AND songs.deletedOn IS NULL
       WHERE projects.id = ?
       GROUP BY projects.id`
    ).get(projectId) as ProjectRow | undefined;
    if (!row) throw new Error(`Project not found: ${projectId}`);
    return row;
  }

  private getSong(songId: string): Song {
    const row = this.database.prepare('SELECT * FROM songs WHERE id = ?').get(songId) as Song | undefined;
    if (!row) throw new Error(`Song not found: ${songId}`);
    return row;
  }

  private touchProject(projectId: string): void {
    this.database.prepare('UPDATE projects SET lastUsedOn = ? WHERE id = ?').run(nowIso(), projectId);
  }

  private projectNameExists(name: string, excludingProjectId?: string): boolean {
    const row = this.database.prepare('SELECT id FROM projects WHERE name = ? AND id != ?').get(name, excludingProjectId ?? '') as { id: string } | undefined;
    return Boolean(row);
  }

  private songTitleExists(projectId: string, title: string, excludingSongId?: string): boolean {
    const row = this.database.prepare(
      'SELECT id FROM songs WHERE projectId = ? AND title = ? AND deletedOn IS NULL AND id != ?'
    ).get(projectId, title, excludingSongId ?? '') as { id: string } | undefined;
    return Boolean(row);
  }

  private normalizeRequiredName(value: string, label: string): string {
    const trimmed = value.trim();
    if (!trimmed) throw new Error(`${label} is required.`);
    return trimmed;
  }
}
