import { Queue, Worker } from 'bullmq'
import type { Response } from 'express'
import { config } from '../config.js'
import { streamChatWithTools } from '../chat/openrouter.js'

interface LlmJobData {
  jobId: string
  conversationId: string
  userId: string
  messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: any[] }>
  authToken: string
  timezone?: string
}

// Local map: jobId -> Express Response (can't serialize through Redis)
const responseMap = new Map<string, Response>()

let queue: Queue | null = null
let worker: Worker | null = null
let initialized = false

export function isQueueEnabled(): boolean {
  return initialized && queue !== null
}

export async function initQueue(): Promise<void> {
  if (!config.redisUrl) {
    console.log('[Queue] No REDIS_URL set — running without queue (direct execution)')
    return
  }

  try {
    const connection = { url: config.redisUrl }

    queue = new Queue('llm-requests', { connection })

    worker = new Worker(
      'llm-requests',
      async (job) => {
        const data = job.data as LlmJobData
        const res = responseMap.get(data.jobId)

        if (!res || res.writableEnded) {
          responseMap.delete(data.jobId)
          console.warn(`[Queue] Response gone for job ${data.jobId}, skipping`)
          return
        }

        try {
          await streamChatWithTools(
            data.messages,
            data.conversationId,
            data.userId,
            res,
            data.authToken,
            data.timezone,
          )
        } finally {
          responseMap.delete(data.jobId)
        }
      },
      {
        connection,
        concurrency: config.queueConcurrency,
      },
    )

    worker.on('failed', (job, err) => {
      console.error(`[Queue] Job ${job?.id} failed:`, err.message)
      if (job) {
        const data = job.data as LlmJobData
        const res = responseMap.get(data.jobId)
        if (res && !res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'error', error: 'Request timed out or failed' })}\n\n`)
          res.write('data: [DONE]\n\n')
          res.end()
        }
        responseMap.delete(data.jobId)
      }
    })

    // Verify connection
    await queue.waitUntilReady()
    initialized = true
    console.log(`[Queue] Connected to Redis, concurrency: ${config.queueConcurrency}`)
  } catch (err) {
    console.warn('[Queue] Failed to connect to Redis:', (err as Error).message)
    console.warn('[Queue] Falling back to direct execution')
    queue = null
    worker = null
  }
}

export async function enqueueChat(
  jobId: string,
  res: Response,
  data: Omit<LlmJobData, 'jobId'>,
): Promise<void> {
  if (!queue) {
    // Fallback: direct execution
    await streamChatWithTools(
      data.messages,
      data.conversationId,
      data.userId,
      res,
      data.authToken,
      data.timezone,
    )
    return
  }

  // Store response for worker to retrieve
  responseMap.set(jobId, res)

  // Clean up if client disconnects before job runs
  res.on('close', () => {
    responseMap.delete(jobId)
  })

  try {
    await queue.add('chat', { ...data, jobId }, {
      removeOnComplete: true,
      removeOnFail: 100,
      timeout: config.queueJobTimeout,
    })
  } catch (err) {
    // Queue add failed — fall back to direct execution
    responseMap.delete(jobId)
    console.warn('[Queue] Failed to enqueue, falling back to direct:', (err as Error).message)
    await streamChatWithTools(
      data.messages,
      data.conversationId,
      data.userId,
      res,
      data.authToken,
      data.timezone,
    )
  }
}

export async function shutdownQueue(): Promise<void> {
  if (worker) await worker.close()
  if (queue) await queue.close()
}
