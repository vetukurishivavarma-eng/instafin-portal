import React from 'react';

const features = [
  { title: 'Lead Management Dashboard', description: 'Manage and track all your leads in one centralized dashboard with real-time updates.', icon: '📊' },
  { title: 'Customer Login & Tracking', description: 'Customers can track their loan application status and history.', icon: '🔐' },
  { title: 'EMI & Eligibility Calculator', description: 'Smart calculators to determine loan eligibility and EMI amounts.', icon: '🧮' },
  { title: 'Bank/NBFC Product Comparison', description: 'Compare loan products across multiple banks and NBFCs.', icon: '🏦' },
  { title: 'Document Upload System', description: 'Secure document upload and AI-powered verification system.', icon: '📄' },
  { title: 'DSA Commission Tracking', description: 'Track DSA commissions and payout history.', icon: '💰' },
  { title: 'Sanction Management', description: 'End-to-end sanction letter management and tracking.', icon: '✅' },
  { title: 'Disbursement Tracking', description: 'Real-time disbursement tracking across all loan types.', icon: '💳' },
  { title: 'Credit Query Resolution', description: 'Streamlined credit query resolution process.', icon: '🔍' },
  { title: 'Revenue & Profitability Tracking', description: 'Comprehensive revenue analytics and profitability reports.', icon: '📈' },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl">
            Everything You Need
          </h1>
          <p className="mt-4 text-xl text-gray-500 max-w-2xl mx-auto">
            Powerful features to streamline your loan management workflow
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, i) => (
            <div
              key={i}
              className="group relative bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-xl hover:border-blue-100 transition-all duration-300 hover:-translate-y-1"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-blue-700 transition-colors">
                {feature.title}
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
