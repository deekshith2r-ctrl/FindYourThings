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

const STORAGE_OPTIONS = [
  "Handed to Central Security Desk (Admin Block)",
  "Handed to Central Library Reception Counter",
  "Handed to Department Office / Lab In-Charge",
  "Handed to Campus Canteen Supervisor",
  "Currently holding with finder (will hand over upon claim)",
  "Other",
];

export default function ReportFoundModal({ isOpen, onClose, user, onSuccess }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Electronics");
  const [location, setLocation] = useState("");
  const [dateFound, setDateFound] = useState("");
  const [maxDate, setMaxDate] = useState("");
  const [description, setDescription] = useState("");
  const [storageLocation, setStorageLocation] = useState(STORAGE_OPTIONS[0]);
  const [customStorage, setCustomStorage] = useState("");

  // Private contact details
  const [finderPhone, setFinderPhone] = useState("");
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
        setDateFound((prev) => prev || today);
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
    setLocation("");
    setDateFound(new Date().toISOString().split("T")[0]);
    setDescription("");
    setStorageLocation(STORAGE_OPTIONS[0]);
    setCustomStorage("");
    setFinderPhone("");
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
      setErrorMessage("Please enter an item title with at least 3 characters.");
      return;
    }
    if (!location.trim() || location.trim().length < 3) {
      setErrorMessage("Please specify where on campus the item was found.");
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      setErrorMessage("Please provide a description of at least 10 characters.");
      return;
    }
    if (storageLocation === "Other" && !customStorage.trim()) {
      setErrorMessage("Please specify the physical custody or storage location.");
      return;
    }

    if (!user || !user.id) {
      setErrorMessage("You must be signed in to submit a found item.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const finalStorage = storageLocation === "Other" ? customStorage.trim() : storageLocation;
    const itemUuid = crypto.randomUUID();

    try {
      let uploadedImageUrl = null;

      // 1. Upload photograph to Supabase Storage if provided
      if (imageFile) {
        const fileExt = imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
        // Sandboxed path matching storage policy: {auth.uid()}/{itemUuid}.{ext}
        const storagePath = `${user.id}/${itemUuid}.${fileExt}`;

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

        // Get public URL for the uploaded photo
        const {
          data: { publicUrl },
        } = supabase.storage.from("item-photos").getPublicUrl(storagePath);

        uploadedImageUrl = publicUrl;
      }

      // 2. Insert record into public.found_items
      // Strictly follows RLS: status must be 'pending_approval', reviewed_by and admin_notes must be null
      const { error: itemError } = await supabase.from("found_items").insert({
        uuid: itemUuid,
        user_id: user.id,
        title: title.trim(),
        category,
        general_location: location.trim(),
        location_description: location.trim(),
        date_found: dateFound,
        found_at: new Date(dateFound).toISOString(),
        description: description.trim(),
        storage_location: finalStorage,
        image_url: uploadedImageUrl,
        image_path: uploadedImageUrl,
        status: "pending_approval",
        reviewed_by: null,
        admin_notes: null,
      });

      if (itemError) {
        throw new Error(`Database submission error: ${itemError.message}`);
      }

      // 3. Insert private contact details into public.item_contact_info
      // Strictly isolated from public view; only admins and approved claimants can access
      const { error: contactError } = await supabase.from("item_contact_info").insert({
        item_id: itemUuid,
        finder_name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Campus Student",
        finder_phone: finderPhone.trim() || null,
        finder_email: user.email,
        semester: semester.trim() || null,
        batch: batch.trim() || null,
      });

      if (contactError) {
        // Log warning but don't fail the primary item report
        console.warn("Contact info logging notice:", contactError.message);
      }

      setSubmittedTitle(title.trim());
      setIsSuccess(true);
      if (onSuccess) onSuccess();
    } catch (err) {
      setErrorMessage(err.message || "An unexpected error occurred while submitting your report.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0d1527] border border-slate-700/80 rounded-2xl shadow-2xl my-8 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-blue-950/80 via-slate-900 to-cyan-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 p-[1.5px] shadow-md shadow-cyan-500/20">
              <div className="w-full h-full bg-[#0b1120] rounded-[9px] flex items-center justify-center">
                <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                Dr. Ambedkar Institute of Technology (DR AIT)
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Report a Found Item
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
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-950/80 border border-emerald-600/40 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Submission Successful
              </span>
              <h3 className="text-2xl font-bold text-white mt-1">
                Thank You for Helping!
              </h3>
              <p className="text-sm text-slate-300 mt-2 max-w-md mx-auto leading-relaxed">
                Your report for <strong className="text-white">&quot;{submittedTitle}&quot;</strong> has been submitted to campus administrators.
              </p>
            </div>

            {/* Status Information Box */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-left space-y-2.5 max-w-lg mx-auto">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Status: Pending Campus Security Approval</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                In accordance with DR AIT campus policy, newly submitted items are reviewed by administration before appearing on the public homepage. Once approved, other students can view the item and submit claims.
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
                Report Another Item
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

            {/* SECTION 1: PUBLIC ITEM DETAILS */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  1. Public Item Details
                </span>
                <span className="text-[11px] text-slate-500">(Visible to students once approved)</span>
              </div>

              {/* Title & Category Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="found-item-title" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Item Title <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    id="found-item-title"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Scientific Calculator fx-991EX"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="found-item-category" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Category <span className="text-cyan-400">*</span>
                  </label>
                  <select
                    id="found-item-category"
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

              {/* Location & Date Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="found-item-location" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Found Location on Campus <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    id="found-item-location"
                    type="text"
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Block B - Room 204 (Maths Dept)"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="found-item-date" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Date Found <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    id="found-item-date"
                    type="date"
                    required
                    max={maxDate || undefined}
                    value={dateFound}
                    onChange={(e) => setDateFound(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label htmlFor="found-item-description" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Item Description <span className="text-cyan-400">*</span>
                </label>
                <textarea
                  id="found-item-description"
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe color, brand, condition, scratches, or general contents (min 10 characters)..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 transition-colors resize-none"
                />
              </div>

              {/* Physical Storage Location */}
              <div>
                <label htmlFor="found-item-storage" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Current Physical Custody / Storage Desk <span className="text-cyan-400">*</span>
                </label>
                <select
                  id="found-item-storage"
                  value={storageLocation}
                  onChange={(e) => setStorageLocation(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  {STORAGE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>

                {storageLocation === "Other" && (
                  <input
                    type="text"
                    required
                    value={customStorage}
                    onChange={(e) => setCustomStorage(e.target.value)}
                    placeholder="Specify physical location (e.g. Electrical Dept Staff Room)"
                    className="mt-2 w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                )}
              </div>

              {/* Photograph Upload Area */}
              <div>
                <label htmlFor="found-item-photo" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Item Photograph <span className="text-slate-500 font-normal">(Optional, Max 5MB)</span>
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
                      id="found-item-photo"
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
                        <span className="font-semibold text-cyan-400">Click to upload</span> or drag and drop
                      </div>
                      <p className="text-[11px] text-slate-500">
                        JPEG, PNG, or WebP up to 5 MB
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 2: PRIVATE FINDER CONTACT & VERIFICATION */}
            <div className="space-y-4 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    2. Private Verification Details
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                    🔒 Strictly Private
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400 leading-relaxed">
                These details are stored in your secure campus contact table. They are <strong>never exposed on public views</strong>. Only authorized campus administrators can review them to facilitate verified hand-overs.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="finder-phone" className="block text-xs font-medium text-slate-300 mb-1">
                    Contact Phone Number
                  </label>
                  <input
                    id="finder-phone"
                    type="tel"
                    value={finderPhone}
                    onChange={(e) => setFinderPhone(e.target.value)}
                    placeholder="+91-9876543210"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="finder-semester" className="block text-xs font-medium text-slate-300 mb-1">
                    Semester / Year
                  </label>
                  <input
                    id="finder-semester"
                    type="text"
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    placeholder="e.g. 6th Sem"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="finder-batch" className="block text-xs font-medium text-slate-300 mb-1">
                    Batch / Dept
                  </label>
                  <input
                    id="finder-batch"
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
                    <span>Submit Found Item</span>
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
