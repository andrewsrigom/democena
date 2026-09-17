import { z } from 'zod';
import { captionPlacements, chromeModes, compositionLayouts, compositionRegistry, typographicRoles } from '../../studio/src/composition-registry.mjs';

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
  type: z.enum(['fade', 'slide', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'none']),
  duration: z.number().nonnegative(),
});

const presentationSchema = z.strictObject({
  layout: z.enum(compositionLayouts).optional(),
  caption: z.enum(captionPlacements).optional(),
}).refine((presentation) => presentation.caption !== 'side' || ['framed', 'detail-crop'].includes(presentation.layout ?? 'framed'), {
  path: ['caption'],
  message: 'Side captions require the framed or detail-crop layout.',
});

export const brandingSchema = z.strictObject({
  logo: z.string().regex(/^(?:[a-z0-9._-]+\/)*[a-z0-9._-]+\.(?:png|jpe?g|webp)$/i).optional(),
  name: z.string().min(1).max(80).optional(),
  tagline: z.string().min(1).max(120).optional(),
  footer: z.string().min(1).max(160).optional(),
});

const colorSchema = z.string().regex(/^#[\da-f]{6}$/i);
export const appearanceSchema = z.strictObject({
  surfaceMode: z.enum(['light', 'dark', 'auto']).optional(),
  background: colorSchema.optional(),
  foreground: colorSchema.optional(),
  muted: colorSchema.optional(),
  surface: colorSchema.optional(),
  border: colorSchema.optional(),
  tint: colorSchema.optional(),
  fontFamily: z.string().min(1).max(200).optional(),
  radius: z.number().min(0).max(40).optional(),
});

const base = {
  id: z.string().min(1),
  duration: z.number().positive().max(600),
  eyebrow: z.string(),
  title: z.string(),
  body: z.string(),
  transition: transitionSchema.optional(),
  chrome: z.enum(chromeModes).optional(),
  typographicRole: z.enum(typographicRoles).optional(),
};
const text = {
  reveal: z.enum(['words', 'lines']).optional(),
  highlight: z.string().optional(),
};
const product = { presentation: presentationSchema.optional() };

export const sceneSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, ...text, type: z.literal('text') }),
  z.strictObject({ ...base, type: z.literal('chapter'), number: z.string() }),
  z.strictObject({ ...base, ...product, type: z.literal('overview'), source: sourceSchema }),
  z.strictObject({ ...base, ...product, type: z.literal('focus'), source: sourceSchema, focus: rectSchema, dim: z.number().min(0).max(0.85).optional(), zoom: z.number().min(1).max(3).optional() }),
  z.strictObject({ ...base, ...product, type: z.literal('camera'), source: sourceSchema, path: z.array(z.strictObject({ at: z.number().nonnegative(), focus: rectSchema.optional(), zoom: z.number().min(1).max(3).optional() })).min(2) }),
  z.strictObject({ ...base, ...product, type: z.literal('annotation'), source: sourceSchema.extend({ freeze: z.literal(true) }), focus: rectSchema, note: z.strictObject({ text: z.string(), x: z.number().nonnegative(), y: z.number().nonnegative(), width: z.number().positive() }) }),
  z.strictObject({ ...base, ...product, type: z.literal('result'), source: sourceSchema, focus: rectSchema.optional(), comparison: z.strictObject({ before: z.number().nonnegative(), after: z.number().nonnegative(), crop: rectSchema, beforeLabel: z.string(), afterLabel: z.string() }).optional() }),
  z.strictObject({ ...base, ...text, type: z.literal('outro'), cta: z.string().optional() }),
]);

export const projectSchema = z.strictObject({
  version: z.literal(2),
  title: z.string(),
  accent: z.string().regex(/^#[\da-f]{6}$/i),
  branding: brandingSchema.optional(),
  appearance: appearanceSchema.optional(),
  video: z.string(),
  sourceDuration: z.number().nonnegative(),
  trimBefore: z.number().nonnegative(),
  viewport: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }),
  scenes: z.array(sceneSchema).min(1).max(100),
}).superRefine((project, ctx) => {
  project.scenes.forEach((scene, index) => {
    const productScene = !['text', 'chapter', 'outro'].includes(scene.type);
    if (scene.typographicRole === 'silent-product' && !productScene) {
      ctx.addIssue({ code: 'custom', path: ['scenes', index, 'typographicRole'], message: 'silent-product is available only on product scenes.' });
    }
    if (scene.typographicRole === 'silent-product' && 'presentation' in scene && scene.presentation?.caption && scene.presentation.caption !== 'none') {
      ctx.addIssue({ code: 'custom', path: ['scenes', index, 'presentation', 'caption'], message: 'silent-product scenes cannot render a caption.' });
    }
    if ('presentation' in scene && scene.presentation?.layout) {
      const definition = compositionRegistry[scene.presentation.layout];
      if (definition.requiresFocus && !('focus' in scene && scene.focus)) {
        ctx.addIssue({ code: 'custom', path: ['scenes', index, 'presentation', 'layout'], message: `${definition.id} requires an evidence-linked focus rectangle.` });
      }
    }
  });
});

export type ProjectInput = z.infer<typeof projectSchema>;
export type SceneInput = z.infer<typeof sceneSchema>;
