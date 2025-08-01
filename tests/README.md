# Web Python Kernel Test Suite

This directory contains the comprehensive test suite for the Web Python Kernel library.

## Test Structure

The test suite is organized into the following files:

### Core Tests

- **kernel_test.ts** - Basic kernel operations and Python execution tests
  - Kernel creation and initialization
  - Python code execution
  - Variable persistence
  - Error handling
  - State management

### Integration Tests

- **kernel_manager_test.ts** - Kernel Manager functionality tests
  - Multiple kernel management
  - Kernel lifecycle (create, list, destroy)
  - Event system
  - Error isolation between kernels

### Streaming Tests

- **kernel_stream_test.ts** - Output streaming and event handling tests
  - Stream output capture
  - Event listeners
  - Execution results
  - Error streams
  - Mixed output handling

### Advanced Feature Tests

- **kernel_worker_test.ts** - Worker mode kernel tests (experimental)
  - Worker kernel creation
  - Isolation between workers
  - Concurrent execution
  - Worker termination

- **kernel_pool_test.ts** - Kernel pool management tests
  - Pool initialization
  - Pre-loaded kernels
  - Auto-refill functionality
  - Pool statistics

- **kernel_interrupt_test.ts** - Interruption functionality tests
  - Kernel interruption methods
  - SharedArrayBuffer support
  - Streaming interruption
  - Multiple kernel interruption

## Running Tests

### Run all tests:
```bash
npm test
```

### Run tests with watch mode:
```bash
npm run test:watch
```

### Run tests in Chrome (not headless):
```bash
npm run test:chrome
```

## Test Configuration

Tests are configured using Karma with the following setup:
- **Framework**: Mocha with Chai assertions
- **Browser**: ChromeHeadless (configurable)
- **Preprocessor**: Webpack with TypeScript support
- **Timeout**: 120 seconds per test (to accommodate Pyodide loading)

## Writing New Tests

When adding new tests:

1. Follow the existing test structure and naming conventions
2. Use descriptive test names that explain what is being tested
3. Set appropriate timeouts for async operations
4. Clean up resources in `afterEach` hooks
5. Group related tests using `describe` blocks

## Known Issues

1. **Worker Mode Tests**: May require additional browser permissions or specific environment setup
2. **Pool Tests**: Timing-sensitive tests may occasionally fail due to async initialization
3. **Interrupt Tests**: SharedArrayBuffer support depends on browser security headers

## Test Coverage

Current test coverage includes:
- ✅ Basic kernel operations
- ✅ Multiple kernel management
- ✅ Event system
- ✅ Stream output handling
- ✅ Error handling and isolation
- ✅ Execution results
- 🚧 Worker mode (experimental)
- 🚧 Pool management (experimental)
- 🚧 Interruption features (experimental)

## Future Improvements

- Add tests for package installation (micropip)
- Add tests for visualization libraries (matplotlib, plotly)
- Add tests for filesystem mounting
- Add tests for environment variables
- Add tests for namespace functionality
- Add performance benchmarks
- Add memory usage tests