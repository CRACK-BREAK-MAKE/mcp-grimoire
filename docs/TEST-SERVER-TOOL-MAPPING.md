# Test Server Tool Mapping

**Purpose**: Map each test MCP server to its available tools for query construction in E2E tests

**Pattern**: Queries must reference actual tool names to ensure correct spell matching

**Example Success**: `"create project and add task using project management"` → matches `create_project`, `add_task` tools

---

## Server Tool Registry

### 1. Basic Auth HTTP/SSE (Project Management)

**Server**: `servers.basic_auth.http_server` / `servers.basic_auth.sse_server`
**Port**: 8017 (HTTP), 8018 (SSE)
**Domain**: Project Management
**Tools**:

- `create_project` - Create a new project with tasks and milestones
- `add_task` - Add a task to an existing project
- `get_project_status` - Get current status and progress of a project

**Query Pattern**: `"create project and add task to get project status"`

---

### 2. API Key HTTP (Weather Service)

**Server**: `servers.api_key.http_server`
**Port**: 8019
**Domain**: Weather API
**Tools**:

- `get_current_weather` - Get current weather for a city
- `get_forecast` - Get weather forecast for upcoming days
- `get_weather_alerts` - Get weather alerts and warnings

**Query Pattern**: `"get current weather forecast and weather alerts for my city"`

---

### 3. API Key SSE (News Aggregator)

**Server**: `servers.api_key.sse_server`
**Port**: 8020
**Domain**: News Aggregator
**Tools**:

- `get_latest_news` - Get latest news articles by category
- `search_news` - Search news articles by keyword and date
- `get_trending_topics` - Get trending topics and top stories

**Query Pattern**: `"get latest news search news and get trending topics"`

---

### 4. Security Keys HTTP (Data Analytics)

**Server**: `servers.security_keys.http_server`
**Port**: 8021
**Domain**: Data Analytics / Database Operations
**Tools**:

- `analyze_dataset` - Analyze dataset with various analysis types
- `get_table_schema` - Get database table schema and structure
- `export_query_results` - Export query results to various formats

**Query Pattern**: `"analyze dataset get table schema and export query results"`

---

### 5. Security Keys SSE (Data Analytics)

**Server**: `servers.security_keys.sse_server`
**Port**: 8022
**Domain**: Data Analytics / Database Operations
**Tools**: Same as Security Keys HTTP

- `analyze_dataset`
- `get_table_schema`
- `export_query_results`

**Query Pattern**: `"use sse to analyze dataset export query get table schema"`

---

### 6. No Auth HTTP (System Monitor)

**Server**: `servers.no_auth.http_server`
**Port**: 8023
**Domain**: System Monitoring
**Tools**:

- `get_cpu_usage` - Get CPU usage statistics and metrics
- `get_memory_stats` - Get memory usage and available RAM
- `get_disk_usage` - Get disk space usage by path

**Query Pattern**: `"get cpu usage memory stats and disk usage for system monitoring"`

---

### 7. No Auth SSE (System Monitor)

**Server**: `servers.no_auth.sse_server`
**Port**: 8024
**Domain**: System Monitoring
**Tools**: Same as No Auth HTTP

- `get_cpu_usage`
- `get_memory_stats`
- `get_disk_usage`

**Query Pattern**: `"use sse to monitor cpu memory disk usage statistics"`

---

### 8. OAuth2 HTTP (Email Service)

**Server**: `servers.oauth2.http_server`
**Port**: 8025
**Domain**: Email Management
**Tools**:

- `send_email` - Send email to recipients with subject and body
- `get_inbox` - Get emails from inbox folder
- `search_emails` - Search emails by query across folders

**Query Pattern**: `"send email get inbox and search emails using oauth2"`

---

### 9. CAP.js stdio (CDS Model Documentation)

**Server**: `@cap-js/mcp-server` (stdio)
**Command**: `npx -y @cap-js/mcp-server`
**Domain**: SAP CAP/CDS Development
**Tools**:

- `search_model` - Search CDS model definitions and entities
- `search_docs` - Search CAP/CDS documentation

**Query Pattern**: `"search model and docs for cds cap entities"`

---

### 10. UI5 MCP stdio (UI5 Development)

**Server**: `@ui5/mcp-server` (stdio)
**Command**: `npx -y @ui5/mcp-server`
**Domain**: SAPUI5/OpenUI5 Development
**Tools**:

- `get_guidelines` - Get UI5 development guidelines
- `get_api_reference` - Search UI5 API reference
- `get_project_info` - Get UI5 project information
- `get_version_info` - Get UI5 framework version info
- `get_integration_cards_guidelines` - Get Integration Cards guidelines
- `get_typescript_conversion_guidelines` - Get TypeScript conversion guidelines

**Query Pattern**: `"get ui5 guidelines api reference and project info for sapui5"`

---

## Query Construction Guidelines

### ✅ Good Query Patterns

1. **Reference multiple tool names**: `"create project and add task"` (matches create_project, add_task)
2. **Use natural language variations**: `"get weather forecast"` (matches get_forecast)
3. **Include domain context**: `"use sse to monitor cpu usage"` (adds sse context + tool name)
4. **Avoid generic terms**: Don't use just "test", "server", "gateway" - too generic

### ❌ Bad Query Patterns

1. **Too generic**: `"help me"`, `"test"`, `"server"` - matches everything
2. **No tool references**: `"gateway-e2e-test"` - doesn't match tool keywords
3. **Ambiguous**: `"database"` - matches multiple spells (postgres, mysql, analytics)

### Key Insight from Successful Test

The query `"create project and add task using project management"` worked because:

1. **create project** → matches keyword `create_project` (tool name)
2. **add task** → matches keyword `add_task` (tool name)
3. **project management** → reinforces domain context
4. Result: Confidence 1.000, correct spell spawned

---

## Testing Pattern

```typescript
// 1. Start server and create spell
const server = await startServerAndCreateSpell(config);
await waitForSpellIndexing();

// 2. Start gateway
const gateway = new GrimoireServer();
await gateway.start();

// 3. Call resolve_intent with tool-name-based query
const query = 'create project and add task to get project status'; // References tool names
const response = await gateway.handleResolveIntentCall({ query });

// 4. Verify correct spell spawned
expect(response.status).toBe('activated');
expect(response.spell.name).toBe(expectedSpellName);
expect(response.tools).toContain('create_project');
expect(response.tools).toContain('add_task');
```

---

## Port Allocation

- **CLI Tests**: 8000-8008 (reserved for CLI integration tests)
- **Gateway Tests**: 8017-8050 (available for gateway E2E tests)

---

## References

- Gateway Integration Test Plan: `docs/GATEWAY-INTEGRATION-TEST-PLAN.md`
- Successful Simple Test: `src/presentation/__tests__/gateway-basic-http-simple.e2e.test.ts`
- Server Source Code: `tests/fastmcp/src/servers/`
