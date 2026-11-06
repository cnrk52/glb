"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  AppNotification,
  BudgetPreferenceType,
  CampusHandoverPoint,
  DirectMessage,
  NeedPost,
  NeedUrgency,
  Offer,
  ProductCategory,
  ProductCondition,
  ProductItem,
  ProductStatus,
  Reservation,
  User,
} from "@/types";
import {
  DEMO_USERS,
  INITIAL_DIRECT_MESSAGES,
  INITIAL_NEED_POSTS,
  INITIAL_NOTIFICATIONS,
  INITIAL_OFFERS,
  INITIAL_PRODUCTS,
  INITIAL_RESERVATIONS,
} from "@/lib/mock-data";
import { AGU_EMAIL_REGEX } from "@/lib/constants";

export type MainTab = "vitrin" | "wishboard";
export type DashboardTab =
  | "my_products"
  | "my_needs"
  | "offers_reservations"
  | "messages";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: "success" | "info" | "warning" | "error";
}

interface AppContextType {
  // Firebase Live Status
  isFirestoreConnected: boolean;

  // Auth & User State
  currentUser: User | null;
  isOnboardingOpen: boolean;
  loginWithAguEmail: (email: string, password: string) => { ok: boolean; error?: string };
  registerWithAguEmail: (email: string, password: string) => { ok: boolean; error?: string };
  completeOnboarding: (fullName: string, department: string, avatarUrl?: string) => void;
  loginAsDemoUser: (userId?: string) => void;
  logout: () => void;

  // Navigation & Global Search
  activeMainTab: MainTab;
  setActiveMainTab: (tab: MainTab) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Modals & Drawers
  isAddListingModalOpen: boolean;
  addListingInitialMode: "product" | "need";
  openAddListingModal: (mode?: "product" | "need") => void;
  closeAddListingModal: () => void;

  selectedProduct: ProductItem | null;
  setSelectedProduct: (product: ProductItem | null) => void;

  selectedNeedPost: NeedPost | null;
  setSelectedNeedPost: (need: NeedPost | null) => void;

  isDashboardOpen: boolean;
  activeDashboardTab: DashboardTab;
  openDashboard: (tab?: DashboardTab) => void;
  closeDashboard: () => void;

  // Data Collections
  products: ProductItem[];
  needPosts: NeedPost[];
  offers: Offer[];
  reservations: Reservation[];
  directMessages: DirectMessage[];
  notifications: AppNotification[];
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  showToast: (title: string, description?: string, type?: ToastMessage["type"]) => void;

  // Marketplace Actions
  addProduct: (input: {
    title: string;
    description: string;
    price: number;
    isFree: boolean;
    category: Exclude<ProductCategory, "all">;
    condition: ProductCondition;
    images: string[];
    handoverPoint: CampusHandoverPoint;
    courseCode?: string;
  }) => void;
  toggleFavoriteProduct: (productId: string) => void;
  updateProductStatus: (productId: string, status: ProductStatus) => void;
  deleteProduct: (productId: string) => void;

  // Q&A Actions
  askProductQuestion: (productId: string, questionText: string) => void;
  answerProductQuestion: (productId: string, questionId: string, answerText: string) => void;

  // Offer & Reservation Actions
  createOffer: (productId: string, offeredPrice: number, note?: string) => void;
  respondToOffer: (offerId: string, decision: "accepted" | "rejected") => void;
  createReservation: (
    productId: string,
    handoverPoint: CampusHandoverPoint,
    proposedTime: string,
    pickupNote: string
  ) => void;
  updateReservationStatus: (
    reservationId: string,
    status: "approved" | "completed" | "cancelled"
  ) => void;

  // Wishboard (İhtiyaç Panosu) Actions
  addNeedPost: (input: {
    title: string;
    description: string;
    category: Exclude<ProductCategory, "all">;
    urgency: NeedUrgency;
    budgetType: BudgetPreferenceType;
    maxBudget?: number;
    budgetLabel: string;
    handoverPreference: CampusHandoverPoint;
    courseCode?: string;
  }) => void;
  markNeedPostFulfilled: (needPostId: string) => void;
  deleteNeedPost: (needPostId: string) => void;
  sendHaveItemMessage: (input: {
    needPostId: string;
    message: string;
    linkedProductId?: string;
    proposedPrice?: number;
    isFreeOffer: boolean;
    handoverPoint: CampusHandoverPoint;
  }) => void;
  replyToDirectMessage: (messageId: string, text: string) => void;

