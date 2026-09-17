import { z } from 'zod';

export const rectSchema = z.strictObject({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const sourceSchema = z.strictObject({
  from: z.number().nonnegative().describe('Seconds in the recording after trimBefore; independent of presentation time.'),
  freeze: z.boolean().optional(),
});

export const transitionSchema = z.strictObject({
  type: z.enum(['fade', 'slide', 'none']),
  duration: z.number().nonnegative(),
});

export const brandingSchema = z.strictObject({
  logo: z.string().regex(/^(?:[a-z0-9._-]+\/)*[a-z0-9._-]+\.(?:png|jpe?g|webp)$/i).optional(),
  name: z.string().min(1).max(80).optional(),
  tagline: z.string().min(1).max(120).optional(),
  footer: z.string().min(1).max(160).optional(),
});

const base = {
  id: z.string().min(1),
  duration: z.number().positive().max(600),
  eyebrow: z.string(),
  title: z.string(),
  body: z.string(),
  transition: transitionSchema.optional(),
};
const text = {
  reveal: z.enum(['words', 'lines']).optional(),
  highlight: z.string().optional(),
};

export const sceneSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, ...text, type: z.literal('text') }),
  z.strictObject({ ...base, type: z.literal('chapter'), number: z.string() }),
  z.strictObject({ ...base, type: z.literal('overview'), source: sourceSchema }),
  z.strictObject({ ...base, type: z.literal('focus'), source: sourceSchema, focus: rectSchema, dim: z.number().min(0).max(0.85).optional(), zoom: z.number().min(1).max(3).optional() }),
  z.strictObject({ ...base, type: z.literal('camera'), source: sourceSchema, path: z.array(z.strictObject({ at: z.number().nonnegative(), focus: rectSchema.optional(), zoom: z.number().min(1).max(3).optional() })).min(2) }),
  z.strictObject({ ...base, type: z.literal('annotation'), source: sourceSchema.extend({ freeze: z.literal(true) }), focus: rectSchema, note: z.strictObject({ text: z.string(), x: z.number().nonnegative(), y: z.number().nonnegative(), width: z.number().positive() }) }),
  z.strictObject({ ...base, type: z.literal('result'), source: sourceSchema, focus: rectSchema.optional(), comparison: z.strictObject({ before: z.number().nonnegative(), after: z.number().nonnegative(), crop: rectSchema, beforeLabel: z.string(), afterLabel: z.string() }).optional() }),
  z.strictObject({ ...base, ...text, type: z.literal('outro'), cta: z.string().optional() }),
]);

export const projectSchema = z.strictObject({
  version: z.literal(2),
  title: z.string(),
  accent: z.string().regex(/^#[\da-f]{6}$/i),
  branding: brandingSchema.optional(),
  video: z.string(),
  sourceDuration: z.number().nonnegative(),
  trimBefore: z.number().nonnegative(),
  viewport: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }),
  scenes: z.array(sceneSchema).min(1).max(100),
});

export type ProjectInput = z.infer<typeof projectSchema>;
export type SceneInput = z.infer<typeof sceneSchema>;
