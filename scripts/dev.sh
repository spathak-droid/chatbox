#!/bin/bash
# scripts/dev.sh — Start all ChatBridge services

echo "Starting ChatBridge development environment..."
echo ""

# Start app backends in background
(cd apps/math-practice && pnpm dev) &
(cd apps/google-calendar && pnpm dev) &
(cd apps/chess && pnpm dev) &
(cd apps/flashcards && pnpm dev) &

# Wait for apps to start
sleep 2

# Start platform backend
(cd server && pnpm dev) &

# Wait for backend
sleep 2

# Start frontend
pnpm run dev:web &

echo ""
echo "========================================="
echo "  ChatBridge is running!"
echo "========================================="
echo ""
echo "  Frontend:         http://localhost:1212"
echo "  Platform Backend: http://localhost:3000"
echo "  Math Practice:    http://localhost:3001"
echo "  Google Calendar:  http://localhost:3002"
echo "  Chess:            http://localhost:3003"
echo "  Flashcards:       http://localhost:3004"
echo ""
echo "  Press Ctrl+C to stop all services"
echo ""

wait
