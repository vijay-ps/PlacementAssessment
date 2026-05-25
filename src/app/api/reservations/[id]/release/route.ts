import { NextResponse } from "next/server";
import { reservationEngine, ReservationError } from "@/lib/reservation";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = "then" in props.params ? await props.params : props.params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json({ error: "Reservation ID is required." }, { status: 400 });
    }

    const result = await reservationEngine.releaseReservation(id);
    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof ReservationError) {
      console.warn(`[Release API] Handled reservation error: ${error.message} (Status: ${error.statusCode})`);
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("[Release API] Unexpected error releasing reservation:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
