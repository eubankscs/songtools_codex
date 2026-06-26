import type Database from 'better-sqlite3';
import type { Project, Song } from './models.js';
import { DuplicateNameError, UNASSIGNED_PROJECT_ID } from './homeRepository.js';

export interface DeletedSongRow extends Song { containerName: string | null }
export interface SearchSongRow extends Song { containerName: string }

function randomId(): string { return globalThis.crypto.randomUUID(); }
function nowIso(): string { return new Date().toISOString(); }

export class Phase5Repository {
  constructor(private readonly database: Database.Database) {}

  searchActiveSongs(query = ''): SearchSongRow[] {
    return this.database.prepare(
      `SELECT songs.*, projects.name AS containerName
       FROM songs JOIN projects ON projects.id = songs.projectId
       WHERE songs.deletedOn IS NULL AND songs.title LIKE ?
       ORDER BY projects.isSystemProject ASC, projects.lastUsedOn DESC, projects.name ASC, songs.title COLLATE NOCASE ASC`
    ).all(`%${query}%`) as SearchSongRow[];
  }

  moveSong(songId: string, destinationProjectId: string, renameTo?: string): Song {
    const song = this.getSong(songId, false);
    const title = renameTo?.trim() || song.title;
    if (this.songTitleExists(destinationProjectId, title, songId)) throw new DuplicateNameError(`A song named "${title}" already exists in the destination container.`);
    const apply = this.database.transaction(() => {
      this.promoteWorkingToSaved(songId);
      this.database.prepare('UPDATE songs SET title = ?, projectId = ?, updatedOn = ? WHERE id = ?').run(title, destinationProjectId, nowIso(), songId);
    });
    apply();
    return this.getSong(songId, false);
  }

  deleteSong(songId: string): void {
    const timestamp = nowIso();
    this.database.prepare('UPDATE songs SET deletedOn = ?, originalProjectId = COALESCE(originalProjectId, projectId), updatedOn = ? WHERE id = ? AND deletedOn IS NULL')
      .run(timestamp, timestamp, songId);
  }

  listRecentlyDeleted(): DeletedSongRow[] {
    return this.database.prepare(
      `SELECT songs.*, projects.name AS containerName
       FROM songs LEFT JOIN projects ON projects.id = songs.originalProjectId
       WHERE songs.deletedOn IS NOT NULL
       ORDER BY songs.deletedOn DESC`
    ).all() as DeletedSongRow[];
  }

  restoreSong(songId: string, options: { title?: string; mode?: 'permanent' | 'variant' } = {}): Song {
    const song = this.getSong(songId, true);
    const destinationProjectId = this.projectExists(song.originalProjectId) ? song.originalProjectId! : UNASSIGNED_PROJECT_ID;
    const title = options.title?.trim() || song.title;
    if (this.songTitleExists(destinationProjectId, title, songId)) throw new DuplicateNameError(`A song named "${title}" already exists in the restore destination.`);
    if (options.mode === 'variant') return this.restoreWorkingAsVariant(song, destinationProjectId, title);
    const apply = this.database.transaction(() => {
      this.promoteWorkingToSaved(songId);
      this.database.prepare('UPDATE songs SET title = ?, projectId = ?, deletedOn = NULL, updatedOn = ? WHERE id = ?').run(title, destinationProjectId, nowIso(), songId);
    });
    apply();
    return this.getSong(songId, false);
  }

  createVariant(songId: string, title: string, projectId?: string): Song {
    const source = this.getSong(songId, false);
    const destinationProjectId = projectId ?? source.projectId;
    const variantTitle = title.trim();
    if (this.songTitleExists(destinationProjectId, variantTitle)) throw new DuplicateNameError(`A song named "${variantTitle}" already exists in the destination container.`);
    this.promoteWorkingToSaved(songId);
    return this.copySongVersionToNewSong(source.id, destinationProjectId, variantTitle, 'saved');
  }

  saveWorkingCopyAsVariant(songId: string, title: string, projectId?: string): Song {
    const source = this.getSong(songId, false);
    const destinationProjectId = projectId ?? source.projectId;
    const variantTitle = title.trim();
    if (this.songTitleExists(destinationProjectId, variantTitle)) throw new DuplicateNameError(`A song named "${variantTitle}" already exists in the destination container.`);
    const variant = this.copySongVersionToNewSong(source.id, destinationProjectId, variantTitle, 'working');
    const working = this.database.prepare("SELECT id FROM song_versions WHERE songId = ? AND type = 'working'").get(songId) as { id: string } | undefined;
    if (working) this.deleteVersion(working.id);
    return variant;
  }

