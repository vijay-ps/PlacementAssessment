import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { lazyCleanupExpiredReservations } from "@/lib/cleanup";

export async function GET() {
  try {
    // 1. Run lazy cleanup of expired reservations to ensure stock is fully up to date
    await lazyCleanupExpiredReservations();

    // 2. Fetch all products, including their warehouse inventories
    const products = await prisma.product.findMany({
      include: {
        inventories: {
          include: {
            warehouse: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // 3. Format output and calculate available stock dynamically
    const formattedProducts = products.map((product) => {
      const inventories = product.inventories.map((inv) => {
        const availableStock = Math.max(0, inv.totalQuantity - inv.reservedQuantity);
        return {
          id: inv.id,
          warehouseId: inv.warehouseId,
          warehouseName: inv.warehouse.name,
          warehouseLocation: inv.warehouse.location,
          totalQuantity: inv.totalQuantity,
          reservedQuantity: inv.reservedQuantity,
          availableStock,
        };
      });

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        createdAt: product.createdAt,
        inventories,
      };
    });

    return NextResponse.json(formattedProducts);
  } catch (error: any) {
    console.error("[Products API] Error fetching products:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
