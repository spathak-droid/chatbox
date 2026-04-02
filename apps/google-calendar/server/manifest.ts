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
    {
      name: 'calendar_delete_event',
      description: 'Delete an event from the user\'s Google Calendar by its event ID.',
      parameters: [
        {
          name: 'eventId',
          type: 'string',
          description: 'The Google Calendar event ID to delete. Get this from calendar_list_events or calendar_search_events.',
          required: true,
        },
      ],
    },
    {
      name: 'calendar_update_event',
      description: 'Update an existing event on the user\'s Google Calendar. Only provide fields you want to change.',
      parameters: [
        {
          name: 'eventId',
          type: 'string',
          description: 'The Google Calendar event ID to update.',
          required: true,
        },
        {
          name: 'summary',
          type: 'string',
          description: 'New title for the event',
          required: false,
        },
        {
          name: 'startTime',
          type: 'string',
          description: 'New start time in ISO 8601 format',
          required: false,
        },
        {
          name: 'endTime',
          type: 'string',
          description: 'New end time in ISO 8601 format',
          required: false,
        },
        {
          name: 'description',
          type: 'string',
          description: 'New description for the event',
          required: false,
        },
      ],
    },
    {
      name: 'calendar_search_events',
      description: 'Search for events on the user\'s Google Calendar by keyword. Returns matching events with their IDs (useful for finding events to delete or update).',
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'Search term to find events (matches title, description, etc.)',
          required: true,
        },
        {
          name: 'maxResults',
          type: 'number',
          description: 'Maximum number of results (1-50)',
          required: false,
        },
      ],
    },
  ],
}
