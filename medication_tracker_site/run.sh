#!/bin/bash
echo "Building Medication Tracker Go Server..."

# Install dependencies if needed
go mod tidy

# Build the executable
go build -o medication_tracker server.go

if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi

echo "Build successful! Running server..."
echo
echo "Press Ctrl+C to stop the server"
echo

# Run the server
./medication_tracker 