import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const features = [
  'Lead Management Dashboard',
  'Customer Login & Tracking',
  'EMI & Eligibility Calculator',
  'Bank/NBFC Product Comparison',
  'Document Upload System',
  'DSA Commission Tracking',
  'Sanction Management',
  'Disbursement Tracking',
  'Credit Query Resolution',
  'Revenue & Profitability Tracking',
];

export default function FeaturesPage() {
  const { user } = useAuth();

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Features</h1>
        <p className="text-gray-500">Welcome, {user?.name}</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, i) => (
          <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border hover:shadow-md transition">
            <h3 className="text-lg font-semibold text-blue-700">{feature}</h3>
          </div>
        ))}
      </div>
    </div>
  );
}
