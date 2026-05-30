import React from 'react';

export default function StatusBadge({ status }) {
  const getStatusStyle = (s) => {
    switch (s) {
      case "fresh":
      case "New":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "processing":
      case "Processing":
        return "bg-yellow-50 text-yellow-700 border-yellow-200";
      case "sanctioned":
      case "Sanctioned":
        return "bg-green-50 text-green-700 border-green-200";
      case "Partially Disbursed":
        return "bg-teal-50 text-teal-700 border-teal-200";
      case "disbursed":
      case "Disbursed":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "Assigned":
        return "bg-orange-50 text-orange-700 border-orange-200";
      case "Rejected":
        return "bg-gray-100 text-gray-600 border-gray-200";
      case "Inactive":
        return "bg-red-50 text-red-800 border-red-300";
      default:
        return "bg-gray-50 text-gray-600 border-gray-200";
    }
  };

  const getDisplayStatus = (s) => {
    if (!s) return 'Unknown';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  return (
    <span className={`${getStatusStyle(status)} px-3 py-1.5 rounded-xl text-xs font-semibold border`}>
      {getDisplayStatus(status)}
    </span>
  );
}
