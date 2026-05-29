import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function ContactPage() {
  const { user } = useAuth();

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Contact Us</h1>
        <p className="text-gray-500">Get in touch with the InstaFin team.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="text-xl font-bold text-blue-700 mb-4">Email</h3>
          <p>support@instafin.com</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="text-xl font-bold text-blue-700 mb-4">Phone</h3>
          <p>+91 90000 00000</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="text-xl font-bold text-blue-700 mb-4">Location</h3>
          <p>Hyderabad, India</p>
        </div>
      </div>
    </div>
  );
}
