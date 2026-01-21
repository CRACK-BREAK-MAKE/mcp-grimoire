#!/bin/bash
# Stop server running on specified port

set -e

PORT="$1"

if [ -z "$PORT" ]; then
  echo "Usage: $0 <port>"
  exit 1
fi

# Find process using the port
PID=$(lsof -ti:"$PORT" 2>/dev/null || true)

if [ -z "$PID" ]; then
  echo "No process found on port $PORT"
  exit 0
fi

echo "Stopping process $PID on port $PORT"

# Try graceful termination first
kill -TERM "$PID" 2>/dev/null || true

# Wait up to 5 seconds for process to stop
for i in {1..10}; do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "Process stopped gracefully"
    exit 0
  fi
  sleep 0.5
done

# Force kill if still running
echo "Force killing process $PID"
kill -KILL "$PID" 2>/dev/null || true

echo "Process stopped"
