import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import { DuplicateNameError, HomeRepository, SystemProjectError, UNASSIGNED_PROJECT_ID } from './db/homeRepository.js';
import { EditorRepository } from './db/editorRepository.js';
import { EditorialRepository } from './db/editorialRepository.js';
import { Phase5Repository } from './db/phase5Repository.js';

function serializeError(error: unknown) {
  if (error instanceof DuplicateNameError || error instanceof SystemProjectError) {
    return { name: error.name, message: error.message };
  }
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: 'Error', message: String(error) };
}

async function safely<T>(action: () => T): Promise<{ ok: true; value: T } | { ok: false; error: { name: string; message: string } }> {
  try {
    return { ok: true, value: action() };
  } catch (error) {
    return { ok: false, error: serializeError(error) };
  }
}

let registered = false;

export function registerIpc(database: Database.Database): void {
  if (registered) return;
  registered = true;
  const home = new HomeRepository(database);
  const editor = new EditorRepository(database);
  const editorial = new EditorialRepository(database);
  const phase5 = new Phase5Repository(database);
  home.ensureSystemContainers();

  ipcMain.handle('home:snapshot', () => safely(() => home.getHomeSnapshot()));
  ipcMain.handle('projects:list', () => safely(() => home.listUserProjects()));
  ipcMain.handle('projects:get', (_event, projectId: string) => safely(() => home.getProjectDetail(projectId)));
  ipcMain.handle('projects:create', (_event, name: string) => safely(() => home.createProject(name)));
  ipcMain.handle('projects:rename', (_event, projectId: string, name: string) => safely(() => home.renameProject(projectId, name)));
  ipcMain.handle('projects:delete', (_event, projectId: string, mode: 'moveSongsToUnassigned' | 'deleteSongs') => safely(() => home.deleteProject(projectId, mode)));
  ipcMain.handle('songs:create', (_event, title: string, projectId = UNASSIGNED_PROJECT_ID) => safely(() => home.createSong(title, projectId)));
  ipcMain.handle('songs:rename', (_event, songId: string, title: string) => safely(() => home.renameSong(songId, title)));
  ipcMain.handle('songs:open', (_event, songId: string) => safely(() => home.openSong(songId)));
  ipcMain.handle('editor:getDocument', (_event, songId: string) => safely(() => editor.getDocument(songId)));
  ipcMain.handle('editor:saveBlocks', (_event, songId: string, blocks: unknown[]) => safely(() => editor.saveBlocks(songId, blocks as never)));
  ipcMain.handle('editor:saveDocument', (_event, songId: string, blocks: unknown[], markers: unknown[]) => safely(() => editor.saveWorkingDocument(songId, blocks as never, markers as never)));
  ipcMain.handle('editor:manualSave', (_event, songId: string) => safely(() => editor.manualSave(songId)));
  ipcMain.handle('editorial:getSnapshot', (_event, songId: string) => safely(() => editorial.getSnapshot(songId)));
  ipcMain.handle('editorial:upsertNote', (_event, songId: string, note: unknown) => safely(() => editorial.upsertNote(songId, note as Parameters<EditorialRepository['upsertNote']>[1])));
  ipcMain.handle('editorial:deleteNote', (_event, id: string) => safely(() => editorial.deleteNote(id)));
  ipcMain.handle('editorial:upsertTag', (_event, tag: unknown) => safely(() => editorial.upsertTag(tag as Parameters<EditorialRepository['upsertTag']>[0])));
  ipcMain.handle('editorial:deleteTag', (_event, id: string) => safely(() => editorial.deleteTag(id)));
  ipcMain.handle('editorial:upsertAnnotation', (_event, songId: string, annotation: unknown) => safely(() => editorial.upsertAnnotation(songId, annotation as Parameters<EditorialRepository['upsertAnnotation']>[1])));
  ipcMain.handle('editorial:createReviewItem', (_event, songId: string, targetId: string | null, type: string, message: string) => safely(() => editorial.createReviewItem(songId, targetId, type, message)));
  ipcMain.handle('editorial:resolveReviewItem', (_event, id: string) => safely(() => editorial.resolveReviewItem(id)));
  ipcMain.handle('editorial:ignoreReviewItem', (_event, id: string) => safely(() => editorial.ignoreReviewItem(id)));
  ipcMain.handle('phase5:searchSongs', (_event, query: string) => safely(() => phase5.searchActiveSongs(query)));
  ipcMain.handle('phase5:moveSong', (_event, songId: string, destinationProjectId: string, renameTo?: string) => safely(() => phase5.moveSong(songId, destinationProjectId, renameTo)));
  ipcMain.handle('phase5:deleteSong', (_event, songId: string) => safely(() => phase5.deleteSong(songId)));
  ipcMain.handle('phase5:listRecentlyDeleted', () => safely(() => phase5.listRecentlyDeleted()));
  ipcMain.handle('phase5:restoreSong', (_event, songId: string, options: unknown) => safely(() => phase5.restoreSong(songId, options as Parameters<Phase5Repository['restoreSong']>[1])));
  ipcMain.handle('phase5:permanentlyDeleteSong', (_event, songId: string) => safely(() => phase5.permanentlyDeleteSong(songId)));
  ipcMain.handle('phase5:createVariant', (_event, songId: string, title: string, projectId?: string) => safely(() => phase5.createVariant(songId, title, projectId)));
  ipcMain.handle('phase5:saveWorkingCopyAsVariant', (_event, songId: string, title: string, projectId?: string) => safely(() => phase5.saveWorkingCopyAsVariant(songId, title, projectId)));
}
