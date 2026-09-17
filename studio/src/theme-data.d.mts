export type PresentationTheme = {
  mode: 'light' | 'dark';
  background: string;
  foreground: string;
  primary: string;
  muted: string;
  border: string;
  tint: string;
  surface: string;
  shadow: string;
  radius: number;
  font: string;
};
export const lightTheme: PresentationTheme;
export const darkTheme: PresentationTheme;
export const theme: PresentationTheme;
export function resolveTheme(project?: { appearance?: Record<string, unknown> } | Record<string, unknown>): PresentationTheme;
