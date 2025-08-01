// Worker Mode Tests - Real Implementation
import { expect } from 'chai';
import { KernelManager, KernelMode, KernelEvents, KernelLanguage, IKernelManagerOptions } from '../src/manager';

describe('Worker Mode Tests', function() {
  this.timeout(120000); // Generous timeout for real Pyodide in worker

  let manager: KernelManager;

  const workerTestOptions: IKernelManagerOptions = {
    allowedKernelTypes: [
      { mode: KernelMode.WORKER, language: KernelLanguage.PYTHON }
    ],
    pool: {
      enabled: false,
      poolSize: 1,
      autoRefill: false,
      preloadConfigs: []
    }
  };

  beforeEach('Initialize kernel manager', function() {
    manager = new KernelManager(workerTestOptions);
  });

  afterEach('Cleanup kernel manager', async function() {
    if (manager) {
      await manager.destroyAll();
    }
  });

  describe('Worker Kernel Creation', function() {
    it('should create a kernel in worker mode', async function() {
      const kernelId = await manager.createKernel({
        mode: KernelMode.WORKER,
        lang: KernelLanguage.PYTHON
      });
      
      expect(kernelId).to.be.a('string');
      expect(kernelId).to.not.be.empty;
      
      const kernel = manager.getKernel(kernelId);
      expect(kernel).to.exist;
      expect(kernel!.mode).to.equal(KernelMode.WORKER);
      expect(kernel!.worker).to.exist;
    });

    it('should execute code in worker mode', async function() {
      const kernelId = await manager.createKernel({
        mode: KernelMode.WORKER,
        lang: KernelLanguage.PYTHON
      });
      
      const result = await manager.execute(kernelId, 'print("Hello from Worker!")');
      expect(result.success).to.be.true;
    });
  });

  describe('Worker Isolation', function() {
    it('should isolate state between worker kernels', async function() {
      const kernelId1 = await manager.createKernel({
        mode: KernelMode.WORKER,
        lang: KernelLanguage.PYTHON
      });
      
      const kernelId2 = await manager.createKernel({
        mode: KernelMode.WORKER,
        lang: KernelLanguage.PYTHON
      });

      // Set variable in kernel 1
      await manager.execute(kernelId1, 'worker_var = "kernel1"');
      
      // Set different variable in kernel 2
      await manager.execute(kernelId2, 'worker_var = "kernel2"');
      
      // Check isolation - each kernel should have its own value
      const result1 = await manager.execute(kernelId1, 'print(worker_var)');
      const result2 = await manager.execute(kernelId2, 'print(worker_var)');
      
      expect(result1.success).to.be.true;
      expect(result2.success).to.be.true;
    });

    it('should handle errors in worker without affecting main thread', async function() {
      const kernelId = await manager.createKernel({
        mode: KernelMode.WORKER,
        lang: KernelLanguage.PYTHON
      });
      
      // Execute code that would crash in main thread
      const result = await manager.execute(kernelId, `
import sys
# This error should be contained in the worker
raise RuntimeError("Worker error test")
`);
      
      expect(result.success).to.be.false;
      expect(result.error).to.exist;
      
      // Should still be able to execute more code
      const result2 = await manager.execute(kernelId, 'print("Worker still alive")');
      expect(result2.success).to.be.true;
    });
  });

  describe('Worker Streaming', function() {
    it('should stream output from worker kernel', async function() {
      const kernelId = await manager.createKernel({
        mode: KernelMode.WORKER,
        lang: KernelLanguage.PYTHON
      });
      
      const code = `
for i in range(3):
    print(f"Worker stream {i}")
`;
      
      const events: any[] = [];
      const streamGenerator = manager.executeStream(kernelId, code);
      
      for await (const event of streamGenerator) {
        events.push(event);
      }
      
      const streamEvents = events.filter(e => e.type === 'stream');
      expect(streamEvents.length).to.be.greaterThan(0);
      
      const outputText = streamEvents.map(e => e.data.text).join('');
      expect(outputText).to.include('Worker stream 0');
      expect(outputText).to.include('Worker stream 1');
      expect(outputText).to.include('Worker stream 2');
    });
  });

  describe('Worker Performance', function() {
    it('should handle concurrent executions in worker', async function() {
      const kernelId = await manager.createKernel({
        mode: KernelMode.WORKER,
        lang: KernelLanguage.PYTHON
      });
      
      // Execute multiple operations
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(manager.execute(kernelId, `result_${i} = ${i} * ${i}`));
      }
      
      const results = await Promise.all(promises);
      expect(results.every(r => r.success)).to.be.true;
      
      // Verify all operations completed
      const checkResult = await manager.execute(kernelId, 
        'print(result_0, result_1, result_2, result_3, result_4)');
      expect(checkResult.success).to.be.true;
    });
  });

  describe('Worker Termination', function() {
    it('should properly terminate worker on kernel destruction', async function() {
      const kernelId = await manager.createKernel({
        mode: KernelMode.WORKER,
        lang: KernelLanguage.PYTHON
      });
      
      const kernel = manager.getKernel(kernelId);
      expect(kernel).to.exist;
      expect(kernel!.worker).to.exist;
      
      await manager.destroyKernel(kernelId);
      
      const destroyedKernel = manager.getKernel(kernelId);
      expect(destroyedKernel).to.be.undefined;
    });
  });
});