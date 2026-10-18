import React from 'react';
import { Link } from 'react-router-dom';

// Public privacy policy (linked from Google OAuth consent screen).
const UPDATED = '18 October 2026';

const SECTIONS = [
  ['Who we are', [
    'InstaFin Portal is an internal loan-processing tool used by InstaFin staff (Hyderabad, India) to manage loan applications ("leads") and the documents customers provide for them. It is not a public consumer service; only staff with an account approved by an administrator can sign in.',
  ]],
  ['Information we collect', [
    'Customer details entered by staff or shared by the customer: name, mobile number, email, address, loan type and amount, employment and income details, and the status of the application with each bank.',
    'Documents shared for a loan application, such as identity and address proof (PAN, Aadhaar, passport), bank statements, salary slips, income tax returns, property papers and photographs. Customers may also send these to our WhatsApp Business number.',
    'Staff account details: name, email, role and activity logs (for example, who uploaded or changed a record and when).',
  ]],
  ['How we use it', [
    'Only to process the customer\'s loan application: checking documents, preparing bank application forms, submitting the application to lenders the customer has chosen, and tracking its progress.',
    'We do not sell personal data, use it for advertising, or share it with anyone other than the banks and financial institutions the application is submitted to, or where the law requires it.',
  ]],
  ['Where it is stored', [
    'Records are stored in a secured database (Supabase). Documents are stored in private cloud storage (Supabase Storage and/or a Google Drive account owned by InstaFin). Files are never public; they can only be opened by signed-in staff or through short-lived links that expire within an hour.',
  ]],
  ['Google user data', [
    'InstaFin Portal connects to InstaFin\'s own Google Drive account using the Google Drive "drive.file" permission. This lets the portal create, read and delete only the files the portal itself uploaded — it cannot see any other file in that Drive.',
    'Data obtained through Google APIs is used only to store and retrieve loan documents for the portal, is not shared with third parties, is not used for advertising, and is not used to train AI models. InstaFin Portal\'s use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.',
  ]],
  ['Retention', [
    'We keep a lead\'s data and documents while the application is active and for as long as needed afterwards for legal, audit and record-keeping obligations. Documents of rejected or closed applications are deleted when no longer required.',
  ]],
  ['Your rights', [
    'Under India\'s Digital Personal Data Protection Act, 2023, customers may ask to see the data we hold about them, correct it, or have it deleted (subject to legal record-keeping requirements), and may withdraw consent for further processing.',
  ]],
  ['Contact', [
    'For any privacy question or request, contact the InstaFin team using the details on our Contact page.',
  ]],
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12 px-4">
      <article className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm p-6 sm:p-10">
        <Link to="/" className="text-xl font-bold text-blue-700">InstaFin</Link>
        <h1 className="mt-4 text-2xl sm:text-3xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mt-1">Last updated: {UPDATED}</p>
        {SECTIONS.map(([title, paras]) => (
          <section key={title} className="mt-7">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            {paras.map((p) => <p key={p.slice(0, 40)} className="mt-2 text-sm sm:text-base leading-relaxed text-gray-700">{p}</p>)}
          </section>
        ))}
        <p className="mt-8 text-sm"><Link to="/contact" className="text-blue-700 hover:underline">Contact page →</Link></p>
      </article>
    </div>
  );
}
