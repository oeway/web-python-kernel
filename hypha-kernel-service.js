// Import the kernel manager - use relative path for GitHub Pages compatibility
// Will use CDN in production, local dist in development
const kernelModuleUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? './dist/web-python-kernel.mjs'
    : 'https://cdn.jsdelivr.net/npm/web-python-kernel@latest/dist/web-python-kernel.mjs';

const { KernelManager, KernelMode, KernelLanguage, KernelEvents } = await import(kernelModuleUrl);

// Global variables
let kernelManager = null;
let hyphaServer = null;
let currentKernelId = null;
let editor = null;

// Parse URL query parameters for Hypha connection
function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        server_url: params.get('server_url') || params.get('server-url') || 'https://hypha.aicell.io',
        workspace: params.get('workspace') || params.get('ws') || null,
        token: params.get('token') || params.get('t') || null,
        client_id: params.get('client_id') || params.get('client-id') || null
    };
}

// Update UI status
function updateStatus(status, text) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    statusDot.className = 'status-dot';
    if (status === 'ready') statusDot.classList.add('ready');
    else if (status === 'busy') statusDot.classList.add('busy');
    else if (status === 'error') statusDot.classList.add('error');
    
    statusText.textContent = text;
}

// Add output to the output panel
function addOutput(type, content, isHtml = false) {
    const output = document.getElementById('output');
    const line = document.createElement('div');
    line.className = `output-line output-${type}`;
    
    if (isHtml) {
        line.innerHTML = content;
    } else {
        line.textContent = content;
    }
    
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

// Clear output panel
function clearOutput() {
    const output = document.getElementById('output');
    const serviceInfo = document.getElementById('serviceInfo');
    output.innerHTML = '';
    if (serviceInfo) {
        output.appendChild(serviceInfo);
    }
}

// Initialize CodeMirror editor
function initializeEditor() {
    const textarea = document.getElementById('codeEditor');
    editor = CodeMirror.fromTextArea(textarea, {
        mode: 'python',
        theme: 'monokai',
        lineNumbers: true,
        indentUnit: 4,
        lineWrapping: true
    });
}

// Initialize kernel manager (infrastructure only, no kernel)
async function initializeKernelManager() {
    updateStatus('busy', 'Initializing kernel manager...');
    
    try {
        // Create kernel manager with both modes allowed
        kernelManager = new KernelManager({
            allowedKernelTypes: [
                { 
                    mode: KernelMode.WORKER, 
                    language: KernelLanguage.PYTHON 
                },
                { 
                    mode: KernelMode.MAIN_THREAD, 
                    language: KernelLanguage.PYTHON 
                }
            ],
            interruptionMode: 'auto',
            pool: {
                enabled: false,  // Disable pool to avoid multiple kernel initializations
                poolSize: 0,
                autoRefill: false
            }
        });
        
        updateStatus('ready', 'Manager ready');
        addOutput('result', '✓ Kernel manager initialized');
        addOutput('stdout', 'Click "Initialize Kernel" to create a Python kernel');
        
    } catch (error) {
        updateStatus('error', 'Manager initialization failed');
        addOutput('error', `Failed to initialize kernel manager: ${error.message}`);
        console.error('Kernel manager initialization error:', error);
    }
}

// Create and initialize a kernel
async function createKernel() {
    if (!kernelManager) {
        addOutput('error', 'Kernel manager not initialized');
        return;
    }
    
    const mode = document.getElementById('kernelMode').value;
    
    updateStatus('busy', 'Creating kernel...');
    
    try {
        // Create kernel
        currentKernelId = await kernelManager.createKernel({
            mode: mode === 'worker' ? KernelMode.WORKER : KernelMode.MAIN_THREAD,
            lang: KernelLanguage.PYTHON
        });
        
        // Set up event listeners
        kernelManager.onKernelEvent(currentKernelId, KernelEvents.KERNEL_BUSY, () => {
            updateStatus('busy', 'Kernel busy...');
            document.getElementById('runBtn').disabled = true;
            document.getElementById('interruptBtn').disabled = false;
        });
        
        kernelManager.onKernelEvent(currentKernelId, KernelEvents.KERNEL_IDLE, () => {
            updateStatus('ready', 'Kernel ready');
            document.getElementById('runBtn').disabled = false;
            document.getElementById('interruptBtn').disabled = true;
        });
        
        updateStatus('ready', 'Kernel ready');
        
        // Enable buttons
        document.getElementById('runBtn').disabled = false;
        document.getElementById('restartBtn').disabled = false;
        document.getElementById('initBtn').disabled = true;
        
        addOutput('result', '✓ Kernel created successfully');
        
    } catch (error) {
        updateStatus('error', 'Kernel creation failed');
        addOutput('error', `Failed to create kernel: ${error.message}`);
        console.error('Kernel creation error:', error);
    }
}

// Run Python code
async function runCode() {
    if (!kernelManager || !currentKernelId) {
        addOutput('error', 'Kernel not initialized');
        return;
    }
    
    const code = editor.getValue();
    clearOutput();
    
    try {
        const stream = kernelManager.executeStream(currentKernelId, code);
        
        for await (const event of stream) {
            switch (event.type) {
                case 'stream':
                    if (event.data.name === 'stdout') {
                        addOutput('stdout', event.data.text);
                    } else if (event.data.name === 'stderr') {
                        addOutput('stderr', event.data.text);
                    }
                    break;
                    
                case 'execute_result':
                    addOutput('result', event.data.data['text/plain']);
                    break;
                    
                case 'display_data':
                    if (event.data.data['image/png']) {
                        const img = document.createElement('img');
                        img.className = 'output-image';
                        img.src = `data:image/png;base64,${event.data.data['image/png']}`;
                        document.getElementById('output').appendChild(img);
                    } else if (event.data.data['text/html']) {
                        addOutput('result', event.data.data['text/html'], true);
                    } else if (event.data.data['text/plain']) {
                        addOutput('result', event.data.data['text/plain']);
                    }
                    break;
                    
                case 'error':
                    addOutput('error', `${event.data.ename}: ${event.data.evalue}`);
                    if (event.data.traceback) {
                        event.data.traceback.forEach(line => {
                            addOutput('stderr', line);
                        });
                    }
                    break;
            }
        }
    } catch (error) {
        addOutput('error', `Execution error: ${error.message}`);
    }
}

// Interrupt kernel
async function interruptKernel() {
    if (!kernelManager || !currentKernelId) return;
    
    try {
        const success = await kernelManager.interruptKernel(currentKernelId);
        if (success) {
            addOutput('result', '✓ Kernel interrupted');
        } else {
            addOutput('error', 'Failed to interrupt kernel');
        }
    } catch (error) {
        addOutput('error', `Interrupt error: ${error.message}`);
    }
}

// Restart kernel
async function restartKernel() {
    if (!kernelManager || !currentKernelId) return;
    
    updateStatus('busy', 'Restarting kernel...');
    
    try {
        // Destroy current kernel
        await kernelManager.destroyKernel(currentKernelId);
        
        // Create new kernel
        const mode = document.getElementById('kernelMode').value;
        currentKernelId = await kernelManager.createKernel({
            mode: mode === 'worker' ? KernelMode.WORKER : KernelMode.MAIN_THREAD,
            lang: KernelLanguage.PYTHON
        });
        
        // Re-setup event listeners
        kernelManager.onKernelEvent(currentKernelId, KernelEvents.KERNEL_BUSY, () => {
            updateStatus('busy', 'Kernel busy...');
            document.getElementById('runBtn').disabled = true;
            document.getElementById('interruptBtn').disabled = false;
        });
        
        kernelManager.onKernelEvent(currentKernelId, KernelEvents.KERNEL_IDLE, () => {
            updateStatus('ready', 'Kernel ready');
            document.getElementById('runBtn').disabled = false;
            document.getElementById('interruptBtn').disabled = true;
        });
        
        updateStatus('ready', 'Kernel ready');
        clearOutput();
        addOutput('result', '✓ Kernel restarted successfully');
        
    } catch (error) {
        updateStatus('error', 'Restart failed');
        addOutput('error', `Restart error: ${error.message}`);
    }
}

// Connect to Hypha and register service
async function connectToHypha() {
    // Ensure kernel manager is initialized
    if (!kernelManager) {
        addOutput('error', 'Kernel manager not initialized');
        return;
    }
    
    const queryParams = getQueryParams();
    
    updateStatus('busy', 'Connecting to Hypha...');
    addOutput('stdout', 'Loading Hypha RPC client...');
    
    try {
        // Load Hypha RPC client
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/hypha-rpc@0.20.66/dist/hypha-rpc-websocket.min.js';
        await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
        
        addOutput('stdout', '✓ Hypha RPC client loaded');
        
        // Handle authentication
        let token = queryParams.token;
        
        if (!token) {
            // Show login prompt
            addOutput('stdout', 'No token found, initiating login...');
            
            const loginConfig = {
                server_url: queryParams.server_url,
                login_callback: (context) => {
                    addOutput('stdout', `Login URL: ${context.login_url}`);
                    window.open(context.login_url, '_blank');
                }
            };
            
            if (queryParams.workspace) {
                loginConfig.workspace = queryParams.workspace;
            }
            
            token = await window.hyphaWebsocketClient.login(loginConfig);
            
            // Update URL with token
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('token', token);
            if (queryParams.workspace) {
                newUrl.searchParams.set('workspace', queryParams.workspace);
            }
            window.history.replaceState({}, '', newUrl);
        }
        
        // Connect to server
        const connectionConfig = {
            server_url: queryParams.server_url,
            token: token
        };
        
        if (queryParams.workspace) {
            connectionConfig.workspace = queryParams.workspace;
        }
        
        hyphaServer = await window.hyphaWebsocketClient.connectToServer(connectionConfig);
        
        addOutput('result', `✓ Connected to Hypha server at ${queryParams.server_url}`);
        addOutput('stdout', `Workspace: ${hyphaServer.config.workspace}`);
        
        // Register the kernel service
        await registerKernelService();
        
    } catch (error) {
        updateStatus('error', 'Connection failed');
        addOutput('error', `Hypha connection error: ${error.message}`);
        console.error('Hypha connection error:', error);
    }
}

// Register kernel service with Hypha as a worker
async function registerKernelService() {
    if (!hyphaServer || !kernelManager) {
        addOutput('error', 'Server or kernel manager not initialized');
        return;
    }
    
    try {
        // Session management
        const sessions = new Map();
        const sessionLogs = new Map();
        let sessionCounter = 0;
        
        // Helper to add log entry
        function addLog(sessionId, type, message) {
            if (!sessionLogs.has(sessionId)) {
                sessionLogs.set(sessionId, []);
            }
            sessionLogs.get(sessionId).push({
                timestamp: new Date().toISOString(),
                type: type,
                message: message
            });
        }
        
        // Helper to convert async generator to array for RPC
        async function* executeStreamGenerator(kernelId, code) {
            const stream = kernelManager.executeStream(kernelId, code);
            for await (const event of stream) {
                yield event;
            }
        }
        
        // Service API implementation with worker interface
        const service = await hyphaServer.registerService({
            type: 'server-app-worker',
            id: 'python-kernel-worker',
            name: 'Python Kernel Worker',
            description: 'Web-based Python kernel worker with streaming execution and visualization support',
            supported_types: ['python-kernel', 'jupyter-kernel', 'python-script'],
            visibility: 'public',
            run_in_executor: false,
            use_local_url: false,
            config: {
                visibility: 'public',
                require_context: false
            },
            
            // Required worker methods
            start: async (config = {}, context = null) => {
                const sessionId = `session_${++sessionCounter}_${Date.now()}`;
                
                try {
                    // Create kernel based on config
                    const mode = config.mode || 'worker';
                    const kernelId = await kernelManager.createKernel({
                        mode: mode === 'worker' ? KernelMode.WORKER : KernelMode.MAIN_THREAD,
                        lang: KernelLanguage.PYTHON,
                        ...config
                    });
                    
                    // Store session info
                    sessions.set(sessionId, {
                        id: sessionId,
                        kernelId: kernelId,
                        status: 'running',
                        startTime: new Date().toISOString(),
                        config: config
                    });
                    
                    addLog(sessionId, 'info', `Session started with kernel ${kernelId}`);
                    
                    // Run startup script if provided
                    if (config.startup_script) {
                        const kernel = kernelManager.getKernel(kernelId);
                        if (kernel) {
                            await kernel.kernel.execute(config.startup_script);
                            addLog(sessionId, 'info', 'Startup script executed');
                        }
                    }
                    
                    return { session_id: sessionId, status: 'running' };
                    
                } catch (error) {
                    addLog(sessionId, 'error', `Failed to start session: ${error.message}`);
                    throw error;
                }
            },
            
            stop: async (sessionId, context = null) => {
                const session = sessions.get(sessionId);
                if (!session) {
                    throw new Error(`Session ${sessionId} not found`);
                }
                
                try {
                    // Destroy the kernel
                    await kernelManager.destroyKernel(session.kernelId);
                    
                    // Update session status
                    session.status = 'stopped';
                    session.endTime = new Date().toISOString();
                    
                    addLog(sessionId, 'info', 'Session stopped');
                    
                    // Clean up after a delay
                    setTimeout(() => {
                        sessions.delete(sessionId);
                        sessionLogs.delete(sessionId);
                    }, 60000); // Keep for 1 minute for log retrieval
                    
                    return { status: 'stopped' };
                    
                } catch (error) {
                    addLog(sessionId, 'error', `Failed to stop session: ${error.message}`);
                    throw error;
                }
            },
            
            get_logs: async (sessionId, type = null, offset = 0, limit = null, context = null) => {
                const logs = sessionLogs.get(sessionId) || [];
                
                let filteredLogs = logs;
                if (type) {
                    filteredLogs = logs.filter(log => log.type === type);
                }
                
                const start = offset || 0;
                const end = limit ? start + limit : undefined;
                
                return {
                    logs: filteredLogs.slice(start, end),
                    total: filteredLogs.length,
                    session_id: sessionId
                };
            },
            
            // Execute code in a session
            execute: async (sessionId, script, config = {}, progress_callback = null, context = null) => {
                const session = sessions.get(sessionId);
                if (!session) {
                    throw new Error(`Session ${sessionId} not found`);
                }
                
                addLog(sessionId, 'info', `Executing script (${script.length} chars)`);
                
                try {
                    const outputs = [];
                    const stream = kernelManager.executeStream(session.kernelId, script);
                    
                    for await (const event of stream) {
                        outputs.push(event);
                        
                        // Call progress callback if provided
                        if (progress_callback) {
                            await progress_callback({
                                type: 'output',
                                event: event
                            });
                        }
                        
                        // Log certain events
                        if (event.type === 'error') {
                            addLog(sessionId, 'error', `Execution error: ${event.data.ename}: ${event.data.evalue}`);
                        }
                    }
                    
                    addLog(sessionId, 'info', 'Script execution completed');
                    
                    return {
                        outputs,
                        success: !outputs.some(o => o.type === 'error')
                    };
                    
                } catch (error) {
                    addLog(sessionId, 'error', `Execution failed: ${error.message}`);
                    throw error;
                }
            },
            
            // Kernel lifecycle management
            createKernel: async (options = {}) => {
                const mode = options.mode || 'worker';
                const kernelId = await kernelManager.createKernel({
                    mode: mode === 'worker' ? KernelMode.WORKER : KernelMode.MAIN_THREAD,
                    lang: KernelLanguage.PYTHON,
                    ...options
                });
                return { kernelId, status: 'created' };
            },
            
            destroyKernel: async (kernelId) => {
                await kernelManager.destroyKernel(kernelId);
                return { status: 'destroyed' };
            },
            
            listKernels: async (namespace = null) => {
                const kernels = await kernelManager.listKernels(namespace);
                return kernels;
            },
            
            // Execution methods
            execute: async (kernelId, code) => {
                const kernel = kernelManager.getKernel(kernelId);
                if (!kernel) {
                    throw new Error(`Kernel ${kernelId} not found`);
                }
                
                const result = await kernel.kernel.execute(code);
                return result;
            },
            
            executeStream: async function*(kernelId, code) {
                // This returns an async generator for streaming
                yield* executeStreamGenerator(kernelId, code);
            },
            
            executeWithOutput: async (kernelId, code) => {
                // Collect all output into a single response
                const outputs = [];
                const stream = kernelManager.executeStream(kernelId, code);
                
                for await (const event of stream) {
                    outputs.push(event);
                }
                
                return {
                    outputs,
                    success: !outputs.some(o => o.type === 'error')
                };
            },
            
            // Kernel control
            interruptKernel: async (kernelId) => {
                const success = await kernelManager.interruptKernel(kernelId);
                return { success };
            },
            
            restartKernel: async (kernelId) => {
                // Get current kernel options
                const kernel = kernelManager.getKernel(kernelId);
                if (!kernel) {
                    throw new Error(`Kernel ${kernelId} not found`);
                }
                
                // Destroy and recreate
                await kernelManager.destroyKernel(kernelId);
                const newKernelId = await kernelManager.createKernel({
                    mode: kernel.mode,
                    lang: kernel.lang
                });
                
                return { 
                    oldKernelId: kernelId,
                    newKernelId,
                    status: 'restarted'
                };
            },
            
            // Kernel status
            getKernelStatus: async (kernelId) => {
                const kernel = kernelManager.getKernel(kernelId);
                if (!kernel) {
                    return { status: 'not_found' };
                }
                
                return {
                    id: kernelId,
                    mode: kernel.mode,
                    language: kernel.lang,
                    status: 'ready' // Could be enhanced with actual status
                };
            },
            
            // Pool management
            getPoolStats: async () => {
                return kernelManager.getPoolStats();
            },
            
            // Package installation
            installPackages: async (kernelId, packages) => {
                const kernel = kernelManager.getKernel(kernelId);
                if (!kernel) {
                    throw new Error(`Kernel ${kernelId} not found`);
                }
                
                const code = `
import micropip
await micropip.install(${JSON.stringify(packages)})
print(f"Successfully installed: {', '.join(${JSON.stringify(packages)})}")
                `;
                
                const result = await kernel.kernel.execute(code);
                return result;
            },
            
            // Startup script support
            runStartupScript: async (kernelId, script) => {
                const kernel = kernelManager.getKernel(kernelId);
                if (!kernel) {
                    throw new Error(`Kernel ${kernelId} not found`);
                }
                
                const result = await kernel.kernel.execute(script);
                return {
                    success: result.success,
                    error: result.error
                };
            },
            
            // Service info
            getServiceInfo: async () => {
                return {
                    name: 'Python Kernel Service',
                    version: '0.1.3',
                    features: {
                        streaming: true,
                        visualization: true,
                        interrupts: true,
                        packages: true,
                        worker_mode: true,
                        main_thread_mode: true
                    },
                    activeKernels: await kernelManager.listKernels()
                };
            }
        });
        
        // Extract service details and build full URL
        const serviceId = service.id;
        const fullServiceUrl = `${hyphaServer.config.server_url}/${hyphaServer.config.workspace}/services/${serviceId}/`;
        
        addOutput('result', `✓ Kernel service registered successfully`);
        addOutput('stdout', `Service ID: ${serviceId}`);
        addOutput('stdout', `Service URL: ${fullServiceUrl}`);
        
        // Show service info
        document.getElementById('serviceInfo').style.display = 'block';
        document.getElementById('serviceUrl').textContent = fullServiceUrl;
        
        updateStatus('ready', 'Service active');
        
    } catch (error) {
        updateStatus('error', 'Service registration failed');
        addOutput('error', `Service registration error: ${error.message}`);
        console.error('Service registration error:', error);
    }
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize CodeMirror
    initializeEditor();
    
    // Set up button event listeners
    document.getElementById('initBtn').addEventListener('click', createKernel);
    document.getElementById('runBtn').addEventListener('click', runCode);
    document.getElementById('interruptBtn').addEventListener('click', interruptKernel);
    document.getElementById('restartBtn').addEventListener('click', restartKernel);
    document.getElementById('clearBtn').addEventListener('click', clearOutput);
    document.getElementById('connectBtn').addEventListener('click', connectToHypha);
    
    // Handle kernel mode change - automatically restart if kernel exists
    document.getElementById('kernelMode').addEventListener('change', async (e) => {
        if (currentKernelId) {
            addOutput('stdout', `Switching to ${e.target.value} mode...`);
            await restartKernel();
        }
    });
    
    // Run code on Ctrl+Enter
    editor.on('keydown', (cm, event) => {
        if (event.ctrlKey && event.key === 'Enter') {
            event.preventDefault();
            if (!document.getElementById('runBtn').disabled) {
                runCode();
            }
        }
    });
    
    // Always initialize the kernel manager (but not a kernel)
    addOutput('stdout', 'Initializing kernel manager...');
    await initializeKernelManager();
    
    // Check if we should auto-connect to Hypha
    const queryParams = getQueryParams();
    const shouldAutoConnect = queryParams.token || queryParams.workspace || queryParams.server_url !== 'https://hypha.aicell.io';
    
    if (shouldAutoConnect) {
        // Auto-connect to Hypha
        addOutput('stdout', 'Auto-connecting to Hypha with URL parameters...');
        addOutput('stdout', `Server: ${queryParams.server_url}`);
        if (queryParams.workspace) addOutput('stdout', `Workspace: ${queryParams.workspace}`);
        await connectToHypha();
    } else {
        addOutput('stdout', 'Ready to connect. Click "Connect to Hypha" to register the service.');
        addOutput('stdout', 'URL parameters supported: server_url, workspace, token, client_id');
    }
});

// Export for debugging
window.kernelManager = () => kernelManager;
window.hyphaServer = () => hyphaServer;