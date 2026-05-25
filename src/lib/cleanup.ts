import prisma from "./prisma";
import { Prisma } from "../generated/prisma";

interface ReservationCleanupRow {
  id: string;
  status: string;
  quantity: number;
  inventoryId: string;
}

interface InventoryCleanupRow {
  id: string;
  reservedQuantity: number;
}

/**
 * Lazy cleanup process: finds all expired PENDING reservations,
 * locks them and their associated inventory rows inside transactions,
 * and releases the reserved stock.
 */
export async function lazyCleanupExpiredReservations() {
  const now = new Date();

  // Find all expired pending reservations (without blocking, just a standard select query first)
  const expiredReservations = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: {
        lte: now,
      },
    },
  });

  if (expiredReservations.length === 0) {
    return 0;
  }

  console.log(`[Lazy Cleanup] Found ${expiredReservations.length} expired reservations to clean up.`);

  let cleanedCount = 0;

  for (const reservation of expiredReservations) {
    try {
      // Process each one in a isolated individual transaction to prevent long-running locks or global deadlocks
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // 1. Lock the reservation row
        const lockedRes = (await tx.$queryRawUnsafe(
          `SELECT id, status, quantity, "inventoryId" FROM "Reservation" WHERE id = $1 FOR UPDATE`,
          reservation.id
        )) as ReservationCleanupRow[];

        if (lockedRes.length === 0) return;
        const res = lockedRes[0];

        // Ensure it's still pending and hasn't been confirmed/released concurrently
        if (res.status !== "PENDING") {
          return;
        }

        // 2. Lock the inventory row
        const lockedInv = (await tx.$queryRawUnsafe(
          `SELECT id, "reservedQuantity" FROM "Inventory" WHERE id = $1 FOR UPDATE`,
          res.inventoryId
        )) as InventoryCleanupRow[];

        if (lockedInv.length === 0) return;
        const inv = lockedInv[0];

        // 3. Perform atomic updates
        await tx.reservation.update({
          where: { id: res.id },
          data: { status: "RELEASED" },
        });

        // Safeguard to make sure reservedQuantity doesn't go below 0
        const newReservedQty = Math.max(0, inv.reservedQuantity - res.quantity);

        await tx.inventory.update({
          where: { id: res.inventoryId },
          data: { reservedQuantity: newReservedQty },
        });

        cleanedCount++;
      });
    } catch (err) {
      console.error(`[Lazy Cleanup] Error cleaning up reservation ${reservation.id}:`, err);
    }
  }

  if (cleanedCount > 0) {
    console.log(`[Lazy Cleanup] Successfully released ${cleanedCount} expired reservations.`);
  }

  return cleanedCount;
}
