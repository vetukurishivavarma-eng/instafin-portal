import React from 'react';

export default function StatusBadge({ status }) {
  const getStatusColor = (s) => {
    switch (s) {
      case "fresh": return "bg-blue-100 text-blue-700";
      case "processing": return "bg-yellow-100 text-yellow-700";
      case "sanctioned": return "bg-green-100 text-green-700";
      case "disbursed": return "bg-purple-100 text-purple-700";
      case "New": return "bg-blue-100 text-blue-700";
      case "Processing": return "bg-yellow-100 text-yellow-700";
      case "Sanctioned": return "bg-green-100 text-green-700";
      case "Disbursed": return "bg-purple-100 text-purple-700";
      case "Assigned": return "bg-indigo-100 text-indigo-700";
      case "Rejected": return "bg-gray-200 text-gray-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const getDisplayStatus = (s) => {
    if (!s) return 'Unknown';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  return (
    <span className={`${getStatusColor(status)} px-3 py-1 rounded-full text-sm font-medium`}>
      {getDisplayStatus(status)}
    </span>
  );
}
