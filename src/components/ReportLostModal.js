"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const CATEGORIES = [
  "Electronics",
  "ID Cards & Keys",
  "Bags & Wallets",
  "Books & Stationery",
  "Clothing",
  "Other",
];

export default function ReportLostModal({ isOpen, onClose, user, onSuccess }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Electronics");
  const [lastSeenLocation, setLastSeenLocation] = useState("");
  const [dateLost, setDateLost] = useState("");
  const [timeLost, setTimeLost] = useState("");
  const [maxDate, setMaxDate] = useState("");
  const [description, setDescription] = useState("");

  // Private owner contact details
  const [ownerPhone, setOwnerPhone] = useState("");
  const [studentRollNo, setStudentRollNo] = useState("");
  const [semester, setSemester] = useState("");
  const [batch, setBatch] = useState("");

  // Photograph upload state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // Status & validation
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedTitle, setSubmittedTitle] = useState("");

  // Set default date when modal opens (deferred to prevent Next.js prerender error)
  useEffect(() => {
    if (isOpen) {
      const today = new Date().toISOString().split("T")[0];
      const timer = setTimeout(() => {
        setDateLost((prev) => prev || today);
        setMaxDate(today);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Cleanup object URL preview to prevent memory leaks
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  if (!isOpen) return null;

  // Handle image selection with strict validation
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    setErrorMessage(null);

    if (!file) {
      setImageFile(null);
      setImagePreview(null);
      return;
    }

    // 1. File size validation (Max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErrorMessage("Selected photograph exceeds the 5 MB limit. Please select a smaller photo.");
      return;
    }

    // 2. MIME type & extension validation
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const validExtensions = ["jpg", "jpeg", "png", "webp"];

    if (!validTypes.includes(file.type) || !validExtensions.includes(ext || "")) {
      setErrorMessage("Only JPEG, PNG, or WebP images are allowed.");
      return;
    }

    setImageFile(file);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
  };

  const removeSelectedImage = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImageFile(null);
    setImagePreview(null);
  };

  // Reset all form fields
  const resetForm = () => {
    setTitle("");
    setCategory("Electronics");
    setLastSeenLocation("");
    setDateLost("");
    setTimeLost("");
    setDescription("");
    setOwnerPhone("");
    setStudentRollNo("");
    setSemester("");
    setBatch("");
    removeSelectedImage();
    setErrorMessage(null);
    setIsSuccess(false);
    setSubmittedTitle("");
  };

  // Handle Form Submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Client-side validation
    if (!title.trim() || title.trim().length < 3) {
      setErrorMessage("Please enter an item name with at least 3 characters.");
      return;
    }
    if (!lastSeenLocation.trim() || lastSeenLocation.trim().length < 3) {
      setErrorMessage("Please specify where on campus the item was last seen.");
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      setErrorMessage("Please provide a description of at least 10 characters (identifying marks, condition, etc.).");
      return;
    }

    if (!user || !user.id) {
      setErrorMessage("You must be signed in to submit a lost item report.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const reportId = crypto.randomUUID();
    const finalDate = dateLost || new Date().toISOString().split("T")[0];
    
    // Construct last seen ISO timestamp if time was provided
    let lastSeenIso;
    try {
      if (timeLost) {
        lastSeenIso = new Date(`${finalDate}T${timeLost}:00`).toISOString();
      } else {
        lastSeenIso = new Date(`${finalDate}T12:00:00`).toISOString();
      }
    } catch {
      lastSeenIso = new Date().toISOString();
    }

    try {
      let uploadedImageUrl = null;

      // 1. Upload photograph to Supabase Storage if provided (item-photos bucket)
      if (imageFile) {
        const fileExt = imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
        // Sandboxed path matching storage policy: {auth.uid()}/{reportId}.{ext}
        const storagePath = `${user.id}/${reportId}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("item-photos")
          .upload(storagePath, imageFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: imageFile.type,
          });

        if (uploadError) {
          throw new Error(`Photo upload failed: ${uploadError.message}`);
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("item-photos").getPublicUrl(storagePath);

        uploadedImageUrl = publicUrl;
      }

      // 2. Insert record into public.lost_reports
      // Strictly follows RLS: status must be 'pending_approval', reviewed_by and admin_notes must be null
      const { error: reportError } = await supabase.from("lost_reports").insert({
        id: reportId,
        user_id: user.id,
        title: title.trim(),
        item_name: title.trim(),
        category,
        last_seen_location: lastSeenLocation.trim(),
        date_lost: finalDate,
        last_seen_at: lastSeenIso,
        description: description.trim(),
        image_url: uploadedImageUrl,
        image_path: uploadedImageUrl,
        status: "pending_approval",
        reviewed_by: null,
        admin_notes: null,
      });

      if (reportError) {
        throw new Error(`Database submission error: ${reportError.message}`);
      }

      // 3. Insert private contact details into public.lost_report_private_details
      // Strictly isolated from public view; only admins can access to match found items
      const { error: privateError } = await supabase.from("lost_report_private_details").insert({
        report_id: reportId,
        owner_name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Student Owner",
        contact_phone: ownerPhone.trim() || null,
        contact_email: user.email,
        student_roll_no: studentRollNo.trim() || null,
        semester: semester.trim() || null,
        batch: batch.trim() || null,
      });

      if (privateError) {
        console.warn("Lost report private details notice:", privateError.message);
      }

      setSubmittedTitle(title.trim());
      setIsSuccess(true);
      if (onSuccess) onSuccess();
    } catch (err) {
      setErrorMessage(err.message || "An unexpected error occurred while submitting your lost report.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0d1527] border border-slate-700/80 rounded-2xl shadow-2xl my-8 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-blue-950/80 via-slate-900 to-indigo-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 p-[1.5px] shadow-md shadow-blue-500/20">
              <div className="w-full h-full bg-[#0b1120] rounded-[9px] flex items-center justify-center">
                <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                Dr. Ambedkar Institute of Technology (DR AIT)
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Report a Lost Belonging
              </h2>
            </div>
          </div>
          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        {isSuccess ? (
          /* SUCCESS STATE */
          <div className="p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-950/80 border border-blue-500/40 text-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/10">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                Report Logged Successfully
              </span>
              <h3 className="text-2xl font-bold text-white mt-1">
                We&apos;re On It!
              </h3>
              <p className="text-sm text-slate-300 mt-2 max-w-md mx-auto leading-relaxed">
                Your lost report for <strong className="text-white">&quot;{submittedTitle}&quot;</strong> has been recorded in the DR AIT campus database.
              </p>
            </div>

            {/* Status Information Box */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-left space-y-2.5 max-w-lg mx-auto">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Status: Pending Campus Verification</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Campus administration and security staff match reported lost items against items handed in by students or security officers. If someone turns in your belonging, you will be notified directly.
              </p>
              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-500">
                Submitted by: <span className="text-slate-300">{user?.email}</span>
              </div>
            </div>

            <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  onClose();
                }}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
              >
                Back to Homepage
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-semibold transition-all cursor-pointer"
              >
                Report Another Missing Item
              </button>
            </div>
          </div>
        ) : (
          /* SUBMISSION FORM */
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Error Banner */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2.5">
                <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* SECTION 1: LOST ITEM DETAILS */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  1. Missing Item Details
                </span>
                <span className="text-[11px] text-slate-500">(Item identification and description)</span>
              </div>

              {/* Title & Category Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="lost-item-title" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Item Name <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    id="lost-item-title"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Boat Rockerz 450 Headphones"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="lost-item-category" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Category <span className="text-cyan-400">*</span>
                  </label>
                  <select
                    id="lost-item-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Location, Date & Time Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label htmlFor="lost-item-location" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Last Seen Location <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    id="lost-item-location"
                    type="text"
                    required
                    value={lastSeenLocation}
                    onChange={(e) => setLastSeenLocation(e.target.value)}
                    placeholder="e.g. Central Library 1st Floor"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="lost-item-date" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Date Last Seen <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    id="lost-item-date"
                    type="date"
                    required
                    max={maxDate || undefined}
                    value={dateLost}
                    onChange={(e) => setDateLost(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="lost-item-time" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Approximate Time <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="lost-item-time"
                    type="time"
                    value={timeLost}
                    onChange={(e) => setTimeLost(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label htmlFor="lost-item-description" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Detailed Description & Identifying Features <span className="text-cyan-400">*</span>
                </label>
                <textarea
                  id="lost-item-description"
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe color, brand, model, scratches, stickers, serial numbers or distinctive contents (min 10 characters)..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 transition-colors resize-none"
                />
              </div>

              {/* Photograph Upload Area */}
              <div>
                <label htmlFor="lost-item-photo" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Reference Photograph <span className="text-slate-500 font-normal">(Optional, Max 5MB)</span>
                </label>

                {imagePreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-950/80 p-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imagePreview}
                        alt="Selected preview"
                        className="w-14 h-14 rounded-lg object-cover border border-slate-800"
                      />
                      <div className="text-xs">
                        <span className="font-medium text-slate-200 block truncate max-w-[200px] sm:max-w-[300px]">
                          {imageFile?.name}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {((imageFile?.size || 0) / (1024 * 1024)).toFixed(2)} MB • Ready to upload
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeSelectedImage}
                      className="px-3 py-1.5 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-300 text-xs font-semibold border border-red-800/60 transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="relative border-2 border-dashed border-slate-700 hover:border-cyan-500/60 rounded-xl p-4 text-center transition-colors bg-slate-900/40">
                    <input
                      id="lost-item-photo"
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      onChange={handleImageChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <div className="flex flex-col items-center justify-center space-y-1.5 pointer-events-none">
                      <svg className="w-8 h-8 text-cyan-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <div className="text-xs text-slate-300">
                        <span className="font-semibold text-cyan-400">Click to upload photo</span> or sample image
                      </div>
                      <p className="text-[11px] text-slate-500">
                        JPEG, PNG, or WebP up to 5 MB
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 2: PRIVATE OWNER CONTACT & VERIFICATION */}
            <div className="space-y-4 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                    2. Private Owner Contact Information
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                    🔒 Strictly Private
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400 leading-relaxed">
                Your contact details are stored in the isolated <code className="text-cyan-300">lost_report_private_details</code> table. They are <strong>never shown publicly</strong> and are only used by campus security to contact you when your item is found.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="owner-phone" className="block text-xs font-medium text-slate-300 mb-1">
                    Contact Phone Number <span className="text-slate-500">(For recovery alerts)</span>
                  </label>
                  <input
                    id="owner-phone"
                    type="tel"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    placeholder="+91-9876543210"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="student-roll-no" className="block text-xs font-medium text-slate-300 mb-1">
                    Student Roll No / Enrollment ID
                  </label>
                  <input
                    id="student-roll-no"
                    type="text"
                    value={studentRollNo}
                    onChange={(e) => setStudentRollNo(e.target.value)}
                    placeholder="e.g. 220101"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="owner-semester" className="block text-xs font-medium text-slate-300 mb-1">
                    Semester / Year
                  </label>
                  <input
                    id="owner-semester"
                    type="text"
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    placeholder="e.g. 6th Sem"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="owner-batch" className="block text-xs font-medium text-slate-300 mb-1">
                    Batch / Department
                  </label>
                  <input
                    id="owner-batch"
                    type="text"
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                    placeholder="e.g. CSE 2022-26"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Logged in as <span className="text-slate-400">{user?.email}</span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    onClose();
                  }}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 disabled:opacity-60 text-white text-xs font-semibold shadow-md shadow-cyan-500/20 transition-all flex items-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      <span>Submitting Report...</span>
                    </>
                  ) : (
                    <span>Submit Lost Report</span>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
