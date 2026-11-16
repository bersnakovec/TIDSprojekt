// JSON schema of the model's answer. It is sent to the Claude API as a
// structured-output format, so the model can only answer with JSON of this
// shape. Range rules (rating 1–5, quantity 1–3 …) are checked again in
// models.js, because the API passes them to the model only as hints.

import { z } from 'zod';

export const DeckAdviceSchema = z.object({
  archetype: z.string().describe('Short archetype label, e.g. "Mind/Order midrange"'),
  summary: z.string().describe('2–3 sentence overview of the deck'),
  gamePlan: z.string().describe('How the deck wins, early / mid / late game'),
  difficulty: z.enum(['easy', 'medium', 'hard']).describe('How hard the deck is to pilot'),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  keyCards: z.array(z.object({
    name: z.string().describe('Exact card name from the deck'),
    role: z.string().describe('Why the card matters in this deck'),
  })),
  swaps: z.array(z.object({
    remove: z.string().describe('Exact name of a main-deck card to take out'),
    add: z.string().describe('Exact name of a card from the candidate pool'),
    quantity: z.number().int().min(1).max(3),
    reason: z.string(),
  })),
  mulligan: z.array(z.string()).describe('Concrete mulligan tips'),
  matchups: z.array(z.object({
    opponent: z.string().describe('Opposing archetype'),
    rating: z.number().int().min(1).max(5),
    tip: z.string(),
  })),
  budgetComment: z.string(),
});
