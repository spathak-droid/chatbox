import type { AppResultEnvelope } from '../../../shared/types/app-session.js'
import { generateProblems, type MathProblem } from './problems.js'

interface SessionState {
  problems?: MathProblem[]
  currentIndex?: number
  correct?: number
  incorrect?: number
  wrongAnswers?: Array<{ question: string; yourAnswer: number; correctAnswer: number }>
  topic?: string
  difficulty?: string
  totalProblems?: number
  finished?: boolean
  [key: string]: unknown
}

export function handleTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionState: SessionState,
): AppResultEnvelope {
  switch (toolName) {
    case 'math_start_session':
      return handleStartSession(args, sessionState)
    case 'math_submit_answer':
      return handleSubmitAnswer(args, sessionState)
    case 'math_get_hint':
      return handleGetHint(sessionState)
    case 'math_finish_session':
      return handleFinishSession(sessionState)
    default:
      return { status: 'error', error: `Unknown tool: ${toolName}` }
  }
}

function handleStartSession(
  args: Record<string, unknown>,
  _sessionState: SessionState,
): AppResultEnvelope {
  const topic = (args.topic as string) || 'addition'
  const difficulty = (args.difficulty as string) || 'easy'
  const numProblems = Math.min(20, Math.max(1, (args.numProblems as number) || 5))

  const problems = generateProblems(
    topic as 'addition' | 'subtraction' | 'multiplication' | 'division' | 'algebra',
    difficulty as 'easy' | 'medium' | 'hard',
    numProblems,
  )

  const state: SessionState = {
    problems,
    currentIndex: 0,
    correct: 0,
    incorrect: 0,
    wrongAnswers: [],
    topic,
    difficulty,
    totalProblems: numProblems,
    finished: false,
  }

  return {
    status: 'ok',
    data: state as Record<string, unknown>,
    summary: `Started ${difficulty} ${topic} session with ${numProblems} problems. Problem 1: ${problems[0].question}`,
  }
}

function handleSubmitAnswer(
  args: Record<string, unknown>,
  sessionState: SessionState,
): AppResultEnvelope {
  if (!sessionState.problems || sessionState.finished) {
    return { status: 'error', error: 'No active session. Use math_start_session first.' }
  }

  const currentIndex = sessionState.currentIndex ?? 0
  const problem = sessionState.problems[currentIndex]

  if (!problem) {
    return { status: 'error', error: 'No more problems available.' }
  }

  const answer = Number(args.answer)
  const isCorrect = answer === problem.answer
  const correct = (sessionState.correct ?? 0) + (isCorrect ? 1 : 0)
  const incorrect = (sessionState.incorrect ?? 0) + (isCorrect ? 0 : 1)
  const wrongAnswers = [...(sessionState.wrongAnswers ?? [])]

  if (!isCorrect) {
    wrongAnswers.push({
      question: problem.question,
      yourAnswer: answer,
      correctAnswer: problem.answer,
    })
  }

  const nextIndex = currentIndex + 1
  const totalProblems = sessionState.totalProblems ?? sessionState.problems.length
  const finished = nextIndex >= totalProblems

  const patch: SessionState = {
    ...sessionState,
    currentIndex: nextIndex,
    correct,
    incorrect,
    wrongAnswers,
    finished,
  }

  let summary: string
  if (isCorrect) {
    summary = `Correct! ${problem.question} = ${problem.answer}.`
  } else {
    summary = `Incorrect. ${problem.question} = ${problem.answer} (you answered ${answer}).`
  }

  if (finished) {
    const accuracy = totalProblems > 0 ? Math.round((correct / totalProblems) * 100) : 0
    summary += ` Session complete! Score: ${correct}/${totalProblems} (${accuracy}%).`
    if (wrongAnswers.length > 0) {
      summary += ` Missed: ${wrongAnswers.map((w) => w.question).join('; ')}.`
    }
  } else {
    const nextProblem = sessionState.problems[nextIndex]
    summary += ` Problem ${nextIndex + 1} of ${totalProblems}: ${nextProblem.question}`
  }

  return {
    status: 'ok',
    data: patch as Record<string, unknown>,
    summary,
  }
}

function handleGetHint(sessionState: SessionState): AppResultEnvelope {
  if (!sessionState.problems || sessionState.finished) {
    return { status: 'error', error: 'No active session.' }
  }

  const currentIndex = sessionState.currentIndex ?? 0
  const problem = sessionState.problems[currentIndex]

  if (!problem) {
    return { status: 'error', error: 'No current problem.' }
  }

  return {
    status: 'ok',
    data: {},
    summary: `Hint: ${problem.hint}`,
  }
}

function handleFinishSession(sessionState: SessionState): AppResultEnvelope {
  if (!sessionState.problems) {
    return { status: 'error', error: 'No active session.' }
  }

  const correct = sessionState.correct ?? 0
  const totalAttempted = correct + (sessionState.incorrect ?? 0)
  const totalProblems = sessionState.totalProblems ?? sessionState.problems.length
  const accuracy = totalAttempted > 0 ? Math.round((correct / totalAttempted) * 100) : 0
  const wrongAnswers = sessionState.wrongAnswers ?? []

  const patch: SessionState = {
    ...sessionState,
    finished: true,
  }

  let summary = `Session finished! Score: ${correct}/${totalAttempted} answered (${accuracy}% accuracy). ${totalProblems - totalAttempted} problems skipped.`
  if (wrongAnswers.length > 0) {
    summary += ` Wrong answers: ${wrongAnswers.map((w) => `${w.question} (answered ${w.yourAnswer}, correct: ${w.correctAnswer})`).join('; ')}.`
  }

  return {
    status: 'ok',
    data: patch as Record<string, unknown>,
    summary,
  }
}
