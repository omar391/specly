# Next Steps

- **SP-043**: COMPLETED - Unified HTTP proxy implementation in mcp-kit
- **SP-044**: COMPLETED - Replaced custom build.js pipeline in mcp-kit with Rsbuild multi-target configuration
- **SP-045**: COMPLETED - Removed deprecated dev flag from BaseCliOptions
- **SP-046**: COMPLETED - Localized force-seed flag handling to Specly server
- **SP-048**: COMPLETED - Pruned unused dependencies and scripts
- **SP-047**:
  - Limit `@omar391/mcp-kit/server` public exports to `startMcpServer`, provide internal test seams, and update Specly tests to mock the higher-level entry point.
- **SP-049**:
  - Delete `SpeclyInstanceManager`, migrate remaining tests to the current lifecycle hooks, and confirm background jobs still start/stop correctly via `SpeclyServer`.


