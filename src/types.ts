export interface ProjectRow {
  id: string;
  name: string;
  createdOn: string | null;
  lastUsedOn: string | null;
  isSystemProject: 0 | 1 | boolean;
  songCount: number;
}

export interface SongRow {
  id: string;
  title: string;
  projectId: string;
  createdOn: string | null;
  updatedOn: string | null;
  lastOpenedOn: string | null;
  deletedOn: string | null;
  originalProjectId: string | null;
}

export interface RecentSongRow extends SongRow {
  containerName: string;
}

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
  songs: SongRow[];
}

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
  song: SongRow;
  version: { id: string; songId: string; type: 'saved' | 'working'; capo: number | null; concertKey: string | null };
  blocks: EditorBlock[];
  markers: EditorMarker[];
  hasWorkingChanges: boolean;
}

export interface SongtoolsApi {
  getHomeSnapshot(): Promise<HomeSnapshot>;
  listProjects(): Promise<ProjectRow[]>;
  getProject(projectId: string): Promise<ProjectDetail>;
  createProject(name: string): Promise<ProjectRow>;
  renameProject(projectId: string, name: string): Promise<ProjectRow>;
  deleteProject(projectId: string, mode: 'moveSongsToUnassigned' | 'deleteSongs'): Promise<void>;
  createSong(title?: string, projectId?: string): Promise<SongRow>;
  renameSong(songId: string, title: string): Promise<SongRow>;
  openSong(songId: string): Promise<SongRow>;
  getEditorDocument(songId: string): Promise<EditorDocument>;
  saveEditorBlocks(songId: string, blocks: EditorBlock[]): Promise<EditorDocument>;
  saveEditorDocument(songId: string, blocks: EditorBlock[], markers: EditorMarker[]): Promise<EditorDocument>;
  manualSave(songId: string): Promise<EditorDocument>;
}

declare global {
  interface Window {
    songtools: SongtoolsApi;
  }
}
