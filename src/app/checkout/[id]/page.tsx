"use client";

import { use, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Building,
  ShoppingBag,
  CreditCard,
  Check,
} from "lucide-react";

interface ReservationDetails {
  id: string;
  inventoryId: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED" | "EXPIRED";
  expiresAt: string;
  productName: string;
  warehouseName: string;
}

export default function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const router = useRouter();

  // State Management
  const [reservation, setReservation] = useState<ReservationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null); // in seconds
  const [status, setStatus] = useState<"PENDING" | "CONFIRMED" | "RELEASED" | "EXPIRED">("PENDING");
  const [confirming, setConfirming] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);
  
  // Timer Reference
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchReservationDetails = async () => {
      try {
        await Promise.resolve(); // Defer state mutations to next microtask tick
        setLoading(true);
        const res = await fetch(`/api/reservations/${id}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error("Reservation not found.");
          throw new Error("Failed to load reservation.");
        }
        const data = await res.json();
        setReservation(data);
        setStatus(data.status);

        if (data.status === "PENDING") {
          const expiresAt = new Date(data.expiresAt).getTime();
          const now = Date.now();
          const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
          setTimeRemaining(diff);

          if (diff <= 0) {
            setStatus("EXPIRED");
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load reservation.";
        setAlert({ type: "error", message: msg });
      } finally {
        setLoading(false);
      }
    };

    fetchReservationDetails();
  }, [id]);

  // Handle ticking countdown timer
  useEffect(() => {
    if (timeRemaining === null || status !== "PENDING") return;

    if (timeRemaining <= 0) {
      // Defer state updates to next tick to avoid synchronous setState inside render path
      Promise.resolve().then(() => {
        setStatus("EXPIRED");
        setTimeRemaining(0);
      });
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!);
          setStatus("EXPIRED");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeRemaining, status]);

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Confirm Purchase (Simulate checkout / banking payment gateway delay)
  const handleConfirm = async () => {
    if (status !== "PENDING") return;
    setConfirming(true);
    setAlert(null);

    try {
      // Simulate network / 3DS redirect/bank verification delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const res = await fetch(`/api/reservations/${id}/confirm`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 410) {
          setStatus("EXPIRED");
          throw new Error("Reservation expired. Stock has been automatically released back to inventory.");
        }
        throw new Error(data.error || "Confirmation failed.");
      }

      setStatus("CONFIRMED");
      setAlert({ type: "success", message: "Payment verified successfully! Your order is fulfilled." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Confirmation failed.";
      setAlert({ type: "error", message: msg });
    } finally {
      setConfirming(false);
    }
  };

  // Cancel reservation early
  const handleCancel = async () => {
    if (status !== "PENDING") return;
    setReleasing(true);
    setAlert(null);

    try {
      const res = await fetch(`/api/reservations/${id}/release`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to cancel reservation.");
      }

      setStatus("RELEASED");
      setAlert({ type: "success", message: "Reservation cancelled. Reserved stock released immediately." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel reservation.";
      setAlert({ type: "error", message: msg });
    } finally {
      setReleasing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 py-32">
        <Loader2 className="h-10 w-10 animate-spin text-cyan-400" />
        <p className="text-zinc-500 text-sm font-semibold">Retrieving Reservation Stock Hold State...</p>
      </div>
    );
  }

  const isExpired = status === "EXPIRED" || status === "RELEASED";
  const isUrgent = timeRemaining !== null && timeRemaining <= 120; // less than 2 minutes

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 flex-1 flex flex-col gap-8 w-full">
      {/* Back to Catalog Link */}
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm font-semibold mr-auto cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Product Catalog
      </button>

      {/* Expiry Alarm Banner */}
      {status === "PENDING" && isUrgent && (
        <div className="flex items-center gap-3 p-4 rounded-xl border bg-amber-500/10 border-amber-500/20 text-amber-300 animate-pulse">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          <div className="text-xs font-bold uppercase tracking-wider">
            Urgent: Your temporary stock reservation expires in {formatTime(timeRemaining!)}! Complete payment immediately.
          </div>
        </div>
      )}

      {/* Main Reservation Card */}
      <div className="rounded-2xl glass-panel border border-white/[0.08] shadow-2xl overflow-hidden flex flex-col">
        {/* Reservation Status Header */}
        <div className="p-6 md:p-8 border-b border-white/[0.06] bg-black/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-wider leading-none">
              Reservation ID
            </span>
            <span className="font-mono text-xs text-zinc-300 select-all font-semibold">
              {id}
            </span>
          </div>

          <div>
            {status === "PENDING" && (
              <span className="px-3.5 py-1.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-extrabold border border-amber-500/20 flex items-center gap-2 shadow-lg shadow-amber-950/20">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
                RESERVED HOLD ACTIVE
              </span>
            )}
            {status === "CONFIRMED" && (
              <span className="px-3.5 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-extrabold border border-emerald-500/20 flex items-center gap-2 shadow-lg shadow-emerald-950/20">
                <CheckCircle2 className="h-3.5 w-3.5" />
                PURCHASE CONFIRMED
              </span>
            )}
            {status === "RELEASED" && (
              <span className="px-3.5 py-1.5 rounded-full bg-zinc-800 text-zinc-400 text-xs font-extrabold border border-zinc-700 flex items-center gap-2">
                <XCircle className="h-3.5 w-3.5" />
                CANCELLED / RELEASED
              </span>
            )}
            {status === "EXPIRED" && (
              <span className="px-3.5 py-1.5 rounded-full bg-rose-500/10 text-rose-400 text-xs font-extrabold border border-rose-500/20 flex items-center gap-2 shadow-lg shadow-rose-950/20">
                <XCircle className="h-3.5 w-3.5" />
                EXPIRED
              </span>
            )}
          </div>
        </div>

        {/* Order Details Body */}
        <div className="p-6 md:p-8 flex flex-col md:flex-row items-stretch justify-between gap-8">
          <div className="flex-1 flex flex-col gap-6">
            <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <ShoppingBag className="h-6 w-6 text-violet-400" /> Checkout Details
            </h2>

            {reservation && (
              <div className="flex flex-col gap-4 bg-zinc-950/40 border border-white/[0.04] p-5 rounded-xl">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-500 font-semibold">Reserved Product</span>
                  <span className="font-extrabold text-white text-right">{reservation.productName}</span>
                </div>
                
                <div className="flex justify-between items-center text-sm border-t border-white/[0.04] pt-3">
                  <span className="text-zinc-500 font-semibold">Fulfillment Warehouse</span>
                  <span className="font-extrabold text-zinc-300 text-right flex items-center gap-1.5">
                    <Building className="h-3.5 w-3.5 text-zinc-500" /> {reservation.warehouseName}
                  </span>
                </div>

                <div className="flex justify-between items-center text-sm border-t border-white/[0.04] pt-3">
                  <span className="text-zinc-500 font-semibold">Reserved Quantity</span>
                  <span className="font-extrabold text-cyan-400 text-right">{reservation.quantity} unit(s)</span>
                </div>

                <div className="flex justify-between items-center text-sm border-t border-white/[0.04] pt-3">
                  <span className="text-zinc-500 font-semibold">Temporary Hold Period</span>
                  <span className="font-extrabold text-zinc-400 text-right">10 Minutes</span>
                </div>
              </div>
            )}
          </div>

          {/* Countdown Clock Display */}
          <div className="w-full md:w-64 flex flex-col justify-center items-center p-6 bg-zinc-950/45 rounded-xl border border-white/[0.04] text-center shrink-0">
            {status === "PENDING" && timeRemaining !== null ? (
              <div className="flex flex-col gap-2">
                <div className="h-12 w-12 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 mx-auto mb-2 border border-cyan-500/25">
                  <Clock className={`h-6 w-6 ${isUrgent ? "animate-pulse text-amber-400" : ""}`} />
                </div>
                <span className="text-3xl font-extrabold font-mono tracking-tight text-white leading-none">
                  {formatTime(timeRemaining)}
                </span>
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">
                  Stock Reserved Hold Timer
                </span>
              </div>
            ) : status === "CONFIRMED" ? (
              <div className="flex flex-col gap-2">
                <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mx-auto mb-2 border border-emerald-500/25 shadow-md shadow-emerald-950/10">
                  <Check className="h-6 w-6" />
                </div>
                <span className="text-lg font-extrabold text-emerald-400 leading-tight">Fulfilled ✅</span>
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider leading-relaxed">
                  Stock is permanently decremented in warehouse database.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="h-12 w-12 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-400 mx-auto mb-2 border border-rose-500/25 shadow-md shadow-rose-950/10">
                  <Lock className="h-6 w-6" />
                </div>
                <span className="text-lg font-extrabold text-rose-400 leading-tight">Stock Released 🔒</span>
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider leading-relaxed">
                  Hold expired or released. This stock is now back in catalog.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Alerts inside Card */}
        {alert && (
          <div
            className={`flex items-start gap-3 p-5 border-t ${
              alert.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/20 text-rose-300"
            }`}
          >
            <div className="mt-0.5 font-bold">
              {alert.type === "success" ? "✓" : "⚠"}
            </div>
            <div className="flex-1 text-xs font-semibold">{alert.message}</div>
          </div>
        )}

        {/* Buttons Action Bar */}
        {status === "PENDING" && (
          <div className="p-6 md:p-8 bg-black/25 border-t border-white/[0.06] flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleConfirm}
              disabled={confirming || releasing}
              className="flex-1 h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-2 cursor-pointer border border-violet-500/20"
            >
              {confirming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying UPI & 3DS Latency...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  Confirm Purchase & Pay
                </>
              )}
            </button>

            <button
              onClick={handleCancel}
              disabled={confirming || releasing}
              className="px-6 h-12 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 disabled:opacity-50 text-zinc-400 hover:text-white transition-all text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              {releasing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Release Stock Early"
              )}
            </button>
          </div>
        )}
      </div>

      {/* Safety Instructions Panel */}
      <div className="p-6 rounded-2xl bg-white/[0.01] border border-white/[0.03] flex items-start gap-4">
        <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20 text-violet-400 shrink-0">
          <Lock className="h-5 w-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-white">How temporary reservations work:</h4>
          <p className="text-xs text-zinc-500 leading-relaxed mt-1">
            During checkout, these items are locked and marked as unavailable for other buyers. If checkout is completed within 10 minutes, stock is permanently decremented. If cancelled or timeout occurs, stock is instantly released back to the global pool without administrative intervention.
          </p>
        </div>
      </div>
    </div>
  );
}
