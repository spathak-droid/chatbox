import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ChatBridgeAuth } from '@/components/chatbridge/ChatBridgeAuth'
import { ChatBridgeChat } from '@/components/chatbridge/ChatBridgeChat'

export const Route = createFileRoute('/chatbridge')({
  component: ChatBridgePage,
})

interface AuthUser {
  id: string
  email: string
  displayName: string
  role: string
}

function ChatBridgePage() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('chatbridge_token'))
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('chatbridge_user')
    return stored ? JSON.parse(stored) : null
  })

  const handleAuth = (newToken: string, newUser: AuthUser) => {
    setToken(newToken)
    setUser(newUser)
    localStorage.setItem('chatbridge_token', newToken)
    localStorage.setItem('chatbridge_user', JSON.stringify(newUser))
  }

  const handleLogout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('chatbridge_token')
    localStorage.removeItem('chatbridge_user')
  }

  if (!token || !user) {
    return <ChatBridgeAuth onAuth={handleAuth} />
  }

  return <ChatBridgeChat token={token} user={user} onLogout={handleLogout} />
}
