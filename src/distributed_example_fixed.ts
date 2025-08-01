import { run } from "@bluelibs/runner";
import { 
  createDistributedTask,
  DistributedPipelineBuilder,
  distributedSystem
} from "./distributed_integration.js";

/**
 * Fixed example demonstrating distributed async/await capabilities
 */

// Simple distributed tasks without complex context dependencies
const validateOrder = createDistributedTask(
  "ecommerce.validateOrder",
  async (order: { id: string; items: any[]; userId: string }) => {
    console.log(`🔍 Validating order ${order.id}...`);
    
    // Simple validation
    const isValid = order.items.length > 0;
    console.log(`✅ Order ${order.id} validation: ${isValid}`);
    
    if (!isValid) {
      throw new Error("Order validation failed");
    }

    return { ...order, validated: true };
  },
  { migratable: true }
);

const processPayment = createDistributedTask(
  "ecommerce.processPayment", 
  async (order: { id: string; userId: string; total: number }) => {
    console.log(`💳 Processing payment for order ${order.id}...`);
    
    // Simulate payment processing
    const paymentResult = await new Promise<{success: boolean; transactionId: string}>((resolve) => {
      setTimeout(() => {
        console.log(`📡 Payment completed for order ${order.id}`);
        resolve({
          success: true,
          transactionId: `txn_${Date.now()}`
        });
      }, 1000);
    });

    if (!paymentResult.success) {
      throw new Error("Payment failed");
    }

    return { 
      ...order, 
      paid: true, 
      transactionId: paymentResult.transactionId 
    };
  },
  { 
    migratable: true,
    resumeEvents: ["payment.webhook"]
  }
);

const fulfillOrder = createDistributedTask(
  "ecommerce.fulfillOrder",
  async (order: { id: string; items: any[] }) => {
    console.log(`📦 Fulfilling order ${order.id}...`);
    
    // Simulate fulfillment steps
    const steps = ["pick", "pack", "ship"];
    const results = [];
    
    for (const step of steps) {
      const result = await new Promise<string>((resolve) => {
        setTimeout(() => {
          const stepResult = `${step}_${Date.now()}`;
          console.log(`✅ Completed ${step} for order ${order.id}: ${stepResult}`);
          resolve(stepResult);
        }, 200);
      });
      
      results.push(result);
    }

    return { 
      ...order, 
      fulfilled: true, 
      trackingNumbers: results 
    };
  },
  { migratable: true }
);

// Create distributed pipeline
export async function createOrderProcessingPipeline() {
  const { value: system } = await run(distributedSystem);
  
  return new DistributedPipelineBuilder()
    .addSuspendableStep(
      "validate",
      async (order: { id: string; items: any[]; userId: string }) => {
        return await validateOrder.run(order, {});
      },
      { migratable: true }
    )
    .addSuspendableStep(
      "payment",
      async (order: { id: string; userId: string; total: number }) => {
        return await processPayment.run(order, {});
      }, 
      { 
        migratable: true, 
        resumeEvents: ["payment.webhook"]
      }
    )
    .addSuspendableStep(
      "fulfill", 
      async (order: { id: string; items: any[] }) => {
        return await fulfillOrder.run(order, {});
      },
      { migratable: true }
    )
    .build("order-processing-fixed", system.promiseManager, system.eventRegistry);
}

// Main example function
export async function runDistributedEcommerceExample(): Promise<void> {
  console.log("🛒 Starting fixed distributed e-commerce example...\n");
  
  const { value: system, dispose } = await run(distributedSystem);
  
  try {
    // Create pipeline
    const pipeline = await createOrderProcessingPipeline();
    
    // Sample order
    const order = {
      id: `order_${Date.now()}`,
      userId: "user_123",
      items: [
        { sku: "ITEM001", quantity: 2, price: 29.99 },
        { sku: "ITEM002", quantity: 1, price: 49.99 }
      ],
      total: 109.97
    };
    
    console.log("📝 Processing order:", order.id);
    
    // Execute pipeline
    const result = await pipeline.executeDistributed(order, {
      allowMigration: true,
    });
    
    console.log("🎉 Order processing completed:", result);
    
  } finally {
    await dispose();
  }
  
  console.log("\n🏁 Fixed distributed e-commerce example completed!");
}

export async function demonstrateAdvancedPatterns(): Promise<void> {
  console.log("🚀 Demonstrating advanced distributed patterns...\n");
  
  const { value: system, dispose } = await run(distributedSystem);
  
  try {
    console.log("1️⃣ Simple distributed promise:");
    
    const promise = system.createDistributedPromise<string>(
      (resolve) => {
        setTimeout(() => {
          console.log("   Promise resolved on distributed system");
          resolve("Distributed execution complete");
        }, 500);
      }
    );
    
    const result = await promise;
    console.log("   Result:", result);
    
    console.log("\n2️⃣ Multiple distributed tasks:");
    
    const tasks = [
      validateOrder.run({ id: "test1", items: [1, 2], userId: "user1" }, {}),
      validateOrder.run({ id: "test2", items: [3, 4], userId: "user2" }, {}),
      validateOrder.run({ id: "test3", items: [5, 6], userId: "user3" }, {})
    ];
    
    const results = await Promise.all(tasks);
    console.log("   All tasks completed:", results.length);
    
  } finally {
    await dispose();
  }
  
  console.log("\n✨ Advanced patterns demonstration completed!");
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDistributedEcommerceExample()
    .then(() => demonstrateAdvancedPatterns())
    .catch(console.error);
}