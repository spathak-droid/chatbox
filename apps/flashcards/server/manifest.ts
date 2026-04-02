import type { AppManifest } from '../../../shared/types/app-manifest.js'

const baseUrl = process.env.FLASHCARDS_URL || 'http://localhost:3004'

export const manifest: AppManifest = {
  id: 'flashcards',
  name: 'Flashcards',
  description: 'Interactive flashcard study tool with flip-card animations. AI generates card decks on any topic, and students review them with spaced repetition tracking.',
  category: 'education',
  authType: 'none',
  baseUrl,
  iframeUrl: `${baseUrl}/app`,
  permissions: [],
  tools: [
    {
      name: 'flashcards_start_deck',
      description: 'Start a new flashcard study session. Call this when the user wants to study, learn, review, or use flashcards on ANY topic. You MUST generate 5-10 cards with front (question) and back (answer). Do NOT call chess or math tools when the user wants flashcards.',
      parameters: [
        {
          name: 'topic',
          type: 'string',
          description: 'The topic or subject of this flashcard deck',
          required: true,
        },
        {
          name: 'cards',
          type: 'array',
          description: 'Array of card objects, each with "front" (question) and "back" (answer) string fields',
          required: true,
        },
      ],
    },
    {
      name: 'flashcards_reveal_card',
      description: 'Reveal the back (answer) of the current flashcard.',
      parameters: [],
    },
    {
      name: 'flashcards_mark_known',
      description: 'Mark the current card as known and advance to the next card.',
      parameters: [],
    },
    {
      name: 'flashcards_mark_unknown',
      description: 'Mark the current card as unknown (needs review) and advance to the next card.',
      parameters: [],
    },
    {
      name: 'flashcards_finish_deck',
      description: 'End the current flashcard session. Call when user wants to stop studying or switch to a different app.',
      parameters: [],
    },
  ],
}
