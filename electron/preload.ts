import { contextBridge, ipcRenderer } from 'electron';

type IpcResult<T> = { ok: true; value: T } | { ok: false; error: { name: string; message: string } };

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = await ipcRenderer.invoke(channel, ...args) as IpcResult<T>;
  if (!result.ok) throw Object.assign(new Error(result.error.message), { name: result.error.name });
  return result.value;
}

contextBridge.exposeInMainWorld('songtools', {
  getHomeSnapshot: () => invoke('home:snapshot'),
  listProjects: () => invoke('projects:list'),
  getProject: (projectId: string) => invoke('projects:get', projectId),
  createProject: (name: string) => invoke('projects:create', name),
  renameProject: (projectId: string, name: string) => invoke('projects:rename', projectId, name),
  deleteProject: (projectId: string, mode: 'moveSongsToUnassigned' | 'deleteSongs') => invoke('projects:delete', projectId, mode),
  createSong: (title: string, projectId?: string) => invoke('songs:create', title, projectId),
  renameSong: (songId: string, title: string) => invoke('songs:rename', songId, title),
  openSong: (songId: string) => invoke('songs:open', songId),
  getEditorDocument: (songId: string) => invoke('editor:getDocument', songId),
  saveEditorBlocks: (songId: string, blocks: unknown[]) => invoke('editor:saveBlocks', songId, blocks),
  saveEditorDocument: (songId: string, blocks: unknown[], markers: unknown[]) => invoke('editor:saveDocument', songId, blocks, markers),
  manualSave: (songId: string) => invoke('editor:manualSave', songId)
});
