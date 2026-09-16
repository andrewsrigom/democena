export type Focus = { x: number; y: number; width: number; height: number };
export type Scene = { at: number; eyebrow: string; title: string; body: string; focus?: Focus };
export type Project = {
  title: string;
  accent: string;
  video: string;
  duration: number;
  trimBefore: number;
  viewport: { width: number; height: number };
  scenes: Scene[];
};

export const example: Project = {
  title: 'Parcel Desk', accent: '#28584c', video: 'captures/parcel.webm',
  duration: 18, trimBefore: 0, viewport: { width: 1280, height: 800 },
  scenes: [{ at: 0, eyebrow: 'A clearer product story', title: 'Show the flow.\nLet it speak.', body: 'Run studio:capture to create your first recording.' }],
};
