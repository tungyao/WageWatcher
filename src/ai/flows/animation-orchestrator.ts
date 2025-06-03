'use server';

/**
 * @fileOverview An AI agent for orchestrating celebratory animations based on earnings milestones.
 *
 * - shouldAnimate - A function that determines whether to trigger an animation.
 * - AnimationOrchestratorInput - The input type for the shouldAnimate function.
 * - AnimationOrchestratorOutput - The return type for the shouldAnimate function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnimationOrchestratorInputSchema = z.object({
  currentEarnings: z.number().describe('The current total earnings of the user.'),
  lastAnimationTimestamp: z
    .number()
    .describe('The timestamp of the last animation triggered.'),
  threshold: z
    .number()
    .default(100)
    .describe('The earnings threshold to trigger an animation (default: 100).'),
});
export type AnimationOrchestratorInput = z.infer<typeof AnimationOrchestratorInputSchema>;

const AnimationOrchestratorOutputSchema = z.object({
  triggerAnimation: z
    .boolean()
    .describe('Whether to trigger the celebratory animation or not.'),
  reason: z.string().describe('The reason for triggering or not triggering the animation.'),
});
export type AnimationOrchestratorOutput = z.infer<typeof AnimationOrchestratorOutputSchema>;

export async function shouldAnimate(input: AnimationOrchestratorInput): Promise<AnimationOrchestratorOutput> {
  return animationOrchestratorFlow(input);
}

const prompt = ai.definePrompt({
  name: 'animationOrchestratorPrompt',
  input: {schema: AnimationOrchestratorInputSchema},
  output: {schema: AnimationOrchestratorOutputSchema},
  prompt: `You are an AI animation orchestrator that helps determine whether to trigger celebratory animations for a user based on their earnings.

You should consider the following factors:

- **currentEarnings**: The user's current total earnings.
- **lastAnimationTimestamp**: The timestamp of the last animation triggered.
- **threshold**: The earnings threshold to trigger an animation (default: 100).

Your goal is to provide a visually rewarding experience without causing visual fatigue.

Determine whether to trigger the animation based on if the current earnings is a multiple of the threshold and if sufficient time has passed since the last animation.

Return a JSON object with 'triggerAnimation' set to true or false, and a 'reason' explaining your decision.

Here's the input data:
currentEarnings: {{{currentEarnings}}}
lastAnimationTimestamp: {{{lastAnimationTimestamp}}}
threshold: {{{threshold}}}

Ensure that you return a valid JSON object.
`,
});

const animationOrchestratorFlow = ai.defineFlow(
  {
    name: 'animationOrchestratorFlow',
    inputSchema: AnimationOrchestratorInputSchema,
    outputSchema: AnimationOrchestratorOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
