import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import BulkUploadModal from '../components/BulkUploadModal';
import { LoanType, LoanStatus, IncomeSource, ResidentType, BusinessType } from '../checklist-spec';
import API_BASE from '../config/api';

export default function LeadEntryPage() {
  const { isAdmin, accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState('new');
  const [formData, setFormData] = useState({
    customerName: '',
    mobile: '',
    loanType: '',
    loanStatus: '',
    incomeSource: '',
    residentType: '',
    businessType: '',
    expectedAmount: '',
    referralCode: '',
    assignedBanks: []
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [assignData, setAssignData] = useState({
    assignedTo: '',
    department: '',
    priority: 'Medium'
  });
  const [executives, setExecutives] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createdLead, setCreatedLead] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/leads/meta/executives`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(r => r.json())
      .then(data => setExecutives(data))
      .catch(() => {});
    loadLeads();
  }, [accessToken]);

  const loadLeads = () => {
    fetch(`${API_BASE}/leads`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(r => r.json())
      .then(data => setLeads(data.data || []))
      .catch(() => {});
  };

// Validation functions
const validateName = (name) => {
  if (!name.trim()) return 'Customer name is required';
  if (/[0-9]/.test(name)) return 'Name cannot contain numbers';
  return '';
};

const validateMobile = (mobile) => {
  if (!mobile.trim()) return 'Mobile number is required';
  if (!/^\d+$/.test(mobile)) return 'Mobile must contain only numbers';
  if (mobile.length !== 10) return 'Mobile must be exactly 10 digits';
  return '';
};

const validateAmount = (amount) => {
  if (!amount.trim()) return 'Expected amount is required';
  if (!/^\d+$/.test(amount)) return 'Amount must contain only numbers';
  return '';
};

const validateLoanType = (loanType) => {
  if (!loanType) return 'Please select a loan type';
  return '';
};

const validateLoanStatus = (loanStatus) => {
  if (!loanStatus) return 'Please select a loan status';
  return '';
};

const validateIncomeSource = (incomeSource) => {
  if (!incomeSource) return 'Please select an income source';
  return '';
};

const validateResidentType = (residentType) => {
  if (!residentType) return 'Please select a resident type';
  return '';
};

const validateBusinessType = (businessType, incomeSource) => {
  // Business type is only required for non-salaried
  if (incomeSource === 'non_salaried' && !businessType) return 'Please select a business type';
  return '';
};

  const handleNameChange = (e) => {
    const value = e.target.value.replace(/[0-9]/g, '');
    setFormData(prev => ({ ...prev, customerName: value }));
    setFieldErrors(prev => ({ ...prev, customerName: '' }));
  };

  const handleMobileChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 10);
    setFormData(prev => ({ ...prev, mobile: value }));
    setFieldErrors(prev => ({ ...prev, mobile: '' }));
  };

  const handleAmountChange = (e) => {
    const value = e.target.value.replace(/\D/g, '');
    setFormData(prev => ({ ...prev, expectedAmount: value }));
    setFieldErrors(prev => ({ ...prev, expectedAmount: '' }));
  };

  const handleBankToggle = (bank) => {
    setFormData(prev => ({
      ...prev,
      assignedBanks: prev.assignedBanks.includes(bank)
        ? prev.assignedBanks.filter(b => b !== bank)
        : [...prev.assignedBanks, bank]
    }));
  };

  const handleSaveLead = async () => {
    const errors = {
      customerName: validateName(formData.customerName),
      mobile: validateMobile(formData.mobile),
      expectedAmount: validateAmount(formData.expectedAmount),
      loanType: validateLoanType(formData.loanType),
      loanStatus: validateLoanStatus(formData.loanStatus),
      incomeSource: validateIncomeSource(formData.incomeSource),
      residentType: validateResidentType(formData.residentType),
      businessType: validateBusinessType(formData.businessType, formData.incomeSource)
    };

    setFieldErrors(errors);

    if (Object.values(errors).some(e => e)) {
      setError('Please fix the errors above');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(formData),
      });
      const lead = await res.json();
      if (!res.ok) {
        setError(lead.error || 'Failed to create lead');
        return;
      }
      setCreatedLead(lead);
      setSuccess(`Lead created successfully!`);
      loadLeads();
      setFormData({ customerName: '', mobile: '', loanType: '', loanStatus: '', incomeSource: '', residentType: '', businessType: '', expectedAmount: '', referralCode: '', assignedBanks: [] });
      setFieldErrors({});
    } catch (err) {
      setError('Failed to create lead');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignExecutive = async () => {
    if (!createdLead || !assignData.assignedTo) {
      setError('Please create lead first and select an executive');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/leads/${createdLead.id}/assign`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(assignData),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || 'Failed to assign');
        setLoading(false);
        return;
      }

      setSuccess('Executive assigned!');
      setCreatedLead(null);
      setAssignData({ assignedTo: '', department: '', priority: 'Medium' });
      loadLeads();
    } catch (err) {
      setError('Failed to assign');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignFromList = async (leadId) => {
    if (!assignData.assignedTo) {
      setError('Please select an executive');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/leads/${leadId}/assign`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(assignData),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || 'Failed to assign');
        setLoading(false);
        return;
      }

      setSuccess('Executive assigned!');
      setSelectedLead(null);
      setAssignData({ assignedTo: '', department: '', priority: 'Medium' });
      loadLeads();
    } catch (err) {
      setError('Failed to assign');
    } finally {
      setLoading(false);
    }
  };

  const unassignedLeads = leads.filter(l => !l.assignedTo);
  const assignedLeads = leads.filter(l => l.assignedTo);

  if (!isAdmin) {
    return (
      <div className="py-12">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-red-700 mb-2">Access Denied</h2>
          <p className="text-gray-600">Only Admin users can add new leads.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Staff Lead Entry Portal</h1>
          <p className="text-gray-500">Internal lead capture portal for staff and appointed DSAs.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('new')}
            className={`px-4 py-2 rounded-xl font-semibold ${activeTab === 'new' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Add New Lead
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`px-4 py-2 rounded-xl font-semibold ${activeTab === 'manage' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Manage Leads ({unassignedLeads.length} unassigned)
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowBulkUpload(true)}
              className="px-4 py-2 rounded-xl font-semibold bg-green-600 text-white hover:bg-green-700"
            >
              Bulk Upload
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6">{error}</div>}
      {success && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-6">{success}</div>}

      {activeTab === 'new' && (
        <div className="bg-white rounded-3xl shadow-xl p-8 border">
<div className="grid md:grid-cols-2 gap-6 mb-6">
             <div>
               <input
                 type="text"
                 placeholder="Customer Name *"
                 className={`border rounded-2xl px-4 py-3 w-full ${fieldErrors.customerName ? 'border-red-500' : ''}`}
                 value={formData.customerName}
                 onChange={handleNameChange}
                 maxLength={50}
               />
               {fieldErrors.customerName && <p className="text-red-500 text-sm mt-1">{fieldErrors.customerName}</p>}
             </div>
             <div>
               <input
                 type="tel"
                 placeholder="Mobile Number * (10 digits)"
                 className={`border rounded-2xl px-4 py-3 w-full ${fieldErrors.mobile ? 'border-red-500' : ''}`}
                 value={formData.mobile}
                 onChange={handleMobileChange}
                 maxLength={10}
               />
               {fieldErrors.mobile && <p className="text-red-500 text-sm mt-1">{fieldErrors.mobile}</p>}
             </div>
           </div>

           <div className="grid md:grid-cols-2 gap-6 mb-6">
             <div>
               <select
                 className={`border rounded-2xl px-4 py-3 w-full ${fieldErrors.loanType ? 'border-red-500' : ''}`}
                 value={formData.loanType}
                 onChange={(e) => { setFormData(p => ({ ...p, loanType: e.target.value })); setFieldErrors(prev => ({ ...prev, loanType: '' })); }}
               >
                 <option value="">Select Loan Type *</option>
                 <option value="home_loan">Home Loan</option>
                 <option value="lap">LAP</option>
                 <option value="mudra">Mudra Loan</option>
                 <option value="msme">MSME Loan</option>
                 <option value="business_loan">Business Loan</option>
                 <option value="personal_loan">Personal Loan</option>
                 <option value="education_loan">Education Loan</option>
               </select>
               {fieldErrors.loanType && <p className="text-red-500 text-sm mt-1">{fieldErrors.loanType}</p>}
             </div>
             <div>
               <select
                 className={`border rounded-2xl px-4 py-3 w-full ${fieldErrors.loanStatus ? 'border-red-500' : ''}`}
                 value={formData.loanStatus}
                 onChange={(e) => { setFormData(p => ({ ...p, loanStatus: e.target.value })); setFieldErrors(prev => ({ ...prev, loanStatus: '' })); }}
               >
                 <option value="">Select Loan Status *</option>
                 <option value="new">New Loan</option>
                 <option value="topup_equity">Top-up/Equity</option>
                 <option value="takeover">Takeover</option>
               </select>
               {fieldErrors.loanStatus && <p className="text-red-500 text-sm mt-1">{fieldErrors.loanStatus}</p>}
             </div>
           </div>

           <div className="grid md:grid-cols-2 gap-6 mb-6">
             <div>
               <select
                 className={`border rounded-2xl px-4 py-3 w-full ${fieldErrors.incomeSource ? 'border-red-500' : ''}`}
                 value={formData.incomeSource}
                 onChange={(e) => { setFormData(p => ({ ...p, incomeSource: e.target.value })); setFieldErrors(prev => ({ ...prev, incomeSource: '' })); }}
               >
                 <option value="">Select Income Source *</option>
                 <option value="salaried">Salaried</option>
                 <option value="non_salaried">Non-Salaried</option>
               </select>
               {fieldErrors.incomeSource && <p className="text-red-500 text-sm mt-1">{fieldErrors.incomeSource}</p>}
             </div>
             <div>
               <select
                 className={`border rounded-2xl px-4 py-3 w-full ${fieldErrors.residentType ? 'border-red-500' : ''}`}
                 value={formData.residentType}
                 onChange={(e) => { setFormData(p => ({ ...p, residentType: e.target.value })); setFieldErrors(prev => ({ ...prev, residentType: '' })); }}
               >
                 <option value="">Select Resident Type *</option>
                 <option value="nri">NRI</option>
                 <option value="indian_resident">Indian Resident</option>
               </select>
               {fieldErrors.residentType && <p className="text-red-500 text-sm mt-1">{fieldErrors.residentType}</p>}
             </div>
           </div>

           <div className="grid md:grid-cols-2 gap-6 mb-6">
             <div>
               <select
                 className={`border rounded-2xl px-4 py-3 w-full ${fieldErrors.businessType ? 'border-red-500' : ''}`}
                 value={formData.businessType}
                 onChange={(e) => { setFormData(p => ({ ...p, businessType: e.target.value })); setFieldErrors(prev => ({ ...prev, businessType: '' })); }}
               >
                 <option value="">Select Business Type (Optional)</option>
                 <option value="proprietor">Proprietor</option>
                 <option value="partnership">Partnership</option>
                 <option value="pvt_ltd">Pvt Ltd</option>
                 <option value="llp">LLP</option>
               </select>
               {fieldErrors.businessType && <p className="text-red-500 text-sm mt-1">{fieldErrors.businessType}</p>}
             </div>
             <div>
               <input
                 type="text"
                 placeholder="Expected Loan Amount *"
                 className={`border rounded-2xl px-4 py-3 w-full ${fieldErrors.expectedAmount ? 'border-red-500' : ''}`}
                 value={formData.expectedAmount}
                 onChange={handleAmountChange}
               />
               {fieldErrors.expectedAmount && <p className="text-red-500 text-sm mt-1">{fieldErrors.expectedAmount}</p>}
             </div>
             <div>
               <input
                 type="text"
                 placeholder="Referral Code (Optional)"
                 className="border rounded-2xl px-4 py-3 w-full"
                 value={formData.referralCode || ''}
                 onChange={(e) => setFormData(prev => ({ ...prev, referralCode: e.target.value.toUpperCase() }))}
               />
             </div>
           </div>

          <button onClick={handleSaveLead} disabled={loading} className="bg-blue-700 text-white px-6 py-3 rounded-2xl font-semibold disabled:opacity-50">
            {loading ? 'Saving...' : 'Save Lead'}
          </button>

          {createdLead && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-3xl p-6 mt-6">
              <h3 className="text-xl font-bold text-indigo-700 mb-4">Assign to Executive</h3>
              <div className="grid md:grid-cols-3 gap-5 mb-5">
                <select className="border rounded-2xl px-4 py-3" value={assignData.assignedTo} onChange={(e) => setAssignData(p => ({...p, assignedTo: e.target.value}))}>
                  <option value="">Select Executive</option>
                  {executives.map(exec => <option key={exec.id} value={exec.name}>{exec.name}</option>)}
                </select>
                <select className="border rounded-2xl px-4 py-3" value={assignData.department} onChange={(e) => setAssignData(p => ({...p, department: e.target.value}))}>
                  <option value="">Department</option>
                  <option>Operations Team</option><option>Login Team</option><option>Sales Team</option><option>Credit Coordination</option>
                </select>
                <select className="border rounded-2xl px-4 py-3" value={assignData.priority} onChange={(e) => setAssignData(p => ({...p, priority: e.target.value}))}>
                  <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option>
                </select>
              </div>
              <button onClick={handleAssignExecutive} disabled={loading} className="bg-indigo-700 text-white px-6 py-3 rounded-2xl font-semibold disabled:opacity-50">
                Assign Executive
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'manage' && (
        <div className="space-y-6">
          {unassignedLeads.length > 0 && (
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
              <div className="p-6 border-b bg-yellow-50">
                <h3 className="text-xl font-bold text-yellow-800">Unassigned Leads ({unassignedLeads.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-4">Customer</th><th className="p-4">Mobile</th><th className="p-4">Loan Type</th><th className="p-4">Amount</th><th className="p-4">Status</th><th className="p-4">Assign</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unassignedLeads.map(lead => (
                      <tr key={lead.id} className="border-t hover:bg-gray-50">
                        <td className="p-4 font-medium">{lead.customerName}</td>
                        <td className="p-4">{lead.mobile}</td>
                        <td className="p-4">{lead.loanType}</td>
                        <td className="p-4">{lead.expectedAmount}</td>
                        <td className="p-4"><StatusBadge status={lead.status} /></td>
                        <td className="p-4">
                          <button onClick={() => setSelectedLead(lead.id)} className="text-blue-700 font-semibold hover:underline">Assign</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {assignedLeads.length > 0 && (
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
              <div className="p-6 border-b bg-green-50">
                <h3 className="text-xl font-bold text-green-800">Assigned Leads ({assignedLeads.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-4">Customer</th><th className="p-4">Mobile</th><th className="p-4">Loan Type</th><th className="p-4">Amount</th><th className="p-4">Assigned To</th><th className="p-4">Department</th><th className="p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedLeads.map(lead => (
                      <tr key={lead.id} className="border-t hover:bg-gray-50">
                        <td className="p-4 font-medium">{lead.customerName}</td>
                        <td className="p-4">{lead.mobile}</td>
                        <td className="p-4">{lead.loanType}</td>
                        <td className="p-4">{lead.expectedAmount}</td>
                        <td className="p-4 font-medium text-blue-700">{lead.assignedTo}</td>
                        <td className="p-4">{lead.department}</td>
                        <td className="p-4"><StatusBadge status={lead.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {leads.length === 0 && (
            <div className="bg-white rounded-3xl p-8 text-center">
              <p className="text-gray-500">No leads found. Add a new lead to get started.</p>
            </div>
          )}
        </div>
      )}

      {selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Assign Executive</h3>
            <div className="space-y-4">
              <select className="border rounded-2xl px-4 py-3 w-full" value={assignData.assignedTo} onChange={(e) => setAssignData(p => ({...p, assignedTo: e.target.value}))}>
                <option value="">Select Executive</option>
                {executives.map(exec => <option key={exec.id} value={exec.name}>{exec.name}</option>)}
              </select>
              <select className="border rounded-2xl px-4 py-3 w-full" value={assignData.department} onChange={(e) => setAssignData(p => ({...p, department: e.target.value}))}>
                <option value="">Department</option>
                <option>Operations Team</option><option>Login Team</option><option>Sales Team</option><option>Credit Coordination</option>
              </select>
              <select className="border rounded-2xl px-4 py-3 w-full" value={assignData.priority} onChange={(e) => setAssignData(p => ({...p, priority: e.target.value}))}>
                <option value="Low">Low Priority</option>
                <option value="Medium">Medium Priority</option>
                <option value="High">High Priority</option>
              </select>
            </div>
            <div className="flex gap-4 mt-6">
              <button onClick={() => setSelectedLead(null)} className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-2xl font-semibold">Cancel</button>
              <button onClick={() => handleAssignFromList(selectedLead)} disabled={loading} className="flex-1 bg-blue-700 text-white px-6 py-3 rounded-2xl font-semibold disabled:opacity-50">
                {loading ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onComplete={() => loadLeads()}
      />
    </div>
  );
}