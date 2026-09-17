export type FrameStats = {
  alphaMinimum: number;
  meanLuma: number;
  lumaDeviation: number;
  colorBins: number;
  dominantRatio: number;
  edgeRatio: number;
  blank: boolean;
};
export function frameStats(rgba: Buffer, width?: number, height?: number, stride?: number): FrameStats;
export function regionMeanLuma(rgba: Buffer, region: { x: number; y: number; width: number; height: number }, frameWidth?: number, stride?: number): number;
export function psnr(a: Buffer, b: Buffer, byteStride?: number): number;
