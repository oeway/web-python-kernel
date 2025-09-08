# 🐍 Web Python Kernel

A Jupyter-like Python kernel for the browser with real-time streaming output, interrupt support, and seamless visualization capabilities. Run Python code with numpy, matplotlib, plotly, pandas, and more directly in your web applications.

## 🎯 Features

- ✅ **Real Python Execution** - Pyodide-powered Python 3.11 in the browser
- ✅ **Streaming Output** - Real-time stdout/stderr streaming as code executes
- ✅ **Interrupt Support** - Stop long-running code with SharedArrayBuffer or fallback
- ✅ **Worker Mode** - Run Python in Web Workers for better performance
- ✅ **Rich Visualizations** - matplotlib, plotly, seaborn plots display automatically
- ✅ **Package Management** - Install packages with micropip
- ✅ **TypeScript Support** - Full type safety and intellisense
- ✅ **Event System** - React to kernel state changes and execution events

## 🚀 Quick Start

### Using CDN (Recommended)

```html
<!DOCTYPE html>
<html>
<head>
    <title>Python in Browser</title>
</head>
<body>
    <div id="output"></div>
    <button id="run">Run Python</button>

    <script type="module">
        // Import from CDN
        import { KernelManager, KernelMode, KernelLanguage } from 'https://cdn.jsdelivr.net/npm/web-python-kernel@0.1.5/dist/web-python-kernel.mjs';
        
        // Create kernel manager with worker mode (recommended)
        const manager = new KernelManager({
            allowedKernelTypes: [
                { mode: KernelMode.WORKER, language: KernelLanguage.PYTHON }
            ],
            // Use SharedArrayBuffer for interrupts if available, fallback to kernel.interrupt()
            interruptionMode: 'auto',
            // Important: specify worker URL when using CDN
            workerUrl: 'https://cdn.jsdelivr.net/npm/web-python-kernel@0.1.5/dist/kernel.worker.js'
        });
        
        // Create a Python kernel
        const kernelId = await manager.createKernel({
            mode: KernelMode.WORKER,
            lang: KernelLanguage.PYTHON
        });
        
        // Execute Python code with real-time streaming
        document.getElementById('run').onclick = async () => {
            const code = `
import matplotlib.pyplot as plt
import numpy as np

print("Generating plot...")
x = np.linspace(0, 10, 100)
y = np.sin(x)
plt.plot(x, y)
plt.title("Sine Wave")
plt.show()
print("Done!")
            `;
            
            // Stream output in real-time
            const stream = manager.executeStream(kernelId, code);
            for await (const event of stream) {
                if (event.type === 'stream' && event.data.name === 'stdout') {
                    document.getElementById('output').innerHTML += event.data.text + '<br>';
                } else if (event.type === 'display_data' && event.data.data['image/png']) {
                    // Display matplotlib plots
                    const img = document.createElement('img');
                    img.src = `data:image/png;base64,${event.data.data['image/png']}`;
                    document.getElementById('output').appendChild(img);
                }
            }
        };
    </script>
</body>
</html>
```

### Alternative CDN URLs

```javascript
// Latest version
import { KernelManager } from 'https://cdn.jsdelivr.net/npm/web-python-kernel@latest/dist/web-python-kernel.mjs';

// Specific version  
import { KernelManager } from 'https://cdn.jsdelivr.net/npm/web-python-kernel@0.1.5/dist/web-python-kernel.mjs';

// Alternative CDNs
import { KernelManager } from 'https://unpkg.com/web-python-kernel@0.1.5/dist/web-python-kernel.mjs';
import { KernelManager } from 'https://esm.sh/web-python-kernel@0.1.5/dist/web-python-kernel.mjs';
```

### Worker URL Configuration for CDN Usage

When using the library from a CDN, you must specify the full URL to the worker file:

```javascript
// Using jsdelivr CDN
const manager = new KernelManager({
    workerUrl: 'https://cdn.jsdelivr.net/npm/web-python-kernel@latest/dist/kernel.worker.js'
});

// Using unpkg CDN
const manager = new KernelManager({
    workerUrl: 'https://unpkg.com/web-python-kernel@latest/dist/kernel.worker.js'
});

// For local development (default behavior)
const manager = new KernelManager(); // Will auto-detect worker location

// You can also set it after initialization
manager.setWorkerUrl('https://cdn.jsdelivr.net/npm/web-python-kernel@latest/dist/kernel.worker.js');
```

**Important**: When loading from a CDN, always specify the `workerUrl` to ensure the worker script loads correctly. The library will attempt to auto-detect the worker location, but explicit configuration is more reliable for production use.

### NPM Installation

```bash
npm install web-python-kernel
```

