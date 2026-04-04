import type { AppManifest } from '../../../shared/types/app-manifest.js'

const baseUrl = process.env.MATH_PRACTICE_URL || 'http://localhost:3001'

export const manifest: AppManifest = {
  id: 'math-practice',
  name: 'Math Practice',
  description: 'Interactive math practice with multiple topics and difficulty levels. Supports addition, subtraction, multiplication, division, and algebra.',
  category: 'education',
  authType: 'none',
  baseUrl,
  trustTier: 'internal' as const,
  iframeUrl: `${baseUrl}/app`,
  permissions: [],
  activationKeywords: ['math', 'practice', 'problems', 'addition', 'algebra', 'subtract', 'multiply', 'divid'],
  tools: [
    {
      name: 'math_start_session',
      description: 'Start a math practice session. Call this when the user wants to practice math, do math problems, or work on arithmetic/algebra. Do NOT call chess or flashcard tools when the user wants math.',
      parameters: [
        {
          name: 'topic',
          type: 'string',
          description: 'Math topic to practice. Defaults to addition if not specified. Pick one based on what the student asks for.',
          required: false,
          enum: ['addition', 'subtraction', 'multiplication', 'division', 'algebra'],
        },
        {
          name: 'difficulty',
          type: 'string',
          description: 'Difficulty level. Defaults to easy if not specified.',
          required: false,
          enum: ['easy', 'medium', 'hard'],
        },
        {
          name: 'numProblems',
          type: 'number',
          description: 'Number of problems in the session (1-20)',
          required: false,
        },
      ],
    },
    {
      name: 'math_submit_answer',
      description: 'Submit an answer to the current math problem.',
      parameters: [
        {
          name: 'answer',
          type: 'number',
          description: 'The numeric answer to the current problem',
          required: true,
        },
      ],
    },
    {
      name: 'math_get_hint',
      description: 'Get a hint for the current math problem.',
      parameters: [],
    },
    {
      name: 'math_finish_session',
      description: 'End the current math practice session early and get results.',
      parameters: [],
    },
  ],
}
