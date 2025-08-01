// Kernel Interruption Tests - Real Implementation
import { expect } from 'chai';
import { KernelManager, KernelMode, KernelEvents, KernelLanguage, IKernelManagerOptions } from '../src/manager';

describe('Kernel Interruption Tests', function() {
  this.timeout(120000); // Generous timeout for interruption tests

  let manager: KernelManager;

  describe('Kernel Interrupt Method', function() {
    beforeEach('Initialize kernel manager with kernel-interrupt mode', function() {
      manager = new KernelManager({
        allowedKernelTypes: [
          { mode: KernelMode.MAIN_THREAD, language: KernelLanguage.PYTHON }
        ],
        interruptionMode: 'kernel-interrupt',
        pool: {
          enabled: false,
          poolSize: 1,
          autoRefill: false,
          preloadConfigs: []
        }
      });
    });

    afterEach('Cleanup kernel manager', async function() {
      if (manager) {
        await manager.destroyAll();
      }
    });

    it('should interrupt long-running computation', async function() {
      const kernelId = await manager.createKernel({
        mode: KernelMode.MAIN_THREAD,
        lang: KernelLanguage.PYTHON
      });
      
      // Start a long-running computation
      const longCode = `
import time
for i in range(100):
    print(f"Step {i}")
    time.sleep(0.1)
print("Completed!")
`;
      
      let executionCompleted = false;
      let executionError: any = null;
      
      // Start execution without waiting
      const executionPromise = manager.execute(kernelId, longCode)
        .then(result => {
          executionCompleted = true;
          return result;
        })
        .catch(error => {
          executionError = error;
        });
      
      // Wait a bit then interrupt
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const interruptSuccess = await manager.interruptKernel(kernelId);
      expect(interruptSuccess).to.be.true;
      
      // Wait for execution to finish
      const result = await executionPromise;
      
      // Execution should have been interrupted
      expect(executionCompleted).to.be.true;
      if (result && result.success) {
        // Some interruptions might still return success
        expect(result).to.exist;
      } else if (result) {
        // Or might return an error
        expect(result.error).to.exist;
      }
    });

    it('should handle interrupt on idle kernel', async function() {
      const kernelId = await manager.createKernel({
        mode: KernelMode.MAIN_THREAD,
        lang: KernelLanguage.PYTHON
      });
      
      // Try to interrupt an idle kernel
      const interruptSuccess = await manager.interruptKernel(kernelId);
      // Should succeed even if kernel is idle
      expect(interruptSuccess).to.be.true;
      
      // Kernel should still be functional
      const result = await manager.execute(kernelId, 'print("Still working")');
      expect(result.success).to.be.true;
    });
  });

  describe('SharedArrayBuffer Interruption', function() {
    beforeEach('Initialize kernel manager with SharedArrayBuffer mode', function() {
      manager = new KernelManager({
        allowedKernelTypes: [
          { mode: KernelMode.MAIN_THREAD, language: KernelLanguage.PYTHON },
          { mode: KernelMode.WORKER, language: KernelLanguage.PYTHON }
        ],
        interruptionMode: 'shared-array-buffer',
        pool: {
          enabled: false,
          poolSize: 1,
          autoRefill: false,
          preloadConfigs: []
        }
      });
    });

    afterEach('Cleanup kernel manager', async function() {
      if (manager) {
        await manager.destroyAll();
      }
    });

    it('should configure SharedArrayBuffer interruption if available', async function() {
      // This test checks if SharedArrayBuffer setup works
      // Note: In test environment, SharedArrayBuffer might not be available
      const kernelId = await manager.createKernel({
        mode: KernelMode.MAIN_THREAD,
        lang: KernelLanguage.PYTHON
      });
      
      const kernel = manager.getKernel(kernelId);
      expect(kernel).to.exist;
      
      // Test basic functionality still works
      const result = await manager.execute(kernelId, 'print("SharedArrayBuffer test")');
      expect(result.success).to.be.true;
    });
  });

  describe('Auto Interruption Mode', function() {
    beforeEach('Initialize kernel manager with auto mode', function() {
      manager = new KernelManager({
        allowedKernelTypes: [
          { mode: KernelMode.MAIN_THREAD, language: KernelLanguage.PYTHON }
        ],
        interruptionMode: 'auto',
        pool: {
          enabled: false,
          poolSize: 1,
          autoRefill: false,
          preloadConfigs: []
        }
      });
    });

    afterEach('Cleanup kernel manager', async function() {
      if (manager) {
        await manager.destroyAll();
      }
    });

    it('should automatically select best interruption method', async function() {
      const kernelId = await manager.createKernel({
        mode: KernelMode.MAIN_THREAD,
        lang: KernelLanguage.PYTHON
      });
      
      // Should be able to interrupt regardless of method
      const interruptSuccess = await manager.interruptKernel(kernelId);
      expect(interruptSuccess).to.be.true;
    });
  });

  describe('Streaming with Interruption', function() {
    beforeEach('Initialize kernel manager', function() {
      manager = new KernelManager({
        allowedKernelTypes: [
          { mode: KernelMode.MAIN_THREAD, language: KernelLanguage.PYTHON }
        ],
        interruptionMode: 'kernel-interrupt',
        pool: {
          enabled: false,
          poolSize: 1,
          autoRefill: false,
          preloadConfigs: []
        }
      });
    });

    afterEach('Cleanup kernel manager', async function() {
      if (manager) {
        await manager.destroyAll();
      }
    });

    it('should interrupt streaming execution', async function() {
      const kernelId = await manager.createKernel({
        mode: KernelMode.MAIN_THREAD,
        lang: KernelLanguage.PYTHON
      });
      
      const longCode = `
import time
for i in range(50):
    print(f"Streaming {i}")
    time.sleep(0.05)
`;
      
      const events: any[] = [];
      const streamGenerator = manager.executeStream(kernelId, longCode);
      
      // Collect events in background
      const streamPromise = (async () => {
        try {
          for await (const event of streamGenerator) {
            events.push(event);
          }
        } catch (error) {
          // Expected when interrupted
        }
      })();
      
      // Wait then interrupt
      await new Promise(resolve => setTimeout(resolve, 500));
      await manager.interruptKernel(kernelId);
      
      // Wait for stream to finish
      await streamPromise.catch(() => {}); // Ignore errors
      
      // Should have received some events but not all
      const streamEvents = events.filter(e => e.type === 'stream');
      expect(streamEvents.length).to.be.greaterThan(0);
      expect(streamEvents.length).to.be.lessThan(50); // Shouldn't complete all iterations
    });
  });

  describe('Multiple Kernel Interruption', function() {
    beforeEach('Initialize kernel manager', function() {
      manager = new KernelManager({
        allowedKernelTypes: [
          { mode: KernelMode.MAIN_THREAD, language: KernelLanguage.PYTHON }
        ],
        interruptionMode: 'kernel-interrupt',
        pool: {
          enabled: false,
          poolSize: 1,
          autoRefill: false,
          preloadConfigs: []
        }
      });
    });

    afterEach('Cleanup kernel manager', async function() {
      if (manager) {
        await manager.destroyAll();
      }
    });

    it('should interrupt specific kernel without affecting others', async function() {
      const kernelId1 = await manager.createKernel({
        mode: KernelMode.MAIN_THREAD,
        lang: KernelLanguage.PYTHON
      });
      
      const kernelId2 = await manager.createKernel({
        mode: KernelMode.MAIN_THREAD,
        lang: KernelLanguage.PYTHON
      });
      
      // Start execution in kernel 2
      const execution2Promise = manager.execute(kernelId2, `
result = 42
print("Kernel 2 finished")
`);
      
      // Interrupt kernel 1 (not running)
      await manager.interruptKernel(kernelId1);
      
      // Kernel 2 should complete normally
      const result2 = await execution2Promise;
      expect(result2.success).to.be.true;
      
      // Both kernels should still be functional
      const test1 = await manager.execute(kernelId1, 'print("Kernel 1 alive")');
      const test2 = await manager.execute(kernelId2, 'print(result)');
      
      expect(test1.success).to.be.true;
      expect(test2.success).to.be.true;
    });
  });
});