# FindYourThings 🔍

> **Lost something? Find it.**  
> Central Lost and Found platform for **Dr. Ambedkar Institute of Technology (DR AIT)** students and faculty.

---

## 🏛️ About the Project

**FindYourThings** is an institutional lost-and-found management portal built for **Dr. Ambedkar Institute of Technology (DR AIT)**, Bengaluru. The platform streamlines reporting lost belongings, submitting found items, coordinating claims, and managing administrative approvals with zero personal contact data leakage to the public.

---

## ✨ Features

- **Google OAuth Authentication:** Secure student and faculty login.
- **Found Item Submissions:** Report items found across campus with photos, category, and date.
- **Lost Item Reports:** File reports for misplaced belongings.
- **Campus Admin Portal:** Multi-tier role verification (`admin`, `super_admin`) with decision workflows (Approve & Publish / Reject with reason).
- **Zero-Leak Row-Level Security:** Confidential student contact info is strictly isolated from public views.
- **Real-time Synchronization:** Live updates powered by Supabase Realtime subscriptions.
- **Interactive Claim Flow:** Pre-fills claim requests to campus security coordination with validated details.

---

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **UI & Styling:** React 19, Tailwind CSS v4
- **Database & Auth:** Supabase PostgreSQL with Row-Level Security (RLS)
- **Object Storage:** Supabase Storage (MIME-validated, user-folder sandboxed)

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/deekshith2r-ctrl/FindYourThings.git
cd FindYourThings
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url_here
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key_here
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🏫 Campus Location

**Dr. Ambedkar Institute of Technology (DR AIT)**  
Outer Ring Road, Near Jnana Bharathi Campus, Mallathahalli, Bengaluru, Karnataka – 560056  
*Campus Security: Central Campus Admin Block (Ground Floor)*

---

## 📄 License

Private repository for Dr. Ambedkar Institute of Technology. All rights reserved.
