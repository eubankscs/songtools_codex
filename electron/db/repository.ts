import type Database from 'better-sqlite3';
import type { TableMap } from './models.js';

type TableName = keyof TableMap;
const columns = {
  projects: ['id', 'name', 'createdOn', 'lastUsedOn', 'isSystemProject'],
  songs: ['id', 'title', 'projectId', 'createdOn', 'updatedOn', 'lastOpenedOn', 'deletedOn', 'originalProjectId'],
  song_versions: ['id', 'songId', 'type', 'capo', 'concertKey'],
  content_blocks: ['id', 'versionId', 'type', 'content', 'position'],
  arrangement_markers: ['id', 'versionId', 'targetPosition', 'displayMode', 'text'],
  notes: ['id', 'songId', 'noteType', 'targetId', 'body'],
  annotations: ['id', 'songId', 'targetRange', 'body', 'tagId'],
  tags: ['id', 'name', 'color', 'createsReviewItem'],
  review_queue: ['id', 'songId', 'targetId', 'type', 'message', 'createdOn', 'ignoredOn', 'resolvedOn']
} as const satisfies Record<TableName, readonly string[]>;

export class Repository<TTable extends TableName> {
  constructor(private readonly database: Database.Database, private readonly table: TTable) {}

  create(record: TableMap[TTable]): void {
    const tableColumns = columns[this.table];
    const names = tableColumns.join(', ');
    const params = tableColumns.map((column) => `@${column}`).join(', ');
    this.database.prepare(`INSERT INTO ${this.table} (${names}) VALUES (${params})`).run(record);
  }

  getById(id: string): TableMap[TTable] | undefined {
    return this.database.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id) as TableMap[TTable] | undefined;
  }

  list(): TableMap[TTable][] {
    return this.database.prepare(`SELECT * FROM ${this.table}`).all() as TableMap[TTable][];
  }

  update(id: string, changes: Partial<TableMap[TTable]>): void {
    const entries = Object.entries(changes).filter(([key]) => key !== 'id');
    if (entries.length === 0) return;
    const assignments = entries.map(([key]) => `${key} = @${key}`).join(', ');
    this.database.prepare(`UPDATE ${this.table} SET ${assignments} WHERE id = @id`).run({ ...changes, id });
  }

  delete(id: string): void {
    this.database.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
  }
}

export function createRepositories(database: Database.Database) {
  return {
    projects: new Repository(database, 'projects'),
    songs: new Repository(database, 'songs'),
    songVersions: new Repository(database, 'song_versions'),
    contentBlocks: new Repository(database, 'content_blocks'),
    arrangementMarkers: new Repository(database, 'arrangement_markers'),
    notes: new Repository(database, 'notes'),
    annotations: new Repository(database, 'annotations'),
    tags: new Repository(database, 'tags'),
    reviewQueue: new Repository(database, 'review_queue')
  };
}
