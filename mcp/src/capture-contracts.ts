import { z } from 'zod';
const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const url = z.url().refine((value) => {
  try {
    const u = new URL(value);
    return (
      ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password
    );
  } catch {
    return false;
  }
}, 'Use HTTP(S) without embedded credentials.');
export const targetSchema = z.union([
  z.strictObject({ testId: z.string().min(1) }),
  z.strictObject({ label: z.string().min(1) }),
  z.strictObject({
    role: z.enum([
      'button',
      'textbox',
      'heading',
      'link',
      'combobox',
      'checkbox',
    ]),
    name: z.string(),
  }),
  z.strictObject({ css: z.string().min(1) }),
]);
const base = { id, holdMs: z.number().int().min(0).max(10000).optional() };
const target = targetSchema;
export const capturePlanSchema = z
  .strictObject({
    url,
    ready: target.optional(),
    viewport: z
      .strictObject({
        width: z.number().int().min(640).max(1920),
        height: z.number().int().min(480).max(1080),
      })
      .optional(),
    allowedOrigins: z.array(url).max(10).optional(),
    redact: z
      .array(
        z
          .string()
          .min(1)
          .refine(
            (s) => !/[{}@]/.test(s),
            'Use a CSS selector, not a stylesheet.',
          ),
      )
      .max(30)
      .optional(),
    storageState: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Optional authentication-state JSON path inside the workspace. The server does not perform login.',
      ),
    typingDelayMs: z.number().int().min(0).max(200).optional(),
    timeoutMs: z.number().int().min(5000).max(180000).optional(),
    steps: z
      .array(
        z.discriminatedUnion('action', [
          z.strictObject({ ...base, action: z.literal('click'), target }),
          z.strictObject({
            ...base,
            action: z.literal('fill'),
            target,
            value: z.string().max(2000),
          }),
          z.strictObject({
            ...base,
            action: z.literal('select'),
            target,
            value: z.string(),
          }),
          z.strictObject({
            ...base,
            action: z.literal('press'),
            target,
            key: z.string().max(100),
          }),
          z.strictObject({ ...base, action: z.literal('scroll'), target }),
          z.strictObject({
            ...base,
            action: z.literal('goto'),
            url: z.string().min(1),
          }),
          z.strictObject({
            ...base,
            action: z.literal('wait'),
            durationMs: z.number().int().min(0).max(10000),
          }),
          z.strictObject({
            ...base,
            action: z.literal('expect'),
            target,
            text: z.string().optional(),
          }),
          z.strictObject({
            ...base,
            action: z.literal('mark'),
            target: target.optional(),
          }),
        ]),
      )
      .min(1)
      .max(80),
  })
  .superRefine((plan, ctx) => {
    const ids = new Set();
    plan.steps.forEach((step, i) => {
      if (ids.has(step.id))
        ctx.addIssue({
          code: 'custom',
          path: ['steps', i, 'id'],
          message: 'Step IDs must be unique.',
        });
      ids.add(step.id);
    });
    if (!plan.steps.some((s) => s.action === 'expect'))
      ctx.addIssue({
        code: 'custom',
        path: ['steps'],
        message: 'Assert at least one application outcome.',
      });
    const changesState = new Set(['click', 'fill', 'select', 'press', 'goto']);
    let lastChange = -1;
    let lastExpectation = -1;
    plan.steps.forEach((step, index) => {
      if (changesState.has(step.action)) lastChange = index;
      if (step.action === 'expect') lastExpectation = index;
    });
    if (lastChange >= 0 && lastExpectation < lastChange)
      ctx.addIssue({
        code: 'custom',
        path: ['steps'],
        message: 'Assert an application outcome after the final state-changing action.',
      });
    const allowed = new Set<string>();
    for (const value of [plan.url, ...(plan.allowedOrigins ?? [])]) {
      try {
        allowed.add(new URL(value).origin);
      } catch {
        /* The URL schema reports malformed inputs. */
      }
    }
    plan.steps.forEach((step, i) => {
      if (step.action === 'goto') {
        try {
          const u = new URL(step.url, plan.url);
          if (
            !['http:', 'https:'].includes(u.protocol) ||
            u.username ||
            u.password ||
            !allowed.has(u.origin)
          )
            throw new Error();
        } catch {
          ctx.addIssue({
            code: 'custom',
            path: ['steps', i, 'url'],
            message:
              'Navigation must stay on an explicitly allowed HTTP(S) origin.',
          });
        }
      }
    });
  });
