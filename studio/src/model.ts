export type Focus = { x: number; y: number; width: number; height: number };
export type Source = { from: number; freeze?: boolean };
export type Transition = { type: 'fade' | 'slide' | 'none'; duration: number };
export type CameraStop = { at: number; focus?: Focus; zoom?: number };
type BaseScene = {
  id: string;
  duration: number;
  eyebrow: string;
  title: string;
  body: string;
  transition?: Transition;
};
type TextOptions = { reveal?: 'words' | 'lines'; highlight?: string };
export type TextScene = BaseScene & TextOptions & { type: 'text' };
export type ChapterScene = BaseScene & { type: 'chapter'; number: string };
export type OverviewScene = BaseScene & { type: 'overview'; source: Source };
export type FocusScene = BaseScene & { type: 'focus'; source: Source; focus: Focus; dim?: number; zoom?: number };
export type CameraScene = BaseScene & { type: 'camera'; source: Source; path: CameraStop[] };
export type AnnotationScene = BaseScene & {
  type: 'annotation'; source: Source & { freeze: true }; focus: Focus;
  note: { text: string; x: number; y: number; width: number };
};
export type ResultScene = BaseScene & {
  type: 'result'; source: Source; focus?: Focus;
  comparison?: { before: number; after: number; crop: Focus; beforeLabel: string; afterLabel: string };
};
export type OutroScene = BaseScene & TextOptions & { type: 'outro'; cta?: string };
export type Scene = TextScene | ChapterScene | OverviewScene | FocusScene | CameraScene | AnnotationScene | ResultScene | OutroScene;
export type Project = {
  version: 2;
  title: string;
  accent: string;
  video: string;
  sourceDuration: number;
  trimBefore: number;
  viewport: { width: number; height: number };
  scenes: Scene[];
};

// Useful even before the first capture: no missing video is requested for a text scene.
export const example: Project = {
  version: 2, title: 'Forma', accent: '#215acb', video: '',
  sourceDuration: 0, trimBefore: 0, viewport: { width: 1280, height: 800 },
  scenes: [{ id: 'welcome', type: 'text', duration: 5, eyebrow: 'Product stories, in motion',
    title: 'Show the flow.\nLet it speak.', body: 'Run studio:capture to create the Forma example.', reveal: 'words', highlight: 'speak.' }],
};
