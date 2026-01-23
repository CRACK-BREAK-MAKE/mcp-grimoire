# Local Testing Guide

This guide helps you test MCP Grimoire locally before publishing.

## Environment Variables

Grimoire supports the following environment variables:

| Variable         | Description                                         | Default        | Example        |
| ---------------- | --------------------------------------------------- | -------------- | -------------- |
| `GRIMOIRE_DEBUG` | Enable verbose debug logging                        | `false`        | `"true"`       |
| `GRIMOIRE_HOME`  | Override spell storage directory                    | `~/.grimoire`  | `/custom/path` |
| `HOME`           | User home directory (used if GRIMOIRE_HOME not set) | System default | -              |

**Usage in configuration**:

```json
{
  "mcpServers": {
    "grimoire-local": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "GRIMOIRE_DEBUG": "true",
        "GRIMOIRE_HOME": "/custom/spell/directory"
      }
    }
  }
}
```

## Prerequisites

- Built project: `pnpm run build`
- A test MCP server to create a spell for (e.g., `@modelcontextprotocol/server-everything`)

## 1. Install a Test MCP Server

Install the official MCP test server globally:

```bash
npm install -g @modelcontextprotocol/server-everything
```

This server provides various test tools and is perfect for local testing.

## 2. Test Spell Creation (Interactive Mode)

Run the CLI using Node directly (not via npx from npm):

```bash
# From your project root
node dist/cli.js create
```

Follow the wizard to create a test spell:

```
Spell name: test-everything
Transport: stdio
Command: npx
Args: -y @modelcontextprotocol/server-everything
Enable probing: Yes
```

The spell will be saved to `~/.grimoire/test-everything.spell.yaml`

**Verify it was created**:

```bash
node dist/cli.js list
```

## 3. Test MCP Server Configuration

### Option A: Test with Claude Desktop

Edit your Claude config at:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "grimoire-local": {
      "command": "node",
      "args": ["/Users/I504180/workspace/personal/ai/mcp-grimoire/dist/index.js"],
      "env": {
        "GRIMOIRE_DEBUG": "true"
      }
    }
  }
}
```

**Important**: Replace `/Users/I504180/workspace/personal/ai/mcp-grimoire` with your actual project path!

### Option B: Test with VS Code Copilot

Create `.vscode/mcp.json` in any test project:

```json
{
  "mcpServers": {
    "grimoire-local": {
      "command": "node",
      "args": ["/Users/I504180/workspace/personal/ai/mcp-grimoire/dist/index.js"],
      "env": {
        "GRIMOIRE_DEBUG": "true"
      }
    }
  }
}
```

## 4. Test the Full Flow

### Step 1: Restart your AI agent (Claude Desktop or VS Code)

This loads the local Grimoire MCP server.

### Step 2: Check logs

**For Claude Desktop**:

- macOS: `~/Library/Logs/Claude/mcp*.log`

Look for:

```
[GRIMOIRE] Starting MCP server...
[GRIMOIRE] Loaded spells: ["test-everything"]
```

**For VS Code**:

- Open Output panel → Select "GitHub Copilot" or "MCP" channel

### Step 3: Test in the AI agent

Ask a question that should trigger your test spell:

```
Can you list all available tools from the test server?
```

Watch for:

1. AI calls `resolve_intent` with your query
2. Grimoire spawns the test-everything server
3. New tools appear via `tools/list_changed` notification
4. AI can now use those tools

### Step 4: Test automatic cleanup

Continue chatting for 5+ turns WITHOUT mentioning the test server tools.

After 5 turns, check logs - you should see:

```
[LIFECYCLE] Killing inactive spell: test-everything
[LIFECYCLE] 5 turns since last use
```

## 5. Debug Common Issues

### Issue: "Spell not created" during wizard

**Cause**: Probe failed - server couldn't be reached

**Fix**:

1. Verify the server command works directly: `npx -y @modelcontextprotocol/server-everything`
2. Check if authentication is needed
3. Disable probing if testing without server access: Edit the wizard or manually create YAML

### Issue: "No tools appearing in AI agent"

**Cause**: Grimoire not starting or spells not loaded

**Fix**:

1. Check logs for errors
2. Verify `GRIMOIRE_DEBUG=true` is set
3. Ensure path in mcp.json is absolute and correct
4. Try running directly: `node dist/index.js` (should wait for stdin)

### Issue: "Tools appear but AI can't call them"

**Cause**: Server crashed after spawning

**Fix**:

1. Check if spell server command works standalone
2. Verify authentication is correctly configured in spell YAML
3. Check spell server logs (if it writes any)

## 6. Test CLI Commands

Test all CLI commands locally:

```bash
# List spells
node dist/cli.js list

# Validate a spell
node dist/cli.js validate ~/.grimoire/test-everything.spell.yaml

# Show help
node dist/cli.js --help

# Create spell (interactive)
node dist/cli.js create

# Create spell (advanced CLI mode - power users)
node dist/cli.js create \
  --name test-manual \
  --transport stdio \
  --command npx \
  --args "-y,@modelcontextprotocol/server-everything" \
  --probe
```

## 7. Clean Up Test Environment

After testing, clean up:

```bash
# Remove test spell
rm ~/.grimoire/test-everything.spell.yaml

# Remove local config from Claude Desktop
# Edit: ~/Library/Application Support/Claude/claude_desktop_config.json
# Remove the "grimoire-local" entry

# Or remove VS Code config
rm .vscode/mcp.json
```

## 8. Verify Before Publishing

Before running `pnpm publish`, ensure:

✅ All tests pass: `pnpm test`
✅ Linting passes: `pnpm lint`
✅ Type checking passes: `pnpm type-check`
✅ Local testing successful (this guide)
✅ README is up to date
✅ Version bumped in package.json

## Quick Test Script

For rapid iteration, create a test script:

```bash
#!/bin/bash
# test-local.sh

set -e

echo "🔨 Building..."
pnpm run build

echo "📋 Listing spells..."
node dist/cli.js list

echo "🧪 Testing MCP server mode..."
echo "test" | node dist/index.js &
PID=$!
sleep 2
kill $PID 2>/dev/null || true

echo "✅ Local build working!"
```

Make it executable: `chmod +x test-local.sh`
Run: `./test-local.sh`
