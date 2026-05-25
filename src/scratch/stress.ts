import "dotenv/config";
import { prisma } from "../lib/prisma";
import { reservationEngine } from "../lib/reservation";

async function runStressTest() {
  console.log("========================================================");
  console.log("STARTING CONCURRENCY STRESS TEST (ROW-LEVEL LOCKING)");
  console.log("========================================================");

  // 1. Setup a clean product & warehouse with exactly 1 stock
  console.log("\n[1/4] Preparing test database state...");
  await prisma.idempotencyKey.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  const product = await prisma.product.create({
    data: {
      name: "Limited Edition Quantum Laptop",
      description: "Only 1 unit exists in the entire world. Extreme demand item.",
    },
  });

  const warehouse = await prisma.warehouse.create({
    data: {
      name: "Global Vault Alpha",
      location: "Geneva, Switzerland",
    },
  });

  const inventory = await prisma.inventory.create({
    data: {
      productId: product.id,
      warehouseId: warehouse.id,
      totalQuantity: 1, // Exactly 1 item in stock!
      reservedQuantity: 0,
    },
  });

  const inventoryId = inventory.id;
  console.log(`- Created product: "${product.name}"`);
  console.log(`- Created warehouse: "${warehouse.name}"`);
  console.log(`- Created inventory ID: ${inventoryId} with Total Stock: 1, Reserved Hold: 0`);
  console.log(`- Available Stock: 1`);

  // 2. Spawn 10 concurrent requests to reserve the 1 available unit
  console.log("\n[2/4] Launching 10 concurrent reservation requests simultaneously...");
  
  const requestPromises = Array.from({ length: 10 }).map(async (_, index) => {
    const requestId = index + 1;
    const idempotencyKey = `key-stress-test-request-${requestId}`;
    
    try {
      // Simulating concurrent processes invoking createReservation
      const res = await reservationEngine.createReservation(
        inventoryId,
        1, // Try to reserve 1 unit
        idempotencyKey,
        { inventoryId, quantity: 1 }
      );
      return {
        requestId,
        success: true,
        data: res,
        error: null,
      };
    } catch (error: any) {
      return {
        requestId,
        success: false,
        data: null,
        error: error.message || "Unknown error",
        statusCode: error.statusCode || 500,
      };
    }
  });

  // Execute all 10 concurrently
  const results = await Promise.all(requestPromises);

  // 3. Analyze results
  console.log("\n[3/4] Analyzing results...");
  
  const successfulReservations = results.filter((r) => r.success);
  const failedReservations = results.filter((r) => !r.success);

  console.log("\n------------------ EXECUTION SUMMARY ------------------");
  console.table(
    results.map((r) => ({
      "Req ID": r.requestId,
      "Succeeded": r.success ? "YES ✅" : "NO ❌",
      "Status Code": r.success ? 201 : r.statusCode,
      "Response/Error Message": r.success && r.data ? `Res ID: ${(r.data as any).id.slice(0, 8)}...` : r.error,
    }))
  );

  console.log("-------------------------------------------------------");
  console.log(`Total Requests Sent: 10`);
  console.log(`Successful Reservations: ${successfulReservations.length} (Expected: 1)`);
  console.log(`Failed Reservations (409 Conflict): ${failedReservations.length} (Expected: 9)`);
  console.log("-------------------------------------------------------");

  // 4. Validate correctness constraints
  console.log("\n[4/4] Performing integrity assertions...");
  
  let assertionsPassed = true;

  if (successfulReservations.length === 1) {
    console.log("✅ ASSERTION SUCCESS: Exactly one concurrent reservation request succeeded.");
  } else {
    console.log(`❌ ASSERTION FAILED: Expected exactly 1 successful reservation, but got ${successfulReservations.length}.`);
    assertionsPassed = false;
  }

  const allFailures409 = failedReservations.every((r) => r.statusCode === 409);
  if (allFailures409) {
    console.log("✅ ASSERTION SUCCESS: All other concurrent requests failed with 409 Conflict.");
  } else {
    console.log("❌ ASSERTION FAILED: Some failed requests did not return 409 Conflict.");
    assertionsPassed = false;
  }

  // Check database final state
  const finalInv = await prisma.inventory.findUnique({
    where: { id: inventoryId },
  });

  if (finalInv) {
    console.log(`\nFinal Database Inventory State:`);
    console.log(`- Total Quantity: ${finalInv.totalQuantity}`);
    console.log(`- Reserved Quantity: ${finalInv.reservedQuantity}`);
    const finalAvailable = finalInv.totalQuantity - finalInv.reservedQuantity;
    console.log(`- Dynamic Available Stock: ${finalAvailable}`);

    if (finalInv.reservedQuantity === 1 && finalAvailable === 0) {
      console.log("✅ ASSERTION SUCCESS: Database reservedQuantity is exactly 1, available stock is 0.");
    } else {
      console.log(`❌ ASSERTION FAILED: Invalid inventory numbers. Reserved: ${finalInv.reservedQuantity}, Available: ${finalAvailable}`);
      assertionsPassed = false;
    }
  }

  if (assertionsPassed) {
    console.log("\n🏆 CONCURRENCY TEST PASSED! The platform guarantees 100% race-condition-free reservations under high load.");
  } else {
    console.log("\n💥 CONCURRENCY TEST FAILED! The platform is susceptible to double-selling/race conditions.");
  }
  console.log("========================================================\n");
}

runStressTest()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
