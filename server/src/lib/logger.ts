const isProduction = process.env.NODE_ENV === 'production'

function formatLog(level: string, msg: string, data?: Record<string, unknown>): string {
  if (isProduction) {
    return JSON.stringify({ level, msg, ...(data || {}), ts: new Date().toISOString() })
  }
  const prefix = `[${level.toUpperCase()}]`
  const dataStr = data ? ` ${JSON.stringify(data)}` : ''
  return `${prefix} ${msg}${dataStr}`
}

export const log = {
  info(msg: string, data?: Record<string, unknown>) {
    console.log(formatLog('info', msg, data))
  },
  warn(msg: string, data?: Record<string, unknown>) {
    console.warn(formatLog('warn', msg, data))
  },
  error(msg: string, data?: Record<string, unknown>) {
    console.error(formatLog('error', msg, data))
  },
}
