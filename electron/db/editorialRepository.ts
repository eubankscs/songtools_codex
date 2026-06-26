import type Database from 'better-sqlite3';
import type { Annotation, Note, ReviewQueueItem, Tag } from './models.js';

export interface AnnotationRange {
  blockId: string;
  start: number;
  end: number;
}

export interface AnnotationInput {
  id?: string;
  targetRange: AnnotationRange;
  body: string;
  tagId: string | null;
}

export interface EditorialSnapshot {
  notes: Note[];
  annotations: (Annotation & { parsedRange: AnnotationRange; tagName: string | null; tagColor: string | null })[];
  tags: Tag[];
  reviewQueue: ReviewQueueItem[];
}

function randomId(): string {
  return globalThis.crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

export class EditorialRepository {
  constructor(private readonly database: Database.Database) {}

  getSnapshot(songId: string): EditorialSnapshot {
    return {
      notes: this.listNotes(songId),
      annotations: this.listAnnotations(songId),
      tags: this.listTags(),
      reviewQueue: this.listReviewQueue(songId)
    };
  }

  listNotes(songId: string): Note[] {
    return this.database.prepare('SELECT * FROM notes WHERE songId = ? ORDER BY noteType ASC, targetId ASC, id ASC').all(songId) as Note[];
  }

  upsertNote(songId: string, note: Partial<Note> & Pick<Note, 'noteType' | 'targetId' | 'body'>): Note {
    const id = note.id ?? randomId();
    this.database.prepare(
      `INSERT INTO notes (id, songId, noteType, targetId, body)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET noteType = excluded.noteType, targetId = excluded.targetId, body = excluded.body`
    ).run(id, songId, note.noteType, note.targetId, note.body);
    return this.database.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note;
  }

  deleteNote(id: string): void {
    this.database.prepare('DELETE FROM notes WHERE id = ?').run(id);
  }

  listTags(): Tag[] {
    return this.database.prepare('SELECT * FROM tags ORDER BY name COLLATE NOCASE ASC').all() as Tag[];
  }

  upsertTag(tag: Partial<Tag> & Pick<Tag, 'name'>): Tag {
    const id = tag.id ?? randomId();
    this.database.prepare(
      `INSERT INTO tags (id, name, color, createsReviewItem)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, createsReviewItem = excluded.createsReviewItem`
    ).run(id, tag.name, tag.color ?? null, tag.createsReviewItem ? 1 : 0);
    return this.database.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Tag;
  }

  deleteTag(id: string): void {
    this.database.prepare('UPDATE annotations SET tagId = NULL WHERE tagId = ?').run(id);
    this.database.prepare('DELETE FROM tags WHERE id = ?').run(id);
  }

  listAnnotations(songId: string): EditorialSnapshot['annotations'] {
    const rows = this.database.prepare(
      `SELECT annotations.*, tags.name AS tagName, tags.color AS tagColor
       FROM annotations
       LEFT JOIN tags ON tags.id = annotations.tagId
       WHERE annotations.songId = ?
       ORDER BY annotations.id ASC`
    ).all(songId) as (Annotation & { tagName: string | null; tagColor: string | null })[];
    return rows.map((row) => ({ ...row, parsedRange: this.parseRange(row.targetRange) }));
  }

  upsertAnnotation(songId: string, annotation: AnnotationInput): Annotation {
    const existing = this.findAnnotationForExactRange(songId, annotation.targetRange);
    const id = annotation.id ?? existing?.id ?? randomId();
    const targetRange = JSON.stringify(annotation.targetRange);
    this.database.prepare(
      `INSERT INTO annotations (id, songId, targetRange, body, tagId)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET targetRange = excluded.targetRange, body = excluded.body, tagId = excluded.tagId`
    ).run(id, songId, targetRange, annotation.body, annotation.tagId);

    if (annotation.tagId) {
      const tag = this.database.prepare('SELECT * FROM tags WHERE id = ?').get(annotation.tagId) as Tag | undefined;
      if (tag?.createsReviewItem) this.createReviewItem(songId, id, 'Placeholder lyric', annotation.body || tag.name);
    }

    return this.database.prepare('SELECT * FROM annotations WHERE id = ?').get(id) as Annotation;
  }

  createReviewItem(songId: string, targetId: string | null, type: string, message: string): ReviewQueueItem {
    const id = randomId();
    this.database.prepare(
      `INSERT INTO review_queue (id, songId, targetId, type, message, createdOn, ignoredOn, resolvedOn)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`
    ).run(id, songId, targetId, type, message, nowIso());
    return this.database.prepare('SELECT * FROM review_queue WHERE id = ?').get(id) as ReviewQueueItem;
  }

  listReviewQueue(songId: string): ReviewQueueItem[] {
    return this.database.prepare(
      `SELECT * FROM review_queue
       WHERE songId = ? AND ignoredOn IS NULL AND resolvedOn IS NULL
       ORDER BY createdOn ASC`
    ).all(songId) as ReviewQueueItem[];
  }

  resolveReviewItem(id: string): void {
    this.database.prepare('UPDATE review_queue SET resolvedOn = ? WHERE id = ?').run(nowIso(), id);
  }

  ignoreReviewItem(id: string): void {
    this.database.prepare('UPDATE review_queue SET ignoredOn = ? WHERE id = ?').run(nowIso(), id);
  }

  private findAnnotationForExactRange(songId: string, targetRange: AnnotationRange): Annotation | undefined {
    return this.database.prepare('SELECT * FROM annotations WHERE songId = ? AND targetRange = ?')
      .get(songId, JSON.stringify(targetRange)) as Annotation | undefined;
  }

  private parseRange(source: string): AnnotationRange {
    const range = JSON.parse(source) as AnnotationRange;
    if (!range.blockId || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end < range.start) throw new Error('Invalid annotation target range.');
    return range;
  }
}
