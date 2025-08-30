# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web Python Kernel is a Jupyter-like Python kernel that runs in the browser using Pyodide. It provides real-time streaming output, interrupt support, and visualization capabilities for Python code execution in web applications.

## Development Commands

### Build Commands
- `npm run build` - Full production build (UMD + ESM formats)
- `npm run build:dev` - Development build with source maps
- `npm run rebuild` - Clean and rebuild development version
- `npm run clean` - Remove all build artifacts

### Testing
- `npm test` - Run all tests in headless Chrome
- `npm run test:watch` - Run tests in watch mode
- `npm run test:chrome` - Run tests in Chrome browser

### Code Quality
- `npm run lint` - Check TypeScript code with ESLint
- `npm run lint:fix` - Auto-fix linting issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

### Development Server
- `npm run playground` or `npm run dev` - Start playground at http://localhost:8080/playground.html

## Architecture

### Core Components

1. **Kernel Manager** (`src/manager.ts`)
   - Manages kernel lifecycle and pooling
   - Handles both main thread and worker mode kernels
   - Provides event system and streaming execution

2. **Kernel Implementation** (`src/index.ts`)
   - Main thread Python kernel using Pyodide
   - Handles code execution, streaming output, and interrupts
   - Integrates with Jupyter message protocol

3. **Worker Kernel** (`src/kernel.worker.ts`)
   - Web Worker implementation for isolated execution
   - Uses Comlink for communication
   - Supports SharedArrayBuffer-based interrupts

4. **Types** (`src/types.ts`)
   - TypeScript interfaces and enums
   - Kernel events, options, and message types

### Execution Modes

- **Main Thread Mode**: Direct Pyodide execution in main thread
- **Worker Mode**: Isolated execution in Web Workers (recommended)
- **Interrupt Support**: SharedArrayBuffer-based or fallback interruption

### Build System

- **Webpack** for bundling (UMD and ESM formats)
- **TypeScript** with declaration files
- **Karma** for browser testing
- Worker bundles are built separately and loaded dynamically

## Key Technical Details

- Uses Pyodide for Python execution in WebAssembly
- Implements Jupyter messaging protocol for compatibility
- Streaming execution via AsyncGenerators
- Real-time matplotlib/plotly visualization support
- Package installation via micropip
- Kernel pooling for performance optimization
- Event-driven architecture with TypeScript support

## Testing Approach

Tests use Karma with Mocha/Chai in real browsers. Test files are in `tests/` directory:
- `kernel_test.ts` - Core kernel functionality
- `kernel_manager_test.ts` - Manager and lifecycle
- `kernel_worker_test.ts` - Worker mode specifics
- `kernel_stream_test.ts` - Streaming execution
- `kernel_interrupt_test.ts` - Interrupt handling
- `kernel_pool_test.ts` - Kernel pooling