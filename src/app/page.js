"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import ReportFoundModal from "@/components/ReportFoundModal";
import ReportLostModal from "@/components/ReportLostModal";
import AuthPromptModal from "@/components/AuthPromptModal";

const CATEGORIES = [
  "All Categories",
  "Electronics",
  "ID Cards & Keys",
  "Bags & Wallets",
  "Books & Stationery",
  "Clothing",
  "Other",
];

// Helper to determine styling based on item category
const getCategoryStyles = (category) => {
  switch (category) {
    case "Electronics":
      return {
        color: "from-blue-600/30 to-cyan-500/20",
        badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
        iconType: "calculator",
      };
    case "ID Cards & Keys":
      return {
        color: "from-cyan-600/30 to-teal-500/20",
        badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
        iconType: "id-card",
      };
    case "Bags & Wallets":
      return {
        color: "from-indigo-600/30 to-blue-500/20",
        badgeColor: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
        iconType: "backpack",
      };
    case "Books & Stationery":
      return {
        color: "from-amber-600/30 to-orange-500/20",
        badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
        iconType: "book",
      };
    default:
      return {
        color: "from-sky-600/30 to-blue-500/20",
        badgeColor: "bg-sky-500/20 text-sky-300 border-sky-500/30",
        iconType: "default",
      };
  }
};