```javascript
import { KernelManager, KernelMode, KernelLanguage, KernelEvents } from 'web-python-kernel';
```

## 📋 Basic Usage Example

```javascript
import { KernelManager, KernelMode, KernelLanguage, KernelEvents } from 'web-python-kernel';

// Create kernel manager
const manager = new KernelManager({
    // Recommend worker mode for better performance and isolation
    allowedKernelTypes: [
        { mode: KernelMode.WORKER, language: KernelLanguage.PYTHON }
    ],
    // Optional: specify worker URL for CDN deployments
    // workerUrl: 'https://cdn.jsdelivr.net/npm/web-python-kernel@latest/dist/kernel.worker.js'
});

// Create a kernel
const kernelId = await manager.createKernel({
    mode: KernelMode.WORKER,
    lang: KernelLanguage.PYTHON
});

// Listen for kernel events
manager.onKernelEvent(kernelId, KernelEvents.KERNEL_BUSY, () => {
    console.log('Kernel is busy...');
});

manager.onKernelEvent(kernelId, KernelEvents.KERNEL_IDLE, () => {
    console.log('Kernel is ready');
});

// Execute Python code with streaming output
const code = `
print("Hello from Python!")
import numpy as np
arr = np.array([1, 2, 3, 4, 5])
print(f"NumPy array: {arr}")
print(f"Sum: {np.sum(arr)}")
`;

// Method 1: Real-time streaming (recommended)
const stream = manager.executeStream(kernelId, code);
for await (const event of stream) {
    switch (event.type) {
        case 'stream':
            if (event.data.name === 'stdout') {
                console.log('Output:', event.data.text);
            }
            break;
        case 'execute_result':
            console.log('Result:', event.data.data['text/plain']);
            break;
        case 'execute_error':
            console.error('Error:', event.data.ename, event.data.evalue);
            break;
    }
}

// Method 2: Simple execution (no streaming)
const kernel = manager.getKernel(kernelId);
const result = await kernel.kernel.execute(code);
if (result.success) {
    console.log('Execution completed');
} else {
    console.error('Execution failed:', result.error);
}
```

## 🔧 Worker Mode Setup (Recommended)

Worker mode runs Python in a Web Worker for better performance and isolation:

```javascript
const manager = new KernelManager({
    allowedKernelTypes: [
        { mode: KernelMode.WORKER, language: KernelLanguage.PYTHON }
    ],
    // Enable SharedArrayBuffer-based interruption (recommended)
    interruptionMode: 'shared-array-buffer'
});

const kernelId = await manager.createKernel({
    mode: KernelMode.WORKER,
    lang: KernelLanguage.PYTHON
});
```

### Interrupt Support with SharedArrayBuffer

For the best interrupt experience, enable SharedArrayBuffer with proper CORS headers:

```javascript
// Server headers required for SharedArrayBuffer
// Cross-Origin-Opener-Policy: same-origin
// Cross-Origin-Embedder-Policy: require-corp

const manager = new KernelManager({
    // Use 'shared-array-buffer' for best interrupt performance
    // Falls back to 'kernel-interrupt' automatically if SharedArrayBuffer unavailable
    interruptionMode: 'auto' // or 'shared-array-buffer'
});

// Interrupt a long-running execution
const interruptSuccess = await manager.interruptKernel(kernelId);
if (interruptSuccess) {
    console.log('Execution interrupted successfully');
}
```

## 🎨 Visualization Support

Web Python Kernel automatically handles matplotlib, plotly, and other visualization libraries:

### Matplotlib Example

```javascript
const matplotlibCode = `
import matplotlib.pyplot as plt
import numpy as np

# Create sample data
x = np.linspace(0, 10, 100)
y = np.sin(x)

# Create plot
plt.figure(figsize=(10, 6))
plt.plot(x, y, label='sin(x)')
plt.plot(x, np.cos(x), label='cos(x)')
plt.title('Trigonometric Functions')
plt.legend()
plt.grid(True)

# Display plot (automatically generates display_data event)
plt.show()
`;

const stream = manager.executeStream(kernelId, matplotlibCode);
for await (const event of stream) {
    if (event.type === 'display_data' && event.data.data['image/png']) {
        // Create img element to display plot
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${event.data.data['image/png']}`;
        img.style.maxWidth = '100%';
        document.body.appendChild(img);
    }
}
```

### Plotly Example

```javascript
const plotlyCode = `
import micropip
await micropip.install('plotly')
import plotly.graph_objects as go
import numpy as np

# Create interactive plot
x = np.linspace(0, 10, 50)
y = np.sin(x)

fig = go.Figure()
fig.add_trace(go.Scatter(x=x, y=y, mode='lines+markers', name='sin(x)'))
fig.update_layout(title='Interactive Sine Wave')

# Display interactive plot
fig.show()
`;

