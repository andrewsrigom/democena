export type Focus = { x: number; y: number; width: number; height: number };
export type Source = { from: number; freeze?: boolean };
export type Transition = { type: 'fade' | 'slide' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'none'; duration: number };
export type CompositionLayout = 'framed' | 'full-bleed' | 'product-stage' | 'detail-crop' | 'layered-product' | 'full-bleed-proof';
export type CaptionPlacement = 'side' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';
export type ChromeMode = 'auto' | 'show' | 'hide';
export type TypographicRole = 'hero' | 'statement' | 'metadata' | 'proof' | 'label' | 'silent-product';
export type ProductPresentation = {
  layout?: CompositionLayout;
  caption?: CaptionPlacement;
};
export type CameraStop = { at: number; focus?: Focus; zoom?: number };
type BaseScene = {
  id: string;
  duration: number;
  eyebrow: string;
  title: string;
  body: string;
  transition?: Transition;
  chrome?: ChromeMode;
  typographicRole?: TypographicRole;
};
type TextOptions = { reveal?: 'words' | 'lines'; highlight?: string };
type ProductOptions = { presentation?: ProductPresentation };
export type TextScene = BaseScene & TextOptions & { type: 'text' };
export type ChapterScene = BaseScene & { type: 'chapter'; number: string };
export type OverviewScene = BaseScene & ProductOptions & { type: 'overview'; source: Source };
export type FocusScene = BaseScene & ProductOptions & { type: 'focus'; source: Source; focus: Focus; dim?: number; zoom?: number };
export type CameraScene = BaseScene & ProductOptions & { type: 'camera'; source: Source; path: CameraStop[] };
export type AnnotationScene = BaseScene & ProductOptions & {
  type: 'annotation'; source: Source & { freeze: true }; focus: Focus;
  note: { text: string; x: number; y: number; width: number };
};
export type ResultScene = BaseScene & ProductOptions & {
  type: 'result'; source: Source; focus?: Focus;
  comparison?: { before: number; after: number; crop: Focus; beforeLabel: string; afterLabel: string };
};
export type OutroScene = BaseScene & TextOptions & { type: 'outro'; cta?: string };
export type Scene = TextScene | ChapterScene | OverviewScene | FocusScene | CameraScene | AnnotationScene | ResultScene | OutroScene;
export type Branding = { logo?: string; name?: string; tagline?: string; footer?: string };
export type Appearance = {
  surfaceMode?: 'light' | 'dark' | 'auto';
  background?: string;
  foreground?: string;
  muted?: string;
  surface?: string;
  border?: string;
  tint?: string;
  fontFamily?: string;
  radius?: number;
};
export type Project = {
  version: 2;
  title: string;
  accent: string;
  branding?: Branding;
  appearance?: Appearance;
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
