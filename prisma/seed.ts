import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Cleaning up existing data...");
  // Clear any existing database entries
  await prisma.idempotencyKey.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  console.log("Seeding warehouses...");
  const warehouses = await Promise.all([
    prisma.warehouse.create({
      data: {
        name: "Silicon Valley Fulfillment Center",
        location: "San Jose, CA, USA",
      },
    }),
    prisma.warehouse.create({
      data: {
        name: "Frankfurt Mega Hub",
        location: "Frankfurt, Germany",
      },
    }),
    prisma.warehouse.create({
      data: {
        name: "Tokyo Logistics Dock",
        location: "Tokyo, Japan",
      },
    }),
  ]);

  console.log("Seeding products...");
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "GeForce RTX 5090 Super",
        description: "The ultimate next-gen graphics processing powerhouse with 32GB GDDDR7 VRAM, revolutionary AI tensor cores, and ultra-high-speed raytracing capability.",
      },
    }),
    prisma.product.create({
      data: {
        name: "PlayStation 6 Pro",
        description: "Sony's state-of-the-art gaming console. Experience real-time photorealistic path tracing, 8K ultra-fluid gameplay, and lightning-fast loading speeds.",
      },
    }),
    prisma.product.create({
      data: {
        name: "Apple Vision Pro 2",
        description: "Premium spatial computer seamlessly blending digital content with your physical space. Features dual 8K Micro-OLED displays and advanced eye tracking.",
      },
    }),
  ]);

  console.log("Seeding inventory configurations...");
  // Let's seed inventories in each warehouse
  // Product 1: GeForce RTX 5090 Super (Silicon Valley has 15, Frankfurt has 8, Tokyo has 3)
  await prisma.inventory.createMany({
    data: [
      {
        productId: products[0].id,
        warehouseId: warehouses[0].id,
        totalQuantity: 15,
        reservedQuantity: 0,
      },
      {
        productId: products[0].id,
        warehouseId: warehouses[1].id,
        totalQuantity: 8,
        reservedQuantity: 0,
      },
      {
        productId: products[0].id,
        warehouseId: warehouses[2].id,
        totalQuantity: 3,
        reservedQuantity: 0,
      },
    ],
  });

  // Product 2: PlayStation 6 Pro (Silicon Valley has 40, Frankfurt has 25, Tokyo has 50)
  await prisma.inventory.createMany({
    data: [
      {
        productId: products[1].id,
        warehouseId: warehouses[0].id,
        totalQuantity: 40,
        reservedQuantity: 0,
      },
      {
        productId: products[1].id,
        warehouseId: warehouses[1].id,
        totalQuantity: 25,
        reservedQuantity: 0,
      },
      {
        productId: products[1].id,
        warehouseId: warehouses[2].id,
        totalQuantity: 50,
        reservedQuantity: 0,
      },
    ],
  });

  // Product 3: Apple Vision Pro 2 (Silicon Valley has 5, Frankfurt has 2, Tokyo has 1)
  await prisma.inventory.createMany({
    data: [
      {
        productId: products[2].id,
        warehouseId: warehouses[0].id,
        totalQuantity: 5,
        reservedQuantity: 0,
      },
      {
        productId: products[2].id,
        warehouseId: warehouses[1].id,
        totalQuantity: 2,
        reservedQuantity: 0,
      },
      {
        productId: products[2].id,
        warehouseId: warehouses[2].id,
        totalQuantity: 1, // Extremely limited high-concurrency item!
        reservedQuantity: 0,
      },
    ],
  });

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