// Plotly generates HTML display data
const stream = manager.executeStream(kernelId, plotlyCode);
for await (const event of stream) {
    if (event.type === 'display_data' && event.data.data['text/html']) {
        const plotDiv = document.createElement('div');
        plotDiv.innerHTML = event.data.data['text/html'];
        document.body.appendChild(plotDiv);
    }
}
```

## 🎮 Try the Interactive Playground

### **Local Development**
```bash
# Clone and setup
git clone <repository>
cd web-python-kernel
npm install

# Start playground
npm run playground
# Opens http://localhost:8080/playground.html
```

### **Playground Features**
- ✅ **Real-time code execution** with streaming output
- ✅ **Matplotlib/Plotly visualization** examples
- ✅ **Interrupt demonstration** for long-running code
- ✅ **Package installation** with micropip
- ✅ **Both main thread and worker modes**

---

## 🔧 Advanced Usage

### Kernel Pool Management

Enable kernel pooling for faster kernel creation:

```javascript
const manager = new KernelManager({
    pool: {
        enabled: true,
        poolSize: 2,              // Keep 2 kernels ready
        autoRefill: true,         // Automatically create new kernels
        preloadConfigs: [
            { mode: KernelMode.WORKER, language: KernelLanguage.PYTHON }
        ]
    }
});

// Pool kernels are created in background, createKernel returns immediately
const kernelId = await manager.createKernel({
    mode: KernelMode.WORKER,
    lang: KernelLanguage.PYTHON
});

// Check pool status
const poolStats = manager.getPoolStats();
console.log('Pool stats:', poolStats);
```

### Multiple Kernels with Namespaces

```javascript
// Create kernels with namespaces for organization
const dataKernelId = await manager.createKernel({
    namespace: 'data-analysis',
    mode: KernelMode.WORKER,
    lang: KernelLanguage.PYTHON
});

const mlKernelId = await manager.createKernel({
    namespace: 'machine-learning',
    mode: KernelMode.WORKER,
    lang: KernelLanguage.PYTHON
});

// List kernels by namespace
const dataKernels = await manager.listKernels('data-analysis');
console.log('Data analysis kernels:', dataKernels);

// Destroy kernels by namespace
await manager.destroyAll('data-analysis');
```

### Custom Environment Variables

```javascript
const kernelId = await manager.createKernel({
    mode: KernelMode.WORKER,
    lang: KernelLanguage.PYTHON,
    env: {
        'API_KEY': 'your-api-key',
        'DEBUG': 'true',
        'MODEL_PATH': '/models/trained.pkl'
    }
});

// Python code can access these via os.environ
const code = `
import os
print(f"API Key: {os.environ.get('API_KEY')}")
print(f"Debug mode: {os.environ.get('DEBUG')}")
`;
```

### Filesystem Mounting

```javascript
const kernelId = await manager.createKernel({
    mode: KernelMode.WORKER,
    lang: KernelLanguage.PYTHON,
    filesystem: {
        mountPoints: {
            '/data': {
                type: 'memory',  // or 'indexeddb'
                initialData: {
                    'dataset.csv': csvData,
                    'config.json': JSON.stringify(config)
                }
            }
        }
    }
});

// Python can now access files
const code = `
import pandas as pd
df = pd.read_csv('/data/dataset.csv')
print(df.head())
`;
```

### Event Handling

```javascript
import { KernelEvents } from 'web-python-kernel';

// Listen for all kernel events
manager.onKernelEvent(kernelId, KernelEvents.KERNEL_BUSY, () => {
    document.getElementById('status').textContent = 'Running...';
});

manager.onKernelEvent(kernelId, KernelEvents.KERNEL_IDLE, () => {
    document.getElementById('status').textContent = 'Ready';
});

manager.onKernelEvent(kernelId, KernelEvents.STREAM, (data) => {
    if (data.name === 'stdout') {
        appendOutput(data.text);
    } else if (data.name === 'stderr') {
        appendError(data.text);
    }
});

manager.onKernelEvent(kernelId, KernelEvents.DISPLAY_DATA, (data) => {
    if (data.data['image/png']) {
        displayPlot(`data:image/png;base64,${data.data['image/png']}`);
    }
});

manager.onKernelEvent(kernelId, KernelEvents.EXECUTE_ERROR, (data) => {
    showError(`${data.ename}: ${data.evalue}`, data.traceback);
});
```

### Package Installation

```javascript
// Install packages dynamically
const installCode = `
import micropip
await micropip.install(['pandas', 'scikit-learn', 'seaborn'])

import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
import seaborn as sns

print("All packages installed successfully!")
`;

