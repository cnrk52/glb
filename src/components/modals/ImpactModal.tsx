"use client";

import React, { useMemo } from "react";
import { Leaf, Package, PiggyBank, Pin, Repeat, Users, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { formatPrice } from "@/lib/utils";

/** Report (GLB300) targets – lower bound of each range. */
const TARGETS = {
  students: 35,
  listings: 25,
  needs: 10,
  swaps: 10,
  savings: 2500,
};

export function ImpactModal() {
  const { isImpactOpen, closeImpact, users, currentUser, products, needPosts } =
    useApp();

  const stats = useMemo(() => {
    const ids = new Set(users.map((u) => u.id));
    if (currentUser) ids.add(currentUser.id);

    const soldProducts = products.filter((p) => p.status === "sold");
    const activeProducts = products.filter((p) => p.status !== "sold");
    const openNeeds = needPosts.filter((n) => n.status === "open");
    const fulfilledNeeds = needPosts.filter((n) => n.status === "fulfilled");

    // Savings = estimated new price - price actually paid (0 for free / borrow)
    const savingOf = (p: (typeof products)[number]) => {
      if (!p.retailPrice || p.retailPrice <= 0) return 0;
      const paid = p.listingType === "sale" || !p.listingType ? p.price : 0;
      return Math.max(0, p.retailPrice - paid);
    };

    const totalSavings = soldProducts.reduce((sum, p) => sum + savingOf(p), 0);
    const potentialSavings = activeProducts.reduce(
      (sum, p) => sum + savingOf(p),
      0
    );
    const completedWithoutRetail = soldProducts.filter(
      (p) => !p.retailPrice
    ).length;

    return {
      students: ids.size,
      activeListings: activeProducts.length,
      openNeeds: openNeeds.length,
      completedSwaps: soldProducts.length,
      fulfilledNeeds: fulfilledNeeds.length,
      freeOrBorrowShared: soldProducts.filter(
        (p) => p.listingType === "free" || p.listingType === "borrow" || p.isFree
      ).length,
      totalSavings,
      potentialSavings,
      completedWithoutRetail,
    };
  }, [users, currentUser, products, needPosts]);

  if (!isImpactOpen) return null;

  const cards = [
    {
      icon: <Users className="w-5 h-5" />,
      label: "Kayıtlı AGÜ Öğrencisi",
      value: String(stats.students),
      target: TARGETS.students,
      current: stats.students,
      hint: `Hedef: 35–50 öğrenci`,
    },
    {
      icon: <Package className="w-5 h-5" />,
      label: "Aktif Vitrin İlanı",
      value: String(stats.activeListings),
      target: TARGETS.listings,
      current: stats.activeListings,
      hint: `Hedef: 25–35 ilan`,
    },
    {
      icon: <Pin className="w-5 h-5" />,
      label: "Açık İhtiyaç İsteği",
      value: String(stats.openNeeds),
      target: TARGETS.needs,
      current: stats.openNeeds,
      hint: `Hedef: 10–15 istek`,
    },
    {
      icon: <Repeat className="w-5 h-5" />,
      label: "Tamamlanan Takas",
      value: String(stats.completedSwaps),
      target: TARGETS.swaps,
      current: stats.completedSwaps,
      hint: `Hedef: 10–15 takas`,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden my-6">
        <div className="p-6 bg-gradient-to-r from-emerald-900 via-slate-900 to-slate-900 text-white flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mb-2">
              <Leaf className="w-3.5 h-3.5" />
              SDG 4 & SDG 12 • Canlı Veri
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold">Kampüs Etkisi (Impact)</h2>
            <p className="text-xs text-slate-300 mt-1">
              Firestore verilerinden anlık hesaplanır; GLB300 raporundaki hedeflerle karşılaştırılır.
            </p>
          </div>
          <button
            type="button"
            onClick={closeImpact}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Savings hero */}
          <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center">
                <PiggyBank className="w-7 h-7" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Toplam Öğrenci Tasarrufu
                </div>
                <div className="text-3xl font-extrabold text-emerald-700">
                  {formatPrice(stats.totalSavings)}
                  {stats.totalSavings === 0 && (
                    <span className="sr-only">0 ₺</span>
                  )}
                </div>
                <div className="text-[11px] text-emerald-900/70 mt-0.5">
                  Σ (Tahmini sıfır fiyatı − ödenen fiyat) • yalnızca satıldı/verildi işaretli ilanlar
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-500">Potansiyel (aktif ilanlar)</div>
              <div className="text-lg font-extrabold text-slate-800">
                {formatPrice(stats.potentialSavings)}
              </div>
              <div className="text-[11px] text-slate-400">Hedef: 2.500–6.000 ₺</div>
            </div>
          </div>

          {/* Metric cards with progress */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cards.map((c) => {
              const pct = Math.min(100, Math.round((c.current / c.target) * 100));
              return (
                <div
                  key={c.label}
                  className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center">
                        {c.icon}
                      </div>
                      <span className="text-xs font-bold text-slate-600">{c.label}</span>
                    </div>
                    <span className="text-2xl font-extrabold text-slate-900">{c.value}</span>
                  </div>
                  <div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                      <span>{c.hint}</span>
                      <span>%{pct}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-xl font-extrabold text-slate-900">{stats.fulfilledNeeds}</div>
              <div className="text-[11px] text-slate-500">Karşılanan İhtiyaç İlanı</div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-xl font-extrabold text-slate-900">{stats.freeOrBorrowShared}</div>
              <div className="text-[11px] text-slate-500">Ücretsiz / Ödünç Paylaşım</div>
            </div>
          </div>

          {stats.completedWithoutRetail > 0 && (
            <p className="text-[11px] text-slate-400">
              {stats.completedWithoutRetail} tamamlanan ilanda “Tahmini Sıfır Fiyatı” girilmediği için tasarruf hesabına dahil edilmedi.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
