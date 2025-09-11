// Global variables
let kernelManager = null;
let hyphaServer = null;
let currentKernelId = null;
let editor = null;
let KernelManager, KernelMode, KernelLanguage, KernelEvents;

// Load kernel module dynamically
async function loadKernelModule() {
    // Use relative path for GitHub Pages compatibility
    const kernelModuleUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? './web-python-kernel.mjs'
        : 'https://cdn.jsdelivr.net/npm/web-python-kernel@latest/dist/web-python-kernel.mjs';
    
    const module = await import(kernelModuleUrl);
    KernelManager = module.KernelManager;
    KernelMode = module.KernelMode;
    KernelLanguage = module.KernelLanguage;
    KernelEvents = module.KernelEvents;
}

// Parse URL query parameters for Hypha connection
function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        server_url: params.get('server_url') || 'https://hypha.aicell.io',
        workspace: params.get('workspace') || null,
        token: params.get('token') || null,
        client_id: params.get('client_id') || null,
        visibility: params.get('visibility') || 'protected',
        service_id: params.get('service_id') || 'web-python-kernel-worker'
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
// Helper to strip ANSI escape codes
function stripAnsi(text) {
    // Remove ANSI escape codes (color codes, cursor movement, etc.)
    return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

function addOutput(type, content, isHtml = false) {
    const output = document.getElementById('output');
    const line = document.createElement('div');
    line.className = `output-line output-${type}`;
    
    // Strip ANSI codes from content
    const cleanContent = stripAnsi(content);
    
    if (isHtml) {
        line.innerHTML = cleanContent;
    } else {
        line.textContent = cleanContent;
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
        addOutput('stdout', 'Click "New Kernel" to create a new Python kernel, or select an existing kernel from the dropdown');
        
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
        
        // Update kernel list and select the new kernel
        await updateKernelList();
        document.getElementById('kernelSelect').value = currentKernelId;
        updateButtonStates();
        
        addOutput('result', `✓ Kernel created successfully: ${currentKernelId.substring(0, 8)}...`);
        
    } catch (error) {
        updateStatus('error', 'Kernel creation failed');
        addOutput('error', `Failed to create kernel: ${error.message}`);
        console.error('Kernel creation error:', error);
    }
}

// Run Python code
async function runCode() {
    if (!kernelManager || !currentKernelId) {
        addOutput('error', 'No kernel selected. Please select or create a kernel first.');
        return;
    }
    
    const code = editor.getValue();
    if (!code.trim()) {
        addOutput('error', 'No code to execute');
        return;
    }
    
    // Don't clear output - append to existing logs
    addOutput('stdout', `\n--- Executing in kernel: ${currentKernelId.substring(0, 8)} ---`);
    
    try {
        // Check if kernel exists
        const kernel = kernelManager.getKernel(currentKernelId);
        if (!kernel) {
            addOutput('error', `Kernel ${currentKernelId} not found. It may have been destroyed.`);
            await updateKernelList();
            return;
        }
        const stream = kernelManager.executeStream(currentKernelId, code);
        let hasError = false;
        
        for await (const event of stream) {
            console.log('Execution event:', event); // Debug log
            
            switch (event.type) {
                case 'stream':
                    if (event.data.name === 'stdout') {
                        addOutput('stdout', event.data.text);
                    } else if (event.data.name === 'stderr') {
                        addOutput('stderr', event.data.text);
                    }
                    break;
                    
                case 'execute_result':
                    if (event.data && event.data.data) {
                        addOutput('result', event.data.data['text/plain'] || JSON.stringify(event.data.data));
                    }
                    break;
                    
                case 'display_data':
                    if (event.data && event.data.data) {
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
                    }
                    break;
                    
                case 'error':
                case 'execute_error':  // Handle both error types
                    hasError = true;
                    if (event.data) {
                        const errorMsg = `${event.data.ename || 'Error'}: ${event.data.evalue || 'Unknown error'}`;
                        addOutput('error', errorMsg);
                        
                        if (event.data.traceback && Array.isArray(event.data.traceback)) {
                            event.data.traceback.forEach(line => {
                                addOutput('stderr', line);
                            });
                        }
                    } else {
                        addOutput('error', 'Execution failed with unknown error');
                    }
                    break;
                    
                default:
                    console.log('Unknown event type:', event.type, event);
            }
        }
        
        if (!hasError) {
            addOutput('stdout', '✓ Execution completed');
        }
        
    } catch (error) {
        console.error('Execution error:', error);
        addOutput('error', `Execution failed: ${error.message || error}`);
        
        // If kernel doesn't exist, update the list
        if (error.message && error.message.includes('not found')) {
            await updateKernelList();
        }
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
        // Get current kernel mode
        const kernel = kernelManager.getKernel(currentKernelId);
        const currentMode = kernel ? kernel.mode : KernelMode.WORKER;
        
        // Destroy current kernel
        await kernelManager.destroyKernel(currentKernelId);
        
        // Create new kernel with same mode
        currentKernelId = await kernelManager.createKernel({
            mode: currentMode,
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
        
        // Update kernel list and select the new kernel
        await updateKernelList();
        document.getElementById('kernelSelect').value = currentKernelId;
        updateButtonStates();
        
        addOutput('result', `✓ Kernel restarted successfully: ${currentKernelId.substring(0, 8)}...`);
        
    } catch (error) {
        updateStatus('error', 'Restart failed');
        addOutput('error', `Restart error: ${error.message}`);
    }
}

// Delete selected kernel
async function deleteKernel() {
    if (!kernelManager || !currentKernelId) return;
    
    const kernelId = currentKernelId;
    updateStatus('busy', 'Deleting kernel...');
    
    try {
        await kernelManager.destroyKernel(kernelId);
        
        // Clear current kernel ID
        currentKernelId = null;
        
        // Update kernel list
        await updateKernelList();
        
        updateStatus('ready', 'Kernel deleted');
        addOutput('result', `✓ Kernel deleted: ${kernelId.substring(0, 8)}...`);
        
    } catch (error) {
        updateStatus('error', 'Delete failed');
        addOutput('error', `Delete error: ${error.message}`);
    }
}

// Track registered service info
let registeredServiceId = null;
let registeredServiceUrl = null;

// Update kernel selector dropdown
async function updateKernelList() {
    const select = document.getElementById('kernelSelect');
    if (!kernelManager) {
        select.innerHTML = '<option value="">No Kernel Manager</option>';
        return;
    }
    
    try {
        const kernels = await kernelManager.listKernels();
        const currentValue = select.value;
        
        // Clear and rebuild options
        select.innerHTML = '<option value="">No Kernel</option>';
        
        if (kernels && kernels.length > 0) {
            kernels.forEach(kernel => {
                const option = document.createElement('option');
                option.value = kernel.id;
                option.textContent = `${kernel.id.substring(0, 8)}... (${kernel.mode})`;
                select.appendChild(option);
            });
            
            // Restore previous selection if it still exists
            if (currentValue && kernels.some(k => k.id === currentValue)) {
                select.value = currentValue;
            } else if (currentKernelId && kernels.some(k => k.id === currentKernelId)) {
                select.value = currentKernelId;
            }
        }
        
        // Update button states based on selection
        updateButtonStates();
        
    } catch (error) {
        console.error('Failed to update kernel list:', error);
        select.innerHTML = '<option value="">Error loading kernels</option>';
    }
}

// Update button states based on selected kernel
function updateButtonStates() {
    const select = document.getElementById('kernelSelect');
    const selectedKernelId = select.value;
    
    document.getElementById('runBtn').disabled = !selectedKernelId;
    document.getElementById('interruptBtn').disabled = !selectedKernelId;
    document.getElementById('restartBtn').disabled = !selectedKernelId;
    document.getElementById('deleteKernelBtn').disabled = !selectedKernelId;
    
    // Update current kernel ID
    currentKernelId = selectedKernelId || null;
    
    if (selectedKernelId) {
        updateStatus('ready', 'Kernel selected');
    } else {
        updateStatus('ready', 'No kernel selected');
    }
}

// Parse JWT token to check expiration
function parseJWT(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (error) {
        console.error('Failed to parse JWT:', error);
        return null;
    }
}

// Check if token is expired
function isTokenExpired(token) {
    const payload = parseJWT(token);
    if (!payload || !payload.exp) {
        return true; // Consider invalid tokens as expired
    }
    const expirationTime = payload.exp * 1000; // Convert to milliseconds
    return Date.now() > expirationTime;
}

// Connect to Hypha and register service
async function connectToHypha() {
    // Check if already connected
    if (hyphaServer) {
        addOutput('stdout', 'Already connected to Hypha server');
        if (registeredServiceId && registeredServiceUrl) {
            addOutput('stdout', `Service ID: ${registeredServiceId}`);
            addOutput('stdout', `Service URL: ${registeredServiceUrl}`);
        }
        return;
    }
    
    // Ensure kernel manager is initialized
    if (!kernelManager) {
        addOutput('error', 'Kernel manager not initialized');
        return;
    }
    
    const queryParams = getQueryParams();
    
    updateStatus('busy', 'Connecting to Hypha...');
    
    try {
        // Load Hypha RPC client if not already loaded
        if (!window.hyphaWebsocketClient) {
            addOutput('stdout', 'Loading Hypha RPC client...');
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/hypha-rpc@0.20.79/dist/hypha-rpc-websocket.min.js';
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
            addOutput('stdout', '✓ Hypha RPC client loaded');
        }
        
        // Handle authentication
        let token = queryParams.token;
        
        // Check if token exists but is expired
        if (token && isTokenExpired(token)) {
            addOutput('stdout', 'Token has expired, removing and requesting new token...');
            // Remove expired token from URL
            const newUrl = new URL(window.location);
            newUrl.searchParams.delete('token');
            window.history.replaceState({}, '', newUrl);
            token = null; // Clear the expired token
        }
        
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
        
        // Connect to Hypha server
        const connectionConfig = {
            server_url: queryParams.server_url
        };
        
        if (queryParams.workspace) {
            connectionConfig.workspace = queryParams.workspace;
        }
        
        if (token) {
            connectionConfig.token = token;
        }
        
        if (queryParams.client_id) {
            connectionConfig.client_id = queryParams.client_id;
        }
        
        hyphaServer = await window.hyphaWebsocketClient.connectToServer(connectionConfig);
        
        addOutput('result', `✓ Connected to Hypha server at ${queryParams.server_url}`);
        addOutput('stdout', `Workspace: ${hyphaServer.config.workspace}`);
        
        // Register the kernel service
        await registerKernelService();
        
    } catch (error) {
        updateStatus('error', 'Connection failed');
        
        // Check if error is due to expired token
        if (error.message && (error.message.includes('expired') || error.message.includes('Authentication error'))) {
            addOutput('stdout', 'Authentication failed, likely due to expired token. Clearing credentials...');
            
            // Clear the token from URL
            const newUrl = new URL(window.location);
            newUrl.searchParams.delete('token');
            window.history.replaceState({}, '', newUrl);
            
            // Reset connection state
            hyphaServer = null;
            registeredServiceId = null;
            registeredServiceUrl = null;
            
            addOutput('stdout', 'Please click "Connect to Hypha" again to re-authenticate.');
        } else {
            addOutput('error', `Hypha connection error: ${error.message}`);
        }
        
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
        
        // Define schemas for all service functions
        const schemas = {
            start: {
                name: "start",
                description: "Start a new Python kernel session. Creates an isolated Python environment that can execute code and maintain state between executions.",
                parameters: {
                    type: "object",
                    properties: {
                        config: {
                            type: "object",
                            description: "Configuration options for the kernel session",
                            properties: {
                                mode: {
                                    type: "string",
                                    enum: ["worker", "main_thread"],
                                    description: "Execution mode: 'worker' runs in Web Worker (recommended), 'main_thread' runs in main browser thread"
                                },
                                startup_script: {
                                    type: "string",
                                    description: "Python code to execute when the kernel starts (e.g., import statements, initial setup)"
                                },
                                env: {
                                    type: "object",
                                    description: "Environment variables to set in the Python kernel",
                                    additionalProperties: { type: "string" }
                                }
                            }
                        }
                    },
                    required: []
                }
            },
            stop: {
                name: "stop",
                description: "Stop and cleanup a running Python kernel session. Frees all resources associated with the session.",
                parameters: {
                    type: "object",
                    properties: {
                        sessionId: {
                            type: "string",
                            description: "The unique identifier of the session to stop (returned from start)"
                        }
                    },
                    required: ["sessionId"]
                }
            },
            get_logs: {
                name: "get_logs",
                description: "Retrieve execution logs from a kernel session. Useful for debugging and monitoring session activity.",
                parameters: {
                    type: "object",
                    properties: {
                        sessionId: {
                            type: "string",
                            description: "The unique identifier of the session"
                        },
                        type: {
                            type: "string",
                            enum: ["info", "error", "warning", null],
                            description: "Filter logs by type. If null, returns all log types",
                            nullable: true
                        },
                        offset: {
                            type: "number",
                            description: "Starting index for log retrieval (for pagination)",
                            default: 0
                        },
                        limit: {
                            type: "number",
                            description: "Maximum number of log entries to return",
                            nullable: true
                        }
                    },
                    required: ["sessionId"]
                }
            },
            execute: {
                name: "execute",
                description: "Execute Python code in a kernel and return all outputs. Supports numpy, matplotlib, pandas, and other scientific libraries.",
                parameters: {
                    type: "object",
                    properties: {
                        kernelId: {
                            type: "string",
                            description: "The unique identifier of the kernel where code will be executed"
                        },
                        code: {
                            type: "string",
                            description: "Python code to execute. Can include imports, function definitions, and any valid Python statements"
                        },
                        config: {
                            type: "object",
                            description: "Execution configuration options",
                            properties: {
                                timeout: {
                                    type: "number",
                                    description: "Maximum execution time in milliseconds"
                                }
                            }
                        },
                        progress_callback: {
                            type: "string",
                            description: "Optional callback function identifier to receive real-time execution progress",
                            nullable: true
                        }
                    },
                    required: ["kernelId", "code"]
                }
            },
            createKernel: {
                name: "createKernel",
                description: "Create a new Python kernel instance without starting a session. Lower-level API for direct kernel management.",
                parameters: {
                    type: "object",
                    properties: {
                        options: {
                            type: "object",
                            description: "Kernel creation options",
                            properties: {
                                mode: {
                                    type: "string",
                                    enum: ["worker", "main_thread"],
                                    description: "Execution mode for the kernel",
                                    default: "worker"
                                },
                                namespace: {
                                    type: "string",
                                    description: "Optional namespace to group related kernels"
                                }
                            }
                        }
                    },
                    required: []
                }
            },
            destroyKernel: {
                name: "destroyKernel",
                description: "Destroy a specific kernel instance and free its resources.",
                parameters: {
                    type: "object",
                    properties: {
                        kernelId: {
                            type: "string",
                            description: "The unique identifier of the kernel to destroy"
                        }
                    },
                    required: ["kernelId"]
                }
            },
            executeStream: {
                name: "executeStream",
                description: "Execute Python code and stream outputs in real-time. Returns an async generator that yields execution events as they occur.",
                parameters: {
                    type: "object",
                    properties: {
                        kernelId: {
                            type: "string",
                            description: "The unique identifier of the kernel"
                        },
                        code: {
                            type: "string",
                            description: "Python code to execute"
                        }
                    },
                    required: ["kernelId", "code"]
                }
            },
            interruptKernel: {
                name: "interruptKernel",
                description: "Interrupt a running execution in a kernel. Useful for stopping long-running or infinite loops.",
                parameters: {
                    type: "object",
                    properties: {
                        kernelId: {
                            type: "string",
                            description: "The unique identifier of the kernel to interrupt"
                        }
                    },
                    required: ["kernelId"]
                }
            },
            installPackages: {
                name: "installPackages",
                description: "Install Python packages in a kernel using micropip. Supports pure Python packages from PyPI.",
                parameters: {
                    type: "object",
                    properties: {
                        kernelId: {
                            type: "string",
                            description: "The unique identifier of the kernel"
                        },
                        packages: {
                            type: "array",
                            items: { type: "string" },
                            description: "List of package names to install (e.g., ['pandas', 'scikit-learn'])"
                        }
                    },
                    required: ["kernelId", "packages"]
                }
            },
            listKernels: {
                name: "listKernels",
                description: "List all active kernels, optionally filtered by namespace. Useful for managing multiple kernel instances.",
                parameters: {
                    type: "object",
                    properties: {
                        namespace: {
                            type: "string",
                            description: "Optional namespace to filter kernels. If null, returns all kernels",
                            nullable: true
                        }
                    },
                    required: []
                }
            },
            restartKernel: {
                name: "restartKernel",
                description: "Restart a kernel by destroying and recreating it. Clears all variables and state while maintaining the same configuration.",
                parameters: {
                    type: "object",
                    properties: {
                        kernelId: {
                            type: "string",
                            description: "The unique identifier of the kernel to restart"
                        }
                    },
                    required: ["kernelId"]
                }
            },
            getKernelStatus: {
                name: "getKernelStatus",
                description: "Get the current status and configuration of a kernel.",
                parameters: {
                    type: "object",
                    properties: {
                        kernelId: {
                            type: "string",
                            description: "The unique identifier of the kernel"
                        }
                    },
                    required: ["kernelId"]
                }
            },
            getPoolStats: {
                name: "getPoolStats",
                description: "Get statistics about the kernel pool, including available and in-use kernels.",
                parameters: {
                    type: "object",
                    properties: {},
                    required: []
                }
            },
            runStartupScript: {
                name: "runStartupScript",
                description: "Execute a startup script in a kernel. Typically used to import libraries or set up initial state.",
                parameters: {
                    type: "object",
                    properties: {
                        kernelId: {
                            type: "string",
                            description: "The unique identifier of the kernel"
                        },
                        script: {
                            type: "string",
                            description: "Python startup script to execute (e.g., imports, function definitions)"
                        }
                    },
                    required: ["kernelId", "script"]
                }
            },
            getServiceInfo: {
                name: "getServiceInfo",
                description: "Get information about the kernel service, including version, features, and active kernels.",
                parameters: {
                    type: "object",
                    properties: {},
                    required: []
                }
            },
        };

        // Create execute function and attach schema - always returns output
        const executeFunction = async ({ kernelId, code, config = {}, progress_callback = null }, context = null) => {
            // Log remote call
            addOutput('result', `🌐 Remote call: execute() - Running code in kernel ${kernelId.substring(0, 8)}...`);
            addOutput('stdout', `Code length: ${code.length} characters`);
            
            // First check if the kernel actually exists
            const kernel = kernelManager.getKernel(kernelId);
            if (!kernel) {
                addOutput('error', `❌ Kernel ${kernelId.substring(0, 8)}... not found`);
                throw new Error(`Kernel ${kernelId} not found`);
            }
            
            // Check if kernelId is from a session (for logging purposes)
            let session = null;
            for (const [sessionId, sess] of sessions.entries()) {
                if (sess.kernelId === kernelId) {
                    session = sess;
                    break;
                }
            }
            
            // If session exists, log to session logs
            if (session) {
                addLog(session.id, 'info', `Executing script (${code.length} chars)`);
            }
            
            try {
                const outputs = [];
                const stream = kernelManager.executeStream(kernelId, code);
                
                for await (const event of stream) {
                    outputs.push(event);
                    
                    // Call progress callback if provided
                    if (progress_callback) {
                        await progress_callback({
                            type: 'output',
                            event: event
                        });
                    }
                    
                    // Log certain events if session exists
                    if (session && event.type === 'error') {
                        addLog(session.id, 'error', `Execution error: ${event.data.ename}: ${event.data.evalue}`);
                    }
                }
                
                if (session) {
                    addLog(session.id, 'info', 'Script execution completed');
                }
                
                const success = !outputs.some(o => o.type === 'error');
                addOutput('result', `✓ Remote execution completed in kernel ${kernelId.substring(0, 8)}... (${success ? 'success' : 'with errors'})`);
                
                return {
                    outputs,
                    success
                };
                
            } catch (error) {
                if (session) {
                    addLog(session.id, 'error', `Execution failed: ${error.message}`);
                }
                addOutput('error', `❌ Remote execution failed in kernel ${kernelId.substring(0, 8)}...: ${error.message}`);
                throw error;
            }
        };
        executeFunction.__schema__ = schemas.execute;

        // Get configuration from query parameters
        const serviceQueryParams = getQueryParams();
        const visibility = serviceQueryParams.visibility;
        const serviceId = serviceQueryParams.service_id;
        
        addOutput('stdout', `Service configuration: ID="${serviceId}", visibility="${visibility}"`);
        
        // Service API implementation with worker interface
        const service = await hyphaServer.registerService({
            type: 'server-app-worker',
            id: serviceId,
            name: 'Web Python Kernel Worker',
            description: 'Web-based Python kernel worker. Provides a full Python 3.11 environment running in the browser via Pyodide/WebAssembly. Supports scientific computing with numpy, matplotlib, pandas, and can install additional pure Python packages. Ideal for data analysis, education, and interactive Python execution without server infrastructure.',
            supported_types: ['web-python-kernel'],
            config: {
                visibility: visibility,
                require_context: true
            },
            
            // Required worker methods with schemas
            start: Object.assign(async ({ config = {} } = {}, context = null) => {
                const sessionId = `session_${++sessionCounter}_${Date.now()}`;
                
                // Log remote call
                addOutput('result', `🌐 Remote call: start() - Creating new session ${sessionId}`);
                
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
                    
                    addOutput('result', `✓ Session ${sessionId} created with kernel ${kernelId}`);
                    return { session_id: sessionId, status: 'running' };
                    
                } catch (error) {
                    addLog(sessionId, 'error', `Failed to start session: ${error.message}`);
                    addOutput('error', `❌ Failed to create session ${sessionId}: ${error.message}`);
                    throw error;
                }
            }, { __schema__: schemas.start }),
            
            stop: Object.assign(async ({ sessionId }, context = null) => {
                const session = sessions.get(sessionId);
                if (!session) {
                    addOutput('error', `❌ Remote call: stop() - Session ${sessionId} not found`);
                    throw new Error(`Session ${sessionId} not found`);
                }
                
                // Log remote call
                addOutput('result', `🌐 Remote call: stop() - Stopping session ${sessionId}`);
                
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
                    
                    addOutput('result', `✓ Session ${sessionId} stopped successfully`);
                    return { status: 'stopped' };
                    
                } catch (error) {
                    addLog(sessionId, 'error', `Failed to stop session: ${error.message}`);
                    addOutput('error', `❌ Failed to stop session ${sessionId}: ${error.message}`);
                    throw error;
                }
            }, { __schema__: schemas.stop }),
            
            get_logs: Object.assign(async ({ sessionId, type = null, offset = 0, limit = null } = {}, context = null) => {
                addOutput('result', `🌐 Remote call: get_logs() - Retrieving logs for session ${sessionId}`);
                
                const logs = sessionLogs.get(sessionId) || [];
                
                let filteredLogs = logs;
                if (type) {
                    filteredLogs = logs.filter(log => log.type === type);
                    addOutput('stdout', `Filtered ${filteredLogs.length}/${logs.length} logs by type: ${type}`);
                } else {
                    addOutput('stdout', `Retrieved ${logs.length} logs`);
                }
                
                const start = offset || 0;
                const end = limit ? start + limit : undefined;
                
                return {
                    logs: filteredLogs.slice(start, end),
                    total: filteredLogs.length,
                    session_id: sessionId
                };
            }, { __schema__: schemas.get_logs }),
            
            // Execute code in a session
            execute: executeFunction,
            
            // Kernel lifecycle management
            createKernel: Object.assign(async ({ options = {} } = {}, context = null) => {
                const mode = options.mode || 'worker';
                addOutput('result', `🌐 Remote call: createKernel() - Creating ${mode} kernel`);
                
                const kernelId = await kernelManager.createKernel({
                    mode: mode === 'worker' ? KernelMode.WORKER : KernelMode.MAIN_THREAD,
                    lang: KernelLanguage.PYTHON,
                    ...options
                });
                
                addOutput('result', `✓ Kernel created: ${kernelId.substring(0, 8)}... (${mode} mode)`);
                return { kernelId, status: 'created' };
            }, { __schema__: schemas.createKernel }),
            
            destroyKernel: Object.assign(async ({ kernelId }, context = null) => {
                addOutput('result', `🌐 Remote call: destroyKernel() - Destroying kernel ${kernelId.substring(0, 8)}...`);
                
                await kernelManager.destroyKernel(kernelId);
                
                addOutput('result', `✓ Kernel destroyed: ${kernelId.substring(0, 8)}...`);
                return { status: 'destroyed' };
            }, { __schema__: schemas.destroyKernel }),
            
            listKernels: Object.assign(async ({ namespace = null } = {}, context = null) => {
                addOutput('result', `🌐 Remote call: listKernels() - Listing kernels${namespace ? ` in namespace: ${namespace}` : ''}`);
                
                const kernels = await kernelManager.listKernels(namespace);
                // The created field is already a string (ISO format), no conversion needed
                
                addOutput('stdout', `Found ${kernels.length} kernel(s)`);
                return kernels;
            }, { __schema__: schemas.listKernels }),
            
            // Execution methods
            
            executeStream: Object.assign(async function*({ kernelId, code }, context = null) {
                // This returns an async generator for streaming
                yield* executeStreamGenerator(kernelId, code);
            }, { __schema__: schemas.executeStream }),
            
            // Kernel control
            interruptKernel: Object.assign(async ({ kernelId }, context = null) => {
                addOutput('result', `🌐 Remote call: interruptKernel() - Interrupting kernel ${kernelId.substring(0, 8)}...`);
                
                const success = await kernelManager.interruptKernel(kernelId);
                
                addOutput('result', `${success ? '✓' : '❌'} Kernel interrupt ${success ? 'successful' : 'failed'}: ${kernelId.substring(0, 8)}...`);
                return { success };
            }, { __schema__: schemas.interruptKernel }),
            
            restartKernel: Object.assign(async ({ kernelId }, context = null) => {
                addOutput('result', `🌐 Remote call: restartKernel() - Restarting kernel ${kernelId.substring(0, 8)}...`);
                
                // Get current kernel options
                const kernel = kernelManager.getKernel(kernelId);
                if (!kernel) {
                    addOutput('error', `❌ Kernel ${kernelId.substring(0, 8)}... not found for restart`);
                    throw new Error(`Kernel ${kernelId} not found`);
                }
                
                // Destroy and recreate
                await kernelManager.destroyKernel(kernelId);
                const newKernelId = await kernelManager.createKernel({
                    mode: kernel.mode,
                    lang: kernel.lang
                });
                
                addOutput('result', `✓ Kernel restarted: ${kernelId.substring(0, 8)}... → ${newKernelId.substring(0, 8)}...`);
                
                return { 
                    oldKernelId: kernelId,
                    newKernelId,
                    status: 'restarted'
                };
            }, { __schema__: schemas.restartKernel }),
            
            // Kernel status
            getKernelStatus: Object.assign(async ({ kernelId }, context = null) => {
                addOutput('result', `🌐 Remote call: getKernelStatus() - Checking status of kernel ${kernelId.substring(0, 8)}...`);
                
                const kernel = kernelManager.getKernel(kernelId);
                if (!kernel) {
                    addOutput('stdout', `Kernel ${kernelId.substring(0, 8)}... not found`);
                    return { status: 'not_found' };
                }
                
                addOutput('stdout', `Kernel ${kernelId.substring(0, 8)}... status: ready (${kernel.mode} mode)`);
                
                return {
                    id: kernelId,
                    mode: kernel.mode,
                    language: kernel.lang,
                    status: 'ready' // Could be enhanced with actual status
                };
            }, { __schema__: schemas.getKernelStatus }),
            
            // Pool management
            getPoolStats: Object.assign(async (context = null) => {
                addOutput('result', `🌐 Remote call: getPoolStats() - Getting kernel pool statistics`);
                
                const stats = kernelManager.getPoolStats();
                addOutput('stdout', `Pool stats: ${JSON.stringify(stats)}`);
                
                return stats;
            }, { __schema__: schemas.getPoolStats }),
            
            // Package installation
            installPackages: Object.assign(async ({ kernelId, packages }, context = null) => {
                addOutput('result', `🌐 Remote call: installPackages() - Installing packages in kernel ${kernelId.substring(0, 8)}...`);
                addOutput('stdout', `Packages to install: ${packages.join(', ')}`);
                
                const kernel = kernelManager.getKernel(kernelId);
                if (!kernel) {
                    addOutput('error', `❌ Kernel ${kernelId.substring(0, 8)}... not found`);
                    throw new Error(`Kernel ${kernelId} not found`);
                }
                
                const code = `
import micropip
await micropip.install(${JSON.stringify(packages)})
print(f"Successfully installed: {', '.join(${JSON.stringify(packages)})}")
                `;
                
                const result = await kernel.kernel.execute(code);
                
                if (result.error) {
                    addOutput('error', `❌ Package installation failed in kernel ${kernelId.substring(0, 8)}...`);
                } else {
                    addOutput('result', `✓ Packages installed successfully in kernel ${kernelId.substring(0, 8)}...`);
                }
                
                // Convert Error objects to serializable format for Hypha RPC
                if (result.error && result.error instanceof Error) {
                    return {
                        ...result,
                        error: {
                            name: result.error.name,
                            message: result.error.message,
                            stack: result.error.stack
                        }
                    };
                }
                return result;
            }, { __schema__: schemas.installPackages }),
            
            // Startup script support
            runStartupScript: Object.assign(async ({ kernelId, script }, context = null) => {
                addOutput('result', `🌐 Remote call: runStartupScript() - Running startup script in kernel ${kernelId.substring(0, 8)}...`);
                addOutput('stdout', `Startup script length: ${script.length} characters`);
                
                const kernel = kernelManager.getKernel(kernelId);
                if (!kernel) {
                    addOutput('error', `❌ Kernel ${kernelId.substring(0, 8)}... not found`);
                    throw new Error(`Kernel ${kernelId} not found`);
                }
                
                const result = await kernel.kernel.execute(script);
                
                if (result.error) {
                    addOutput('error', `❌ Startup script failed in kernel ${kernelId.substring(0, 8)}...`);
                } else {
                    addOutput('result', `✓ Startup script executed successfully in kernel ${kernelId.substring(0, 8)}...`);
                }
                
                // Convert Error objects to serializable format for Hypha RPC
                const serializedResult = {
                    success: result.success
                };
                
                if (result.error && result.error instanceof Error) {
                    serializedResult.error = {
                        name: result.error.name,
                        message: result.error.message,
                        stack: result.error.stack
                    };
                } else if (result.error) {
                    serializedResult.error = result.error;
                }
                
                return serializedResult;
            }, { __schema__: schemas.runStartupScript }),
            
            // Service info
            getServiceInfo: Object.assign(async (context = null) => {
                addOutput('result', `🌐 Remote call: getServiceInfo() - Getting service information`);
                
                const kernels = await kernelManager.listKernels();
                // The created field is already a string (ISO format), no conversion needed
                
                addOutput('stdout', `Service info requested - ${kernels.length} active kernels`);
                
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
                    activeKernels: kernels
                };
            }, { __schema__: schemas.getServiceInfo })
        });
        
        // Extract service details and build full URL
        const fullServiceId = service.id;
        // The service.id format is "workspace/client_id:service_name"
        // We need to extract just "client_id:service_name"
        let actualServiceId = fullServiceId.split("/")[1];
        
        // Check if serviceId contains workspace prefix
        const workspace = hyphaServer.config.workspace;
        
        // Get the server URL - it might not be in config, so use query params or connection info
        const urlQueryParams = getQueryParams();
        const serverUrl = urlQueryParams.server_url || hyphaServer.config.server_url || 'https://hypha.aicell.io';
        // Build the correct service URL without trailing slash
        const fullServiceUrl = `${serverUrl}/${workspace}/services/${actualServiceId}`;
        
        // Store the service info for later reference
        registeredServiceId = fullServiceId;
        registeredServiceUrl = fullServiceUrl;
        
        addOutput('result', `✓ Kernel service registered successfully`);
        addOutput('stdout', `Service ID: ${fullServiceId}`);
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
    try {
        // Load kernel module first
        await loadKernelModule();
        
        // Initialize CodeMirror
        initializeEditor();
        
        // Set up button event listeners
        document.getElementById('initBtn').addEventListener('click', createKernel);
        document.getElementById('runBtn').addEventListener('click', runCode);
        document.getElementById('interruptBtn').addEventListener('click', interruptKernel);
        document.getElementById('restartBtn').addEventListener('click', restartKernel);
        document.getElementById('clearBtn').addEventListener('click', clearOutput);
        document.getElementById('connectBtn').addEventListener('click', connectToHypha);
        document.getElementById('deleteKernelBtn').addEventListener('click', deleteKernel);
        document.getElementById('refreshKernelsBtn').addEventListener('click', updateKernelList);
        
        // Handle kernel selection change
        document.getElementById('kernelSelect').addEventListener('change', (e) => {
            currentKernelId = e.target.value || null;
            updateButtonStates();
            if (currentKernelId) {
                addOutput('stdout', `Selected kernel: ${currentKernelId.substring(0, 8)}...`);
            }
        });
        
        // Handle kernel mode change - create new kernel with new mode
        document.getElementById('kernelMode').addEventListener('change', async (e) => {
            addOutput('stdout', `Mode changed to ${e.target.value}. Click "New Kernel" to create a new kernel with this mode.`);
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
        
        // Load initial kernel list
        await updateKernelList();
        
        // Check if we should auto-connect to Hypha
        const queryParams = getQueryParams();
        const shouldAutoConnect = queryParams.token;
        
        if (shouldAutoConnect) {
            // Auto-connect to Hypha
            addOutput('stdout', 'Auto-connecting to Hypha with URL parameters...');
            addOutput('stdout', `Server: ${queryParams.server_url}`);
            if (queryParams.workspace) addOutput('stdout', `Workspace: ${queryParams.workspace}`);
            addOutput('stdout', `Service ID: ${queryParams.service_id}`);
            addOutput('stdout', `Visibility: ${queryParams.visibility}`);
            await connectToHypha();
        } else {
            addOutput('stdout', 'Ready to connect. Click "Connect to Hypha" to register the service.');
            addOutput('stdout', 'URL parameters supported: server_url, workspace, token, client_id, visibility, service_id');
            addOutput('stdout', `Default service ID: ${queryParams.service_id}, visibility: ${queryParams.visibility}`);
        }
        
    } catch (error) {
        console.error('Initialization error:', error);
        addOutput('error', `Failed to initialize: ${error.message}`);
    }
});

// Export for debugging
window.kernelManager = () => kernelManager;
window.hyphaServer = () => hyphaServer;