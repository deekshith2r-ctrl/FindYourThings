"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminReportDetailModal({
  isOpen,
  onClose,
  report,
  currentAdmin,
  onStatusUpdated,
}) {
  const [activeTab, setActiveTab] = useState("details"); // 'details' | 'confidential' | 'review'
  const [privateDetails, setPrivateDetails] = useState(null);
  const [submitterProfile, setSubmitterProfile] = useState(null);
  const [reviewerProfile, setReviewerProfile] = useState(null);
  const [isLoadingPrivate, setIsLoadingPrivate] = useState(false);
  const [privateError, setPrivateError] = useState(null);

  // Action states
  const [adminNotes, setAdminNotes] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Confirmation dialogs
  const [confirmDialog, setConfirmDialog] = useState(null); // { type: 'approve' | 'reject' | 'archive', title: string, prompt: string }
  const [rejectionReason, setRejectionReason] = useState("");

  const isFound = report?.reportType === "found";
  const reportId = isFound ? report?.uuid : report?.id;
  const isSelfSubmitted = currentAdmin?.id && report?.user_id && currentAdmin.id === report.user_id;

  // Reset tab & state when opened
  useEffect(() => {
    if (isOpen && report) {
      const initialTabTimer = setTimeout(() => {
        setActiveTab("details");
        setAdminNotes(report.admin_notes || "");
        setStorageLocation(report.storage_location || "");
        setActionError(null);
        setActionSuccess(null);
        setConfirmDialog(null);
        setRejectionReason("");
      }, 0);

      // Fetch confidential contact info and submitter profile
      const fetchPrivateData = async () => {
        if (!supabase) return;
        setIsLoadingPrivate(true);
        setPrivateError(null);

        try {
          if (isFound) {
            const { data, error } = await supabase
              .from("item_contact_info")
              .select("*")
              .eq("item_id", report.uuid)
              .maybeSingle();

            if (error) throw error;
            setPrivateDetails(data);
          } else {
            const { data, error } = await supabase
              .from("lost_report_private_details")
              .select("*")
              .eq("report_id", report.id)
              .maybeSingle();

            if (error) throw error;
            setPrivateDetails(data);
          }

          // Fetch submitter profile if user_id exists
          if (report.user_id) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id, email, display_name, avatar_url, student_roll_no, department")
              .eq("id", report.user_id)
              .maybeSingle();
            setSubmitterProfile(profile);
          }

          // Fetch reviewer profile if reviewed_by exists
          if (report.reviewed_by) {
            const { data: reviewer } = await supabase
              .from("profiles")
              .select("id, email, display_name")
              .eq("id", report.reviewed_by)
              .maybeSingle();
            setReviewerProfile(reviewer);
          }
        } catch (err) {
          setPrivateError(err.message || "Failed to load confidential details.");
        } finally {
          setIsLoadingPrivate(false);
        }
      };

      fetchPrivateData();
      return () => clearTimeout(initialTabTimer);
    } else {
      const clearTimer = setTimeout(() => {
        setPrivateDetails(null);
        setSubmitterProfile(null);
        setReviewerProfile(null);
      }, 0);
      return () => clearTimeout(clearTimer);
    }
  }, [isOpen, report, isFound]);

  if (!isOpen || !report) return null;

  // Handle Approve Action
  const handleApprove = async () => {
    if (!supabase || !currentAdmin?.id) return;
    setIsSubmittingAction(true);
    setActionError(null);

    try {
      const updatePayload = {
        status: "approved",
        reviewed_by: currentAdmin.id,
        admin_notes: adminNotes.trim() || "Approved by campus administration.",
        updated_at: new Date().toISOString(),
      };

      if (isFound && storageLocation.trim()) {
        updatePayload.storage_location = storageLocation.trim();
      }

      const table = isFound ? "found_items" : "lost_reports";
      const idColumn = isFound ? "uuid" : "id";

      const { error } = await supabase
        .from(table)
        .update(updatePayload)
        .eq(idColumn, reportId);

      if (error) throw error;

      setActionSuccess("Report successfully approved and published to campus registry!");
      setConfirmDialog(null);
      if (onStatusUpdated) {
        onStatusUpdated({
          ...report,
          ...updatePayload,
        });
      }
    } catch (err) {
      setActionError(err.message || "Failed to approve report.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Handle Reject Action
  const handleReject = async () => {
    if (!supabase || !currentAdmin?.id) return;
    if (!rejectionReason.trim()) {
      setActionError("Please provide an official rejection reason for campus audit logs.");
      return;
    }

    setIsSubmittingAction(true);
    setActionError(null);

    try {
      const updatePayload = {
        status: "rejected",
        reviewed_by: currentAdmin.id,
        admin_notes: rejectionReason.trim(),
        updated_at: new Date().toISOString(),
      };

      const table = isFound ? "found_items" : "lost_reports";
      const idColumn = isFound ? "uuid" : "id";

      const { error } = await supabase
        .from(table)
        .update(updatePayload)
        .eq(idColumn, reportId);

      if (error) throw error;

      setActionSuccess("Report rejected and moved to rejected archive.");
      setConfirmDialog(null);
      if (onStatusUpdated) {
        onStatusUpdated({
          ...report,
          ...updatePayload,
        });
      }
    } catch (err) {
      setActionError(err.message || "Failed to reject report.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status) => {
    switch (status) {
      case "pending_approval":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Pending Approval
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Approved & Live
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <svg className="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Rejected
          </span>
        );
      case "claimed":
      case "resolved":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
            <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {status === "claimed" ? "Claimed & Returned" : "Resolved"}
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            {status || "Unknown"}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                isFound
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                  : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
              }`}
            >
              {isFound ? "Found Item Report" : "Lost Item Report"}
            </span>
            {renderStatusBadge(report.status)}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* TABS NAVIGATION */}
        <div className="flex border-b border-slate-800 bg-slate-900/60 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("details")}
            className={`px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-lg transition-colors border-b-2 cursor-pointer ${
              activeTab === "details"
                ? "text-cyan-400 border-cyan-400 bg-slate-800/60"
                : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/30"
            }`}
          >
            Item Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("confidential")}
            className={`px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === "confidential"
                ? "text-amber-400 border-amber-400 bg-slate-800/60"
                : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/30"
            }`}
          >
            <span>🛡️ Confidential Contact Info</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold uppercase tracking-wider">
              Admin Only
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("review")}
            className={`px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === "review"
                ? "text-blue-400 border-blue-400 bg-slate-800/60"
                : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/30"
            }`}
          >
            <span>Decision & Actions</span>
          </button>
        </div>

        {/* NOTIFICATIONS */}
        {actionSuccess && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs sm:text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{actionSuccess}</span>
            </div>
            <button
              onClick={() => setActionSuccess(null)}
              className="text-emerald-400 hover:text-white font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {actionError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs sm:text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{actionError}</span>
            </div>
            <button
              onClick={() => setActionError(null)}
              className="text-rose-400 hover:text-white font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: ITEM DETAILS */}
          {activeTab === "details" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left Column: Photograph */}
              <div className="md:col-span-1 space-y-3">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Item Photograph
                </label>
                {report.image_url ? (
                  <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-950 aspect-square flex items-center justify-center group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={report.image_url}
                      alt={report.title || "Report photo"}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <a
                      href={report.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-2 right-2 px-2.5 py-1 rounded bg-black/75 hover:bg-black text-[11px] font-medium text-cyan-300 flex items-center gap-1 backdrop-blur-sm"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Full Size
                    </a>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/60 aspect-square flex flex-col items-center justify-center text-slate-500 p-4 text-center">
                    <svg className="w-12 h-12 text-slate-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs">No photograph uploaded</span>
                  </div>
                )}

                <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Report ID:</span>
                    <span className="font-mono text-[11px] text-slate-300 truncate max-w-[150px]">
                      {reportId}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Submitted:</span>
                    <span className="text-slate-200">
                      {report.created_at ? new Date(report.created_at).toLocaleDateString() : "Unknown"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Metadata & Description */}
              <div className="md:col-span-2 space-y-4">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    {report.title || (isFound ? "Found Item" : "Lost Item")}
                  </h3>
                  <p className="text-xs text-cyan-400 font-medium mt-0.5">
                    Category: {report.category || "General"}
                  </p>
                </div>

                {/* Key Location & Date Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      {isFound ? "Where Found" : "Last Seen Location"}
                    </span>
                    <p className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {report.general_location || report.last_seen_location || "Not specified"}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      {isFound ? "Date Found" : "Date & Time Lost"}
                    </span>
                    <p className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {report.date_found || report.date_lost || "Recent"}
                    </p>
                  </div>
                </div>

                {/* Physical Storage Location (for Found items) */}
                {isFound && (
                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Physical Custody Location (DR AIT Campus)
                    </span>
                    <p className="text-sm text-cyan-300 font-medium">
                      {report.storage_location || "Central Security Desk (Central Admin Block)"}
                    </p>
                  </div>
                )}

                {/* Description */}
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Full Description
                  </span>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {report.description || "No description provided."}
                  </div>
                </div>

                {/* Existing Review Info if any */}
                {(report.reviewed_by || report.admin_notes) && (
                  <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-700/80">
                    <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider block mb-1">
                      Previous Review Log
                    </span>
                    <div className="text-xs text-slate-300 space-y-1">
                      {reviewerProfile && (
                        <p>
                          <span className="text-slate-400">Reviewer:</span> {reviewerProfile.display_name} ({reviewerProfile.email})
                        </p>
                      )}
                      {report.admin_notes && (
                        <p>
                          <span className="text-slate-400">Admin Remarks:</span> {report.admin_notes}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CONFIDENTIAL CONTACT INFO (ADMIN ONLY) */}
          {activeTab === "confidential" && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs sm:text-sm flex items-start gap-3">
                <span className="text-lg">🔒</span>
                <div>
                  <p className="font-semibold text-amber-300">Confidential Campus Record</p>
                  <p className="text-amber-200/80 text-xs mt-0.5">
                    This contact information and secret identifying notes are restricted exclusively to authorized DR AIT campus administrators. These details are completely isolated from public views.
                  </p>
                </div>
              </div>

              {isLoadingPrivate ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                  <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mb-3" />
                  <span className="text-xs">Decrypting confidential contact record...</span>
                </div>
              ) : privateError ? (
                <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                  {privateError}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Submitter Account Profile */}
                  <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      Google Authenticated Student Profile
                    </h4>

                    {submitterProfile ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          {submitterProfile.avatar_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={submitterProfile.avatar_url}
                              alt={submitterProfile.display_name || "Avatar"}
                              className="w-11 h-11 rounded-full border border-cyan-400/40 object-cover"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-cyan-900/60 text-cyan-300 font-bold flex items-center justify-center text-base border border-cyan-700/60">
                              {(submitterProfile.display_name || submitterProfile.email || "S")[0].toUpperCase()}
                            </div>
                          )}
                          <div className="overflow-hidden">
                            <p className="text-sm font-semibold text-white truncate">
                              {submitterProfile.display_name || "Student"}
                            </p>
                            <p className="text-xs text-cyan-400 truncate">
                              {submitterProfile.email}
                            </p>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-800/80 space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-400">User ID:</span>
                            <span className="font-mono text-slate-300 truncate max-w-[180px]">
                              {submitterProfile.id}
                            </span>
                          </div>
                          {submitterProfile.student_roll_no && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Student Roll No:</span>
                              <span className="font-semibold text-slate-200">
                                {submitterProfile.student_roll_no}
                              </span>
                            </div>
                          )}
                          {submitterProfile.department && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Department:</span>
                              <span className="text-slate-200">{submitterProfile.department}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        {report.user_id ? `User UUID: ${report.user_id}` : "Anonymous / Direct Submission"}
                      </p>
                    )}
                  </div>

                  {/* Private Contact Details Record */}
                  <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      {isFound ? "Finder Contact Details" : "Owner Contact Details"}
                    </h4>

                    {privateDetails ? (
                      <div className="space-y-3 text-xs">
                        <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                          <span className="text-slate-400">Full Name:</span>
                          <span className="font-semibold text-white">
                            {isFound
                              ? privateDetails.finder_name || "Not provided"
                              : privateDetails.owner_name || "Not provided"}
                          </span>
                        </div>

                        <div className="flex justify-between py-1.5 border-b border-slate-800/60 items-center">
                          <span className="text-slate-400">Phone Number:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-cyan-300">
                              {isFound
                                ? privateDetails.finder_phone || "Not provided"
                                : privateDetails.contact_phone || "Not provided"}
                            </span>
                            {(privateDetails.finder_phone || privateDetails.contact_phone) && (
                              <a
                                href={`tel:${privateDetails.finder_phone || privateDetails.contact_phone}`}
                                className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 hover:bg-cyan-900 text-[10px] font-bold"
                              >
                                Call
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-between py-1.5 border-b border-slate-800/60 items-center">
                          <span className="text-slate-400">Email:</span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-200">
                              {isFound
                                ? privateDetails.finder_email || "Not provided"
                                : privateDetails.contact_email || "Not provided"}
                            </span>
                            {(privateDetails.finder_email || privateDetails.contact_email) && (
                              <a
                                href={`mailto:${privateDetails.finder_email || privateDetails.contact_email}`}
                                className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white text-[10px]"
                              >
                                Mail
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                          <span className="text-slate-400">Academic Semester & Batch:</span>
                          <span className="text-slate-200">
                            Sem {privateDetails.semester || "N/A"} • Batch {privateDetails.batch || "N/A"}
                          </span>
                        </div>

                        {!isFound && privateDetails.student_roll_no && (
                          <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                            <span className="text-slate-400">Student Roll No:</span>
                            <span className="font-semibold text-white">
                              {privateDetails.student_roll_no}
                            </span>
                          </div>
                        )}

                        {/* Secret Marks / Specific Details */}
                        {isFound && privateDetails.secret_identifying_marks && (
                          <div className="pt-2">
                            <span className="text-slate-400 block mb-1 font-semibold text-amber-300">
                              Secret Identifying Marks:
                            </span>
                            <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-900/40 text-amber-100/90 text-xs">
                              {privateDetails.secret_identifying_marks}
                            </div>
                          </div>
                        )}

                        {isFound && privateDetails.precise_location_details && (
                          <div className="pt-2">
                            <span className="text-slate-400 block mb-1">
                              Precise Location Notes:
                            </span>
                            <div className="p-2.5 rounded-lg bg-slate-900 text-slate-300 text-xs">
                              {privateDetails.precise_location_details}
                            </div>
                          </div>
                        )}

                        {!isFound && privateDetails.private_notes && (
                          <div className="pt-2">
                            <span className="text-slate-400 block mb-1">
                              Private Owner Notes:
                            </span>
                            <div className="p-2.5 rounded-lg bg-slate-900 text-slate-300 text-xs">
                              {privateDetails.private_notes}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">
                        No private contact details were attached to this report.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: REVIEW & DECISION CENTER */}
          {activeTab === "review" && (
            <div className="space-y-6">
              {/* Conflict of Interest Warning if user is the submitter */}
              {isSelfSubmitted && (
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200 text-xs sm:text-sm flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <h5 className="font-bold text-amber-300">Self-Review Safeguard</h5>
                    <p className="mt-1 leading-relaxed text-amber-200/90">
                      You submitted this report yourself using your account. Under DR AIT institutional lost-and-found security guidelines, administrators cannot approve or reject their own submissions to prevent conflicts of interest.
                    </p>
                    <p className="mt-1 text-[11px] text-amber-400 font-medium">
                      Please have another authorized campus administrator review and verify this report.
                    </p>
                  </div>
                </div>
              )}

              {/* Form for Remarks and Custody Location */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Administrative Audit & Remarks
                </h4>

                {isFound && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      Campus Storage / Custody Location
                    </label>
                    <input
                      type="text"
                      value={storageLocation}
                      onChange={(e) => setStorageLocation(e.target.value)}
                      placeholder="e.g. Security Desk - Admin Block (Locker #14)"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs sm:text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                      disabled={isSubmittingAction}
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Specifies where the physical item is held on campus for owner collection.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Administrative Notes / Remarks
                  </label>
                  <textarea
                    rows={3}
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="e.g. Verified serial number against student ID card; ready for public listing."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs sm:text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                    disabled={isSubmittingAction}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-300">
                    Current Status: <span className="text-cyan-400 capitalize">{report.status || "Pending"}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Approving makes this report live on the public campus registry. Rejecting archives it.
                  </p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmDialog({
                        type: "reject",
                        title: "Reject Report",
                        prompt: "Provide an official reason for rejecting this report. This reason will be recorded in campus audit logs.",
                      })
                    }
                    disabled={isSelfSubmitted || isSubmittingAction}
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Reject Report
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setConfirmDialog({
                        type: "approve",
                        title: "Approve & Publish",
                        prompt: "Are you sure you want to approve this report? It will become visible immediately on the campus FindYourThings public registry.",
                      })
                    }
                    disabled={isSelfSubmitted || isSubmittingAction}
                    className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSubmittingAction ? "Processing..." : "Approve & Publish"}
                  </button>
                </div>
              </div>

              {/* CONFIRMATION DIALOG MODAL OVERLAY */}
              {confirmDialog && (
                <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
                  <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <h4
                        className={`text-base font-bold ${
                          confirmDialog.type === "approve" ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {confirmDialog.title}
                      </h4>
                      <button
                        onClick={() => setConfirmDialog(null)}
                        className="text-slate-400 hover:text-white text-sm"
                      >
                        ✕
                      </button>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      {confirmDialog.prompt}
                    </p>

                    {confirmDialog.type === "reject" && (
                      <div>
                        <label className="block text-xs font-semibold text-rose-300 mb-1">
                          Rejection Reason *
                        </label>
                        <textarea
                          rows={3}
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          placeholder="e.g. Duplicate report, insufficient description, or inappropriate content."
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-rose-500/40 text-slate-200 text-xs focus:outline-none focus:border-rose-400"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDialog(null)}
                        className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
                        disabled={isSubmittingAction}
                      >
                        Cancel
                      </button>

                      {confirmDialog.type === "approve" ? (
                        <button
                          type="button"
                          onClick={handleApprove}
                          disabled={isSubmittingAction}
                          className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                        >
                          {isSubmittingAction ? "Approving..." : "Confirm Approval"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleReject}
                          disabled={isSubmittingAction || !rejectionReason.trim()}
                          className="px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {isSubmittingAction ? "Rejecting..." : "Confirm Rejection"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/80">
          <span className="text-[11px] text-slate-500">
            FindYourThings Admin Security System • DR AIT
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
