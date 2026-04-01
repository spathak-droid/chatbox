import type { AppManifest } from '../../../shared/types/app-manifest.js'

const baseUrl = process.env.CALENDAR_APP_URL || 'http://localhost:3002'

export const manifest: AppManifest = {
  id: 'google-calendar',
  name: 'Google Calendar Study Planner',
  description: 'Connect your Google Calendar to view upcoming events, create study blocks, and generate study plans. Requires Google account authorization.',
  category: 'productivity',
  authType: 'oauth2',
  baseUrl,
  iframeUrl: `${baseUrl}/app`,
  permissions: ['calendar.events'],
  tools: [
    {
      name: 'calendar_check_connection',
      description: 'Check if the user has connected their Google Calendar account.',
      parameters: [],
    },
    {
      name: 'calendar_start_connect',
      description: 'Start the Google OAuth flow to connect the user\'s Google Calendar. Returns a URL the user should open to authorize.',
      parameters: [],
    },
    {
      name: 'calendar_list_events',
      description: 'List upcoming events from the user\'s Google Calendar.',
      parameters: [
        {
          name: 'maxResults',
          type: 'number',
          description: 'Maximum number of events to return (1-50)',
          required: false,
        },
        {
          name: 'timeMin',
          type: 'string',
          description: 'Start of time range in ISO 8601 format (defaults to now)',
          required: false,
        },
        {
          name: 'timeMax',
          type: 'string',
          description: 'End of time range in ISO 8601 format (defaults to 7 days from now)',
          required: false,
        },
      ],
    },
    {
      name: 'calendar_create_study_block',
      description: 'Create a single study block event on the user\'s Google Calendar.',
      parameters: [
        {
          name: 'subject',
          type: 'string',
          description: 'The subject or topic to study',
          required: true,
        },
        {
          name: 'startTime',
          type: 'string',
          description: 'Start time in ISO 8601 format',
          required: true,
        },
        {
          name: 'endTime',
          type: 'string',
          description: 'End time in ISO 8601 format',
          required: true,
        },
        {
          name: 'description',
          type: 'string',
          description: 'Optional description or notes for the study block',
          required: false,
        },
      ],
    },
    {
      name: 'calendar_create_study_plan',
      description: 'Create multiple study block events on the user\'s Google Calendar based on a study plan.',
      parameters: [
        {
          name: 'blocks',
          type: 'array',
          description: 'Array of study blocks, each with subject, startTime, endTime, and optional description',
          required: true,
        },
      ],
    },
  ],
}