// Clean date formatting
const formatDate = (dateStr) => {
  if (!dateStr) return "Recently";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

export default function Home() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeModalItem, setActiveModalItem] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);

  // Workflow modals
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isLostModalOpen, setIsLostModalOpen] = useState(false);
  const [isAuthPromptOpen, setIsAuthPromptOpen] = useState(false);
  const [authPromptAction, setAuthPromptAction] = useState("found");

  // Public item detail claim form state
  const [claimName, setClaimName] = useState("");
  const [claimPhone, setClaimPhone] = useState("");
  const [claimEmail, setClaimEmail] = useState("");
  const [claimUsn, setClaimUsn] = useState("");
  const [claimDept, setClaimDept] = useState("");
  const [claimBatch, setClaimBatch] = useState("");
  const [claimSem, setClaimSem] = useState("");
  const [claimFormError, setClaimFormError] = useState(null);
  const [claimFormSuccess, setClaimFormSuccess] = useState(false);

  // Supabase Authentication state
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured);

  const handleOpenItemDetails = (item) => {
    setActiveModalItem(item);
    setClaimFormError(null);
    setClaimFormSuccess(false);
    setClaimName(user?.user_metadata?.full_name || user?.user_metadata?.name || "");
    setClaimEmail(user?.email || "");
    setClaimPhone("");
    setClaimUsn("");
    setClaimDept("");
    setClaimBatch("");
    setClaimSem("");
  };

  const handleSendClaimEmail = () => {
    if (!claimName.trim() || !claimPhone.trim() || !claimEmail.trim() || !claimUsn.trim()) {
      setClaimFormError("Please fill in your Full Name, Mobile Number, Email Address, and USN.");
      return;
    }
    setClaimFormError(null);
    setClaimFormSuccess(true);

    const itemName = activeModalItem?.title || "Found Item";
    const subject = `FindYourThings – Claim Request for ${itemName}`;
    const body = `Dear FindYourThings Administrator,\n\nI believe I am the owner of the following found item and would like assistance in claiming it.\n\nITEM DETAILS\nItem Name: ${itemName}\n\nMY DETAILS\nFull Name: ${claimName.trim()}\nMobile Number: ${claimPhone.trim()}\nEmail Address: ${claimEmail.trim()}\nUSN: ${claimUsn.trim().toUpperCase()}\nDepartment: ${claimDept.trim() || "N/A"}\nBatch: ${claimBatch.trim() || "N/A"}\nSemester: ${claimSem.trim() || "N/A"}\n\nPlease verify my details and help coordinate with the person who found the item.\n\nThank you,\n${claimName.trim()}`;

    const mailtoUrl = `mailto:deekshith2r@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  };

  const handleOpenReportModal = () => {
    if (user) {
      setIsReportModalOpen(true);
    } else {
      setAuthPromptAction("found");
      setIsAuthPromptOpen(true);
    }
  };

  const handleOpenLostModal = () => {
    if (user) {
      setIsLostModalOpen(true);
    } else {
      setAuthPromptAction("lost");
      setIsAuthPromptOpen(true);
    }
  };

  // Live Supabase items state
  const [items, setItems] = useState([]);
  const [isItemsLoading, setIsItemsLoading] = useState(isSupabaseConfigured);
  const [itemsError, setItemsError] = useState(null);

  // Fetch approved found items from the safe public view
  const fetchFoundItems = useCallback(() => {
    if (!supabase || !isSupabaseConfigured) return;

    supabase
      .from("public_found_items")
      .select(
        "id, title, category, general_location, date_found, description, image_url, storage_location, status, created_at"
      )
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setItemsError(error.message);
        } else {
          setItems(data || []);
          setItemsError(null);
        }
        setIsItemsLoading(false);
      })
      .catch((err) => {
        setItemsError(err.message || "Failed to load items");
        setIsItemsLoading(false);
      });
  }, []);

  const handleRetry = () => {
    setIsItemsLoading(true);
    setItemsError(null);
    fetchFoundItems();
  };

  // Initialize Auth state listener & admin privilege check
  useEffect(() => {
    if (!supabase) return;

    const checkAdminStatus = (uid) => {
      if (!uid) {
        setIsAdmin(false);
        return;
      }
      supabase
        .from("app_admins")
        .select("role")
        .eq("user_id", uid)
        .maybeSingle()
        .then(({ data }) => {
          setIsAdmin(Boolean(data && (data.role === "admin" || data.role === "super_admin")));
        })
        .catch(() => setIsAdmin(false));
    };

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!error && session?.user) {
        setUser(session.user);
        checkAdminStatus(session.user.id);
      } else {
        setIsAdmin(false);
      }
      setIsAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdminStatus(session.user.id);
      } else {
        setIsAdmin(false);
      }
      setIsAuthLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Initialize live items fetching & Realtime updates
  useEffect(() => {
    fetchFoundItems();

    if (!supabase || !isSupabaseConfigured) return;

    // Requirement 8: Subscribe to changes on underlying base table 'found_items'
    // and safely refetch from the safe 'public_found_items' view
    const channel = supabase
      .channel("public-found-items-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "found_items" },
        () => {
          fetchFoundItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchFoundItems]);

  // Handle Google OAuth Sign-in
  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setActionNotice(
        "Supabase credentials needed! Please add your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY inside .env.local, then restart your development server."
      );
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setActionNotice(`Google Sign-In Error: ${error.message}`);
      }
    } catch (err) {
      setActionNotice(`Unexpected error: ${err.message}`);
    }
  };

  // Handle User Sign-out
  const handleSignOut = async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
      setUser(null);
      setActionNotice("You have successfully signed out.");
    } catch (err) {
      setActionNotice(`Sign Out Error: ${err.message}`);
    }
  };

  // Filter items in real time based on search term and category
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const title = (item.title || "").toLowerCase();
      const location = (item.general_location || "").toLowerCase();
      const term = searchTerm.toLowerCase();

      const matchesSearch = title.includes(term) || location.includes(term);
      const matchesCategory =
        selectedCategory === "All Categories" || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [items, searchTerm, selectedCategory]);

  // Helper to render decorative SVG icons for items without photographs
  const renderItemVisual = (type) => {
    switch (type) {
      case "calculator":
        return (
          <svg className="w-14 h-14 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        );
      case "id-card":
        return (
          <svg className="w-14 h-14 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
          </svg>
        );
      case "backpack":
        return (
          <svg className="w-14 h-14 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        );
      case "book":
        return (
          <svg className="w-14 h-14 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        );
      default:
        return (
          <svg className="w-14 h-14 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-white">
      {/* 1. NAVIGATION BAR */}
      <header className="sticky top-0 z-40 bg-[#0b1120]/85 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo & College Badge */}
            <div className="flex items-center gap-3">
              <a href="#" className="flex items-center gap-3 group">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-sky-400 p-[2px] shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform duration-200">
                  <div className="w-full h-full bg-[#0b1120] rounded-[10px] flex items-center justify-center">
                    <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
                      FindYourThings
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-semibold tracking-wider uppercase">
                      Campus
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium tracking-wide">
                    Dr. Ambedkar Institute of Technology (DR AIT)
                  </p>
                </div>
              </a>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-6">
              <a href="#" className="text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors">
                Home
              </a>
              <a href="#browse" className="text-sm font-medium text-slate-300 hover:text-cyan-400 transition-colors">
                Browse Items
              </a>
              <a href="#how-it-works" className="text-sm font-medium text-slate-300 hover:text-cyan-400 transition-colors">
                How It Works
              </a>
              <div className="h-4 w-px bg-slate-800" />
              <button
                type="button"
                onClick={handleOpenReportModal}
                className="text-xs font-semibold px-3.5 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white shadow-md shadow-cyan-500/20 transition-all duration-200 cursor-pointer"
              >
                + Report Item
              </button>

              {/* Supabase Google Auth Button / Profile Indicator */}
              {isAuthLoading ? (
                <div className="w-24 h-8 rounded-lg bg-slate-800/60 animate-pulse" />
              ) : user ? (
                <div className="flex items-center gap-2.5">
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-cyan-300 bg-cyan-950/80 border border-cyan-800/60 hover:bg-cyan-900 transition-colors shadow-sm"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span>Admin Portal</span>
                    </Link>
                  )}
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700/80">
                    {user.user_metadata?.avatar_url || user.user_metadata?.picture ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={user.user_metadata.avatar_url || user.user_metadata.picture}
                        alt="Profile"
                        className="w-6 h-6 rounded-full border border-cyan-400/50 object-cover"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-400 text-white flex items-center justify-center font-bold text-[10px]">
                        {(user.user_metadata?.full_name || user.email || "U")[0].toUpperCase()}
                      </div>
                    )}
                    <div className="flex flex-col text-left max-w-[120px]">
                      <span className="font-semibold text-slate-100 truncate text-[11px] leading-tight">
                        {user.user_metadata?.full_name || user.user_metadata?.name || "Student"}
                      </span>
                      <span className="text-[10px] text-cyan-400 truncate leading-tight">
                        {user.email}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-red-300 hover:bg-red-500/10 border border-slate-800 hover:border-red-500/30 transition-colors cursor-pointer"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 hover:border-cyan-500/50 text-xs font-semibold shadow-sm transition-all duration-200 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Sign in with Google</span>
                </button>
              )}
            </nav>

            {/* Mobile Menu Button */}
            <div className="md:hidden flex items-center">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Mobile Menu Dropdown */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-slate-800/80 space-y-2">
              <a
                href="#"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-cyan-400 bg-slate-900/60"
              >
                Home
              </a>
              <a
                href="#browse"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-slate-300 hover:text-white hover:bg-slate-800/40"
              >
                Browse Items
              </a>
              <a
                href="#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-slate-300 hover:text-white hover:bg-slate-800/40"
              >
                How It Works
              </a>
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleOpenReportModal();
                  }}
                  className="w-full text-center text-sm font-semibold px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 text-white cursor-pointer"
                >
                  + Report an Item
                </button>

                {/* Mobile Auth Button / Profile */}
                {user ? (
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setMobileMenuOpen(false)}
                        className="block w-full text-center px-3 py-2 rounded-lg text-xs font-semibold text-cyan-300 bg-cyan-950/80 border border-cyan-800/60 hover:bg-cyan-900"
                      >
                        🛡️ Open Admin Portal
                      </Link>
                    )}
                    <div className="flex items-center gap-2.5">
                      {user.user_metadata?.avatar_url || user.user_metadata?.picture ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={user.user_metadata.avatar_url || user.user_metadata.picture}
                          alt="Profile"
                          className="w-8 h-8 rounded-full border border-cyan-400/50 object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-400 text-white flex items-center justify-center font-bold text-xs">
                          {(user.user_metadata?.full_name || user.email || "U")[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex flex-col text-left overflow-hidden">
                        <span className="font-semibold text-slate-100 truncate text-xs">
                          {user.user_metadata?.full_name || user.user_metadata?.name || "Student"}
                        </span>
                        <span className="text-[11px] text-cyan-400 truncate">
                          {user.email}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleSignOut();
                      }}
                      className="w-full text-center text-xs font-semibold py-2 rounded-md text-red-300 hover:bg-red-500/10 border border-red-500/30 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleGoogleSignIn();
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-slate-200 border border-slate-700 text-xs font-semibold"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Sign in with Google</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* NOTICE BANNER */}
      {actionNotice && (
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-cyan-950 border-b border-cyan-800/40 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-xs sm:text-sm text-cyan-200">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span>{actionNotice}</span>
            </div>
            <button
              onClick={() => setActionNotice(null)}
              className="text-cyan-400 hover:text-white font-bold ml-4 text-base"
              aria-label="Dismiss notice"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="flex-1">
        {/* 2. HERO SECTION */}
        <section className="relative overflow-hidden py-20 lg:py-28 border-b border-slate-800/60">
          {/* Subtle Ambient Background Gradients */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-blue-600/15 via-cyan-500/15 to-transparent blur-3xl pointer-events-none rounded-full" />
          <div className="absolute top-1/2 -left-32 w-80 h-80 bg-blue-700/10 blur-3xl pointer-events-none rounded-full" />
          <div className="absolute bottom-0 -right-32 w-96 h-96 bg-cyan-600/10 blur-3xl pointer-events-none rounded-full" />

          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            {/* Campus Tag Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/70 text-slate-300 text-xs sm:text-sm font-medium shadow-inner mb-8">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>Official Student Portal • Dr. Ambedkar Institute of Technology (DR AIT)</span>
            </div>

            {/* Main Heading */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-tight">
              Lost Something?{" "}
              <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-300 bg-clip-text text-transparent">
                Let&apos;s Find It.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed">
              Lost something? Find it. Your college&apos;s central destination for reconnecting lost belongings with their owners.
            </p>

            {/* Action Buttons */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-5">
              <button
                type="button"
                onClick={handleOpenLostModal}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-semibold text-base text-white bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              >
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                I Lost Something
              </button>

              <button
                type="button"
                onClick={handleOpenReportModal}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-semibold text-base text-slate-200 bg-slate-900/80 hover:bg-slate-800/90 border border-slate-700/80 hover:border-cyan-500/50 hover:text-white transition-all duration-200 cursor-pointer"
              >
                <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                I Found Something
              </button>
            </div>

            {/* Reassurance Feature Strip */}
            <div className="mt-14 pt-10 border-t border-slate-800/60 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/40 border border-slate-800/40">
                <div className="p-2 rounded-lg bg-blue-500/10 text-cyan-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Campus Security Verified</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Items stored safely at designated campus desks</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/40 border border-slate-800/40">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Quick Recovery</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Real-time notifications for student matches</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/40 border border-slate-800/40">
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">DR AIT Community</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Built exclusively for students, staff, and faculty</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. SEARCH & FILTER SECTION */}
        <section id="browse" className="py-14 bg-[#0d1527]/50 border-b border-slate-800/70">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Search Missing Belongings
              </h2>
              <p className="text-sm text-slate-400 mt-2">
                Filter by keyword or category to browse items reported across campus classrooms, labs, and grounds.
              </p>
            </div>

            {/* Search Input Bar */}
            <div className="max-w-3xl mx-auto">
              <div className="relative flex flex-col sm:flex-row items-stretch gap-2 bg-[#0b1120] p-2 rounded-2xl border border-slate-700/80 shadow-xl shadow-black/40 focus-within:border-cyan-500 transition-colors">
                <div className="relative flex-1 flex items-center">
                  <div className="absolute left-4 pointer-events-none text-slate-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by item name or location (e.g. calculator, library, canteen)..."
                    className="w-full bg-transparent pl-12 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="text-xs text-slate-400 hover:text-white mr-3 px-2 py-1 rounded bg-slate-800"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById("items-grid");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-sm shadow-md shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Search</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>

              {/* Category Filter Pills */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <span className="text-xs text-slate-400 font-medium mr-1">Categories:</span>
                {CATEGORIES.map((cat) => {
                  const isActive = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-all duration-150 cursor-pointer ${
                        isActive
                          ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-sm shadow-cyan-500/30"
                          : "bg-slate-900/80 text-slate-400 border border-slate-800 hover:border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* 4. RECENTLY FOUND ITEMS */}
        <section id="items-grid" className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  Campus Registry
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Sync Active
                </span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white">
                Recently Found Items
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                {isItemsLoading
                  ? "Connecting to campus registry..."
                  : `Showing ${filteredItems.length} of ${items.length} approved items logged across campus`}
              </p>
            </div>

            {selectedCategory !== "All Categories" || searchTerm ? (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("All Categories");
                }}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-medium underline"
              >
                Reset filters
              </button>
            ) : null}
          </div>

          {/* Error State */}
          {itemsError && (
            <div className="mb-8 p-4 rounded-2xl bg-red-950/40 border border-red-800/60 text-red-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-xs sm:text-sm">
                  Failed to load campus items: {itemsError}
                </span>
              </div>
              <button
                type="button"
                onClick={handleRetry}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-900/60 hover:bg-red-800 text-white transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading Skeleton State */}
          {isItemsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="bg-slate-900/70 rounded-2xl border border-slate-800/90 overflow-hidden animate-pulse flex flex-col"
                >
                  <div className="h-44 w-full bg-slate-800/60" />
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2.5">
                      <div className="h-4 w-3/4 bg-slate-800 rounded" />
                      <div className="h-3 w-1/2 bg-slate-800/60 rounded" />
                      <div className="h-3 w-2/5 bg-slate-800/40 rounded" />
                    </div>
                    <div className="h-9 w-full bg-slate-800/80 rounded-xl mt-4" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            /* Database Empty State */
            <div className="text-center py-20 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-cyan-400 flex items-center justify-center">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white">Campus Registry Is Clear</h3>
              <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
                No found items are currently waiting to be claimed. When students or faculty report a found belonging and it is approved by campus security, it will appear here in real time.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleOpenReportModal}
                  className="text-xs font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:from-blue-500 hover:to-cyan-400 shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
                >
                  + Report a Found Item
                </button>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="text-xs font-semibold px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Refresh Registry
                </button>
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            /* Search Filter Empty State */
            <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800">
              <svg className="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-lg font-semibold text-white">No matching items found</h3>
              <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
                No items match your search term &quot;{searchTerm}&quot; in {selectedCategory}. Try another keyword or reset filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("All Categories");
                }}
                className="mt-4 text-xs font-medium px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                Clear Search
              </button>
            </div>
          ) : (
            /* Live Items Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {filteredItems.map((item) => {
                const styles = getCategoryStyles(item.category);
                return (
                  <div
                    key={item.id}
                    className="group relative flex flex-col bg-slate-900/70 hover:bg-slate-900/90 rounded-2xl border border-slate-800/90 hover:border-cyan-500/40 shadow-lg hover:shadow-cyan-500/10 transition-all duration-300 overflow-hidden"
                  >
                    {/* Visual Card Header */}
                    <div
                      className={`h-44 w-full bg-gradient-to-br ${styles.color} flex flex-col items-center justify-center relative p-4 border-b border-slate-800/60 overflow-hidden`}
                    >
                      {item.image_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={item.image_url}
                          alt={item.title || "Found Item"}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="transform group-hover:scale-110 transition-transform duration-300">
                          {renderItemVisual(styles.iconType)}
                        </div>
                      )}

                      {/* Status Badge */}
                      <span className="absolute top-3 left-3 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-950/90 text-emerald-400 border border-emerald-800/60 flex items-center gap-1 shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {item.status === "claimed" ? "Claimed" : "Found"}
                      </span>

                      {/* Category Badge */}
                      <span
                        className={`absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${styles.badgeColor} shadow-sm backdrop-blur-sm`}
                      >
                        {item.category || "General"}
                      </span>
                    </div>

                    {/* Card Content */}
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="font-semibold text-base text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                          {item.title || "Found Item"}
                        </h3>

                        {/* Location Row */}
                        <div className="mt-3 flex items-start gap-2 text-xs text-slate-400">
                          <svg className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="line-clamp-1">
                            {item.general_location || "Campus Grounds"}
                          </span>
                        </div>

                        {/* Date Row */}
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                          <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>{formatDate(item.date_found)}</span>
                        </div>
                      </div>

                      {/* View Details Action */}
                      <div className="mt-5 pt-4 border-t border-slate-800/70">
                        <button
                          type="button"
                          onClick={() => handleOpenItemDetails(item)}
                          className="w-full py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-gradient-to-r hover:from-blue-600 hover:to-cyan-500 text-slate-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer"
                        >
                          <span>View Details</span>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 5. HOW IT WORKS */}
        <section id="how-it-works" className="py-20 bg-gradient-to-b from-[#0d1527]/70 via-[#0b1120] to-[#0b1120] border-t border-slate-800/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                Simple & Transparent
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mt-2">
                How It Works
              </h2>
              <p className="text-base text-slate-400 mt-3">
                A simple three-step system designed to reunite students and faculty of Dr. Ambedkar Institute of Technology with their lost belongings.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
              {/* Step 1 */}
              <div className="relative flex flex-col items-center text-center p-8 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all duration-200 group">
                <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-cyan-400 flex items-center justify-center mb-6 shadow-md shadow-cyan-500/10 group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">Step 1</span>
                <h3 className="text-xl font-bold text-white mb-3">Report a Found Item</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Found someone&apos;s belongings on campus? Take a photo, select the campus location (e.g., Canteen, Library, Lab), and submit a quick report.
                </p>
              </div>

              {/* Step 2 */}
              <div className="relative flex flex-col items-center text-center p-8 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all duration-200 group">
                <div className="w-16 h-16 rounded-2xl bg-cyan-600/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-6 shadow-md shadow-cyan-500/10 group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">Step 2</span>
                <h3 className="text-xl font-bold text-white mb-3">Search for Missing Belongings</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Lost an item? Browse our searchable campus registry by category, location, or date to see if someone has handed it in.
                </p>
              </div>

              {/* Step 3 */}
              <div className="relative flex flex-col items-center text-center p-8 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all duration-200 group">
                <div className="w-16 h-16 rounded-2xl bg-teal-600/10 border border-teal-500/20 text-teal-300 flex items-center justify-center mb-6 shadow-md shadow-teal-500/10 group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-teal-400 mb-2">Step 3</span>
                <h3 className="text-xl font-bold text-white mb-3">Connect & Recover</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Verify your ownership at the designated campus office (Security Desk, Library, or Department) and securely retrieve your item.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ITEM DETAILS MODAL */}
      {activeModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-xl bg-[#0d1527] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            {(() => {
              const modalStyles = getCategoryStyles(activeModalItem.category);
              return (
                <div className={`p-6 bg-gradient-to-br ${modalStyles.color} border-b border-slate-800 flex items-center justify-between`}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-700">
                      {renderItemVisual(modalStyles.iconType)}
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                        Status: {activeModalItem.status === "claimed" ? "Claimed" : "Found on Campus"}
                      </span>
                      <h3 className="text-lg font-bold text-white mt-1">
                        {activeModalItem.title || "Found Item"}
                      </h3>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveModalItem(null)}
                    className="w-8 h-8 rounded-full bg-slate-900/80 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                    aria-label="Close modal"
                  >
                    ✕
                  </button>
                </div>
              );
            })()}

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-sm max-h-[75vh] overflow-y-auto">
              {activeModalItem.image_url && (
                <div className="w-full h-48 rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeModalItem.image_url}
                    alt={activeModalItem.title || "Item Photo"}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div>
                  <span className="text-xs text-slate-400 block">Category</span>
                  <span className="font-medium text-slate-200">
                    {activeModalItem.category || "General"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Date Found</span>
                  <span className="font-medium text-slate-200">
                    {formatDate(activeModalItem.date_found)}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-slate-400 block">Found Location</span>
                  <span className="font-medium text-slate-200">
                    {activeModalItem.general_location || "Campus Grounds"}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-slate-400 block">Current Storage / Handed To</span>
                  <span className="font-semibold text-cyan-300">
                    {activeModalItem.storage_location || "Central Security Desk (Admin Block)"}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-xs text-slate-400 block mb-1">Item Description:</span>
                <p className="text-slate-300 text-xs leading-relaxed bg-slate-900/40 p-3 rounded-lg border border-slate-800/80">
                  {activeModalItem.description || "No specific details provided for this item."}
                </p>
              </div>

              {/* How to Claim & Contact Administrator Section */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-950/40 via-slate-900 to-cyan-950/30 border border-cyan-800/50 shadow-lg space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/30 mt-0.5">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                      <span>How to Claim This Item</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 uppercase font-semibold">
                        Admin Coordination
                      </span>
                    </h4>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      If this item belongs to you, contact the FindYourThings administrator using the button below. The administrator will verify your details and coordinate with the person who found the item. Please include the following information in your email.
                    </p>
                  </div>
                </div>

                {/* Required Details Form & Admin Email Generator */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 block">
                    Required Details to Include in Your Email:
                  </span>

                  {claimFormError && (
                    <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>{claimFormError}</span>
                    </div>
                  )}

                  {claimFormSuccess && (
                    <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Opening your default email app with prefilled details...</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Full Name <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={claimName}
                        onChange={(e) => setClaimName(e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Mobile Number <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        type="tel"
                        value={claimPhone}
                        onChange={(e) => setClaimPhone(e.target.value)}
                        placeholder="e.g. +91 98765 43210"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Email Address <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        type="email"
                        value={claimEmail}
                        onChange={(e) => setClaimEmail(e.target.value)}
                        placeholder="e.g. rahul@example.com"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        USN <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={claimUsn}
                        onChange={(e) => setClaimUsn(e.target.value)}
                        placeholder="e.g. 1DA22CS001"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 uppercase"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Department
                      </label>
                      <input
                        type="text"
                        value={claimDept}
                        onChange={(e) => setClaimDept(e.target.value)}
                        placeholder="e.g. Computer Science"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Batch
                      </label>
                      <input
                        type="text"
                        value={claimBatch}
                        onChange={(e) => setClaimBatch(e.target.value)}
                        placeholder="e.g. 2022-2026"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Semester
                      </label>
                      <input
                        type="text"
                        value={claimSem}
                        onChange={(e) => setClaimSem(e.target.value)}
                        placeholder="e.g. 6th Semester"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Found Item Name:</span>
                    <span className="font-semibold text-cyan-300">
                      {activeModalItem.title || "Found Item"}
                    </span>
                  </div>
                </div>

                {/* Email Administrator Action Button */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleSendClaimEmail}
                    className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 hover:via-cyan-500 hover:to-teal-400 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>Email Admin to Claim ({activeModalItem.title || "Item"})</span>
                  </button>
                  <p className="text-[11px] text-slate-400 text-center mt-2">
                    Validates your details and opens your default email application to mail <span className="text-cyan-400 font-mono">deekshith2r@gmail.com</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Official Campus Registry</span>
              <button
                type="button"
                onClick={() => setActiveModalItem(null)}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. FOOTER */}
      <footer className="bg-[#080d19] border-t border-slate-800/90 py-12 text-slate-400 text-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            {/* Column 1: Platform Info */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center text-white font-bold text-xs">
                  F
                </div>
                <span className="text-lg font-bold text-white">FindYourThings</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md leading-relaxed">
                The centralized Lost and Found digital directory for Dr. Ambedkar Institute of Technology (DR AIT). Designed to simplify the recovery of lost student belongings across the college campus.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs text-cyan-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>DR AIT Student Community Initiative</span>
              </div>
            </div>

            {/* Column 2: Navigation Links */}
            <div>
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">
                Quick Navigation
              </h3>
              <ul className="space-y-2 text-xs">
                <li>
                  <a href="#" className="hover:text-cyan-400 transition-colors">
                    Home
                  </a>
                </li>
                <li>
                  <a href="#browse" className="hover:text-cyan-400 transition-colors">
                    Browse All Items
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="hover:text-cyan-400 transition-colors">
                    How It Works
                  </a>
                </li>
                <li>
                  <button
                    onClick={() => setActionNotice("Safety guidelines and claiming tips will be added in Phase 7.")}
                    className="hover:text-cyan-400 transition-colors text-left"
                  >
                    Campus Safety Guidelines
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3: College Campus Info */}
            <div>
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <svg className="w-4 h-4 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Campus Location</span>
              </h3>
              <p className="text-xs text-slate-300 font-semibold mb-1">
                Dr. Ambedkar Institute of Technology (DR AIT)
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Outer Ring Road, Near Jnana Bharathi Campus,
                <br />
                Mallathahalli, Bengaluru, Karnataka – 560056
              </p>
              <p className="text-xs text-slate-500 mt-3">
                Security Desk: Central Campus Admin Block (Ground Floor)
              </p>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
            <p>© 2026 FindYourThings • Dr. Ambedkar Institute of Technology. All rights reserved.</p>
            <p className="text-cyan-400/80 font-medium">Phase 3: Live Supabase Integration</p>
          </div>
        </div>
      </footer>

      {/* REPORT FOUND ITEM MODAL */}
      <ReportFoundModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        user={user}
        onSuccess={() => {
          // Submitted items remain pending until approved by administrators
          // Realtime subscription will automatically display them once approved
        }}
      />

      {/* REPORT LOST ITEM MODAL */}
      <ReportLostModal
        isOpen={isLostModalOpen}
        onClose={() => setIsLostModalOpen(false)}
        user={user}
        onSuccess={() => {
          // Submitted lost reports remain pending until reviewed by security/admin
        }}
      />

      {/* AUTHENTICATION PROMPT MODAL */}
      <AuthPromptModal
        isOpen={isAuthPromptOpen}
        actionType={authPromptAction}
        onClose={() => setIsAuthPromptOpen(false)}
        onSignIn={() => {
          setIsAuthPromptOpen(false);
          handleGoogleSignIn();
        }}
      />
    </div>
  );
}
