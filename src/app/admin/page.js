"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import AdminReportDetailModal from "@/components/AdminReportDetailModal";

const CATEGORIES = [
  "All Categories",
  "Electronics",
  "ID Cards & Keys",
  "Bags & Wallets",
  "Books & Stationery",
  "Clothing",
  "Other",
];

export default function AdminDashboardPage() {
  // Authentication & Authorization state
  const [user, setUser] = useState(null);
  const [adminRecord, setAdminRecord] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Dashboard Data State
  const [foundItems, setFoundItems] = useState([]);
  const [lostReports, setLostReports] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataError, setDataError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview"); // 'overview' | 'pending' | 'found' | 'lost' | 'approved' | 'rejected'

  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [selectedType, setSelectedType] = useState("all"); // 'all' | 'found' | 'lost'
  const [selectedStatus, setSelectedStatus] = useState("all"); // 'all' | 'pending_approval' | 'approved' | 'rejected'
  const [sortOrder, setSortOrder] = useState("newest"); // 'newest' | 'oldest'

  // Modal State
  const [selectedReport, setSelectedReport] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Notification Banner
  const [dashboardNotice, setDashboardNotice] = useState(null);

  // 1. Check Auth & Verify Administrator Role in public.app_admins
  const checkAdminAccess = useCallback(() => {
    if (!supabase || !isSupabaseConfigured) return;

    supabase.auth
      .getSession()
      .then(({ data: { session }, error: sessionError }) => {
        if (sessionError) throw sessionError;

        if (!session || !session.user) {
          setUser(null);
          setAdminRecord(null);
          setIsAuthLoading(false);
          return null;
        }

        const currentUser = session.user;
        setUser(currentUser);

        return supabase
          .from("app_admins")
          .select("user_id, role, created_at")
          .eq("user_id", currentUser.id)
          .maybeSingle();
      })
      .then((adminRes) => {
        if (!adminRes) return;
        const { data: adminData, error: adminQueryError } = adminRes;
        if (adminQueryError) throw adminQueryError;

        if (adminData && (adminData.role === "admin" || adminData.role === "super_admin")) {
          setAdminRecord(adminData);
          setAuthError(null);
        } else {
          setAdminRecord(null);
          setAuthError("FORBIDDEN");
        }
        setIsAuthLoading(false);
      })
      .catch((err) => {
        setAuthError(err.message || "Failed to verify administrative authorization.");
        setAdminRecord(null);
        setIsAuthLoading(false);
      });
  }, []);

  // 2. Fetch All Reports from Base Tables (Governed by Admin RLS)
  const fetchAllReports = useCallback(() => {
    if (!supabase || !adminRecord) return;

    Promise.all([
      supabase
        .from("found_items")
        .select("uuid, title, category, general_location, date_found, description, image_url, storage_location, status, user_id, reviewed_by, admin_notes, created_at, updated_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("lost_reports")
        .select("id, title, item_name, category, last_seen_location, date_lost, last_seen_at, description, image_url, status, user_id, reviewed_by, admin_notes, created_at, updated_at")
        .order("created_at", { ascending: false }),
    ])
      .then(([foundRes, lostRes]) => {
        if (foundRes.error) throw new Error(`Found Items: ${foundRes.error.message}`);
        if (lostRes.error) throw new Error(`Lost Reports: ${lostRes.error.message}`);

        setFoundItems(foundRes.data || []);
        setLostReports(lostRes.data || []);
        setDataError(null);
        setIsLoadingData(false);
      })
      .catch((err) => {
        setDataError(err.message || "Failed to load management records.");
        setIsLoadingData(false);
      });
  }, [adminRecord]);

  // Auth state listener
  useEffect(() => {
    checkAdminAccess();

    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        checkAdminAccess();
      } else {
        setUser(null);
        setAdminRecord(null);
        setIsAuthLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [checkAdminAccess]);

  // Load data once admin status confirmed
  useEffect(() => {
    if (adminRecord) {
      fetchAllReports();
    }
  }, [adminRecord, fetchAllReports]);

  // Realtime subscription for live dashboard updates
  useEffect(() => {
    if (!supabase || !adminRecord) return;

    const channel = supabase
      .channel("admin-dashboard-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "found_items" },
        (payload) => {
          fetchAllReports();
          if (payload.eventType === "INSERT") {
            setDashboardNotice("🔔 New Found Item submitted and waiting for review!");
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lost_reports" },
        (payload) => {
          fetchAllReports();
          if (payload.eventType === "INSERT") {
            setDashboardNotice("🔔 New Lost Report submitted and waiting for review!");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminRecord, fetchAllReports]);

  // Google Sign-In Trigger
  const handleGoogleSignIn = async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
    } catch (err) {
      setAuthError(err.message || "Authentication redirect failed.");
    }
  };

  // Sign Out Handler
  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setAdminRecord(null);
  };

  // Unified List of Reports
  const unifiedReports = useMemo(() => {
    const normalizedFound = (foundItems || []).map((item) => ({
      ...item,
      reportType: "found",
      primaryId: item.uuid,
      displayTitle: item.title || "Found Item",
      displayLocation: item.general_location || "Campus",
      displayDate: item.date_found || item.created_at?.split("T")[0],
    }));

    const normalizedLost = (lostReports || []).map((item) => ({
      ...item,
      reportType: "lost",
      primaryId: item.id,
      displayTitle: item.title || item.item_name || "Lost Item",
      displayLocation: item.last_seen_location || "Campus",
      displayDate: item.date_lost || item.created_at?.split("T")[0],
    }));

    return [...normalizedFound, ...normalizedLost];
  }, [foundItems, lostReports]);

  // Dashboard Overview Metrics
  const metrics = useMemo(() => {
    const totalFound = foundItems.length;
    const totalLost = lostReports.length;

    const pendingFound = foundItems.filter((i) => i.status === "pending_approval").length;
    const pendingLost = lostReports.filter((i) => i.status === "pending_approval").length;
    const pendingApprovals = pendingFound + pendingLost;

    const approvedFound = foundItems.filter((i) => i.status === "approved" || i.status === "claimed").length;
    const approvedLost = lostReports.filter((i) => i.status === "approved" || i.status === "open" || i.status === "resolved").length;
    const approvedReports = approvedFound + approvedLost;

    const rejectedFound = foundItems.filter((i) => i.status === "rejected").length;
    const rejectedLost = lostReports.filter((i) => i.status === "rejected").length;
    const rejectedReports = rejectedFound + rejectedLost;

    return {
      totalFound,
      totalLost,
      pendingApprovals,
      pendingFound,
      pendingLost,
      approvedReports,
      rejectedReports,
    };
  }, [foundItems, lostReports]);

  // Filtered Reports based on Active Tab, Search, Category, Status, Type
  const filteredReports = useMemo(() => {
    return unifiedReports.filter((report) => {
      // 1. Tab constraints
      if (activeTab === "pending" && report.status !== "pending_approval") return false;
      if (activeTab === "found" && report.reportType !== "found") return false;
      if (activeTab === "lost" && report.reportType !== "lost") return false;
      if (
        activeTab === "approved" &&
        report.status !== "approved" &&
        report.status !== "claimed" &&
        report.status !== "open" &&
        report.status !== "resolved"
      ) {
        return false;
      }
      if (activeTab === "rejected" && report.status !== "rejected") return false;

      // 2. Report Type Filter
      if (selectedType !== "all" && report.reportType !== selectedType) return false;

      // 3. Category Filter
      if (selectedCategory !== "All Categories" && report.category !== selectedCategory) return false;

      // 4. Status Filter (when not on a specific status tab)
      if (selectedStatus !== "all") {
        if (selectedStatus === "pending_approval" && report.status !== "pending_approval") return false;
        if (selectedStatus === "approved" && report.status !== "approved") return false;
        if (selectedStatus === "rejected" && report.status !== "rejected") return false;
      }

      // 5. Search Filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const titleMatch = (report.displayTitle || "").toLowerCase().includes(query);
        const locMatch = (report.displayLocation || "").toLowerCase().includes(query);
        const catMatch = (report.category || "").toLowerCase().includes(query);
        const descMatch = (report.description || "").toLowerCase().includes(query);
        const idMatch = (report.primaryId || "").toLowerCase().includes(query);
        if (!titleMatch && !locMatch && !catMatch && !descMatch && !idMatch) return false;
      }

      return true;
    }).sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
    });
  }, [unifiedReports, activeTab, selectedType, selectedCategory, selectedStatus, searchTerm, sortOrder]);

  // Handle report status update from modal
  const handleReportUpdated = (updatedReport) => {
    if (updatedReport.reportType === "found") {
      setFoundItems((prev) =>
        prev.map((item) => (item.uuid === updatedReport.uuid ? { ...item, ...updatedReport } : item))
      );
    } else {
      setLostReports((prev) =>
        prev.map((item) => (item.id === updatedReport.id ? { ...item, ...updatedReport } : item))
      );
    }
    // Update active modal report
    setSelectedReport(updatedReport);
  };

  // -------------------------------------------------------------
  // STATE 1: LOADING INITIAL AUTHORIZATION
  // -------------------------------------------------------------
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#0b1120] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mb-4" />
        <h2 className="text-base font-semibold text-slate-200">
          Verifying DR AIT Administrator Access
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Validating cryptographic credentials against public.app_admins...
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 2: NOT SIGNED IN
  // -------------------------------------------------------------
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0b1120] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>

          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60">
              Admin Portal • DR AIT
            </span>
            <h1 className="text-2xl font-bold text-white mt-3">
              Authentication Required
            </h1>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Sign in with your authorized college Google account to access the FindYourThings Security Management Dashboard.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full inline-flex items-center justify-center gap-3 px-5 py-3 rounded-xl bg-white text-slate-900 hover:bg-slate-100 font-semibold text-sm shadow-md transition-all cursor-pointer"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Sign In with College Google</span>
          </button>

          <div className="pt-2">
            <Link
              href="/"
              className="text-xs text-slate-400 hover:text-cyan-400 transition-colors inline-flex items-center gap-1.5"
            >
              ← Return to FindYourThings Public Portal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 3: SIGNED IN BUT NOT AN AUTHORIZED ADMINISTRATOR (403)
  // -------------------------------------------------------------
  if (authError === "FORBIDDEN" || !adminRecord) {
    return (
      <div className="min-h-screen bg-[#0b1120] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-rose-900/60 rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-rose-950/60 border border-rose-500/40 flex items-center justify-center mx-auto text-rose-400">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>

          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-950 text-rose-300 border border-rose-800/60">
              403 Forbidden • Access Denied
            </span>
            <h1 className="text-2xl font-bold text-white mt-3">
              Administrator Privileges Required
            </h1>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              You are signed in as <span className="font-semibold text-slate-200">{user.email}</span>. This account does not possess administrator credentials in <span className="font-mono text-cyan-400 text-[11px]">public.app_admins</span>.
            </p>
            <p className="text-[11px] text-slate-500 mt-2">
              If you are a member of campus security or faculty administration, please request authorization from the super-administrator.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <Link
              href="/"
              className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors"
            >
              Return to Public Portal
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Sign Out & Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 4: AUTHORIZED ADMINISTRATOR DASHBOARD
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-white">
      {/* 1. ADMIN HEADER */}
      <header className="sticky top-0 z-40 bg-[#0b1120]/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo & Admin Badge */}
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-3 group">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-sky-400 p-[2px] shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
                  <div className="w-full h-full bg-[#0b1120] rounded-[10px] flex items-center justify-center">
                    <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
                      FindYourThings
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-bold uppercase tracking-wider">
                      Admin Portal
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium tracking-wide">
                    Dr. Ambedkar Institute of Technology (DR AIT)
                  </p>
                </div>
              </Link>
            </div>

            {/* Admin Profile & Actions */}
            <div className="flex items-center gap-3 sm:gap-4">
              <Link
                href="/"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
              >
                <span>🌐 Public Portal</span>
              </Link>

              <button
                type="button"
                onClick={fetchAllReports}
                disabled={isLoadingData}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 hover:bg-cyan-900/60 transition-colors cursor-pointer"
                title="Refresh Records"
              >
                <svg
                  className={`w-3.5 h-3.5 ${isLoadingData ? "animate-spin" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden sm:inline">Refresh</span>
              </button>

              {/* Administrator Identity Badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-500 text-white font-bold flex items-center justify-center text-xs">
                  {(user.user_metadata?.full_name || user.email || "A")[0].toUpperCase()}
                </div>
                <div className="hidden md:flex flex-col text-left">
                  <span className="text-xs font-semibold text-slate-200 truncate max-w-[140px]">
                    {user.user_metadata?.full_name || user.email}
                  </span>
                  <span className="text-[10px] font-mono text-cyan-400 capitalize">
                    {adminRecord.role.replace("_", " ")}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* DASHBOARD ALERT / NOTICE BANNER */}
      {dashboardNotice && (
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-cyan-950 border-b border-cyan-800/40 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-xs sm:text-sm text-cyan-200">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span>{dashboardNotice}</span>
            </div>
            <button
              onClick={() => setDashboardNotice(null)}
              className="text-cyan-400 hover:text-white font-bold ml-4"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* KPI OVERVIEW METRICS CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* Card 1: Pending Approvals (High Priority) */}
          <div
            onClick={() => setActiveTab("pending")}
            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
              metrics.pendingApprovals > 0
                ? "bg-amber-950/20 border-amber-500/40 hover:border-amber-400 shadow-lg shadow-amber-500/5"
                : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                Pending Queue
              </span>
              {metrics.pendingApprovals > 0 && (
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              )}
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2">
              {metrics.pendingApprovals}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {metrics.pendingFound} Found • {metrics.pendingLost} Lost
            </p>
          </div>

          {/* Card 2: Total Found Reports */}
          <div
            onClick={() => setActiveTab("found")}
            className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all cursor-pointer"
          >
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
              Found Items
            </span>
            <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2">
              {metrics.totalFound}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Total submissions</p>
          </div>

          {/* Card 3: Total Lost Reports */}
          <div
            onClick={() => setActiveTab("lost")}
            className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-all cursor-pointer"
          >
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
              Lost Reports
            </span>
            <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2">
              {metrics.totalLost}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Total submissions</p>
          </div>

          {/* Card 4: Approved Reports */}
          <div
            onClick={() => setActiveTab("approved")}
            className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 transition-all cursor-pointer"
          >
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Approved Live
            </span>
            <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2">
              {metrics.approvedReports}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Live on campus site</p>
          </div>

          {/* Card 5: Rejected Archive */}
          <div
            onClick={() => setActiveTab("rejected")}
            className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-rose-500/40 transition-all cursor-pointer col-span-2 sm:col-span-1"
          >
            <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
              Rejected Archive
            </span>
            <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2">
              {metrics.rejectedReports}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Declined reports</p>
          </div>
        </div>

        {/* 3. NAVIGATION TABS */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "overview"
                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            Overview & Stats
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeTab === "pending"
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <span>Pending Approvals</span>
            {metrics.pendingApprovals > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                {metrics.pendingApprovals}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("found")}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "found"
                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            Found Reports ({metrics.totalFound})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("lost")}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "lost"
                ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            Lost Reports ({metrics.totalLost})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("approved")}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "approved"
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            Approved Registry ({metrics.approvedReports})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("rejected")}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "rejected"
                ? "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            Rejected Archive ({metrics.rejectedReports})
          </button>
        </div>

        {/* 4. OVERVIEW DASHBOARD SUMMARY SECTION (When on 'overview' tab) */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Urgent Pending Action Banner */}
            {metrics.pendingApprovals > 0 ? (
              <div className="p-6 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/30 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {metrics.pendingApprovals} Pending Student Report{metrics.pendingApprovals > 1 ? "s" : ""} Requiring Review
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">
                      New reports submitted by students are currently held in pending approval status. They will not be visible on the public campus portal until you approve them.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("pending")}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer whitespace-nowrap"
                >
                  Open Pending Queue →
                </button>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Pending Approval Queue is Clear</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    All student reports have been reviewed. When new lost or found submissions are submitted, they will appear here in real-time.
                  </p>
                </div>
              </div>
            )}

            {/* Recent Activity Header */}
            <div className="flex items-center justify-between pt-4">
              <div>
                <h3 className="text-lg font-bold text-white">Recent Submissions (All)</h3>
                <p className="text-xs text-slate-400">Complete audit log of campus submissions</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("pending")}
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                View Pending Only ({metrics.pendingApprovals}) →
              </button>
            </div>
          </div>
        )}

        {/* 5. SEARCH & FILTERS BAR */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
            {/* Search Input */}
            <div className="lg:col-span-5 relative">
              <svg
                className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by title, location, description, or ID..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Filter */}
            <div className="lg:col-span-3">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} className="bg-slate-900">
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Report Type Filter */}
            <div className="lg:col-span-2">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
              >
                <option value="all" className="bg-slate-900">All Types</option>
                <option value="found" className="bg-slate-900">Found Items</option>
                <option value="lost" className="bg-slate-900">Lost Reports</option>
              </select>
            </div>

            {/* Sort Order */}
            <div className="lg:col-span-2">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
              >
                <option value="newest" className="bg-slate-900">Newest First</option>
                <option value="oldest" className="bg-slate-900">Oldest First</option>
              </select>
            </div>
          </div>
        </div>

        {/* 6. REPORTS TABLE / LIST */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>
              Showing <span className="font-semibold text-white">{filteredReports.length}</span> report{filteredReports.length !== 1 ? "s" : ""}
            </span>
            {isLoadingData && (
              <span className="text-cyan-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                Syncing with Supabase...
              </span>
            )}
          </div>

          {dataError && (
            <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs">
              {dataError}
            </div>
          )}

          {isLoadingData && filteredReports.length === 0 ? (
            /* Skeleton Loading State */
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 rounded-2xl bg-slate-900/40 border border-slate-800 animate-pulse" />
              ))}
            </div>
          ) : filteredReports.length === 0 ? (
            /* Empty State */
            <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800">
              <div className="w-12 h-12 rounded-full bg-slate-800/80 text-slate-500 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h4 className="text-base font-semibold text-slate-300">No Reports Match Your Filter</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No submissions were found matching your current search parameters or active tab.
              </p>
              {(searchTerm || selectedCategory !== "All Categories" || selectedType !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedCategory("All Categories");
                    setSelectedType("all");
                  }}
                  className="mt-4 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-medium transition-colors cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            /* Interactive Data Table / Cards */
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-semibold tracking-wider uppercase text-[11px]">
                      <th className="py-3.5 px-4">Item & Category</th>
                      <th className="py-3.5 px-4">Type</th>
                      <th className="py-3.5 px-4">Location</th>
                      <th className="py-3.5 px-4">Date Reported</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredReports.map((report) => {
                      const isFound = report.reportType === "found";
                      const isPending = report.status === "pending_approval";

                      return (
                        <tr
                          key={report.primaryId}
                          className="hover:bg-slate-800/40 transition-colors group"
                        >
                          {/* Item & Category */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              {report.image_url ? (
                                <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-700/80 bg-slate-950 shrink-0">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={report.image_url}
                                    alt={report.displayTitle}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 text-slate-500">
                                  <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                  </svg>
                                </div>
                              )}
                              <div className="overflow-hidden">
                                <p className="font-semibold text-white truncate max-w-[220px]">
                                  {report.displayTitle}
                                </p>
                                <p className="text-[11px] text-cyan-400 font-medium">
                                  {report.category || "General"}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Report Type Badge */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                isFound
                                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                  : "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                              }`}
                            >
                              {isFound ? "Found Item" : "Lost Report"}
                            </span>
                          </td>

                          {/* Location */}
                          <td className="py-3.5 px-4 text-slate-300 max-w-[160px] truncate">
                            {report.displayLocation}
                          </td>

                          {/* Date Reported */}
                          <td className="py-3.5 px-4 whitespace-nowrap text-slate-400">
                            {report.displayDate}
                          </td>

                          {/* Status Badge */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {isPending ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                Pending
                              </span>
                            ) : report.status === "approved" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                ✓ Live
                              </span>
                            ) : report.status === "rejected" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                ✕ Rejected
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30 capitalize">
                                {report.status || "Open"}
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedReport(report);
                                setIsDetailModalOpen(true);
                              }}
                              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-cyan-600 text-slate-200 hover:text-white font-semibold transition-all cursor-pointer"
                            >
                              {isPending ? "Review & Decide →" : "View Details"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 7. ADMIN REPORT DETAIL & DECISION MODAL */}
      <AdminReportDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedReport(null);
        }}
        report={selectedReport}
        currentAdmin={user}
        onStatusUpdated={handleReportUpdated}
      />
    </div>
  );
}
