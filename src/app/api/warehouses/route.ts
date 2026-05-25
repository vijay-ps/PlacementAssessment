import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const warehouses = await prisma.warehouse.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
    return NextResponse.json(warehouses);
  } catch (error: any) {
    console.error("[Warehouses API] Error fetching warehouses:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
