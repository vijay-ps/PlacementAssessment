"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  MapPin,
  ShieldCheck,
  RefreshCw,
  TrendingUp,
  Loader2,
  Lock,
  Layers,
  ArrowRight,
  Database,
  History,
} from "lucide-react";

interface WarehouseInventory {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  totalQuantity: number;
  reservedQuantity: number;
  availableStock: number;
}

interface Product {
  id: string;
  name: string;
  description: string;
  inventories: WarehouseInventory[];
}

export default function CatalogPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Selection states: productId -> warehouseInventoryId
  const [selections, setSelections] = useState<Record<string, string>>({});
  // Quantities states: productId -> number
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // Loading states for reservation buttons: productId -> boolean
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  
  // Toast / Error state
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Stable ref to catalog reload callback to prevent useEffect cascading render triggers
  const fetchProductsRef = useRef<(isSilent?: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    const fetchProducts = async (isSilent = false) => {
      try {
        await Promise.resolve(); // Defer state mutations to next microtask tick
        if (!isSilent) setLoading(true);
        else setRefreshing(true);
        
        const res = await fetch("/api/products");
        if (!res.ok) throw new Error("Failed to fetch catalog.");
        const data = await res.json();
        setProducts(data);
        
        setSelections((prev) => {
          const newSelections = { ...prev };
          data.forEach((p: Product) => {
            if (!newSelections[p.id] && p.inventories.length > 0) {
              const inStockInv = p.inventories.find((i) => i.availableStock > 0);
              newSelections[p.id] = inStockInv ? inStockInv.id : p.inventories[0].id;
            }
          });
          return newSelections;
        });

        setQuantities((prev) => {
          const newQuantities = { ...prev };
          data.forEach((p: Product) => {
            if (!newQuantities[p.id]) {
              newQuantities[p.id] = 1;
            }
          });
          return newQuantities;
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load product catalog.";
        setAlert({ type: "error", message: msg });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };

    fetchProductsRef.current = fetchProducts;
    fetchProducts();
  }, []);

  const handleReserve = async (productId: string) => {
    const inventoryId = selections[productId];
    const qty = quantities[productId] || 1;
    
    if (!inventoryId) {
      setAlert({ type: "error", message: "Please select a warehouse first." });
      return;
    }

    setSubmitting((prev) => ({ ...prev, [productId]: true }));
    setAlert(null);

    // Generate a unique idempotency key for this click session
    // This demonstrates double-click protection and idempotency handling
    const rawKey = `key-${inventoryId}-${qty}-${Date.now()}`;
    
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": rawKey,
        },
        body: JSON.stringify({ inventoryId, quantity: qty }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          throw new Error("Insufficient stock available in this warehouse.");
        }
        throw new Error(data.error || "Failed to reserve stock.");
      }

      setAlert({
        type: "success",
        message: `Inventory reserved successfully! Redirecting to secure checkout...`,
      });

      // Redirect to checkout after 1.5s delay
      setTimeout(() => {
        router.push(`/checkout/${data.id}`);
      }, 1200);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reserve stock.";
      setAlert({ type: "error", message: msg });
      // Refresh catalog to pull latest stock levels in case of conflict
      fetchProductsRef.current(true);
    } finally {
      setSubmitting((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const handleQuantityChange = (productId: string, val: number, maxStock: number) => {
    const parsed = Math.max(1, Math.min(maxStock, val));
    setQuantities((prev) => ({ ...prev, [productId]: parsed }));
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 flex-1 flex flex-col gap-10">
      {/* Hero Section */}
      <div className="relative rounded-2xl overflow-hidden glass-panel p-8 md:p-12 border border-white/[0.08] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-violet-600/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-cyan-600/10 rounded-full blur-3xl"></div>
        
        <div className="flex-1 flex flex-col gap-4 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-semibold border border-cyan-500/20 max-w-fit">
            <ShieldCheck className="h-3.5 w-3.5" /> Concurrency Guard Engaged
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            Instant Inventory Hold Platform
          </h1>
          <p className="text-zinc-400 max-w-xl text-base leading-relaxed">
            Eliminate double-selling under high traffic. Acquire 10-minute temporary stock reservations atomically using row-level locking (<code className="text-cyan-400 bg-cyan-950/40 px-1 py-0.5 rounded text-xs">SELECT FOR UPDATE</code>) on Postgres.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto relative z-10">
          <button
            onClick={() => fetchProductsRef.current(true)}
            disabled={refreshing}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors px-6 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh Catalog
          </button>
        </div>
      </div>

      {/* Alert Banners */}
      {alert && (
        <div
          className={`flex items-start gap-3 p-4 rounded-xl border animate-fade-in ${
            alert.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/20 text-rose-300"
          }`}
        >
          <div className="mt-0.5 font-bold">
            {alert.type === "success" ? "✓" : "⚠"}
          </div>
          <div className="flex-1 text-sm font-medium">{alert.message}</div>
          <button onClick={() => setAlert(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Main Catalog Grid */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Package className="h-5 w-5 text-violet-400" /> High-Demand Products
          </h2>
          <span className="text-xs text-zinc-500 font-semibold flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" /> Real-time DB inventory
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="h-96 rounded-2xl border border-white/[0.04] bg-white/[0.01] shimmer-bg"></div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/45">
            <Package className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400 font-medium">No products found in the catalog.</p>
            <p className="text-zinc-600 text-xs mt-1">Please re-run the database seeder script.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {products.map((product) => {
              const selectedInvId = selections[product.id];
              const selectedInv = product.inventories.find((i) => i.id === selectedInvId);
              const maxAvailable = selectedInv ? selectedInv.availableStock : 0;
              const isOutOfStock = product.inventories.every((i) => i.availableStock === 0);
              const quantity = quantities[product.id] || 1;

              return (
                <div
                  key={product.id}
                  className="rounded-2xl glass-panel glass-panel-hover flex flex-col shadow-xl overflow-hidden group"
                >
                  {/* Card Header graphic placeholder */}
                  <div className="h-44 bg-gradient-to-br from-zinc-900 to-black p-6 relative flex flex-col justify-between border-b border-white/[0.04]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(139,92,246,0.15),transparent_70%)]"></div>
                    <div className="flex items-center justify-between relative z-10">
                      <span className="text-[10px] tracking-wider text-cyan-400 font-extrabold uppercase bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/30">
                        IN STOCK
                      </span>
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-zinc-500">
                        <Layers className="h-3 w-3" /> {product.inventories.length} Warehouses
                      </div>
                    </div>
                    
                    <div className="relative z-10 mt-auto">
                      <h3 className="text-xl font-bold tracking-tight text-white leading-tight group-hover:text-cyan-400 transition-colors">
                        {product.name}
                      </h3>
                      <p className="text-zinc-500 text-xs line-clamp-2 mt-1 leading-relaxed">
                        {product.description}
                      </p>
                    </div>
                  </div>

                  {/* Card Body / Warehouse Selector */}
                  <div className="p-6 flex-1 flex flex-col gap-5 bg-black/15">
                    <div className="flex flex-col gap-2.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                        Select Fulfillment Warehouse
                      </span>
                      <div className="flex flex-col gap-2">
                        {product.inventories.map((inv) => {
                          const isSelected = selectedInvId === inv.id;
                          const isInvEmpty = inv.availableStock === 0;

                          return (
                            <button
                              key={inv.id}
                              disabled={isInvEmpty}
                              onClick={() => {
                                setSelections((prev) => ({ ...prev, [product.id]: inv.id }));
                                setQuantities((prev) => ({ ...prev, [product.id]: 1 }));
                              }}
                              className={`flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-all ${
                                isInvEmpty
                                  ? "opacity-40 border-zinc-900 bg-zinc-950/20 cursor-not-allowed"
                                  : isSelected
                                  ? "border-violet-500 bg-violet-600/10 text-white shadow-md shadow-violet-950/20"
                                  : "border-zinc-800 bg-zinc-900/35 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/30"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <MapPin className={`h-4 w-4 ${isSelected ? "text-violet-400" : "text-zinc-500"}`} />
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold leading-tight">{inv.warehouseName}</span>
                                  <span className="text-[10px] text-zinc-500 leading-none mt-0.5">{inv.warehouseLocation}</span>
                                </div>
                              </div>
                              
                              <div className="flex flex-col items-end">
                                <span className={`text-xs font-extrabold ${isInvEmpty ? "text-rose-400" : isSelected ? "text-cyan-400" : "text-zinc-300"}`}>
                                  {inv.availableStock} / {inv.totalQuantity}
                                </span>
                                <span className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wider mt-0.5">
                                  Available
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Quantity Picker & Reserve Action */}
                    {!isOutOfStock ? (
                      <div className="mt-auto flex flex-col gap-4 pt-3 border-t border-white/[0.04]">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-400">Order Quantity</span>
                          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-1 h-9">
                            <button
                              onClick={() => handleQuantityChange(product.id, quantity - 1, maxAvailable)}
                              className="px-2.5 text-zinc-400 hover:text-white transition-colors text-sm font-semibold"
                            >
                              -
                            </button>
                            <span className="px-3 text-xs font-bold text-white min-w-[2rem] text-center">
                              {quantity}
                            </span>
                            <button
                              onClick={() => handleQuantityChange(product.id, quantity + 1, maxAvailable)}
                              className="px-2.5 text-zinc-400 hover:text-white transition-colors text-sm font-semibold"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <button
                          onClick={() => handleReserve(product.id)}
                          disabled={submitting[product.id] || maxAvailable === 0}
                          className="w-full h-11 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-2 cursor-pointer border border-violet-500/20 group/btn"
                        >
                          {submitting[product.id] ? (
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                          ) : (
                            <>
                              <Lock className="h-4 w-4 text-violet-300" />
                              Reserve Units Lock
                              <ArrowRight className="h-3.5 w-3.5 text-indigo-300 group-hover/btn:translate-x-1 transition-transform" />
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="mt-auto pt-3 border-t border-white/[0.04]">
                        <div className="w-full py-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold rounded-xl text-center flex items-center justify-center gap-2">
                          <Lock className="h-4 w-4" /> Temporarily Fully Sold Out
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tech Stack Info Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-white/[0.05]">
        <div className="p-5 rounded-2xl bg-white/[0.01] border border-white/[0.03] flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20 text-violet-400 shrink-0">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Row-Level Locks</h4>
            <p className="text-xs text-zinc-500 leading-relaxed mt-1">
              Guarantees strict FIFO serialization at database layer using PostgreSQL interactive transactions + <code className="text-cyan-400">FOR UPDATE</code> queries.
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white/[0.01] border border-white/[0.03] flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 text-cyan-400 shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Double-Click Proof</h4>
            <p className="text-xs text-zinc-500 leading-relaxed mt-1">
              Protects write actions using crypto hashed request payload mappings saved transactional alongside database updates.
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white/[0.01] border border-white/[0.03] flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-400 shrink-0">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Lazy Cleanup System</h4>
            <p className="text-xs text-zinc-500 leading-relaxed mt-1">
              Checks and releases expired stocks lazily on write-heavy catalog updates and reservation creations, avoiding heavy worker queues.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