  permanentlyDeleteSong(songId: string): void {
    const versions = this.database.prepare('SELECT id FROM song_versions WHERE songId = ?').all(songId) as { id: string }[];
    for (const version of versions) this.deleteVersion(version.id);
    this.database.prepare('DELETE FROM notes WHERE songId = ?').run(songId);
    this.database.prepare('DELETE FROM annotations WHERE songId = ?').run(songId);
    this.database.prepare('DELETE FROM review_queue WHERE songId = ?').run(songId);
    this.database.prepare('DELETE FROM songs WHERE id = ?').run(songId);
  }

  private restoreWorkingAsVariant(song: Song, destinationProjectId: string, title: string): Song {
    if (this.songTitleExists(destinationProjectId, title)) throw new DuplicateNameError(`A song named "${title}" already exists in the restore destination.`);
    const variant = this.copySongVersionToNewSong(song.id, destinationProjectId, title, 'working');
    this.database.prepare('UPDATE songs SET deletedOn = NULL, projectId = ?, updatedOn = ? WHERE id = ?').run(destinationProjectId, nowIso(), song.id);
    return variant;
  }

  private promoteWorkingToSaved(songId: string): void {
    const working = this.database.prepare("SELECT id FROM song_versions WHERE songId = ? AND type = 'working'").get(songId) as { id: string } | undefined;
    if (!working) return;
    let saved = this.database.prepare("SELECT id FROM song_versions WHERE songId = ? AND type = 'saved'").get(songId) as { id: string } | undefined;
    if (!saved) {
      saved = { id: randomId() };
      this.database.prepare("INSERT INTO song_versions (id, songId, type, capo, concertKey) VALUES (?, ?, 'saved', NULL, NULL)").run(saved.id, songId);
    }
    this.copyVersionContent(working.id, saved.id);
    this.deleteVersion(working.id);
  }

  private copySongVersionToNewSong(sourceSongId: string, projectId: string, title: string, preferredType: 'saved' | 'working'): Song {
    const sourceVersion = this.database.prepare('SELECT id FROM song_versions WHERE songId = ? AND type = ?').get(sourceSongId, preferredType) as { id: string } | undefined
      ?? this.database.prepare("SELECT id FROM song_versions WHERE songId = ? AND type = 'saved'").get(sourceSongId) as { id: string } | undefined;
    const songId = randomId();
    const versionId = randomId();
    const timestamp = nowIso();
    this.database.prepare('INSERT INTO songs VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)').run(songId, title, projectId, timestamp, timestamp, timestamp);
    this.database.prepare("INSERT INTO song_versions VALUES (?, ?, 'saved', NULL, NULL)").run(versionId, songId);
    if (sourceVersion) this.copyVersionContent(sourceVersion.id, versionId);
    return this.getSong(songId, false);
  }

  private copyVersionContent(fromVersionId: string, toVersionId: string): void {
    this.database.prepare('DELETE FROM content_blocks WHERE versionId = ?').run(toVersionId);
    this.database.prepare('DELETE FROM arrangement_markers WHERE versionId = ?').run(toVersionId);
    this.database.prepare('INSERT INTO content_blocks SELECT id || ? , ?, type, content, position FROM content_blocks WHERE versionId = ?').run(`-${toVersionId}`, toVersionId, fromVersionId);
    this.database.prepare('INSERT INTO arrangement_markers SELECT id || ? , ?, targetPosition, displayMode, text FROM arrangement_markers WHERE versionId = ?').run(`-${toVersionId}`, toVersionId, fromVersionId);
  }

  private deleteVersion(versionId: string): void {
    this.database.prepare('DELETE FROM arrangement_markers WHERE versionId = ?').run(versionId);
    this.database.prepare('DELETE FROM content_blocks WHERE versionId = ?').run(versionId);
    this.database.prepare('DELETE FROM song_versions WHERE id = ?').run(versionId);
  }

  private getSong(songId: string, includeDeleted: boolean): Song {
    const sql = includeDeleted ? 'SELECT * FROM songs WHERE id = ?' : 'SELECT * FROM songs WHERE id = ? AND deletedOn IS NULL';
    const song = this.database.prepare(sql).get(songId) as Song | undefined;
    if (!song) throw new Error(`Song not found: ${songId}`);
    return song;
  }

  private projectExists(projectId: string | null): boolean {
    if (!projectId) return false;
    return Boolean(this.database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId) as Project | undefined);
  }

  private songTitleExists(projectId: string, title: string, excludingSongId?: string): boolean {
    return Boolean(this.database.prepare('SELECT id FROM songs WHERE projectId = ? AND title = ? AND deletedOn IS NULL AND id != ?').get(projectId, title, excludingSongId ?? '') as Song | undefined);
  }
}
