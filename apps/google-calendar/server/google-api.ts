const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'

export interface CalendarEvent {
  id: string
  summary: string
  description?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  htmlLink?: string
}

export interface CalendarEventInput {
  summary: string
  description?: string
  start: { dateTime: string; timeZone?: string }
  end: { dateTime: string; timeZone?: string }
  colorId?: string
}

async function calendarFetch(
  accessToken: string,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${CALENDAR_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google Calendar API error ${res.status}: ${body}`)
  }
  return res
}

export async function listEvents(
  accessToken: string,
  params: { maxResults?: number; timeMin?: string; timeMax?: string } = {},
): Promise<CalendarEvent[]> {
  const now = new Date().toISOString()
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const query = new URLSearchParams({
    maxResults: String(params.maxResults || 10),
    timeMin: params.timeMin || now,
    timeMax: params.timeMax || weekFromNow,
    singleEvents: 'true',
    orderBy: 'startTime',
  })

  const res = await calendarFetch(accessToken, `/calendars/primary/events?${query}`)
  const data = await res.json()
  return (data.items || []) as CalendarEvent[]
}

export async function createEvent(
  accessToken: string,
  event: CalendarEventInput,
): Promise<CalendarEvent> {
  const res = await calendarFetch(accessToken, '/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(event),
  })
  return (await res.json()) as CalendarEvent
}
