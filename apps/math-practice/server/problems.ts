export interface MathProblem {
  question: string
  answer: number
  hint: string
}

type Topic = 'addition' | 'subtraction' | 'multiplication' | 'division' | 'algebra'
type Difficulty = 'easy' | 'medium' | 'hard'

function getRange(difficulty: Difficulty): [number, number] {
  switch (difficulty) {
    case 'easy': return [1, 12]
    case 'medium': return [1, 50]
    case 'hard': return [1, 100]
  }
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function generateOne(topic: Topic, difficulty: Difficulty): MathProblem {
  const [min, max] = getRange(difficulty)

  switch (topic) {
    case 'addition': {
      const a = randInt(min, max)
      const b = randInt(min, max)
      return {
        question: `${a} + ${b} = ?`,
        answer: a + b,
        hint: `Try breaking it down: ${a} + ${Math.floor(b / 2)} = ${a + Math.floor(b / 2)}, then add ${b - Math.floor(b / 2)} more.`,
      }
    }
    case 'subtraction': {
      const b = randInt(min, max)
      const a = randInt(b, max + b) // ensure non-negative result
      return {
        question: `${a} - ${b} = ?`,
        answer: a - b,
        hint: `Think of it as: what number plus ${b} equals ${a}?`,
      }
    }
    case 'multiplication': {
      const a = randInt(min, Math.min(max, difficulty === 'easy' ? 12 : 25))
      const b = randInt(min, Math.min(max, difficulty === 'easy' ? 12 : 25))
      return {
        question: `${a} × ${b} = ?`,
        answer: a * b,
        hint: `Try ${a} × ${Math.floor(b / 2)} = ${a * Math.floor(b / 2)}, then double it${b % 2 !== 0 ? ` and add ${a}` : ''}.`,
      }
    }
    case 'division': {
      const b = randInt(Math.max(min, 2), Math.min(max, difficulty === 'easy' ? 12 : 25))
      const answer = randInt(min, Math.min(max, difficulty === 'easy' ? 12 : 25))
      const a = b * answer // ensure clean division
      return {
        question: `${a} ÷ ${b} = ?`,
        answer,
        hint: `Think: ${b} × ? = ${a}. Try multiplying ${b} by small numbers.`,
      }
    }
    case 'algebra': {
      const answer = randInt(min, max)
      const b = randInt(min, max)
      const op = Math.random() < 0.5 ? '+' : '-'
      const result = op === '+' ? answer + b : answer - b
      return {
        question: `x ${op} ${b} = ${result}. Solve for x.`,
        answer,
        hint: `To isolate x, ${op === '+' ? 'subtract' : 'add'} ${b} ${op === '+' ? 'from' : 'to'} both sides: x = ${result} ${op === '+' ? '-' : '+'} ${b}.`,
      }
    }
  }
}

export function generateProblems(topic: Topic, difficulty: Difficulty, count: number): MathProblem[] {
  const problems: MathProblem[] = []
  for (let i = 0; i < count; i++) {
    problems.push(generateOne(topic, difficulty))
  }
  return problems
}
