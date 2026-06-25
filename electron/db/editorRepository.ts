import type Database from 'better-sqlite3';
import type { ContentBlock, Song, SongVersion } from './models.js';

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

export interface EditorDocument {
  song: Song;
  version: SongVersion;
  blocks: EditorBlock[];
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
    const version = this.getOrCreateWorkingVersion(songId);
    return { song, version, blocks: this.getBlocks(version.id) };
  }

  saveBlocks(songId: string, blocks: EditorBlock[]): EditorDocument {
    const song = this.getSong(songId);
    const version = this.getOrCreateWorkingVersion(songId);
    const apply = this.database.transaction(() => {
      this.database.prepare('DELETE FROM content_blocks WHERE versionId = ?').run(version.id);
      for (const [index, block] of blocks.entries()) {
        const content = block.type === 'chordLine'
          ? serializeChordLineContent(block.content as ChordPlacement[])
          : String(block.content ?? '');
        this.database.prepare(
          `INSERT INTO content_blocks (id, versionId, type, content, position)
           VALUES (?, ?, ?, ?, ?)`
        ).run(block.id ?? randomId(), version.id, block.type, content, block.position ?? index);
      }
    });
    apply();
    return { song, version, blocks: this.getBlocks(version.id) };
  }

  private getSong(songId: string): Song {
    const song = this.database.prepare('SELECT * FROM songs WHERE id = ? AND deletedOn IS NULL').get(songId) as Song | undefined;
    if (!song) throw new Error(`Active song not found: ${songId}`);
    return song;
  }

  private getOrCreateWorkingVersion(songId: string): SongVersion {
    const existing = this.database.prepare("SELECT * FROM song_versions WHERE songId = ? AND type = 'working'").get(songId) as SongVersion | undefined;
    if (existing) return existing;
    const version: SongVersion = { id: randomId(), songId, type: 'working', capo: null, concertKey: null };
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
}
