# Aureon - Project Plan

## Overview
Aureon is a solar energy platform for the Canary Islands that simplifies the subsidy application process for both clients and installers.

---

## Phase 1: Lead Generation & Installer Portal (Current)

### Landing Page
- [x] Hero section with video background
- [x] "Que Hacemos" section
- [x] Features/Benefits section
- [x] Process steps
- [x] Solar savings calculator
- [x] FAQ section
- [x] Contact/Lead form
- [x] Footer with legal links

### Installer Portal
- [x] Authentication (Supabase)
- [x] Dashboard with stats
- [x] Leads list with filtering
- [x] Lead detail view
- [x] Status management (new, contacted, won, lost)

### Pending Phase 1
- [ ] Connect custom domain
- [ ] Deploy to production
- [ ] Set up email notifications for new leads

---

## Phase 2: Subsidy Paperwork Automation (Next)

### Problem
Canarias Next Generation solar subsidies require extensive paperwork:
1. **Solicitud oficial** - Official application form
2. **DNI/NIE + Escrituras** - ID documents + property deeds
3. **Presupuesto detallado** - Detailed budget/quote
4. **Memoria tecnica** - Technical report
5. **Certificado de eficiencia energetica** - Energy efficiency certificate

This process is time-consuming and error-prone for both clients and installers.

### Solution
Build a tool that:
1. **Collects client data once** - Single form captures all required information
2. **Auto-fills PDF forms** - Using pdf-lib to populate official forms
3. **Generates document checklist** - Shows required documents with status
4. **Tracks submission status** - Pipeline view of application progress

### Technical Approach

#### PDF Auto-fill System
```
Libraries: pdf-lib (for PDF manipulation)

Flow:
1. Client/Installer enters data in web form
2. System maps data to PDF form fields
3. Generate pre-filled PDFs for download
4. Store completed forms in Supabase Storage
```

#### Data Model Extensions
```sql
-- Subsidy applications
CREATE TABLE subsidy_applications (
  id UUID PRIMARY KEY,
  lead_id UUID REFERENCES leads(id),
  installer_id UUID REFERENCES installers(id),
  status TEXT, -- draft, documents_pending, submitted, approved, rejected
  submission_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Required documents tracking
CREATE TABLE application_documents (
  id UUID PRIMARY KEY,
  application_id UUID REFERENCES subsidy_applications(id),
  document_type TEXT, -- solicitud, dni, escrituras, presupuesto, memoria, certificado
  status TEXT, -- pending, uploaded, verified
  file_path TEXT,
  uploaded_at TIMESTAMP
);

-- Client data for form filling
CREATE TABLE client_profiles (
  id UUID PRIMARY KEY,
  lead_id UUID REFERENCES leads(id),
  -- Personal
  full_name TEXT,
  dni_nie TEXT,
  address TEXT,
  postal_code TEXT,
  municipality TEXT,
  island TEXT,
  phone TEXT,
  email TEXT,
  -- Property
  property_type TEXT,
  property_address TEXT,
  catastral_reference TEXT,
  -- Installation
  installation_power_kw DECIMAL,
  panel_count INTEGER,
  inverter_model TEXT,
  battery_capacity_kwh DECIMAL,
  estimated_cost DECIMAL,
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);
```

#### UI Components Needed
- [ ] Client data collection wizard (multi-step form)
- [ ] Document upload interface with drag-drop
- [ ] Document checklist with status indicators
- [ ] PDF preview before download
- [ ] Application status timeline
- [ ] Installer dashboard for managing multiple applications

### PDF Forms to Integrate
- [ ] Obtain official Gobierno de Canarias subsidy forms
- [ ] Map form fields to data model
- [ ] Test auto-fill with sample data

---

## Phase 3: Future Enhancements

- [ ] Email/SMS notifications for status updates
- [ ] Client portal (self-service document upload)
- [ ] Integration with Gobierno de Canarias API (if available)
- [ ] Installer mobile app
- [ ] Analytics dashboard
- [ ] Multi-language support (Spanish/English)

---

## Tech Stack

- **Frontend:** Next.js 14, React 19, Tailwind CSS v4
- **Backend:** Next.js API Routes, Supabase
- **Database:** PostgreSQL (via Supabase)
- **Auth:** Supabase Auth
- **PDF:** pdf-lib
- **Storage:** Supabase Storage
- **Deployment:** Vercel

---

## Design System

### Colors
- Primary (Dark): `#222f30`
- Accent (Green): `#a7e26e`
- Background: `#f7f7f5`
- Text Secondary: `#445e5f`

### Border Radius
- Small: `8px` (buttons, inputs)
- Medium: `12px` (cards, nav pills)
- Large: `20px` (feature cards)
- XL: `40px` (hero sections)

### Typography
- Body: System font stack
- Mono: Roboto Mono (buttons, labels, uppercase text)