const stream = manager.executeStream(kernelId, installCode);
for await (const event of stream) {
    if (event.type === 'stream') {
        console.log('Install progress:', event.data.text);
    }
}
```

### Kernel Interruption

```javascript
// Start a long-running computation
const longCode = `
import time
for i in range(100):
    print(f"Step {i+1}/100")
    time.sleep(1)  # Long-running operation
print("Completed!")
`;

const stream = manager.executeStream(kernelId, longCode);

// Set up interrupt after 5 seconds
setTimeout(async () => {
    const success = await manager.interruptKernel(kernelId);
    if (success) {
        console.log('Execution interrupted successfully');
    }
}, 5000);

// Handle the stream until interruption
try {
    for await (const event of stream) {
        console.log('Output:', event);
    }
} catch (error) {
    if (error.message.includes('interrupt')) {
        console.log('Execution was interrupted');
    }
}
```

## 📚 API Reference

### KernelManager

```typescript
class KernelManager {
    constructor(options: IKernelManagerOptions);
    
    // Kernel lifecycle
    createKernel(options: IManagerKernelOptions): Promise<string>;
    getKernel(id: string): IKernelInstance | undefined;
    destroyKernel(id: string): Promise<void>;
    destroyAll(namespace?: string): Promise<void>;
    listKernels(namespace?: string): Promise<KernelInfo[]>;
    
    // Execution
    executeStream(kernelId: string, code: string, parent?: any): AsyncGenerator;
    interruptKernel(kernelId: string): Promise<boolean>;
    
    // Events
    onKernelEvent(kernelId: string, eventType: KernelEvents, listener: Function): void;
    offKernelEvent(kernelId: string, eventType: KernelEvents, listener: Function): void;
    
    // Pool management
    getPoolStats(): Record<string, { available: number; total: number }>;
    getPoolConfig(): PoolConfig;
}
```

### KernelEvents

```typescript
enum KernelEvents {
    KERNEL_BUSY = 'kernel_busy',
    KERNEL_IDLE = 'kernel_idle',
    STREAM = 'stream',
    DISPLAY_DATA = 'display_data',
    UPDATE_DISPLAY_DATA = 'update_display_data',
    EXECUTE_RESULT = 'execute_result',
    EXECUTE_ERROR = 'execute_error',
    KERNEL_INFO = 'kernel_info'
}
```

### Configuration Options

```typescript
interface IKernelManagerOptions {
    pool?: IKernelPoolConfig;
    allowedKernelTypes?: Array<{
        mode: KernelMode;
        language: KernelLanguage;
    }>;
    interruptionMode?: 'shared-array-buffer' | 'kernel-interrupt' | 'auto';
}

interface IManagerKernelOptions {
    id?: string;
    mode?: KernelMode;
    lang?: KernelLanguage;
    namespace?: string;
    env?: Record<string, string>;
    filesystem?: IFilesystemMountOptions;
    lockFileURL?: string;
    inactivityTimeout?: number;
    maxExecutionTime?: number;
}
```

## 🔍 Performance Tips

1. **Use Worker Mode**: Better performance and isolation
2. **Enable Kernel Pooling**: Faster kernel creation for frequent use
3. **Use SharedArrayBuffer**: Better interrupt performance with proper CORS headers
4. **Preload Packages**: Include commonly used packages in lockFileURL
5. **Stream Processing**: Use `executeStream` for real-time feedback

## 🛡️ Security Considerations

- Worker mode provides better isolation than main thread mode
- Set appropriate CORS headers for SharedArrayBuffer
- Limit allowed kernel types in production
- Use namespaces to organize and limit kernel access
- Set inactivity timeouts to prevent resource leaks

## 🛠 Development Commands

| Command | Description |
|---------|-------------|
| `npm run playground` | Build and start playground |
| `npm run build` | Build kernel bundle |
| `npm run serve` | Start development server |
| `npm run test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run clean` | Clean build artifacts |

## 📁 Project Structure

```
web-python-kernel/
├── src/                    # TypeScript source code
│   ├── manager.ts          # Kernel manager implementation
│   ├── index.ts            # Main kernel implementation
│   ├── types.ts            # TypeScript interfaces
│   └── kernel.worker.ts    # Web Worker implementation
├── tests/                  # Test files
├── playground.html         # Interactive demo
├── dist/                   # Built bundles
│   ├── web-python-kernel.mjs    # ES module
│   ├── web-python-kernel.umd.js # UMD bundle
│   └── kernel.worker.js         # Worker bundle
└── package.json           # Package configuration
```

## 🚀 Ready to Go!

Your web-python-kernel is ready to power Jupyter-like Python experiences in the browser!

**Quick start**: Use the CDN version or install via npm and start building amazing Python web applications.

Happy coding! 🐍✨ 