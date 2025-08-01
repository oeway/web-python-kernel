// Kernel Pool Tests - Real Implementation
import { expect } from 'chai';
import { KernelManager, KernelMode, KernelLanguage, IKernelManagerOptions } from '../src/manager';

describe('Kernel Pool Tests', function() {
  this.timeout(120000); // Generous timeout for pool initialization

  let manager: KernelManager;

  const poolTestOptions: IKernelManagerOptions = {
    allowedKernelTypes: [
      { mode: KernelMode.MAIN_THREAD, language: KernelLanguage.PYTHON },
      { mode: KernelMode.WORKER, language: KernelLanguage.PYTHON }
    ],
    pool: {
      enabled: true,
      poolSize: 2,
      autoRefill: true,
      preloadConfigs: [
        { mode: KernelMode.MAIN_THREAD, language: KernelLanguage.PYTHON },
        { mode: KernelMode.WORKER, language: KernelLanguage.PYTHON }
      ]
    }
  };

  beforeEach('Initialize kernel manager with pool', function() {
    manager = new KernelManager(poolTestOptions);
  });

  afterEach('Cleanup kernel manager', async function() {
    if (manager) {
      await manager.destroyAll();
    }
  });

  describe('Pool Initialization', function() {
    it('should initialize kernel pool on manager creation', async function() {
      // Give pool time to initialize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const poolStats = manager.getPoolStats();
      expect(poolStats).to.exist;
      
      // Check that pool has been initialized for configured kernel types
      const mainThreadKey = `${KernelMode.MAIN_THREAD}-${KernelLanguage.PYTHON}`;
      const workerKey = `${KernelMode.WORKER}-${KernelLanguage.PYTHON}`;
      
      expect(poolStats[mainThreadKey]).to.exist;
      expect(poolStats[workerKey]).to.exist;
    });

    it('should preload kernels according to pool configuration', async function() {
      // Wait for pool to initialize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const poolStats = manager.getPoolStats();
      const mainThreadKey = `${KernelMode.MAIN_THREAD}-${KernelLanguage.PYTHON}`;
      
      expect(poolStats[mainThreadKey].available).to.be.greaterThan(0);
      expect(poolStats[mainThreadKey].total).to.equal(poolTestOptions.pool!.poolSize);
    });
  });

  describe('Pool Usage', function() {
    it('should use pooled kernels for faster creation', async function() {
      // Wait for pool to initialize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const startTime = Date.now();
      const kernelId = await manager.createKernel({
        mode: KernelMode.MAIN_THREAD,
        lang: KernelLanguage.PYTHON
      });
      const creationTime = Date.now() - startTime;
      
      // Pooled kernel should be created very quickly (< 100ms)
      expect(creationTime).to.be.lessThan(100);
      
      const kernel = manager.getKernel(kernelId);
      expect(kernel).to.exist;
      expect(kernel!.isFromPool).to.be.true;
    });

    it('should auto-refill pool when kernels are taken', async function() {
      // Wait for pool to initialize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const poolKey = `${KernelMode.MAIN_THREAD}-${KernelLanguage.PYTHON}`;
      const initialStats = manager.getPoolStats();
      const initialAvailable = initialStats[poolKey].available;
      
      // Take a kernel from the pool
      const kernelId = await manager.createKernel({
        mode: KernelMode.MAIN_THREAD,
        lang: KernelLanguage.PYTHON
      });
      
      // Check pool was decremented
      const afterTakeStats = manager.getPoolStats();
      expect(afterTakeStats[poolKey].available).to.equal(initialAvailable - 1);
      
      // Wait for auto-refill
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Pool should be refilled
      const afterRefillStats = manager.getPoolStats();
      expect(afterRefillStats[poolKey].available).to.be.greaterThan(afterTakeStats[poolKey].available);
    });
  });

  describe('Pool Fallback', function() {
    it('should create kernel normally when pool is empty', async function() {
      // Create a manager without pool
      const noPoolManager = new KernelManager({
        allowedKernelTypes: [
          { mode: KernelMode.MAIN_THREAD, language: KernelLanguage.PYTHON }
        ],
        pool: {
          enabled: false,
          poolSize: 0,
          autoRefill: false,
          preloadConfigs: []
        }
      });
      
      try {
        const kernelId = await noPoolManager.createKernel({
          mode: KernelMode.MAIN_THREAD,
          lang: KernelLanguage.PYTHON
        });
        
        const kernel = noPoolManager.getKernel(kernelId);
        expect(kernel).to.exist;
        expect(kernel!.isFromPool).to.be.undefined;
        
        await noPoolManager.destroyAll();
      } finally {
        await noPoolManager.destroyAll();
      }
    });
  });

  describe('Pool Configuration', function() {
    it('should respect pool size configuration', async function() {
      const customPoolManager = new KernelManager({
        allowedKernelTypes: [
          { mode: KernelMode.MAIN_THREAD, language: KernelLanguage.PYTHON }
        ],
        pool: {
          enabled: true,
          poolSize: 3,
          autoRefill: false,
          preloadConfigs: [
            { mode: KernelMode.MAIN_THREAD, language: KernelLanguage.PYTHON }
          ]
        }
      });
      
      try {
        // Wait for pool initialization
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const poolStats = customPoolManager.getPoolStats();
        const poolKey = `${KernelMode.MAIN_THREAD}-${KernelLanguage.PYTHON}`;
        
        expect(poolStats[poolKey].total).to.equal(3);
      } finally {
        await customPoolManager.destroyAll();
      }
    });

    it('should handle multiple kernel types in pool', async function() {
      // Wait for pool initialization
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const poolStats = manager.getPoolStats();
      
      // Check both kernel types are in pool
      const mainThreadKey = `${KernelMode.MAIN_THREAD}-${KernelLanguage.PYTHON}`;
      const workerKey = `${KernelMode.WORKER}-${KernelLanguage.PYTHON}`;
      
      expect(poolStats[mainThreadKey]).to.exist;
      expect(poolStats[workerKey]).to.exist;
      expect(poolStats[mainThreadKey].available).to.be.greaterThan(0);
      expect(poolStats[workerKey].available).to.be.greaterThan(0);
    });
  });
});