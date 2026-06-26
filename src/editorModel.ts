import type { EditorMarker } from './types';

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

export type RenderBlock =
  | { kind: 'section'; id?: string; text: string; position: number; isFirstSection: boolean; standaloneMarkers: EditorMarker[] }
  | { kind: 'lyric'; id?: string; text: string; position: number; chords: ChordPlacement[]; inlineMarkers: EditorMarker[]; standaloneMarkers: EditorMarker[] };

export function normalizeChordPlacements(chords: ChordPlacement[]): ChordPlacement[] {
  return chords.map((placement) => {
    if (!Number.isInteger(placement.offset) || placement.offset < 0) throw new Error('Chord offset must be a non-negative integer.');
    if (!placement.chord.trim()) throw new Error('Chord text is required.');
    return { chord: placement.chord, offset: placement.offset };
  }).sort((left, right) => left.offset - right.offset);
}

export function toRenderableBlocks(blocks: EditorBlock[], markers: EditorMarker[] = []): RenderBlock[] {
  const sorted = [...blocks].sort((left, right) => left.position - right.position);
  const inlineMarkers = markers.filter((marker) => marker.displayMode === 'inline');
  const standaloneMarkers = markers.filter((marker) => marker.displayMode === 'standalone');
  const renderBlocks: RenderBlock[] = [];
  let pendingChords: ChordPlacement[] = [];
  let sectionCount = 0;

  for (const block of sorted) {
    if (block.type === 'chordLine') {
      pendingChords = normalizeChordPlacements(block.content as ChordPlacement[]);
      continue;
    }

    const blockStandaloneMarkers = standaloneMarkers.filter((marker) => marker.targetPosition === `position:${block.position}`);

    if (block.type === 'section') {
      sectionCount += 1;
      renderBlocks.push({ kind: 'section', id: block.id, text: String(block.content ?? ''), position: block.position, isFirstSection: sectionCount === 1, standaloneMarkers: blockStandaloneMarkers });
      pendingChords = [];
      continue;
    }

    renderBlocks.push({
      kind: 'lyric',
      id: block.id,
      text: String(block.content ?? ''),
      position: block.position,
      chords: pendingChords,
      inlineMarkers: inlineMarkers.filter((marker) => marker.targetPosition.startsWith(`${block.id}:`)),
      standaloneMarkers: blockStandaloneMarkers
    });
    pendingChords = [];
  }

  return renderBlocks;
}

export function parseBlocksJson(source: string): EditorBlock[] {
  const parsed = JSON.parse(source) as EditorBlock[];
  if (!Array.isArray(parsed)) throw new Error('Editor blocks JSON must be an array.');
  return parsed.map((block, index) => {
    if (block.type !== 'section' && block.type !== 'lyricLine' && block.type !== 'chordLine') throw new Error(`Unsupported editor block type at index ${index}.`);
    return { ...block, position: Number.isInteger(block.position) ? block.position : index };
  });
}

export function parseMarkersJson(source: string): EditorMarker[] {
  const parsed = JSON.parse(source) as EditorMarker[];
  if (!Array.isArray(parsed)) throw new Error('Editor markers JSON must be an array.');
  return parsed.map((marker, index) => {
    if (marker.displayMode !== 'inline' && marker.displayMode !== 'standalone') throw new Error(`Unsupported marker display mode at index ${index}.`);
    if (!marker.text.trim()) throw new Error(`Marker text is required at index ${index}.`);
    return marker;
  });
}

export function stringifyBlocks(blocks: EditorBlock[]): string {
  return JSON.stringify(blocks, null, 2);
}

export function stringifyMarkers(markers: EditorMarker[]): string {
  return JSON.stringify(markers, null, 2);
}
