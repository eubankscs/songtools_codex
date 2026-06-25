import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import { DATABASE_FILE_NAME, migrate } from './migrations.js';
import { createRepositories } from './repository.js';

export function databasePath(): string {
  return path.join(app.getPath('userData'), DATABASE_FILE_NAME);
}

export function openDatabase(filePath = databasePath()): Database.Database {
  const database = new Database(filePath);
  migrate(database);
  return database;
}

export { createRepositories, migrate };
