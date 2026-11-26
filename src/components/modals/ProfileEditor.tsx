"use client";

import React, { useRef, useState } from "react";
import { Camera, CheckCircle2, GraduationCap, Repeat, Save, Star, X } from "lucide-react";
import { AGU_DEPARTMENTS } from "@/lib/constants";
import { compressImage } from "@/lib/image";
import { getInitials } from "@/lib/utils";
import { useApp } from "@/context/AppContext";

export function ProfileEditor() {
  const { currentUser, updateProfile } = useApp();

  const [fullName, setFullName] = useState(currentUser?.fullName || "");
  const [department, setDepartment] = useState(
    currentUser?.department || AGU_DEPARTMENTS[0]
  );
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(
    currentUser?.avatarUrl
  );
  const [error, setError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!currentUser) return null;

  const departments = AGU_DEPARTMENTS.includes(department)
    ? AGU_DEPARTMENTS
    : [department, ...AGU_DEPARTMENTS];

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setIsCompressing(true);
    try {
      // Avatars only need to be small; still compressed via canvas
      setAvatarUrl(await compressImage(file, 400));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Görsel yüklenemedi.");
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fullName.trim().length < 3) {
      setError("Lütfen adınızı ve soyadınızı eksiksiz girin.");
      return;
    }
    setError(null);
    updateProfile(fullName, department, avatarUrl);
  };

  const dirty =
    fullName.trim() !== currentUser.fullName ||
    department !== currentUser.department ||
    (avatarUrl || "") !== (currentUser.avatarUrl || "");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Stats */}
      <div className="space-y-3 lg:order-2">
        <div className="p-4 rounded-2xl bg-emerald-600 text-white flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
            <Repeat className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-extrabold leading-none">
              {currentUser.completedSwaps}
            </div>
            <div className="text-xs text-emerald-50 mt-1">
              Tamamlanan Kampüs Takası
            </div>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
            <Star className="w-5 h-5 fill-amber-400" />
          </div>
          <div>
            <div className="text-lg font-extrabold text-slate-900 leading-none">
              {currentUser.rating.toFixed(1)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Güven Puanı ({currentUser.reviewCount} değerlendirme)
            </div>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 text-xs text-slate-600 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Doğrulanmış @agu.edu.tr
          </div>
          <div>{currentUser.email}</div>
          <div className="text-slate-400">Üyelik: {currentUser.joinedAt}</div>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Takas sayacı; “Satıldı/Verildi” işaretlediğinde veya rezervasyonu
          “Elden Teslim Edildi” yaptığında hem satıcı hem alıcı için otomatik artar.
        </p>
      </div>

      {/* Edit form */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-2 lg:order-1 p-5 rounded-2xl bg-white border border-slate-200 space-y-5"
      >
        <div>
          <h3 className="text-base font-extrabold text-slate-900">Profil Bilgilerim</h3>
          <p className="text-xs text-slate-500">
            Güncellediğin bilgiler Firestore’a kaydedilir ve ilanlarında da güncellenir.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            {avatarUrl ? (
              <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-emerald-500">
                <img src={avatarUrl} alt="Profil" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setAvatarUrl(undefined)}
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shadow"
                  title="Fotoğrafı Kaldır"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold text-2xl flex items-center justify-center">
                {getInitials(fullName || "AGÜ")}
              </div>
            )}
            <button
              type="button"
              disabled={isCompressing}
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-xl bg-slate-900 hover:bg-emerald-600 text-white flex items-center justify-center shadow-md transition-colors cursor-pointer disabled:opacity-50"
              title="Fotoğraf Değiştir"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatar}
              className="hidden"
            />
          </div>
          <p className="text-xs text-slate-500">
            {isCompressing
              ? "Fotoğraf sıkıştırılıyor..."
              : "Fotoğraf otomatik sıkıştırılır. Yüklemezsen baş harfler kullanılır."}
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
            Ad Soyad
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (error) setError(null);
            }}
            className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
            Bölüm
          </label>
          <div className="relative">
            <GraduationCap className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-emerald-500"
            >
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!dirty || isCompressing}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            <span>Değişiklikleri Kaydet</span>
          </button>
        </div>
      </form>
    </div>
  );
}
