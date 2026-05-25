import prisma from "./prisma";
import { lazyCleanupExpiredReservations } from "./cleanup";
import { checkIdempotency, saveIdempotencyKey } from "./idempotency";
import { Prisma } from "../generated/prisma";

export class ReservationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ReservationError";
  }
}

interface InventoryRow {
  id: string;
  productId: string;
  warehouseId: string;
  totalQuantity: number;
  reservedQuantity: number;
}

interface ReservationRow {
  id: string;
  status: string;
  quantity: number;
  inventoryId: string;
  expiresAt: Date;
}

/**
 * Concurrency-Safe Reservation Engine
 */
export const reservationEngine = {
  /**
   * Atomically creates a pending reservation with strict concurrency control.
   */
  async createReservation(
    inventoryId: string,
    quantity: number,
    idempotencyKey?: string,
    requestBody?: unknown
  ) {
    // 1. Lazy cleanup first
    await lazyCleanupExpiredReservations();

    // 2. Perform checkout inside an interactive transaction
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Check Idempotency if key is present
      if (idempotencyKey) {
        const idempotencyResult = await checkIdempotency(tx, idempotencyKey, requestBody);
        if (idempotencyResult.isDuplicate) {
          if (idempotencyResult.hashMismatch) {
            throw new ReservationError(
              "Idempotency Key reuse detected with mismatched request payload.",
              400
            );
          }
          // Return the cached successful response
          return idempotencyResult.response?.body;
        }
      }

      // Lock the inventory row using SELECT FOR UPDATE
      const lockedInvs = (await tx.$queryRawUnsafe(
        `SELECT id, "productId", "warehouseId", "totalQuantity", "reservedQuantity" FROM "Inventory" WHERE id = $1 FOR UPDATE`,
        inventoryId
      )) as InventoryRow[];

      if (lockedInvs.length === 0) {
        throw new ReservationError("Inventory item not found.", 404);
      }

      const inv = lockedInvs[0];

      // Calculate available stock dynamically
      const availableStock = inv.totalQuantity - inv.reservedQuantity;

      if (availableStock < quantity) {
        throw new ReservationError("Insufficient stock available.", 409);
      }

      // Atomically increment the reservedQuantity
      await tx.inventory.update({
        where: { id: inventoryId },
        data: {
          reservedQuantity: {
            increment: quantity,
          },
        },
      });

      // Calculate reservation expiry (10 minutes from now)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // Create the Reservation record
      const reservation = await tx.reservation.create({
        data: {
          inventoryId,
          quantity,
          status: "PENDING",
          expiresAt,
        },
        include: {
          inventory: {
            include: {
              product: true,
              warehouse: true,
            },
          },
        },
      });

      const responseBody = {
        id: reservation.id,
        inventoryId: reservation.inventoryId,
        quantity: reservation.quantity,
        status: reservation.status,
        expiresAt: reservation.expiresAt,
        productName: reservation.inventory.product.name,
        warehouseName: reservation.inventory.warehouse.name,
      };

      // Save idempotency key inside the same transaction
      if (idempotencyKey) {
        await saveIdempotencyKey(
          tx,
          idempotencyKey,
          "/api/reservations",
          requestBody,
          responseBody,
          201
        );
      }

      return responseBody;
    });
  },

  /**
   * Finalizes purchase by transitioning reservation PENDING -> CONFIRMED
   * and decrementing total stock permanently.
   */
  async confirmReservation(reservationId: string) {
    // 1. Lazy cleanup first
    await lazyCleanupExpiredReservations();

    // 2. Perform confirmation inside transaction
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Lock reservation row
      const lockedRes = (await tx.$queryRawUnsafe(
        `SELECT id, status, quantity, "inventoryId", "expiresAt" FROM "Reservation" WHERE id = $1 FOR UPDATE`,
        reservationId
      )) as ReservationRow[];

      if (lockedRes.length === 0) {
        throw new ReservationError("Reservation not found.", 404);
      }

      const res = lockedRes[0];
      const now = new Date();

      if (res.status === "CONFIRMED") {
        return { status: "CONFIRMED", alreadyDone: true };
      }

      if (res.status !== "PENDING" || new Date(res.expiresAt) <= now) {
        throw new ReservationError("Reservation expired.", 410);
      }

      // Lock corresponding Inventory row
      const lockedInvs = (await tx.$queryRawUnsafe(
        `SELECT id, "totalQuantity", "reservedQuantity" FROM "Inventory" WHERE id = $1 FOR UPDATE`,
        res.inventoryId
      )) as InventoryRow[];

      if (lockedInvs.length === 0) {
        throw new ReservationError("Inventory not found.", 404);
      }

      const inv = lockedInvs[0];

      // Update Reservation Status
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: "CONFIRMED" },
      });

      // Update Inventory: decrement total stock and decrement reserved hold
      const newTotalQuantity = Math.max(0, inv.totalQuantity - res.quantity);
      const newReservedQuantity = Math.max(0, inv.reservedQuantity - res.quantity);

      await tx.inventory.update({
        where: { id: res.inventoryId },
        data: {
          totalQuantity: newTotalQuantity,
          reservedQuantity: newReservedQuantity,
        },
      });

      return { status: "CONFIRMED" };
    });
  },

  /**
   * Releases stock holding back into available pool when payment fails / checkout cancelled.
   */
  async releaseReservation(reservationId: string) {
    // 1. Lazy cleanup first
    await lazyCleanupExpiredReservations();

    // 2. Perform early release inside transaction
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Lock reservation row
      const lockedRes = (await tx.$queryRawUnsafe(
        `SELECT id, status, quantity, "inventoryId" FROM "Reservation" WHERE id = $1 FOR UPDATE`,
        reservationId
      )) as ReservationRow[];

      if (lockedRes.length === 0) {
        throw new ReservationError("Reservation not found.", 404);
      }

      const res = lockedRes[0];

      // If already released, exit silently
      if (res.status === "RELEASED") {
        return { status: "RELEASED", alreadyDone: true };
      }

      if (res.status !== "PENDING") {
        throw new ReservationError(`Reservation is in state '${res.status}' and cannot be released.`, 400);
      }

      // Lock corresponding Inventory row
      const lockedInvs = (await tx.$queryRawUnsafe(
        `SELECT id, "reservedQuantity" FROM "Inventory" WHERE id = $1 FOR UPDATE`,
        res.inventoryId
      )) as InventoryRow[];

      if (lockedInvs.length === 0) {
        throw new ReservationError("Inventory not found for reservation.", 404);
      }

      const inv = lockedInvs[0];

      // Update Reservation Status
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: "RELEASED" },
      });

      // Update Inventory: release reserved hold
      const newReservedQuantity = Math.max(0, inv.reservedQuantity - res.quantity);

      await tx.inventory.update({
        where: { id: res.inventoryId },
        data: {
          reservedQuantity: newReservedQuantity,
        },
      });

      return { status: "RELEASED" };
    });
  },
};
