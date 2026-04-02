import { useState } from 'react'
import {
  Button,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:3000/api'

interface AuthUser {
  id: string
  email: string
  displayName: string
  role: string
}

interface ChatBridgeAuthProps {
  onAuth: (token: string, user: AuthUser) => void
}

export function ChatBridgeAuth({ onAuth }: ChatBridgeAuthProps) {
  const [activeTab, setActiveTab] = useState<string | null>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<string | null>('student')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }
      onAuth(data.token, data.user)
    } catch (err) {
      setError('Network error. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Registration failed')
        return
      }
      onAuth(data.token, data.user)
    } catch (err) {
      setError('Network error. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Stack align="center" justify="center" style={{ minHeight: '100vh', background: 'var(--mantine-color-dark-8)' }}>
      <Paper shadow="md" p="xl" radius="md" w={400} style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Stack gap="md">
          <Title order={2} ta="center" c="white">
            TutorMeAI
          </Title>
          <Text size="sm" ta="center" c="dimmed">
            Sign in to start learning
          </Text>

          {error && (
            <Text size="sm" c="red" ta="center">
              {error}
            </Text>
          )}

          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List grow>
              <Tabs.Tab value="login">Login</Tabs.Tab>
              <Tabs.Tab value="register">Register</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="login" pt="md">
              <Stack gap="sm">
                <TextInput
                  label="Email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
                <PasswordInput
                  label="Password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
                <Button fullWidth loading={loading} onClick={handleLogin}>
                  Sign In
                </Button>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="register" pt="md">
              <Stack gap="sm">
                <TextInput
                  label="Display Name"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.currentTarget.value)}
                />
                <TextInput
                  label="Email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                />
                <PasswordInput
                  label="Password"
                  placeholder="Choose a password"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                />
                <Select
                  label="Role"
                  data={[
                    { value: 'student', label: 'Student' },
                    { value: 'teacher', label: 'Teacher' },
                  ]}
                  value={role}
                  onChange={setRole}
                />
                <Button fullWidth loading={loading} onClick={handleRegister}>
                  Create Account
                </Button>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Paper>
    </Stack>
  )
}
