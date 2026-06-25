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

export interface SongtoolsApi {
  getHomeSnapshot(): Promise<HomeSnapshot>;
  listProjects(): Promise<ProjectRow[]>;
  getProject(projectId: string): Promise<ProjectDetail>;
  createProject(name: string): Promise<ProjectRow>;
  renameProject(projectId: string, name: string): Promise<ProjectRow>;
  deleteProject(projectId: string, mode: 'moveSongsToUnassigned' | 'deleteSongs'): Promise<void>;
  createSong(title: string, projectId?: string): Promise<SongRow>;
  renameSong(songId: string, title: string): Promise<SongRow>;
  openSong(songId: string): Promise<SongRow>;
}

declare global {
  interface Window {
    songtools: SongtoolsApi;
  }
}
