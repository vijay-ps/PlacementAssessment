import { NextRequest, NextResponse } from "next/server";
import { reservationEngine, ReservationError } from "@/lib/reservation";
import { z } from "zod";

const createReservationSchema = z.object({
  inventoryId: z.string().uuid("Invalid Inventory ID format."),
  quantity: z.number().int().positive("Quantity must be a positive integer."),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request schema
    const parseResult = createReservationSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { inventoryId, quantity } = parseResult.data;

    // Read Idempotency-Key from headers
    const idempotencyKey = request.headers.get("idempotency-key") || undefined;

    // Call reservation engine to atomically create reservation
    const result = await reservationEngine.createReservation(
      inventoryId,
      quantity,
      idempotencyKey,
      body
    );

    // Return the response, checking if it was an idempotency cached error response
    // (though in our code, errors thrown are handled by the catch block below)
    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    if (error instanceof ReservationError) {
      console.warn(`[Reservations API] Handled reservation error: ${error.message} (Status: ${error.statusCode})`);
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("[Reservations API] Unexpected error creating reservation:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
