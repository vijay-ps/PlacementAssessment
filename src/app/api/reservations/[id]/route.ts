import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { lazyCleanupExpiredReservations } from "@/lib/cleanup";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = "then" in props.params ? await props.params : props.params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json({ error: "Reservation ID is required." }, { status: 400 });
    }

    // 1. Run lazy cleanup first to check if this reservation is expired
    await lazyCleanupExpiredReservations();

    // 2. Fetch reservation details
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        inventory: {
          include: {
            product: true,
            warehouse: true,
          },
        },
      },
    });

    if (!reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    // 3. Format response
    const responseBody = {
      id: reservation.id,
      inventoryId: reservation.inventoryId,
      quantity: reservation.quantity,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
      productName: reservation.inventory.product.name,
      warehouseName: reservation.inventory.warehouse.name,
    };

    return NextResponse.json(responseBody);
  } catch (error: any) {
    console.error("[Get Reservation API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
