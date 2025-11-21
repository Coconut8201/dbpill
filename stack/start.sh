#!/bin/bash

# Start Backend
echo "Starting Backend..."
# You can set DATABASE_URL environment variable to override the default
# export DATABASE_URL="postgresql://user:password@localhost:5432/dbname?sslmode=disable"
cd stack/backend
go run main.go &
BACKEND_PID=$!

# Start Frontend
echo "Starting Frontend..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID" EXIT

wait
