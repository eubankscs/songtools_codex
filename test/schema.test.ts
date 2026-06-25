import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrate } from '../electron/db/migrations.js';
import { createRepositories } from '../electron/db/repository.js';

function memoryDb() {
  const db = new Database(':memory:');
  migrate(db);
  return db;
}

describe('phase 1 database foundation', () => {
  it('creates every spec table with the required columns', () => {
    const db = memoryDb();
    const tables = ['projects','songs','song_versions','content_blocks','arrangement_markers','notes','annotations','tags','review_queue'];
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r: any) => r.name)).toEqual([...tables].sort());
    expect(db.prepare('PRAGMA table_info(tags)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'createsReviewItem', type: 'BOOLEAN', notnull: 1, dflt_value: '0' })]));
    db.close();
  });

  it('enforces unique song version type per song and check constraints', () => {
    const db = memoryDb();
    db.prepare("INSERT INTO projects VALUES ('p1','Unassigned Songs',NULL,NULL,1)").run();
    db.prepare("INSERT INTO songs VALUES ('s1','Title','p1',NULL,NULL,NULL,NULL,NULL)").run();
    db.prepare("INSERT INTO song_versions VALUES ('v1','s1','working',NULL,NULL)").run();
    expect(() => db.prepare("INSERT INTO song_versions VALUES ('v2','s1','working',NULL,NULL)").run()).toThrow();
    expect(() => db.prepare("INSERT INTO song_versions VALUES ('v3','s1','draft',NULL,NULL)").run()).toThrow();
    expect(() => db.prepare("INSERT INTO content_blocks VALUES ('b1','v1','bad',NULL,0)").run()).toThrow();
    expect(() => db.prepare("INSERT INTO arrangement_markers VALUES ('m1','v1','b1:0','bad','text')").run()).toThrow();
    expect(() => db.prepare("INSERT INTO notes VALUES ('n1','s1','bad',NULL,'body')").run()).toThrow();
    db.close();
  });

  it('enforces foreign keys and supports idempotent migration plus repository CRUD', () => {
    const db = memoryDb();
    migrate(db);
    expect(() => db.prepare("INSERT INTO songs VALUES ('s1','Title','missing',NULL,NULL,NULL,NULL,NULL)").run()).toThrow();
    const repos = createRepositories(db);
    repos.projects.create({ id: 'p1', name: 'Project', createdOn: null, lastUsedOn: null, isSystemProject: 0 });
    expect(repos.projects.getById('p1')?.name).toBe('Project');
    repos.projects.update('p1', { name: 'Renamed' });
    expect(repos.projects.list()).toEqual([expect.objectContaining({ name: 'Renamed' })]);
    repos.projects.delete('p1');
    expect(repos.projects.list()).toEqual([]);
    db.close();
  });
});