  // Notifications & Demo Utilities
  markAllNotificationsRead: () => void;
  markNotificationRead: (id: string) => void;
  resetDemoData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  USER: "h2h_agu_current_user_v1",
  PRODUCTS: "h2h_agu_products_v1",
  NEEDS: "h2h_agu_needs_v1",
  OFFERS: "h2h_agu_offers_v1",
  RESERVATIONS: "h2h_agu_reservations_v1",
  MESSAGES: "h2h_agu_messages_v1",
  NOTIFICATIONS: "h2h_agu_notifications_v1",
};

/**
 * Strips undefined fields so Firestore setDoc never rejects optional undefined properties.
 */
function sanitizeForFirestore<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

async function saveDocToFirestore<T extends { id: string }>(
  collectionName: string,
  item: T
) {
  if (!db) return;
  try {
    await setDoc(
      doc(db, collectionName, item.id),
      sanitizeForFirestore(item) as Record<string, unknown>
    );
  } catch (err) {
    console.warn(`Firestore write warning (${collectionName}/${item.id}):`, err);
  }
}

async function removeDocFromFirestore(collectionName: string, id: string) {
  if (!db) return;
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (err) {
    console.warn(`Firestore delete warning (${collectionName}/${id}):`, err);
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isFirestoreConnected, setIsFirestoreConnected] = useState(false);
  const hasSeededRef = useRef(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

  const [activeMainTab, setActiveMainTab] = useState<MainTab>("vitrin");
  const [searchQuery, setSearchQuery] = useState("");

  const [isAddListingModalOpen, setIsAddListingModalOpen] = useState(false);
  const [addListingInitialMode, setAddListingInitialMode] = useState<"product" | "need">("product");

  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [selectedNeedPost, setSelectedNeedPost] = useState<NeedPost | null>(null);

  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [activeDashboardTab, setActiveDashboardTab] = useState<DashboardTab>("my_products");

  const [products, setProducts] = useState<ProductItem[]>(INITIAL_PRODUCTS);
  const [needPosts, setNeedPosts] = useState<NeedPost[]>(INITIAL_NEED_POSTS);
  const [offers, setOffers] = useState<Offer[]>(INITIAL_OFFERS);
  const [reservations, setReservations] = useState<Reservation[]>(INITIAL_RESERVATIONS);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>(INITIAL_DIRECT_MESSAGES);
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // 1. Load persisted user session and fallback local cache on client mount
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
      if (savedUser) {
        const parsedUser: User = JSON.parse(savedUser);
        setCurrentUser(parsedUser);
        if (parsedUser.needsOnboarding) {
          setIsOnboardingOpen(true);
        }
      }

      const savedProducts = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
      if (savedProducts) setProducts(JSON.parse(savedProducts));

      const savedNeeds = localStorage.getItem(STORAGE_KEYS.NEEDS);
      if (savedNeeds) setNeedPosts(JSON.parse(savedNeeds));

      const savedOffers = localStorage.getItem(STORAGE_KEYS.OFFERS);
      if (savedOffers) setOffers(JSON.parse(savedOffers));

      const savedRes = localStorage.getItem(STORAGE_KEYS.RESERVATIONS);
      if (savedRes) setReservations(JSON.parse(savedRes));

      const savedMessages = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      if (savedMessages) setDirectMessages(JSON.parse(savedMessages));

      const savedNotifs = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      if (savedNotifs) setNotifications(JSON.parse(savedNotifs));
    } catch (e) {
      console.warn("Failed to read state from localStorage:", e);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // 2. Real-time Firebase Cloud Firestore Subscriptions & Auto-Seeding
  useEffect(() => {
    if (!db) return;

    const unsubProducts = onSnapshot(
      collection(db, "products"),
      (snapshot) => {
        setIsFirestoreConnected(true);
        if (snapshot.empty && !hasSeededRef.current) {
          hasSeededRef.current = true;
          // Seed initial AGU data into Firestore on first run
          INITIAL_PRODUCTS.forEach((p) => saveDocToFirestore("products", p));
          INITIAL_NEED_POSTS.forEach((n) => saveDocToFirestore("needPosts", n));
          INITIAL_OFFERS.forEach((o) => saveDocToFirestore("offers", o));
          INITIAL_RESERVATIONS.forEach((r) => saveDocToFirestore("reservations", r));
          INITIAL_DIRECT_MESSAGES.forEach((m) => saveDocToFirestore("directMessages", m));
          INITIAL_NOTIFICATIONS.forEach((nf) => saveDocToFirestore("notifications", nf));
          DEMO_USERS.forEach((u) => saveDocToFirestore("users", u));
          return;
        }
        if (!snapshot.empty) {
          const loaded = snapshot.docs.map((d) => d.data() as ProductItem);
          setProducts(loaded);
        }
      },
      (err) => {
        console.warn("Firestore products listener fallback:", err.message);
        setIsFirestoreConnected(false);
      }
    );

    const unsubNeeds = onSnapshot(
      collection(db, "needPosts"),
      (snapshot) => {
        if (!snapshot.empty) {
          setNeedPosts(snapshot.docs.map((d) => d.data() as NeedPost));
        }
      },
      () => {}
    );

    const unsubOffers = onSnapshot(
      collection(db, "offers"),
      (snapshot) => {
        if (!snapshot.empty) {
          setOffers(snapshot.docs.map((d) => d.data() as Offer));
        }
      },
      () => {}
    );

    const unsubReservations = onSnapshot(
      collection(db, "reservations"),
      (snapshot) => {
        if (!snapshot.empty) {
          setReservations(snapshot.docs.map((d) => d.data() as Reservation));
        }
      },
      () => {}
    );

    const unsubMessages = onSnapshot(
      collection(db, "directMessages"),
      (snapshot) => {
        if (!snapshot.empty) {
          setDirectMessages(snapshot.docs.map((d) => d.data() as DirectMessage));
        }
      },
      () => {}
    );

    const unsubNotifs = onSnapshot(
      collection(db, "notifications"),
      (snapshot) => {
        if (!snapshot.empty) {
          setNotifications(snapshot.docs.map((d) => d.data() as AppNotification));
        }
      },
      () => {}
    );

    return () => {
      unsubProducts();
      unsubNeeds();
      unsubOffers();
      unsubReservations();
      unsubMessages();
      unsubNotifs();
    };
  }, []);

  // Sync changes back to localStorage as instant offline cache
  useEffect(() => {
    if (!isHydrated) return;
    try {
      if (currentUser) {
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(STORAGE_KEYS.USER);
      }
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
      localStorage.setItem(STORAGE_KEYS.NEEDS, JSON.stringify(needPosts));
      localStorage.setItem(STORAGE_KEYS.OFFERS, JSON.stringify(offers));
      localStorage.setItem(STORAGE_KEYS.RESERVATIONS, JSON.stringify(reservations));
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(directMessages));
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    } catch (e) {
      console.warn("Failed to persist state to localStorage:", e);
    }
  }, [
    isHydrated,
    currentUser,
    products,
    needPosts,
    offers,
    reservations,
    directMessages,
    notifications,
  ]);

  // Keep selectedProduct in sync when products array updates
  useEffect(() => {
    if (selectedProduct) {
      const updated = products.find((p) => p.id === selectedProduct.id);
      if (updated) {
        setSelectedProduct(updated);
      }
    }
  }, [products]);

  const showToast = (
    title: string,
    description?: string,
    type: ToastMessage["type"] = "success"
  ) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, title, description, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // AUTHENTICATION HANDLERS
  const loginWithAguEmail = (email: string, password: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!AGU_EMAIL_REGEX.test(trimmedEmail)) {
      return {
        ok: false,
        error: "Sadece @agu.edu.tr uzantılı Abdullah Gül Üniversitesi e-posta adresleri kabul edilmektedir.",
      };
    }
    if (password.length < 6) {
      return {
        ok: false,
        error: "Şifreniz en az 6 karakter olmalıdır.",
      };
    }

    const existingDemoUser = DEMO_USERS.find(
      (u) => u.email.toLowerCase() === trimmedEmail
    );

    if (existingDemoUser) {
      setCurrentUser(existingDemoUser);
      setIsOnboardingOpen(false);
      saveDocToFirestore("users", existingDemoUser);
      showToast(
        `Hoş geldin, ${existingDemoUser.fullName}!`,
        "AGU Sümer Kampüsü hesabınla giriş yapıldı."
      );
      return { ok: true };
    }

    const namePart = trimmedEmail.split("@")[0].replace(/[._-]+/g, " ");
    const formattedName = namePart
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    const loggedUser: User = {
      id: `user-${trimmedEmail.split("@")[0].replace(/[^a-z0-9]/gi, "")}`,
      email: trimmedEmail,
      fullName: formattedName || "AGÜ Öğrencisi",
      department: "Bilgisayar Mühendisliği",
      rating: 5.0,
      reviewCount: 1,
      completedSwaps: 0,
      joinedAt: "Kasım 2026",
      isVerifiedAgu: true,
      needsOnboarding: false,
    };

    setCurrentUser(loggedUser);
    setIsOnboardingOpen(false);
    saveDocToFirestore("users", loggedUser);
    showToast(`Hoş geldin, ${loggedUser.fullName}!`, "Kampüs hesabın doğrulandı.");
    return { ok: true };
  };

  const registerWithAguEmail = (email: string, password: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!AGU_EMAIL_REGEX.test(trimmedEmail)) {
      return {
        ok: false,
        error: "Kayıt olmak için @agu.edu.tr uzantılı kurumsal öğrenci e-postanızı girmelisiniz.",
      };
    }
    if (password.length < 6) {
      return {
        ok: false,
        error: "Güvenliğiniz için şifreniz en az 6 karakter olmalıdır.",
      };
    }

    const newUser: User = {
      id: `user-${Date.now()}`,
      email: trimmedEmail,
      fullName: "",
      department: "",
      rating: 5.0,
      reviewCount: 0,
      completedSwaps: 0,
      joinedAt: "Kasım 2026",
      isVerifiedAgu: true,
      needsOnboarding: true,
    };

    setCurrentUser(newUser);
    setIsOnboardingOpen(true);
    saveDocToFirestore("users", newUser);
    showToast(
      "Kayıt Başarılı! 🎓",
      "Şimdi kampüs profilini tamamlayarak hemen ilan paylaşmaya başlayabilirsin.",
      "info"
    );
    return { ok: true };
  };

  const completeOnboarding = (
    fullName: string,
    department: string,
    avatarUrl?: string
  ) => {
    if (!currentUser) return;
    const updatedUser: User = {
      ...currentUser,
      fullName: fullName.trim(),
      department,
      avatarUrl: avatarUrl || undefined,
      needsOnboarding: false,
    };
    setCurrentUser(updatedUser);
    setIsOnboardingOpen(false);
    saveDocToFirestore("users", updatedUser);
    showToast(
      `Aramıza hoş geldin, ${updatedUser.fullName}!`,
      `${department} profilin oluşturuldu ve veritabanına kaydedildi.`
    );
  };

  const loginAsDemoUser = (userId = "user-caner") => {
    const found = DEMO_USERS.find((u) => u.id === userId) || DEMO_USERS[0];
    setCurrentUser(found);
    setIsOnboardingOpen(false);
    saveDocToFirestore("users", found);
    showToast(
      `Demo Hesabı Aktif: ${found.fullName}`,
      `${found.department} (${found.email}) olarak giriş yapıldı.`
    );
  };

  const logout = () => {
    setCurrentUser(null);
    setIsOnboardingOpen(false);
    setIsDashboardOpen(false);
    setSelectedProduct(null);
    setSelectedNeedPost(null);
    showToast("Çıkış Yapıldı", "Tekrar görüşmek üzere!", "info");
  };

  // MODAL & DRAWER CONTROLS
  const openAddListingModal = (mode: "product" | "need" = "product") => {
    setAddListingInitialMode(mode);
    setIsAddListingModalOpen(true);
  };

  const closeAddListingModal = () => {
    setIsAddListingModalOpen(false);
  };

  const openDashboard = (tab: DashboardTab = "my_products") => {
    setActiveDashboardTab(tab);
    setIsDashboardOpen(true);
  };

  const closeDashboard = () => {
    setIsDashboardOpen(false);
  };

  // MARKETPLACE ACTIONS
  const addProduct = (input: {
    title: string;
    description: string;
    price: number;
    isFree: boolean;
    category: Exclude<ProductCategory, "all">;
    condition: ProductCondition;
    images: string[];
    handoverPoint: CampusHandoverPoint;
    courseCode?: string;
  }) => {
    if (!currentUser) return;
    const newProduct: ProductItem = {
      id: `prod-${Date.now()}`,
      title: input.title.trim(),
      description: input.description.trim(),
      price: input.isFree ? 0 : Number(input.price),
      isFree: input.isFree || Number(input.price) === 0,
      category: input.category,
      condition: input.condition,
      status: "available",
      images:
        input.images.length > 0
          ? input.images
          : [
              "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=900&q=80",
            ],
      sellerId: currentUser.id,
      sellerName: currentUser.fullName,
      sellerDepartment: currentUser.department,
      sellerAvatar: currentUser.avatarUrl,
      sellerRating: currentUser.rating || 5.0,
      handoverPoint: input.handoverPoint,
      createdAt: "Şimdi",
      favoriteCount: 1,
      favoritedBy: [currentUser.id],
      questions: [],
      courseCode: input.courseCode?.trim() || undefined,
    };

    setProducts((prev) => [newProduct, ...prev]);
    saveDocToFirestore("products", newProduct);
    setActiveMainTab("vitrin");
    showToast(
      "Vitrin İlanın Yayında! 🎉",
      `"${newProduct.title}" Firebase veritabanına ve vitrine eklendi.`
    );
  };

  const toggleFavoriteProduct = (productId: string) => {
    const userId = currentUser?.id || "guest";
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const alreadyFav = p.favoritedBy.includes(userId);
        const updatedProduct: ProductItem = {
          ...p,
          favoriteCount: alreadyFav
            ? Math.max(0, p.favoriteCount - 1)
            : p.favoriteCount + 1,
          favoritedBy: alreadyFav
            ? p.favoritedBy.filter((id) => id !== userId)
            : [...p.favoritedBy, userId],
        };
        saveDocToFirestore("products", updatedProduct);
        return updatedProduct;
      })
    );
  };

  const updateProductStatus = (productId: string, status: ProductStatus) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const updated = { ...p, status };
        saveDocToFirestore("products", updated);
        return updated;
      })
    );
    const statusLabels: Record<ProductStatus, string> = {
      available: "Müsait",
      reserved: "Rezerve Edildi",
      sold: "Satıldı / Teslim Edildi",
    };
    showToast("İlan Durumu Güncellendi", `Yeni durum: ${statusLabels[status]}`);
  };

  const deleteProduct = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    removeDocFromFirestore("products", productId);
    if (selectedProduct?.id === productId) {
      setSelectedProduct(null);
    }
    showToast("İlan Silindi", "Vitrin ilanınız veritabanından kaldırıldı.", "info");
  };

  // PUBLIC Q&A ACTIONS
  const askProductQuestion = (productId: string, questionText: string) => {
    if (!currentUser || !questionText.trim()) return;
    const newQA = {
      id: `qa-${Date.now()}`,
      productId,
      askerId: currentUser.id,
      askerName: currentUser.fullName,
      askerDepartment: currentUser.department,
      askerAvatar: currentUser.avatarUrl,
      question: questionText.trim(),
      createdAt: "Şimdi",
    };

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const updated = { ...p, questions: [...p.questions, newQA] };
        saveDocToFirestore("products", updated);
        return updated;
      })
    );

    const targetProduct = products.find((p) => p.id === productId);
    if (targetProduct) {
      const newNotif: AppNotification = {
        id: `notif-${Date.now()}`,
        userId: targetProduct.sellerId,
        type: "question",
        title: "Ürününe Yeni Soru Soruldu 💬",
        body: `${currentUser.fullName}: "${questionText.trim().slice(0, 60)}..."`,
        createdAt: "Şimdi",
        isRead: false,
        relatedProductId: productId,
      };
      setNotifications((prev) => [newNotif, ...prev]);
      saveDocToFirestore("notifications", newNotif);
    }

    showToast("Sorunuz İletildi 💬", "Satıcı yanıtladığında bildirim alacaksınız.");
  };

  const answerProductQuestion = (
    productId: string,
    questionId: string,
    answerText: string
  ) => {
    if (!currentUser || !answerText.trim()) return;
    const targetProduct = products.find((p) => p.id === productId);
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const updated: ProductItem = {
          ...p,
          questions: p.questions.map((q) =>
            q.id === questionId
              ? {
                  ...q,
                  answer: answerText.trim(),
                  answeredAt: "Şimdi",
                  sellerName: p.sellerName || currentUser.fullName,
                }
              : q
          ),
        };
        saveDocToFirestore("products", updated);
        return updated;
      })
    );

    if (targetProduct) {
      showToast("Cevabınız Yayınlandı ✅", "Satıcı yanıtınız ürün sayfasına eklendi.");
    }
  };

  // OFFERS & RESERVATIONS
  const createOffer = (productId: string, offeredPrice: number, note?: string) => {
    if (!currentUser) return;
    const product = products.find((p) => p.id === productId);
    if (!product || product.isFree) return;

    const newOffer: Offer = {
      id: `offer-${Date.now()}`,
      productId: product.id,
      productTitle: product.title,
      productImage: product.images[0],
      originalPrice: product.price,
      offeredPrice,
      buyerId: currentUser.id,
      buyerName: currentUser.fullName,
      buyerDepartment: currentUser.department,
      buyerAvatar: currentUser.avatarUrl,
      sellerId: product.sellerId,
      sellerName: product.sellerName,
      note: note?.trim() || undefined,
      status: "pending",
      createdAt: "Şimdi",
    };

    setOffers((prev) => [newOffer, ...prev]);
    saveDocToFirestore("offers", newOffer);

    const newNotif: AppNotification = {
      id: `notif-${Date.now()}`,
      userId: product.sellerId,
      type: "offer",
      title: `Yeni Teklif: ${offeredPrice} TL 💸`,
      body: `${currentUser.fullName}, "${product.title}" ilanın için ${offeredPrice} TL teklif verdi.`,
      createdAt: "Şimdi",
      isRead: false,
      targetDashboardTab: "offers_reservations",
      relatedProductId: product.id,
    };
    setNotifications((prev) => [newNotif, ...prev]);
    saveDocToFirestore("notifications", newNotif);

    showToast(
      `${offeredPrice} TL Teklif Gönderildi! 💸`,
      `Satıcı (${product.sellerName}) teklifini onayladığında haberdar olacaksın.`
    );
  };

  const respondToOffer = (offerId: string, decision: "accepted" | "rejected") => {
    const targetOffer = offers.find((o) => o.id === offerId);
    if (!targetOffer) return;

    setOffers((prev) =>
      prev.map((o) => {
        if (o.id !== offerId) return o;
        const updatedOffer = { ...o, status: decision };
        saveDocToFirestore("offers", updatedOffer);
        return updatedOffer;
      })
    );

    if (decision === "accepted") {
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== targetOffer.productId) return p;
          const updatedProd: ProductItem = {
            ...p,
            status: "reserved",
            price: targetOffer.offeredPrice,
            reservedBy: targetOffer.buyerId,
            reservedByName: targetOffer.buyerName,
            reservedNote: `${targetOffer.offeredPrice} TL kabul edilen teklif ile ayrıldı`,
          };
          saveDocToFirestore("products", updatedProd);
          return updatedProd;
        })
      );
      showToast(
        "Teklif Kabul Edildi! 🤝",
        `${targetOffer.buyerName} adlı öğrencinin ${targetOffer.offeredPrice} TL teklifi onaylandı ve ürün rezerve edildi.`
      );
    } else {
      showToast(
        "Teklif Reddedildi",
        `${targetOffer.buyerName} tarafından yapılan teklif reddedildi.`,
        "info"
      );
    }
  };

  const createReservation = (
    productId: string,
    handoverPoint: CampusHandoverPoint,
    proposedTime: string,
    pickupNote: string
  ) => {
    if (!currentUser) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const newRes: Reservation = {
      id: `res-${Date.now()}`,
      productId: product.id,
      productTitle: product.title,
      productImage: product.images[0],
      productPrice: product.price,
      buyerId: currentUser.id,
      buyerName: currentUser.fullName,
      buyerDepartment: currentUser.department,
      buyerAvatar: currentUser.avatarUrl,
      sellerId: product.sellerId,
      sellerName: product.sellerName,
      handoverPoint,
      proposedTime: proposedTime.trim() || "Yarın Öğle Arası",
      pickupNote: pickupNote.trim(),
      status: "pending",
      createdAt: "Şimdi",
    };

    setReservations((prev) => [newRes, ...prev]);
    saveDocToFirestore("reservations", newRes);

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const updatedProd: ProductItem = {
          ...p,
          status: "reserved",
          reservedBy: currentUser.id,
          reservedByName: currentUser.fullName,
          reservedNote: `${proposedTime} - ${handoverPoint}`,
        };
        saveDocToFirestore("products", updatedProd);
        return updatedProd;
      })
    );

    const newNotif: AppNotification = {
      id: `notif-${Date.now()}`,
      userId: product.sellerId,
      type: "reservation",
      title: "Yeni Kampüs Teslim / Rezerve Talebi 📌",
      body: `${currentUser.fullName}, "${product.title}" ürününü ${handoverPoint} noktasında teslim almak için ayırttı.`,
      createdAt: "Şimdi",
      isRead: false,
      targetDashboardTab: "offers_reservations",
      relatedProductId: product.id,
    };
    setNotifications((prev) => [newNotif, ...prev]);
    saveDocToFirestore("notifications", newNotif);

    showToast(
      "Ürün Sizin İçin Rezerve Edildi! 📌",
      `Buluşma Noktası: ${handoverPoint} (${proposedTime})`
    );
  };

  const updateReservationStatus = (
    reservationId: string,
    status: "approved" | "completed" | "cancelled"
  ) => {
    const targetRes = reservations.find((r) => r.id === reservationId);
    if (!targetRes) return;

    setReservations((prev) =>
      prev.map((r) => {
        if (r.id !== reservationId) return r;
        const updatedRes = { ...r, status };
        saveDocToFirestore("reservations", updatedRes);
        return updatedRes;
      })
    );

    if (status === "approved") {
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== targetRes.productId) return p;
          const updatedProd: ProductItem = {
            ...p,
            status: "reserved",
            reservedBy: targetRes.buyerId,
            reservedByName: targetRes.buyerName,
            reservedNote: `${targetRes.proposedTime} - ${targetRes.handoverPoint}`,
          };
          saveDocToFirestore("products", updatedProd);
          return updatedProd;
        })
      );
      showToast(
        "Rezervasyon Onaylandı ✅",
        `${targetRes.handoverPoint} noktasında teslimat için onay verildi.`
      );
    } else if (status === "completed") {
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== targetRes.productId) return p;
          const updatedProd: ProductItem = { ...p, status: "sold" };
          saveDocToFirestore("products", updatedProd);
          return updatedProd;
        })
      );
      showToast(
        "Kampüs Teslimatı Tamamlandı! 🌱",
        "Sürdürülebilir kampüs ekonomisine katkınız için teşekkürler!"
      );
    } else if (status === "cancelled") {
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== targetRes.productId) return p;
          const updatedProd: ProductItem = {
            ...p,
            status: "available",
            reservedBy: undefined,
            reservedByName: undefined,
            reservedNote: undefined,
          };
          saveDocToFirestore("products", updatedProd);
          return updatedProd;
        })
      );
      showToast(
        "Rezervasyon İptal Edildi",
        "Ürün tekrar vitrinde 'Müsait' durumuna alındı.",
        "info"
      );
    }
  };

  // WISHBOARD (İHTİYAÇ PANOSU) ACTIONS
  const addNeedPost = (input: {
    title: string;
    description: string;
    category: Exclude<ProductCategory, "all">;
    urgency: NeedUrgency;
    budgetType: BudgetPreferenceType;
    maxBudget?: number;
    budgetLabel: string;
    handoverPreference: CampusHandoverPoint;
    courseCode?: string;
  }) => {
    if (!currentUser) return;
    const newNeed: NeedPost = {
      id: `need-${Date.now()}`,
      requesterId: currentUser.id,
      requesterName: currentUser.fullName,
      requesterDepartment: currentUser.department,
      requesterAvatar: currentUser.avatarUrl,
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      urgency: input.urgency,
      budgetType: input.budgetType,
      maxBudget: input.maxBudget,
      budgetLabel: input.budgetLabel,
      handoverPreference: input.handoverPreference,
      courseCode: input.courseCode?.trim() || undefined,
      createdAt: "Şimdi",
      status: "open",
      responseCount: 0,
    };

    setNeedPosts((prev) => [newNeed, ...prev]);
    saveDocToFirestore("needPosts", newNeed);
    setActiveMainTab("wishboard");
    showToast(
      "İhtiyaç İlanın Panoya Eklendi! 📌",
      "Ürüne sahip olan AGÜ öğrencileri sana doğrudan mesaj gönderebilecek."
    );
  };

  const markNeedPostFulfilled = (needPostId: string) => {
    setNeedPosts((prev) =>
      prev.map((n) => {
        if (n.id !== needPostId) return n;
        const updatedNeed: NeedPost = {
          ...n,
          status: n.status === "open" ? "fulfilled" : "open",
        };
        saveDocToFirestore("needPosts", updatedNeed);
        return updatedNeed;
      })
    );
    showToast("İhtiyaç İlanı Güncellendi", "İlan durumu değiştirildi.");
  };

  const deleteNeedPost = (needPostId: string) => {
    setNeedPosts((prev) => prev.filter((n) => n.id !== needPostId));
    removeDocFromFirestore("needPosts", needPostId);
    if (selectedNeedPost?.id === needPostId) {
      setSelectedNeedPost(null);
    }
    showToast("İhtiyaç İlanı Silindi", "İlan panodan kaldırıldı.", "info");
  };

  const sendHaveItemMessage = (input: {
    needPostId: string;
    message: string;
    linkedProductId?: string;
    proposedPrice?: number;
    isFreeOffer: boolean;
    handoverPoint: CampusHandoverPoint;
  }) => {
    if (!currentUser) return;
    const need = needPosts.find((n) => n.id === input.needPostId);
    if (!need) return;

    const linkedProduct = input.linkedProductId
      ? products.find((p) => p.id === input.linkedProductId)
      : undefined;

    const newDM: DirectMessage = {
      id: `dm-${Date.now()}`,
      needPostId: need.id,
      needPostTitle: need.title,
      senderId: currentUser.id,
      senderName: currentUser.fullName,
      senderDepartment: currentUser.department,
      senderAvatar: currentUser.avatarUrl,
      receiverId: need.requesterId,
      receiverName: need.requesterName,
      receiverDepartment: need.requesterDepartment,
      message: input.message.trim(),
      linkedProductId: linkedProduct?.id,
      linkedProductTitle: linkedProduct?.title,
      linkedProductPrice: linkedProduct?.price,
      linkedProductImage: linkedProduct?.images[0],
      proposedPrice: input.isFreeOffer ? 0 : input.proposedPrice,
      isFreeOffer: input.isFreeOffer,
      handoverPoint: input.handoverPoint,
      createdAt: "Şimdi",
      isRead: false,
      replies: [],
    };

    setDirectMessages((prev) => [newDM, ...prev]);
    saveDocToFirestore("directMessages", newDM);

    setNeedPosts((prev) =>
      prev.map((n) => {
        if (n.id !== need.id) return n;
        const updatedNeed = { ...n, responseCount: n.responseCount + 1 };
        saveDocToFirestore("needPosts", updatedNeed);
        return updatedNeed;
      })
    );

    const newNotif: AppNotification = {
      id: `notif-${Date.now()}`,
      userId: need.requesterId,
      type: "need_response",
      title: `"Bende Bu Ürün Var!" Mesajı Geldi 🎉`,
      body: `${currentUser.fullName}, "${need.title}" ilanına yanıt gönderdi.`,
      createdAt: "Şimdi",
      isRead: false,
      targetDashboardTab: "messages",
    };
    setNotifications((prev) => [newNotif, ...prev]);
    saveDocToFirestore("notifications", newNotif);

    showToast(
      `Mesajın ${need.requesterName} adlı öğrenciye iletildi! 🤝`,
      "Mesajlarım sekmesinden konuşmayı takip edebilirsin."
    );
  };

  const replyToDirectMessage = (messageId: string, text: string) => {
    if (!currentUser || !text.trim()) return;
    setDirectMessages((prev) =>
      prev.map((dm) => {
        if (dm.id !== messageId) return dm;
        const updatedDM: DirectMessage = {
          ...dm,
          isRead: true,
          replies: [
            ...dm.replies,
            {
              id: `rep-${Date.now()}`,
              senderId: currentUser.id,
              senderName: currentUser.fullName,
              text: text.trim(),
              createdAt: "Şimdi",
            },
          ],
        };
        saveDocToFirestore("directMessages", updatedDM);
        return updatedDM;
      })
    );
    showToast("Yanıt Gönderildi 💬", "Mesajınız sohbete eklendi.");
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) =>
      prev.map((n) => {
        const updated = { ...n, isRead: true };
        saveDocToFirestore("notifications", updated);
        return updated;
      })
    );
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        const updated = { ...n, isRead: true };
        saveDocToFirestore("notifications", updated);
        return updated;
      })
    );
  };

  const resetDemoData = () => {
    setProducts(INITIAL_PRODUCTS);
    setNeedPosts(INITIAL_NEED_POSTS);
    setOffers(INITIAL_OFFERS);
    setReservations(INITIAL_RESERVATIONS);
    setDirectMessages(INITIAL_DIRECT_MESSAGES);
    setNotifications(INITIAL_NOTIFICATIONS);

    INITIAL_PRODUCTS.forEach((p) => saveDocToFirestore("products", p));
    INITIAL_NEED_POSTS.forEach((n) => saveDocToFirestore("needPosts", n));
    INITIAL_OFFERS.forEach((o) => saveDocToFirestore("offers", o));
    INITIAL_RESERVATIONS.forEach((r) => saveDocToFirestore("reservations", r));
    INITIAL_DIRECT_MESSAGES.forEach((m) => saveDocToFirestore("directMessages", m));
    INITIAL_NOTIFICATIONS.forEach((nf) => saveDocToFirestore("notifications", nf));

    localStorage.removeItem(STORAGE_KEYS.PRODUCTS);
    localStorage.removeItem(STORAGE_KEYS.NEEDS);
    localStorage.removeItem(STORAGE_KEYS.OFFERS);
    localStorage.removeItem(STORAGE_KEYS.RESERVATIONS);
    localStorage.removeItem(STORAGE_KEYS.MESSAGES);
    localStorage.removeItem(STORAGE_KEYS.NOTIFICATIONS);
    showToast(
      "Demo Verileri Sıfırlandı 🔄",
      "Tüm AGU kampüs vitrin ve ihtiyaç panosu verileri başlangıç durumuna döndürüldü.",
      "info"
    );
  };

  return (
    <AppContext.Provider
      value={{
        isFirestoreConnected,
        currentUser,
        isOnboardingOpen,
        loginWithAguEmail,
        registerWithAguEmail,
        completeOnboarding,
        loginAsDemoUser,
        logout,
        activeMainTab,
        setActiveMainTab,
        searchQuery,
        setSearchQuery,
        isAddListingModalOpen,
        addListingInitialMode,
        openAddListingModal,
        closeAddListingModal,
        selectedProduct,
        setSelectedProduct,
        selectedNeedPost,
        setSelectedNeedPost,
        isDashboardOpen,
        activeDashboardTab,
        openDashboard,
        closeDashboard,
        products,
        needPosts,
        offers,
        reservations,
        directMessages,
        notifications,
        toasts,
        dismissToast,
        showToast,
        addProduct,
        toggleFavoriteProduct,
        updateProductStatus,
        deleteProduct,
        askProductQuestion,
        answerProductQuestion,
        createOffer,
        respondToOffer,
        createReservation,
        updateReservationStatus,
        addNeedPost,
        markNeedPostFulfilled,
        deleteNeedPost,
        sendHaveItemMessage,
        replyToDirectMessage,
        markAllNotificationsRead,
        markNotificationRead,
        resetDemoData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
