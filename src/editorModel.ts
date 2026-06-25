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
  | { kind: 'section'; id?: string; text: string; position: number; isFirstSection: boolean }
  | { kind: 'lyric'; id?: string; text: string; position: number; chords: ChordPlacement[] };

export function normalizeChordPlacements(chords: ChordPlacement[]): ChordPlacement[] {
  return chords.map((placement) => {
    if (!Number.isInteger(placement.offset) || placement.offset < 0) throw new Error('Chord offset must be a non-negative integer.');
    if (!placement.chord.trim()) throw new Error('Chord text is required.');
    return { chord: placement.chord, offset: placement.offset };
  }).sort((left, right) => left.offset - right.offset);
}

export function toRenderableBlocks(blocks: EditorBlock[]): RenderBlock[] {
  const sorted = [...blocks].sort((left, right) => left.position - right.position);
  const renderBlocks: RenderBlock[] = [];
  let pendingChords: ChordPlacement[] = [];
  let sectionCount = 0;

  for (const block of sorted) {
    if (block.type === 'chordLine') {
      pendingChords = normalizeChordPlacements(block.content as ChordPlacement[]);
      continue;
    }

    if (block.type === 'section') {
      sectionCount += 1;
      renderBlocks.push({ kind: 'section', id: block.id, text: String(block.content ?? ''), position: block.position, isFirstSection: sectionCount === 1 });
      pendingChords = [];
      continue;
    }

    renderBlocks.push({ kind: 'lyric', id: block.id, text: String(block.content ?? ''), position: block.position, chords: pendingChords });
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

export function stringifyBlocks(blocks: EditorBlock[]): string {
  return JSON.stringify(blocks, null, 2);
}
