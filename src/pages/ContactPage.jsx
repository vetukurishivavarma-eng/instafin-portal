import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function ContactPage() {
  const { user } = useAuth();

  return (
    <div className="py-6 sm:py-12 px-3 sm:px-6">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Contact Us</h1>
        <p className="text-sm sm:text-base text-gray-500">Get in touch with the InstaFin team.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-8">
        <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm">
          <h3 className="text-lg sm:text-xl font-bold text-blue-700 mb-3 sm:mb-4">Email</h3>
          <p className="text-sm sm:text-base">support@instafin.com</p>
        </div>
        <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm">
          <h3 className="text-lg sm:text-xl font-bold text-blue-700 mb-3 sm:mb-4">Phone</h3>
          <p className="text-sm sm:text-base">+91 90000 00000</p>
        </div>
        <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm">
          <h3 className="text-lg sm:text-xl font-bold text-blue-700 mb-3 sm:mb-4">Location</h3>
          <p className="text-sm sm:text-base">Hyderabad, India</p>
        </div>
      </div>
    </div>
  );
}
