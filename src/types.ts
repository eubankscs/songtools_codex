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

export interface AnnotationRange {
  blockId: string;
  start: number;
  end: number;
}

export interface NoteRow {
  id: string;
  songId: string;
  noteType: 'line' | 'section' | 'song';
  targetId: string | null;
  body: string;
}

export interface TagRow {
  id: string;
  name: string;
  color: string | null;
  createsReviewItem: 0 | 1 | boolean;
}

export interface AnnotationRow {
  id: string;
  songId: string;
  targetRange: string;
  parsedRange: AnnotationRange;
  body: string;
  tagId: string | null;
  tagName: string | null;
  tagColor: string | null;
}

export interface ReviewQueueRow {
  id: string;
  songId: string;
  targetId: string | null;
  type: string;
  message: string;
  createdOn: string | null;
  ignoredOn: string | null;
  resolvedOn: string | null;
}

export interface EditorialSnapshot {
  notes: NoteRow[];
  annotations: AnnotationRow[];
  tags: TagRow[];
  reviewQueue: ReviewQueueRow[];
}


export interface SearchSongRow extends SongRow { containerName: string; }
export interface DeletedSongRow extends SongRow { containerName: string | null; }

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
  getEditorialSnapshot(songId: string): Promise<EditorialSnapshot>;
  upsertNote(songId: string, note: Partial<NoteRow> & Pick<NoteRow, 'noteType' | 'targetId' | 'body'>): Promise<NoteRow>;
  deleteNote(id: string): Promise<void>;
  upsertTag(tag: Partial<TagRow> & Pick<TagRow, 'name'>): Promise<TagRow>;
  deleteTag(id: string): Promise<void>;
  upsertAnnotation(songId: string, annotation: { id?: string; targetRange: AnnotationRange; body: string; tagId: string | null }): Promise<AnnotationRow>;
  createReviewItem(songId: string, targetId: string | null, type: string, message: string): Promise<ReviewQueueRow>;
  resolveReviewItem(id: string): Promise<void>;
  ignoreReviewItem(id: string): Promise<void>;
  searchSongs(query: string): Promise<SearchSongRow[]>;
  moveSong(songId: string, destinationProjectId: string, renameTo?: string): Promise<SongRow>;
  deleteSong(songId: string): Promise<void>;
  listRecentlyDeleted(): Promise<DeletedSongRow[]>;
  restoreSong(songId: string, options: { title?: string; mode?: 'permanent' | 'variant' }): Promise<SongRow>;
  permanentlyDeleteSong(songId: string): Promise<void>;
  createVariant(songId: string, title: string, projectId?: string): Promise<SongRow>;
  saveWorkingCopyAsVariant(songId: string, title: string, projectId?: string): Promise<SongRow>;
}

declare global {
  interface Window {
    songtools: SongtoolsApi;
  }
}
