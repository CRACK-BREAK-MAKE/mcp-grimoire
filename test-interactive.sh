#!/bin/bash
# Test interactive create command

echo "Testing interactive spell creation..."
echo ""
echo "Enter inputs:"
echo "test-interactive"
echo "1 (stdio)"
echo "npx"
echo "-y @modelcontextprotocol/server-example"
echo "n (no probe)"
echo ""

node dist/cli.js create
