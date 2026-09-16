export type Target = {
  testId?: string;
  label?: string;
  role?: 'button' | 'textbox' | 'heading' | 'link' | 'combobox' | 'checkbox';
  name?: string;
  css?: string;
};
export type CaptureStep = {
  id: string;
  action: string;
  target?: Target;
  value?: string;
  key?: string;
  url?: string;
  text?: string;
  durationMs?: number;
  holdMs?: number;
};
export type CapturePlan = {
  url: string;
  viewport?: { width: number; height: number };
  ready?: Target;
  allowedOrigins?: string[];
  redact?: string[];
  typingDelayMs?: number;
  timeoutMs?: number;
  steps: CaptureStep[];
};
export type CaptureEvent = {
  id: string;
  action: string;
  at: number;
  end: number;
  url: string;
  box?: { x: number; y: number; width: number; height: number };
  screenshot?: string;
  verified?: boolean;
};
export type CaptureResult = {
  recording: string;
  preview: string;
  viewport: { width: number; height: number };
  events: CaptureEvent[];
  clock: {
    method: string;
    firstFrameTimestamp: number;
    lastFrameTimestamp: number;
    precision: string;
  };
};
export function httpOrigin(value: string): string;
export function captureBrowser(
  plan: CapturePlan,
  output: string,
  options?: { storageState?: string },
): Promise<CaptureResult>;
