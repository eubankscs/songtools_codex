import type Database from 'better-sqlite3';
import type { ArrangementMarker, ContentBlock, Song, SongVersion } from './models.js';

export interface ChordPlacement {
  chord: string;
  offset: number;
}

export interface EditorBlock {
  id?: string;
  type: 'section' | 'lyricLine' | 'chordLine';
  content: string | ChordPlacement[];
  position: number;
}

export interface EditorMarker {
  id?: string;
  targetPosition: string;
  displayMode: 'inline' | 'standalone';
  text: string;
}

export interface EditorDocument {
  song: Song;
  version: SongVersion;
  blocks: EditorBlock[];
  markers: EditorMarker[];
  hasWorkingChanges: boolean;
}

function randomId(): string {
  return globalThis.crypto.randomUUID();
}

export function parseChordLineContent(content: string | null): ChordPlacement[] {
  if (!content) return [];
  const parsed = JSON.parse(content) as ChordPlacement[];
  if (!Array.isArray(parsed)) throw new Error('Chord line content must be a JSON array.');
  return parsed.map((placement) => {
    if (typeof placement.chord !== 'string' || !placement.chord.trim()) throw new Error('Chord placement requires chord text.');
    if (!Number.isInteger(placement.offset) || placement.offset < 0) throw new Error('Chord placement offset must be a non-negative integer.');
    return { chord: placement.chord, offset: placement.offset };
  });
}

export function serializeChordLineContent(chords: ChordPlacement[]): string {
  return JSON.stringify(chords.map((placement) => ({ chord: placement.chord, offset: placement.offset })));
}

export class EditorRepository {
  constructor(private readonly database: Database.Database) {}

  getDocument(songId: string): EditorDocument {
    const song = this.getSong(songId);
    const working = this.getVersion(songId, 'working');
    const saved = this.getVersion(songId, 'saved');
    const version = working ?? saved ?? this.createWorkingVersion(songId);
    return this.toDocument(song, version, Boolean(working));
  }

  saveWorkingDocument(songId: string, blocks: EditorBlock[], markers: EditorMarker[] = []): EditorDocument {
    const song = this.getSong(songId);
    const version = this.getVersion(songId, 'working') ?? this.createWorkingVersion(songId);
    this.replaceVersionContent(version.id, blocks, markers);
    this.database.prepare('UPDATE songs SET updatedOn = ? WHERE id = ?').run(new Date().toISOString(), songId);
    return this.toDocument(song, version, true);
  }

  saveBlocks(songId: string, blocks: EditorBlock[]): EditorDocument {
    return this.saveWorkingDocument(songId, blocks, this.getDocument(songId).markers);
  }

  manualSave(songId: string): EditorDocument {
    const song = this.getSong(songId);
    const working = this.getVersion(songId, 'working');
    if (!working) {
      const saved = this.getVersion(songId, 'saved') ?? this.createVersion(songId, 'saved');
      return this.toDocument(song, saved, false);
    }

    const saved = this.getVersion(songId, 'saved') ?? this.createVersion(songId, 'saved');
    const blocks = this.getBlocks(working.id);
    const markers = this.getMarkers(working.id);
    const apply = this.database.transaction(() => {
      this.replaceVersionContent(saved.id, blocks, markers);
      this.database.prepare('DELETE FROM arrangement_markers WHERE versionId = ?').run(working.id);
      this.database.prepare('DELETE FROM content_blocks WHERE versionId = ?').run(working.id);
      this.database.prepare('DELETE FROM song_versions WHERE id = ?').run(working.id);
      this.database.prepare('UPDATE songs SET updatedOn = ? WHERE id = ?').run(new Date().toISOString(), songId);
    });
    apply();
    return this.toDocument(song, saved, false);
  }

  private toDocument(song: Song, version: SongVersion, hasWorkingChanges: boolean): EditorDocument {
    return {
      song,
      version,
      blocks: this.getBlocks(version.id),
      markers: this.getMarkers(version.id),
      hasWorkingChanges
    };
  }

  private replaceVersionContent(versionId: string, blocks: EditorBlock[], markers: EditorMarker[]): void {
    const apply = this.database.transaction(() => {
      this.database.prepare('DELETE FROM arrangement_markers WHERE versionId = ?').run(versionId);
      this.database.prepare('DELETE FROM content_blocks WHERE versionId = ?').run(versionId);
      for (const [index, block] of blocks.entries()) {
        const content = block.type === 'chordLine'
          ? serializeChordLineContent(block.content as ChordPlacement[])
          : String(block.content ?? '');
        this.database.prepare(
          `INSERT INTO content_blocks (id, versionId, type, content, position)
           VALUES (?, ?, ?, ?, ?)`
        ).run(block.id ?? randomId(), versionId, block.type, content, block.position ?? index);
      }
      for (const marker of markers) {
        this.database.prepare(
          `INSERT INTO arrangement_markers (id, versionId, targetPosition, displayMode, text)
           VALUES (?, ?, ?, ?, ?)`
        ).run(marker.id ?? randomId(), versionId, marker.targetPosition, marker.displayMode, marker.text);
      }
    });
    apply();
  }

  private getSong(songId: string): Song {
    const song = this.database.prepare('SELECT * FROM songs WHERE id = ? AND deletedOn IS NULL').get(songId) as Song | undefined;
    if (!song) throw new Error(`Active song not found: ${songId}`);
    return song;
  }

  private getVersion(songId: string, type: 'saved' | 'working'): SongVersion | undefined {
    return this.database.prepare('SELECT * FROM song_versions WHERE songId = ? AND type = ?').get(songId, type) as SongVersion | undefined;
  }

  private createWorkingVersion(songId: string): SongVersion {
    return this.createVersion(songId, 'working');
  }

  private createVersion(songId: string, type: 'saved' | 'working'): SongVersion {
    const version: SongVersion = { id: randomId(), songId, type, capo: null, concertKey: null };
    this.database.prepare('INSERT INTO song_versions (id, songId, type, capo, concertKey) VALUES (?, ?, ?, NULL, NULL)')
      .run(version.id, version.songId, version.type);
    return version;
  }

  private getBlocks(versionId: string): EditorBlock[] {
    const rows = this.database.prepare(
      `SELECT * FROM content_blocks
       WHERE versionId = ? AND type IN ('section', 'lyricLine', 'chordLine')
       ORDER BY position ASC`
    ).all(versionId) as ContentBlock[];
    return rows.map((row) => ({
      id: row.id,
      type: row.type as EditorBlock['type'],
      content: row.type === 'chordLine' ? parseChordLineContent(row.content) : row.content ?? '',
      position: row.position
    }));
  }

  private getMarkers(versionId: string): EditorMarker[] {
    const rows = this.database.prepare(
      `SELECT * FROM arrangement_markers
       WHERE versionId = ?
       ORDER BY targetPosition ASC, text ASC`
    ).all(versionId) as ArrangementMarker[];
    return rows.map((row) => ({ id: row.id, targetPosition: row.targetPosition, displayMode: row.displayMode ?? 'standalone', text: row.text }));
  }
}
