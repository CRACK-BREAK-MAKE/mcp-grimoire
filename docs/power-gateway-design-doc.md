# Grimoire Design Document
**Production-Grade MCP Orchestrator for Claude Desktop**

Version: 2.0  
Date: January 11, 2026

---

## Executive Summary

This document provides detailed design specifications for **Grimoire** - an intelligent MCP orchestrator that eliminates context overload through dynamic server activation and semantic intent resolution. The system achieves 94% token reduction while providing expert guidance through "steering injection."

**Key Design Goals:**
1. Minimal NPM package size (target: <15MB including embedding model)
2. Cross-platform support (macOS, Windows, Linux)
3. Production-grade reliability (99.9%+ uptime)
4. Sub-50ms intent resolution latency
5. Zero-configuration for end users

---

## Table of Contents

1. [Cross-Platform Path Management](#cross-platform-path-management)
2. [File Watching System](#file-watching-system)
3. [Embedding Storage Architecture](#embedding-storage-architecture)
4. [Architecture Decision Records](#architecture-decision-records)
5. [System Components](#system-components)
6. [Implementation Roadmap](#implementation-roadmap)

---

## Cross-Platform Path Management

### Problem Statement

Spell configurations (`.spell.yaml` files) must be stored in OS-appropriate locations:
- **macOS**: `~/.grimoire/`
- **Windows**: `%APPDATA%\Power\` (e.g., `C:\Users\USERNAME\AppData\Roaming\Power\`)
- **Linux**: `~/.config/power/` or `$XDG_CONFIG_HOME/power/`

Embedding cache must follow OS conventions:
- **macOS**: `~/Library/Caches/grimoire/`
- **Windows**: `%LOCALAPPDATA%\grimoire\Cache\`
- **Linux**: `~/.cache/grimoire/` or `$XDG_CACHE_HOME/grimoire/`

### Solution: Use `env-paths`

The env-paths package generates OS-specific paths for data files (like ~/.local/share/MyApp-nodejs on Linux, %LOCALAPPDATA%\MyApp-nodejs\Data on Windows), config files, cache, logs, and temp directories, following platform conventions.

**Implementation:**

```javascript
// lib/paths.js
import envPaths from 'env-paths';
import { mkdir } from 'fs/promises';
import { join } from 'path';

const paths = envPaths('grimoire', { suffix: '' });

export const PATHS = {
  // Spell configurations
  config: paths.config,           // ~/.config/grimoire (Linux)
                                   // %APPDATA%\grimoire (Windows)
                                   // ~/Library/Preferences/grimoire (macOS)
  
  // Embedding cache
  cache: paths.cache,              // ~/.cache/grimoire (Linux)
                                   // %LOCALAPPDATA%\grimoire\Cache (Windows)
                                   // ~/Library/Caches/grimoire (macOS)
  
  // Log files
  log: paths.log,                  // ~/.local/state/grimoire (Linux)
                                   // %LOCALAPPDATA%\grimoire\Log (Windows)
                                   // ~/Library/Logs/grimoire (macOS)
  
  // Computed paths
  get powerFiles() {
    return join(this.config, 'powers');
  },
  
  get embeddingCache() {
    return join(this.cache, 'embeddings.msgpack');
  }
};

// Ensure directories exist at startup
export async function ensureDirectories() {
  await mkdir(PATHS.config, { recursive: true });
  await mkdir(PATHS.powerFiles, { recursive: true });
  await mkdir(PATHS.cache, { recursive: true });
  await mkdir(PATHS.log, { recursive: true });
}
```

**Directory Structure:**

```
# macOS
~/Library/Preferences/grimoire/
  └── powers/
      ├── postgres.spell.yaml
      ├── stripe.spell.yaml
      └── github.spell.yaml

~/Library/Caches/grimoire/
  └── embeddings.msgpack

# Windows
C:\Users\USERNAME\AppData\Roaming\grimoire\
  └── powers\
      ├── postgres.spell.yaml
      ├── stripe.spell.yaml
      └── github.spell.yaml

C:\Users\USERNAME\AppData\Local\grimoire\Cache\
  └── embeddings.msgpack

# Linux
~/.config/grimoire/
  └── powers/
      ├── postgres.spell.yaml
      ├── stripe.spell.yaml
      └── github.spell.yaml

~/.cache/grimoire/
  └── embeddings.msgpack
```

**Package Dependencies:**
```json
{
  "dependencies": {
    "env-paths": "^3.0.0"  // 2.4KB (minified)
  }
}
```

---

## File Watching System

### Problem Statement

Grimoire must detect changes to `.spell.yaml` files in real-time to:
1. **Reload configurations** when files are modified
2. **Re-compute embeddings** for semantic search
3. **Invalidate cache** for changed powers
4. **Add new powers** when files are created
5. **Remove powers** when files are deleted

Requirements:
- **Cross-platform**: Work on macOS, Windows, Linux
- **Efficient**: Use native OS APIs (inotify, FSEvents, ReadDirectoryChangesW)
- **Lightweight**: Minimal CPU usage, no polling
- **Production-grade**: Handle edge cases (editors saving twice, network drives)
- **Small package size**: <200KB

### Solution: Use `chokidar` v5

Chokidar v5 (November 2025) decreased dependency count from 13 to 1, is ESM-only, uses native OS file watching APIs like inotify on Linux, FSEvents on macOS, and ReadDirectoryChangesW on Windows, avoiding polling to keep CPU usage down.

**Why chokidar?**

Chokidar is known for high performance and low resource consumption, using native OS file watching APIs to efficiently monitor file changes, making it suitable for large projects with many files.

Chokidar provides a rich API and is known for performance and reliability, particularly useful for applications requiring real-time file watching like build tools or development servers, handling large numbers of files with minimal overhead.

**Alternatives Rejected:**

| Library | Why Rejected |
|---------|--------------|
| `fs.watch` (native) | fs.watch is unreliable: emits most changes as rename, shows multiple events per modification, doesn't report filenames on macOS, and doesn't provide easy recursive watching |
| `node-watch` | Node-Watch is lightweight but may not handle high-frequency changes as efficiently as Chokidar, especially in larger projects |
| `gaze` | Gaze offers decent performance for smaller projects but may not scale as well as Chokidar, using polling as a fallback which can lead to higher resource usage |

**Implementation:**

```javascript
// lib/watcher.js
import chokidar from 'chokidar';
import { PATHS } from './paths.js';
import { reloadPower, removePower } from './discovery.js';
import { invalidateEmbedding } from './embeddings.js';

export class PowerWatcher {
  constructor() {
    this.watcher = null;
    this.isReady = false;
  }
  
  async start() {
    this.watcher = chokidar.watch(
      `${PATHS.powerFiles}/*.spell.yaml`,
      {
        persistent: true,
        ignoreInitial: false,  // We want initial 'add' events
        awaitWriteFinish: {    // Handle editors that save in multiple writes
          stabilityThreshold: 200,
          pollInterval: 100
        },
        usePolling: false,     // Use native OS events
        depth: 0               // Don't watch subdirectories
      }
    );
    
    // Wait for initial scan to complete
    await new Promise((resolve) => {
      this.watcher.on('ready', () => {
        this.isReady = true;
        resolve();
      });
    });
    
    // File added (new power)
    this.watcher.on('add', async (path) => {
      if (this.isReady) {
        console.log(`[Watcher] New power detected: ${path}`);
        await this.handleFileChange(path);
      }
    });
    
    // File changed (power updated)
    this.watcher.on('change', async (path) => {
      console.log(`[Watcher] Power modified: ${path}`);
      await this.handleFileChange(path);
    });
    
    // File deleted (power removed)
    this.watcher.on('unlink', async (path) => {
      console.log(`[Watcher] Power deleted: ${path}`);
      const powerName = this.extractPowerName(path);
      await removePower(powerName);
    });
    
    console.log(`[Watcher] Monitoring ${PATHS.powerFiles}`);
  }
  
  async handleFileChange(filepath) {
    try {
      const powerName = this.extractPowerName(filepath);
      
      // Reload spell configuration
      await reloadPower(filepath);
      
      // Invalidate cached embedding
      await invalidateEmbedding(powerName);
      
      console.log(`[Watcher] Reloaded power: ${powerName}`);
    } catch (error) {
      console.error(`[Watcher] Error handling ${filepath}:`, error);
    }
  }
  
  extractPowerName(filepath) {
    const filename = filepath.split(/[/\\]/).pop();
    return filename.replace('.spell.yaml', '');
  }
  
  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      console.log('[Watcher] Stopped');
    }
  }
}
```

**Key Features:**

1. **awaitWriteFinish**: In some scenarios files are created before fully written, which would emit 'add' and 'change' events prematurely. Setting awaitWriteFinish to true polls file size, holding events until size doesn't change for a configurable time

2. **Native OS Events**: Mac uses FSEvents, Linux uses inotify, Windows uses FileSystemWatcher - chokidar depends on these native APIs

3. **ignoreInitial: false**: We want to discover all existing powers at startup

4. **depth: 0**: Only watch the `powers/` directory itself, not subdirectories

**Package Dependencies:**
```json
{
  "dependencies": {
    "chokidar": "^5.0.0"  // ~190KB (includes 1 dependency)
  }
}
```

---

## Embedding Storage Architecture

### Problem Statement (ADR Context)

Phase 2 adds semantic search using sentence transformer embeddings. Each power requires:
- **384-dimensional float vector** (all-MiniLM-L6-v2 model)
- **Persistent storage** (not recomputed on every startup)
- **Compact format** (minimize NPM package size)
- **Fast loading** (<50ms startup overhead)
- **Efficient lookup** (support ~100 powers with linear scan)
- **Cache invalidation** (detect when power description/keywords change)

**User Constraints:**
- "Smallest npm package possible"
- "Keep vectors in file instead of memory"
- "Should not be in readable file [like JSON]"
- "Achieve something similar to ChromaDB which is fast, safe, efficient and secure"

**Storage Requirements:**
- 10-100 spell configurations
- Each embedding: 384 floats × 4 bytes = **1,536 bytes**
- Total: ~153 KB for 100 powers (raw binary)

### Decision: MessagePack Binary Format

**Selected Format: MessagePack** (single file at `~/.cache/grimoire/embeddings.msgpack`)

**Why MessagePack?**

MessagePack is a binary format for representing arrays and associative arrays, aiming to be as compact and simple as possible, supporting binary data and non-UTF-8 strings unlike JSON.

MessagePack stores data similarly to JSON but is faster and smaller because JSON is human-readable and less efficient: JSON requires delimiters for compound types, doesn't store strings in native encoding, handles numbers inefficiently especially floats, and doesn't support binary data.

**Comparison with Alternatives:**

| Format | Size (100 powers) | Load Time | Pros | Cons |
|--------|------------------|-----------|------|------|
| **MessagePack** ✅ | **~170 KB** | **~20ms** | Binary, fast, simple, npm package | Not human-readable |
| JSON | ~450 KB | ~40ms | Human-readable, native | Large, slow parsing floats |
| Protocol Buffers | ~155 KB | ~15ms | Most compact | Requires schema, heavy deps |
| CBOR | ~175 KB | ~25ms | Similar to MessagePack | Less popular, larger npm package |
| SQLite | ~220 KB | ~30ms | Queryable, ACID | Requires native binding |
| Custom Binary | ~153 KB | ~10ms | Smallest possible | No libraries, maintenance burden |

**Selected Library: `msgpackr`**

msgpackr automatically generates record definitions that are reused by objects with the same structure, providing better type preservation, much more compact encodings, and 2-3x faster decoding performance.

**Why msgpackr over alternatives?**

| Library | Package Size | Features | Choice |
|---------|--------------|----------|--------|
| `@msgpack/msgpack` | 82 KB | Official reference implementation | Good, but verbose API |
| **`msgpackr`** ✅ | **45 KB** | **Record extension, fastest** | **Best choice** |
| `msgpack5` | 38 KB | Simple, v5 spec | No record optimization |
| `tiny-msgpack` | 12 KB | Minimalistic | Missing extensions |

**Storage Schema:**

```javascript
// File: ~/.cache/grimoire/embeddings.msgpack
{
  version: 1,
  embeddings: {
    "postgres": {
      vector: Float32Array(384),  // The embedding itself
      hash: "sha256:abc123...",    // Hash of description + keywords
      timestamp: 1704960000000     // When computed (ms since epoch)
    },
    "stripe": { ... },
    "github": { ... }
  }
}
```

**Implementation:**

```javascript
// lib/embeddings.js
import { pack, unpack } from 'msgpackr';
import { readFile, writeFile } from 'fs/promises';
import { createHash } from 'crypto';
import { PATHS } from './paths.js';

export class EmbeddingCache {
  constructor() {
    this.cache = { version: 1, embeddings: {} };
    this.loaded = false;
  }
  
  async load() {
    try {
      const buffer = await readFile(PATHS.embeddingCache);
      this.cache = unpack(buffer);
      this.loaded = true;
      console.log(`[Cache] Loaded ${Object.keys(this.cache.embeddings).length} embeddings`);
    } catch (error) {
      // Cache file doesn't exist yet
      console.log('[Cache] No existing cache, starting fresh');
      this.loaded = true;
    }
  }
  
  async save() {
    const buffer = pack(this.cache);
    await writeFile(PATHS.embeddingCache, buffer);
    console.log(`[Cache] Saved ${Object.keys(this.cache.embeddings).length} embeddings`);
  }
  
  // Compute hash of power content (for cache invalidation)
  computeHash(powerConfig) {
    const content = `${powerConfig.description}|${powerConfig.keywords.join(',')}`;
    return createHash('sha256').update(content).digest('hex');
  }
  
  // Get cached embedding if valid
  get(powerName, powerConfig) {
    const cached = this.cache.embeddings[powerName];
    if (!cached) return null;
    
    const currentHash = this.computeHash(powerConfig);
    if (cached.hash !== currentHash) {
      console.log(`[Cache] Hash mismatch for ${powerName}, invalidating`);
      return null;
    }
    
    return Float32Array.from(cached.vector);
  }
  
  // Store new embedding
  set(powerName, powerConfig, embedding) {
    this.cache.embeddings[powerName] = {
      vector: Array.from(embedding),  // MessagePack doesn't support Float32Array directly
      hash: this.computeHash(powerConfig),
      timestamp: Date.now()
    };
  }
  
  // Remove embedding
  delete(powerName) {
    delete this.cache.embeddings[powerName];
  }
}
```

**Cache Invalidation Strategy:**

1. **Hash-based detection**: Compute SHA-256 of `description + keywords`
2. **On file change**: File watcher invalidates cache entry
3. **On startup**: Compare hashes, recompute if mismatch
4. **Lazy recomputation**: Only regenerate embedding when actually needed

**Benefits:**

✅ **Compact**: ~170 KB for 100 powers (vs ~450 KB JSON)  
✅ **Fast**: ~20ms load time (vs ~40ms JSON parsing)  
✅ **Binary**: Not human-readable (meets security requirement)  
✅ **Simple**: No schema required (unlike Protocol Buffers)  
✅ **Portable**: Works on all platforms  
✅ **Small npm package**: msgpackr is only 45 KB  

**Package Dependencies:**
```json
{
  "dependencies": {
    "msgpackr": "^1.10.0"  // 45KB
  }
}
```

---

## Architecture Decision Records

### ADR-001: Cross-Platform Path Strategy

**Decision**: Use `env-paths` package instead of manual path construction.

**Rationale**:
- env-paths uses correct OS-specific paths, which most developers get wrong
- Handles XDG directories on Linux automatically
- Only 2.4KB package size
- Maintained by Sindre Sorhus (high quality, well-tested)

**Alternatives Rejected**:
- Manual `process.platform` checks: Error-prone, misses XDG on Linux
- `platform-folders`: Requires native binding (increases package size, compilation issues)

**Consequences**:
- ✅ Cross-platform compatibility guaranteed
- ✅ Follows OS conventions
- ✅ Minimal package size impact
- ⚠️ Additional dependency (acceptable trade-off)

---

### ADR-002: File Watching Library

**Decision**: Use `chokidar` v5 for monitoring `.spell.yaml` files.

**Rationale**:
- Production-proven: Used in ~30 million repositories and proven in production environments since 2012
- Minimal dependencies: v5 decreased dependency count from 13 to 1
- Cross-platform: Uses native OS APIs (inotify on Linux, FSEvents on macOS, ReadDirectoryChangesW on Windows)
- Handles edge cases: awaitWriteFinish option prevents premature events when files are created before fully written

**Alternatives Rejected**:
- Native `fs.watch`: Too unreliable, platform inconsistencies
- `node-watch`: Less robust for high-frequency changes
- `gaze`: Uses polling, higher CPU usage

**Consequences**:
- ✅ Reliable file change detection
- ✅ ~190KB package size (acceptable)
- ✅ Handles network drives, editors saving twice
- ⚠️ Requires Node.js v20+ (chokidar v5 requirement)

---

### ADR-003: Embedding Storage Format

**Decision**: Use MessagePack binary format with `msgpackr` library.

**Rationale**:
- Compact: MessagePack is faster and smaller than JSON, encoding small integers in a single byte and short strings requiring only one extra byte
- Fast: msgpackr's record extension provides 2-3x faster decoding and more compact encodings by reusing structure definitions
- Binary: Meets requirement of non-readable format
- Simple: No schema required (unlike Protocol Buffers)
- Small: msgpackr is only 45KB

**Alternatives Rejected**:
- JSON: 2.6x larger, slow float parsing
- Protocol Buffers: Requires schema compilation, 200KB+ package
- SQLite: Requires native binding, 500KB+ package
- CBOR: Less popular, similar size to MessagePack

**Consequences**:
- ✅ 60% smaller than JSON
- ✅ 2x faster loading
- ✅ Binary format (secure)
- ✅ Minimal package size
- ⚠️ Not human-inspectable (use CLI tool for debugging)

---

## System Components

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Claude Desktop                             │
│  - Spawns: npx -y mcp-grimoire                             │
│  - Maintains stdio connection                                   │
└────────────────────┬────────────────────────────────────────────┘
                     │ MCP Protocol (stdio)
                     │
┌────────────────────▼────────────────────────────────────────────┐
│                 POWER GATEWAY PROCESS                           │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Startup Sequence                                          │ │
│  │ 1. ensureDirectories() - Create OS-specific paths        │ │
│  │ 2. loadEmbeddingCache() - Load ~/.cache/.../embeddings   │ │
│  │ 3. discoverPowers() - Scan config/powers/*.yaml          │ │
│  │ 4. startFileWatcher() - Monitor for changes              │ │
│  │ 5. initializeEmbedder() - Load all-MiniLM-L6-v2          │ │
│  │ 6. precomputeEmbeddings() - Generate missing vectors     │ │
│  │ 7. startMCPServer() - Listen on stdio                    │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Path Manager (lib/paths.js)                              │ │
│  │ - Uses env-paths for cross-platform directories          │ │
│  │ - macOS: ~/Library/Preferences/grimoire/            │ │
│  │ - Windows: %APPDATA%\grimoire\                      │ │
│  │ - Linux: ~/.config/grimoire/                        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ File Watcher (lib/watcher.js)                            │ │
│  │ - Uses chokidar v5 for file monitoring                   │ │
│  │ - Watches: {config}/powers/*.spell.yaml                  │ │
│  │ - Events: add, change, unlink                            │ │
│  │ - awaitWriteFinish: 200ms stability threshold            │ │
│  │ - On change: reloadPower() + invalidateEmbedding()       │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Embedding Cache (lib/embeddings.js)                      │ │
│  │ - Uses msgpackr for binary serialization                 │ │
│  │ - File: {cache}/embeddings.msgpack                       │ │
│  │ - Schema: { version, embeddings: { name: {vector, hash} }}│ │
│  │ - Cache invalidation via SHA-256 hash                    │ │
│  │ - Lazy recomputation on cache miss                       │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Intent Resolver (lib/intent.js)                          │ │
│  │ - Semantic search: transformers.js + all-MiniLM-L6-v2    │ │
│  │ - Fallback: keyword matching                             │ │
│  │ - Cosine similarity threshold: 0.5                       │ │
│  │ - Returns: powerName | null                              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Process Lifecycle Manager (lib/lifecycle.js)             │ │
│  │ - Spawns MCP child servers on-demand                     │ │
│  │ - Tracks usage per turn                                  │ │
│  │ - Cleanup: Kill after 5 turns inactive                   │ │
│  │ - Max concurrent: 10 processes                           │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow: File Change Event

```
1. User edits postgres.spell.yaml
   ↓
2. Chokidar detects 'change' event
   ↓
3. awaitWriteFinish waits 200ms (file size stable)
   ↓
4. PowerWatcher.handleFileChange(filepath)
   ↓
5. reloadPower(filepath)
   - Parse YAML
   - Validate schema
   - Update in-memory config
   ↓
6. invalidateEmbedding('postgres')
   - Compute new hash
   - Compare to cached hash
   - If different: delete cache entry
   ↓
7. Next resolve_intent call:
   - Cache miss detected
   - Regenerate embedding (50ms)
   - Save to embeddings.msgpack
   ↓
8. Continue with normal operation
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
**Goal**: Cross-platform path management and file discovery

**Tasks**:
1. ✅ Install `env-paths` dependency
2. ✅ Create `lib/paths.js` with OS-specific path logic
3. ✅ Implement `ensureDirectories()` function
4. ✅ Create `.spell.yaml` validation schema
5. ✅ Implement power discovery (scan directory)
6. ✅ Add unit tests for path resolution on all platforms

**Deliverable**: Gateway can discover powers cross-platform

---

### Phase 2: File Watching (Week 1)
**Goal**: Real-time configuration updates

**Tasks**:
1. ✅ Install `chokidar` v5 dependency
2. ✅ Create `lib/watcher.js` with PowerWatcher class
3. ✅ Implement event handlers (add, change, unlink)
4. ✅ Add `awaitWriteFinish` logic
5. ✅ Test with manual file edits
6. ✅ Handle edge cases (file rename, editor temp files)

**Deliverable**: Gateway reloads powers on file changes

---

### Phase 3: Embedding Storage (Week 2)
**Goal**: Persistent embedding cache

**Tasks**:
1. ✅ Install `msgpackr` dependency
2. ✅ Create `lib/embeddings.js` with EmbeddingCache class
3. ✅ Implement load/save methods
4. ✅ Add hash-based cache invalidation
5. ✅ Test cache persistence across restarts
6. ✅ Benchmark load times (<50ms target)

**Deliverable**: Embeddings cached efficiently

---

### Phase 4: Semantic Search (Week 2)
**Goal**: Intent resolution with embeddings

**Tasks**:
1. ✅ Install `@xenova/transformers` dependency
2. ✅ Implement embedding generation
3. ✅ Add cosine similarity calculation
4. ✅ Integrate with EmbeddingCache
5. ✅ Add fallback to keyword matching
6. ✅ Test accuracy with diverse queries

**Deliverable**: Semantic intent resolution working

---

### Phase 5: Integration & Testing (Week 3)
**Goal**: Complete end-to-end workflow

**Tasks**:
1. ✅ Integrate all components into main gateway
2. ✅ Add comprehensive error handling
3. ✅ Write integration tests
4. ✅ Test on macOS, Windows, Linux
5. ✅ Performance profiling
6. ✅ Package size optimization

**Deliverable**: Production-ready gateway

---

## Package Size Budget

**Target Total: <15 MB**

| Component | Size | Justification |
|-----------|------|---------------|
| Core code | ~50 KB | Gateway logic, MCP server |
| `env-paths` | 2.4 KB | Cross-platform paths |
| `chokidar` | 190 KB | File watching |
| `msgpackr` | 45 KB | Embedding storage |
| `@xenova/transformers` | 2.8 MB | Embedding model runner |
| `all-MiniLM-L6-v2` (ONNX) | 90 MB | Auto-downloaded, cached separately |
| `@modelcontextprotocol/sdk` | 1.2 MB | MCP protocol |
| `yaml` | 85 KB | Parse .spell.yaml files |
| **Total (excluding model)** | **~4.4 MB** | ✅ Well under budget |

**Note**: The 90MB embedding model is downloaded to `~/.cache/huggingface/` on first run and **not bundled in NPM package**.

---

## Security Considerations

### File System Access

**Risk**: Users could place malicious `.spell.yaml` files in config directory

**Mitigation**:
1. Validate YAML schema strictly
2. Sanitize `command` field (whitelist: `npx`, `node`, absolute paths only)
3. Reject shell metacharacters in arguments
4. Log all power loads to `{log}/powers.log`

### Process Spawning

**Risk**: Spawned child processes could execute arbitrary code

**Mitigation**:
1. Use `spawn()` not `exec()` (no shell expansion)
2. Validate `command` against allowed executables
3. Set resource limits (max 10 concurrent processes)
4. Kill processes after 1 hour uptime (safety)
5. Monitor for abnormal CPU/memory usage

### Cache Poisoning

**Risk**: Attacker modifies `embeddings.msgpack` to inject malicious embeddings

**Mitigation**:
1. Hash validation: Recompute if hash mismatch
2. File permissions: 0600 (user read/write only)
3. Integrity check on load (MessagePack CRC)
4. Fallback to regeneration if cache corrupted

---

## Monitoring & Observability

### Logging Strategy

**Log Files**: `{log}/grimoire.log`

**Log Levels**:
- **ERROR**: Process crashes, invalid configs, file system errors
- **WARN**: Cache misses, slow embeddings (>100ms), cleanup events
- **INFO**: Power loaded/unloaded, file changes detected
- **DEBUG**: Intent resolution scores, cosine similarities

**Log Rotation**: Use `winston` or `pino` with daily rotation (max 7 days)

### Metrics to Track

1. **Intent Resolution**
   - Latency (p50, p95, p99)
   - Accuracy (semantic vs keyword fallback)
   - Cache hit rate

2. **File Watching**
   - Events per minute
   - Reload success rate
   - Watcher restart count

3. **Embedding Cache**
   - Size on disk
   - Load time on startup
   - Invalidation frequency

4. **Process Lifecycle**
   - Active children count
   - Spawn/kill frequency
   - Average process lifetime

---

## Testing Strategy

### Unit Tests

**Coverage Target**: >90%

**Key Test Suites**:
1. `paths.test.js`: Cross-platform path resolution
2. `watcher.test.js`: File event handling
3. `embeddings.test.js`: Cache load/save, invalidation
4. `intent.test.js`: Semantic search, keyword fallback
5. `lifecycle.test.js`: Process spawning, cleanup

**Testing Framework**: Vitest (fast, ESM-native)

### Integration Tests

**Scenarios**:
1. **Cold Start**: Gateway starts, discovers powers, generates embeddings
2. **Hot Reload**: Edit `.spell.yaml`, verify reload + invalidation
3. **Multi-Power**: Activate postgres → stripe → cleanup postgres
4. **Cache Persistence**: Restart gateway, verify cached embeddings load
5. **Cross-Platform**: Run on macOS, Windows, Linux (CI/CD)

### Performance Tests

**Benchmarks**:
1. **Startup Time**: <2 seconds (including embedding generation)
2. **Intent Resolution**: <50ms (semantic), <5ms (keyword)
3. **File Change Detection**: <300ms (from edit to reload)
4. **Cache Load**: <50ms (100 powers)
5. **Memory Usage**: <500MB (gateway + 2 children)

---

## Error Handling

### Critical Errors (Fatal)

**Scenarios**:
1. Cannot create config directory (permissions issue)
2. MCP SDK initialization failure
3. File watcher crashes repeatedly

**Action**: Log error, exit with code 1, display user-friendly message

### Recoverable Errors (Retry)

**Scenarios**:
1. Embedding model download fails (network issue)
2. Cache file corrupted (MessagePack parse error)
3. Child process spawn fails (resource limit)

**Action**: Log warning, retry with exponential backoff (3 attempts max)

### Non-Critical Errors (Continue)

**Scenarios**:
1. Single `.spell.yaml` file invalid (schema validation failed)
2. Cache miss (embedding not found)
3. Child process crashes during execution

**Action**: Log error, skip power, continue with others

---

## CLI Commands

### Installation

```bash
# Install globally
npm install -g mcp-grimoire

# Or use npx (no install)
npx mcp-grimoire init
```

### Commands

**1. Initialize Gateway**
```bash
mcp-grimoire init

# Output:
# ✓ Created config directory: ~/.config/grimoire/powers/
# ✓ Created cache directory: ~/.cache/grimoire/
# ✓ Added to Claude Desktop config
# 
# Next steps:
#   1. Add your first power: mcp-grimoire add
#   2. Restart Claude Desktop
```

**2. Add New Power**
```bash
mcp-grimoire add postgres \
  --command "npx -y @modelcontextprotocol/server-postgres" \
  --keywords "database,sql,query,postgres" \
  --env DATABASE_URL="postgresql://localhost/mydb"

# Interactive mode (no flags)
mcp-grimoire add
```

**3. List Installed Powers**
```bash
mcp-grimoire list

# Output:
# Installed Powers:
# 
# postgres (v1.0.0)
#   Status: Active
#   Keywords: database, sql, query, postgres
#   Last Used: 2 minutes ago
# 
# stripe (v1.0.0)
#   Status: Inactive (cleaned up 3 turns ago)
#   Keywords: payment, stripe, subscription
```

**4. Test Power Configuration**
```bash
mcp-grimoire test postgres

# Output:
# Testing power: postgres
# ✓ YAML syntax valid
# ✓ Schema validation passed
# ✓ Command executable: npx
# ✓ Spawned child process (PID 12345)
# ✓ MCP handshake successful
# ✓ Tools available: query_database, execute_sql, list_tables
# ✓ Steering injected (1,247 tokens)
# 
# Test passed! Power is ready to use.
```

**5. Remove Power**
```bash
mcp-grimoire remove postgres

# Confirmation prompt:
# Remove power 'postgres'? This will delete:
#   - ~/.config/grimoire/powers/postgres.spell.yaml
#   - Cached embedding
# 
# Continue? (y/N): y
# 
# ✓ Power removed
```

**6. Show Logs**
```bash
mcp-grimoire logs --tail 50 --follow

# Output:
# [INFO] Power loaded: postgres
# [WARN] Cache miss for stripe, regenerating embedding (51ms)
# [DEBUG] Intent match: "query database" → postgres (score: 0.87)
# [INFO] Spawned child: postgres (PID 12345)
```

**7. Clear Cache**
```bash
mcp-grimoire cache clear

# Output:
# Clearing embedding cache...
# ✓ Deleted: ~/.cache/grimoire/embeddings.msgpack
# 
# Embeddings will be regenerated on next startup.
```

---

## Deployment Checklist

### Pre-Release

- [ ] All unit tests passing (>90% coverage)
- [ ] Integration tests on macOS, Windows, Linux
- [ ] Performance benchmarks met (see targets above)
- [ ] Package size <15MB (excluding model)
- [ ] Documentation complete (README, examples, API docs)
- [ ] Security audit (no shell injection, file permissions correct)
- [ ] Error messages user-friendly
- [ ] Logging configured correctly

### NPM Package Configuration

```json
{
  "name": "mcp-grimoire",
  "version": "1.0.0",
  "description": "Intelligent MCP orchestrator with semantic intent resolution",
  "type": "module",
  "bin": {
    "mcp-grimoire": "./bin/cli.js"
  },
  "main": "./lib/index.js",
  "files": [
    "lib/",
    "bin/",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "build": "tsc",
    "prepublishOnly": "npm run build && npm test"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@xenova/transformers": "^2.17.0",
    "chokidar": "^5.0.0",
    "env-paths": "^3.0.0",
    "msgpackr": "^1.10.0",
    "yaml": "^2.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  },
  "keywords": [
    "mcp",
    "model-context-protocol",
    "claude",
    "ai",
    "orchestrator",
    "semantic-search",
    "embedding"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/mcp-grimoire"
  },
  "license": "MIT"
}
```

### Post-Release

- [ ] Publish to NPM registry
- [ ] Create GitHub release with changelog
- [ ] Update documentation site
- [ ] Announce on Discord/Twitter
- [ ] Monitor error reports (Sentry/LogRocket)
- [ ] Collect user feedback

---

## Future Enhancements

### Phase 6: Advanced Features (Q2 2026)

1. **Power Marketplace**
   - Centralized registry: `https://power-registry.dev`
   - Command: `mcp-grimoire install nomic/postgres-power`
   - Versioning support (semver)
   - Popularity metrics, ratings

2. **Auto-Steering Generation**
   - Use LLM to analyze MCP server docs
   - Generate steering automatically
   - Command: `mcp-grimoire generate-steering postgres`

3. **Analytics Dashboard**
   - Web UI showing usage metrics
   - Intent resolution accuracy over time
   - Most used powers
   - Performance trends

4. **Multi-User Support**
   - Shared spell configurations
   - Team-wide steering templates
   - Access control (read-only vs edit)

### Phase 7: Enterprise Features (Q3 2026)

1. **Audit Logging**
   - Detailed logs of all tool usage
   - User attribution
   - Export to SIEM tools

2. **Remote MCP Servers**
   - Support for `npx mcp-remote` connections
   - OAuth2 authentication
   - TLS encryption

3. **High Availability**
   - Redundant gateway processes
   - Automatic failover
   - Load balancing across children

4. **Telemetry & Monitoring**
   - OpenTelemetry integration
   - Prometheus metrics export
   - Grafana dashboards

---

## Appendix A: Example Power Configurations

### Example 1: PostgreSQL (Complete)

```yaml
# ~/.config/grimoire/powers/postgres.spell.yaml

name: postgres
version: 1.0.0
description: PostgreSQL database operations and SQL query execution

server:
  command: npx
  args:
    - "-y"
    - "@modelcontextprotocol/server-postgres"
  env:
    DATABASE_URL: postgresql://user:password@localhost:5432/mydb

keywords:
  - database
  - sql
  - query
  - postgres
  - postgresql
  - table
  - users
  - select
  - insert
  - update
  - delete

steering: |
  # Database Schema
  Tables:
    - users (id uuid PRIMARY KEY, email varchar(255), created_at timestamp)
    - orders (id uuid PRIMARY KEY, user_id uuid, amount decimal, status varchar(50))
    - products (id uuid PRIMARY KEY, name varchar(255), price decimal)
  
  Indexes:
    - users.email (UNIQUE)
    - users.created_at (for date filtering)
    - orders.user_id (foreign key)
  
  # Security Rules
  ALWAYS use parameterized queries:
    ✓ Good: query_database('SELECT * FROM users WHERE id = $1', [userId])
    ✗ Bad:  query_database('SELECT * FROM users WHERE id = ' + userId)  // SQL INJECTION!
  
  # Performance Tips
  - Use LIMIT to avoid scanning millions of rows
  - created_at is indexed, use for date filtering
  - Use INTERVAL for relative dates:
      WHERE created_at >= NOW() - INTERVAL '1 month'
  - SELECT specific columns, not SELECT *
  
  # Best Practices
  - Always check for NULL values in WHERE clauses
  - Use transactions for multi-query operations (BEGIN, COMMIT, ROLLBACK)
  - EXPLAIN ANALYZE queries if performance is slow
  - Join tables efficiently (INNER JOIN vs LEFT JOIN)
  
  # Common Patterns
  Recent users: WHERE created_at >= NOW() - INTERVAL '30 days'
  Active orders: WHERE status IN ('pending', 'processing')
  User orders: JOIN orders ON orders.user_id = users.id
```

### Example 2: Stripe Payments

```yaml
# ~/.config/grimoire/powers/stripe.spell.yaml

name: stripe
version: 1.0.0
description: Stripe payment processing, subscriptions, and customer management

server:
  command: npx
  args:
    - "-y"
    - "@stripe/mcp"
    - "--api-key"
    - "${STRIPE_API_KEY}"
    - "--tools"
    - "customers,charges,payment_intents"
  env:
    STRIPE_API_KEY: ${STRIPE_API_KEY}  # Set your Stripe test key (also pass via --api-key arg)

keywords:
  - payment
  - stripe
  - subscription
  - charge
  - customer
  - invoice
  - billing
  - checkout

steering: |
  # API Mode
  - Test mode: API keys start with sk_test_
  - Production mode: API keys start with sk_live_
  - Current environment: TEST (use test cards only)
  
  # Security
  - ALWAYS set idempotency keys for safety:
      create_payment({ ..., idempotencyKey: 'unique_id' })
  - Verify webhook signatures before processing events
  - Never log full API keys (only last 4 digits)
  
  # Test Cards
  Success: 4242 4242 4242 4242
  Decline: 4000 0000 0000 0002
  3D Secure: 4000 0025 0000 3155
  
  # Common Operations
  1. Create customer first, then subscription
  2. Use price IDs (price_xxx), not amount
  3. Handle webhooks asynchronously (don't wait for completion)
  4. Check payment_intent.status before fulfillment
  
  # Best Practices
  - Always handle errors (card declined, insufficient funds)
  - Set metadata for tracking (user_id, order_id)
  - Use automatic tax calculation (tax_behavior: 'inclusive')
  - Enable customer portal for self-service
```

---

## Appendix B: Troubleshooting Guide

### Issue: Gateway not starting

**Symptoms**: `npx mcp-grimoire` exits immediately

**Diagnosis**:
```bash
# Check Node.js version (must be >=20)
node --version

# Check logs
mcp-grimoire logs --tail 100
```

**Solution**:
- Upgrade Node.js: `nvm install 20`
- Check file permissions: `ls -la ~/.config/grimoire`
- Clear cache: `mcp-grimoire cache clear`

---

### Issue: Powers not detected

**Symptoms**: `mcp-grimoire list` shows empty

**Diagnosis**:
```bash
# Check config directory
ls -la ~/.config/grimoire/powers/

# Validate YAML syntax
mcp-grimoire test postgres
```

**Solution**:
- Ensure `.