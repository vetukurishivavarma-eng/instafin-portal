import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';
import { getChecklist, getChecklistWithFallback, getCoapplicantChecklist } from '../utils/resolver';
import ChecklistDisplay from '../components/ChecklistDisplay';
import { downloadPDF, downloadProfilePDF, downloadEligibilityPDF } from '../export/pdf';
import { shareOnWhatsApp, isWebShareAvailable } from '../export/whatsapp';

export default function ChecklistsPage() {
  const { accessToken, user, impersonating, isImpersonating } = useAuth();
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [checklistItems, setChecklistItems] = useState([]);
  const [checklistStatuses, setChecklistStatuses] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(null); // { documentId, description }
  const [deletingDoc, setDeletingDoc] = useState(null); // fileId
  const [viewDoc, setViewDoc] = useState(null);
  const [showUploadForm, setShowUploadForm] = useState(null); // documentId of item showing upload form
  const [uploadDescription, setUploadDescription] = useState('');
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [extractedProfile, setExtractedProfile] = useState(null);
  const [croppedPhoto, setCroppedPhoto] = useState(null);
  const [isGeneratingProfilePDF, setIsGeneratingProfilePDF] = useState(false);

  // ===== Eligibility Calculator State =====
  const [eligPF, setEligPF] = useState('');
  const [eligIncomeTax, setEligIncomeTax] = useState('');
  const [eligProfessionTax, setEligProfessionTax] = useState('');
  const [eligGrossSalary, setEligGrossSalary] = useState('');
  const [eligRentalIncome, setEligRentalIncome] = useState('');
  const [eligEmiNmiPercent, setEligEmiNmiPercent] = useState('50');
  const [eligBankEmis, setEligBankEmis] = useState([{ bank: '', emi: '' }]);
  const [eligPrincipal, setEligPrincipal] = useState('100000');
  const [eligRate, setEligRate] = useState('8.5');
  const [eligPeriod, setEligPeriod] = useState('240');
  const [eligHasCoapplicant, setEligHasCoapplicant] = useState(false);
  const [eligCoapplicantGross, setEligCoapplicantGross] = useState('');
  const [showEligModal, setShowEligModal] = useState(false);
  const [eligDownloading, setEligDownloading] = useState(false);

  // Fetch leads
  useEffect(() => {
    if (!accessToken) return;
    fetchLeads();
  }, [accessToken]);

  const fetchLeads = () => {
    setLoading(true);
    fetch(`${API_BASE}/leads`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    .then(r => r.json())
    .then(data => {
      const allLeads = data.data || [];
      // Filter by impersonated executive if admin is impersonating
      const executiveName = isImpersonating ? impersonating?.name : null;
      const filtered = executiveName
        ? allLeads.filter(l => l.assignedTo === executiveName)
        : allLeads;
      // Only show active leads
      const activeLeads = filtered.filter(l => l.isActive !== false);
      setLeads(activeLeads);
      setLoading(false);
    })
    .catch(err => {
      console.error('Failed to load leads:', err);
      setError('Failed to load leads');
      setLoading(false);
    });
  };

  // Fetch existing summary for a lead
  const fetchSummary = (leadId) => {
    setSummaryLoading(true);
    setSummaryError('');
    fetch(`${API_BASE}/leads/${leadId}/summary`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    .then(r => r.json())
    .then(data => {
      if (data.hasSummary) {
        setSummary(data.summary);
      } else {
        setSummary(null);
      }
      setSummaryLoading(false);
    })
    .catch(err => {
      console.error('Failed to load summary:', err);
      setSummaryLoading(false);
    });
  };

  // Generate new AI profile summary
  const handleSummarize = () => {
    if (!selectedLead) return;
    setSummaryLoading(true);
    setSummaryError('');
    fetch(`${API_BASE}/leads/${selectedLead.id}/summarize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    .then(async (res) => {
      const data = await res.json();
      if (res.ok) {
        setSummary(data.summary);
        // Refresh statuses and lead list so derived statuses update
        fetchChecklistStatuses(selectedLead.id);
        fetchLeads();
        setSuccess('Documents successfully analyzed and lead profile summarized!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setSummaryError(data.error || 'Failed to analyze documents');
      }
      setSummaryLoading(false);
    })
    .catch(err => {
      console.error('Summarize error:', err);
      setSummaryError('Failed to analyze documents');
      setSummaryLoading(false);
    });
  };

  // Crop face photo from Aadhaar or PAN using canvas
  const cropAadhaarPhoto = async (boundingBox) => {
    if (!selectedLead || !boundingBox) return;

    // Find if Aadhaar or PAN is uploaded (check if array has files)
    const uploadedDocs = Object.keys(checklistStatuses).filter(id => {
      const files = checklistStatuses[id];
      return files && files.length > 0 && 
        (id.toLowerCase().includes('aadhaar') || id.toLowerCase().includes('pan'));
    });

    if (uploadedDocs.length === 0) {
      console.log('No uploaded Aadhaar/PAN found for cropping.');
      return;
    }

    const docId = uploadedDocs.find(id => id.toLowerCase().includes('aadhaar')) || uploadedDocs[0];

    try {
      const res = await fetch(`${API_BASE}/checklist-status/file/${selectedLead.id}/${docId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Failed to fetch file for cropping');
      const blob = await res.blob();
      const imgUrl = URL.createObjectURL(blob);

      const img = new window.Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          const [ymin, xmin, ymax, xmax] = boundingBox;
          const imgWidth = img.naturalWidth;
          const imgHeight = img.naturalHeight;

          const x = (xmin / 1000) * imgWidth;
          const y = (ymin / 1000) * imgHeight;
          const width = ((xmax - xmin) / 1000) * imgWidth;
          const height = ((ymax - ymin) / 1000) * imgHeight;

          canvas.width = width;
          canvas.height = height;

          ctx.drawImage(img, x, y, width, height, 0, 0, width, height);

          const base64Url = canvas.toDataURL('image/jpeg', 0.9);
          setCroppedPhoto(base64Url);
          URL.revokeObjectURL(imgUrl);
        } catch (cropErr) {
          console.error('Error during canvas crop:', cropErr);
          URL.revokeObjectURL(imgUrl);
        }
      };
      img.onerror = () => {
        console.error('Failed to load image for cropping (might be a PDF)');
        URL.revokeObjectURL(imgUrl);
      };
      img.src = imgUrl;
    } catch (err) {
      console.error('Failed to crop photo:', err);
    }
  };

  // Parse summary for structured JSON and trigger cropping
  useEffect(() => {
    if (!summary) {
      setExtractedProfile(null);
      setCroppedPhoto(null);
      return;
    }

    try {
      const jsonMatch = summary.match(/```json([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        const parsed = JSON.parse(jsonMatch[1].trim());
        setExtractedProfile(parsed.extracted_details || null);
        
        if (parsed.face_bounding_box && selectedLead) {
          cropAadhaarPhoto(parsed.face_bounding_box);
        } else {
          setCroppedPhoto(null);
        }
      } else {
        setExtractedProfile(null);
        setCroppedPhoto(null);
      }
    } catch (err) {
      console.error('Failed to parse JSON from summary:', err);
      setExtractedProfile(null);
      setCroppedPhoto(null);
    }
  }, [summary, selectedLead, checklistStatuses]);

  // Download underwriting report
  const handleDownloadProfilePDF = async () => {
    if (!selectedLead || !summary) return;
    setIsGeneratingProfilePDF(true);
    try {
      const details = extractedProfile || {};
      const leadData = {
        id: selectedLead.id,
        customerName: selectedLead.customerName,
        mobile: selectedLead.mobile,
        email: selectedLead.email,
        loanType: selectedLead.loanType,
        expectedAmount: selectedLead.expectedAmount,
        status: selectedLead.status
      };
      
      await downloadProfilePDF(leadData, details, summary, croppedPhoto || null);
      
      setSuccess('Underwriting report downloaded successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Failed to generate profile PDF:', err);
      setError('Failed to generate Underwriting PDF Report');
      setTimeout(() => setError(''), 5000);
    } finally {
      setIsGeneratingProfilePDF(false);
    }
  };

  // Handle lead selection
  const handleLeadSelect = (leadId) => {
    const lead = leads.find(l => String(l.id) === String(leadId));
    if (lead) {
      setSelectedLead(lead);
      loadChecklistForLead(lead);
      fetchChecklistStatuses(lead.id);
      fetchSummary(lead.id);
    } else {
      setSelectedLead(null);
      setChecklistItems([]);
      setChecklistStatuses({});
      setSummary(null);
    }
  };

  // Normalize lead field values to match decision tree keys
  const normalizeValue = (val) => {
    if (!val) return val;
    return val.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  };

  // Load checklist for lead using decision tree resolver
  const loadChecklistForLead = (lead) => {
    const selection = {
      loanType: normalizeValue(lead.loanType),
      loanStatus: normalizeValue(lead.loanStatus) || 'new',
      incomeSource: normalizeValue(lead.incomeSource),
      residentType: normalizeValue(lead.residentType),
      businessType: normalizeValue(lead.businessType)
    };

    let items = getChecklistWithFallback(selection);

    if (lead.hasCoapplicant) {
      const coapplicantItems = getCoapplicantChecklist(items, lead.coapplicantName);
      items = [...items, ...coapplicantItems];
    }

    setChecklistItems(items);
  };

  // Helper to parse markdown bold text **bold**
  const parseBoldText = (text) => {
    if (typeof text !== 'string') return text;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  // Helper to render markdown text beautifully with basic HTML styles
  const renderSummary = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, index) => {
      if (line.startsWith('### ')) {
        return <h4 key={index} className="text-md font-bold text-gray-800 mt-4 mb-2">{line.replace('### ', '')}</h4>;
      }
      if (line.startsWith('## ')) {
        return <h3 key={index} className="text-lg font-bold text-indigo-900 mt-5 mb-3 border-b border-indigo-50 pb-1">{line.replace('## ', '')}</h3>;
      }
      if (line.startsWith('# ')) {
        return <h2 key={index} className="text-xl font-bold text-indigo-950 mt-6 mb-4">{line.replace('# ', '')}</h2>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const cleanLine = line.replace(/^[-*]\s+/, '');
        return (
          <li key={index} className="ml-6 list-disc text-gray-700 my-1">
            {parseBoldText(cleanLine)}
          </li>
        );
      }
      if (line.trim() === '') {
        return <div key={index} className="h-2" />;
      }
      return <p key={index} className="text-gray-700 my-1 leading-relaxed">{parseBoldText(line)}</p>;
    });
  };

  // Fetch checklist statuses from the new API
  const fetchChecklistStatuses = (leadId) => {
    fetch(`${API_BASE}/checklist-status/${leadId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    .then(r => r.json())
    .then(data => {
      // New response format: { grouped: { docId: [files...] }, files: [...] }
      if (data && data.grouped) {
        setChecklistStatuses(data.grouped);
      } else if (data && typeof data === 'object') {
        // Legacy fallback: try old format
        const statusMap = {};
        Object.entries(data).forEach(([docId, info]) => {
          if (typeof info === 'object' && info.status) {
            statusMap[docId] = [{
              id: info.id || docId,
              status: info.status || 'pending',
              filePath: info.filePath || null,
              documentName: info.documentName || null,
              description: info.description || '',
              originalFile: info.originalFile || null,
              uploadedAt: info.uploadedAt || null
            }];
          } else {
            statusMap[docId] = [];
          }
        });
        setChecklistStatuses(statusMap);
      } else {
        setChecklistStatuses({});
      }
    })
    .catch(err => {
      console.error('Failed to load checklist statuses:', err);
      setChecklistStatuses({});
    });
  };

  // Handle file upload for a checklist item
  const handleFileUpload = async (documentId, documentName, file, description) => {
    if (!selectedLead) return;

    setUploadingDoc(documentId);
    try {
      const formData = new FormData();
      formData.append('leadId', selectedLead.id);
      formData.append('documentId', documentId);
      formData.append('documentName', documentName);
      formData.append('description', (description || '').trim());
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/checklist-status/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
      });

      if (res.ok) {
        fetchChecklistStatuses(selectedLead.id);
        setSuccess(`${documentName} uploaded successfully!`);
        setShowUploadForm(null);
        setUploadDescription('');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Upload failed');
        setTimeout(() => setError(''), 5000);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('Upload failed');
      setTimeout(() => setError(''), 5000);
    } finally {
      setUploadingDoc(null);
    }
  };

  // Handle document deletion (by file record ID)
  const handleDeleteDocument = async (fileId, documentName) => {
    if (!selectedLead || !window.confirm(`Delete this file for "${documentName}"? This cannot be undone.`)) return;

    setDeletingDoc(fileId);
    try {
      const res = await fetch(`${API_BASE}/checklist-status/file/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (res.ok) {
        fetchChecklistStatuses(selectedLead.id);
        setSuccess(`File deleted successfully!`);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Delete failed');
        setTimeout(() => setError(''), 5000);
      }
    } catch (err) {
      setError('Delete failed');
      setTimeout(() => setError(''), 5000);
    } finally {
      setDeletingDoc(null);
    }
  };

  // Handle view document (by file record ID)
  const handleViewDocument = async (fileId) => {
    setViewDoc({ url: null, id: fileId, loading: true });
    try {
      const res = await fetch(`${API_BASE}/checklist-status/file/${fileId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Failed to fetch file');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      setViewDoc({ url: blobUrl, id: fileId, loading: false });
    } catch (err) {
      setError('Failed to load document');
      setTimeout(() => setError(''), 5000);
      setViewDoc(null);
    }
  };

  // Get assigned bank names string for the selected lead
  const getBankNamesString = () => {
    if (!selectedLead) return '';
    const banks = selectedLead.assignedBanks || [];
    if (banks.length === 0) return 'No bank assigned';
    return banks.join(', ');
  };

  const getBankDetailsWithBranches = () => {
    if (!selectedLead || !selectedLead.bankDetails) return '';
    return selectedLead.bankDetails.map(b => 
      `${b.bankName}${b.branchName ? ` (${b.branchName})` : ''}`
    ).join(', ');
  };

  // Share via email (opens Gmail compose) - includes bank name
  const handleShareEmail = () => {
    const pendingItems = checklistItems.filter(item => {
      const files = checklistStatuses[item.id];
      const hasUploaded = files && files.length > 0;
      return !hasUploaded && item.required;
    });

    if (pendingItems.length === 0) {
      setSuccess('All required documents have been uploaded!');
      setTimeout(() => setSuccess(''), 3000);
      return;
    }

    const bankInfo = getBankDetailsWithBranches() || getBankNamesString();
    const subject = `Pending Documents - ${selectedLead.customerName} (${selectedLead.loanType || 'Loan'})`;
    const body =
      `Dear ${selectedLead.customerName},\n\n` +
      `Please submit the following pending documents for your ${selectedLead.loanType || 'loan'} application.\n` +
      `Bank(s): ${bankInfo}\n\n` +
      pendingItems.map((item, i) => `${i + 1}. ${item.name} (${item.category.replace(/_/g, ' ')})`).join('\n') +
      `\n\nPlease upload these at your earliest convenience.\n\nThank you.`;

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
  };

  // Download checklist as PDF
  const handleDownloadPDF = async () => {
    if (checklistItems.length === 0 || !selectedLead) return;

    setIsDownloading(true);
    try {
      const selection = {
        loanType: selectedLead.loanType,
        loanStatus: selectedLead.loanStatus || 'new',
        incomeSource: selectedLead.incomeSource,
        residentType: selectedLead.residentType,
        businessType: selectedLead.businessType
      };
      const bankName = getBankDetailsWithBranches() || getBankNamesString();
      await downloadPDF(selection, checklistItems, bankName);
    } catch (err) {
      console.error('PDF generation error:', err);
      setError('Failed to generate PDF');
      setTimeout(() => setError(''), 5000);
    } finally {
      setIsDownloading(false);
    }
  };

  // Share pending documents via WhatsApp (includes bank name)
  const handleSharePendingWhatsApp = async () => {
    const pendingItems = checklistItems.filter(item => {
      const files = checklistStatuses[item.id];
      const hasUploaded = files && files.length > 0;
      return !hasUploaded && item.required;
    });

    if (pendingItems.length === 0) {
      setSuccess('All required documents have been uploaded!');
      setTimeout(() => setSuccess(''), 3000);
      return;
    }

    setIsSharing(true);
    try {
      const bankName = getBankDetailsWithBranches() || getBankNamesString();
      await shareOnWhatsApp({
        loanType: selectedLead.loanType,
        title: `Pending Documents - ${selectedLead.customerName} (${selectedLead.loanType ? selectedLead.loanType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Loan'})`,
        items: pendingItems.map(item => ({
          name: item.name,
          category: item.category,
          required: item.required
        })),
        bankName: bankName
      });
    } catch (err) {
      console.error('WhatsApp share error:', err);
      setError('Failed to share on WhatsApp');
      setTimeout(() => setError(''), 5000);
    } finally {
      setIsSharing(false);
    }
  };

  // ===== Eligibility Calculator Functions =====
  const eligNum = (v) => parseFloat(v) || 0;
  const eligFormatNum = (n) => n.toLocaleString('en-IN', { maximumFractionDigits:0 });
  const eligFormatDec = (n) => n.toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const eligHandleNumInput = (setter) => (e) => {
    const v = e.target.value;
    if (v === '' || /^\d*\.?\d*$/.test(v)) setter(v);
  };

  // Parse AI summary for income/deduction hints
  // Also looks for the embedded ```json block to extract structured data
  const prefillEligibilityFromSummary = () => {
    if (!summary) return;
    try {
      // 1) Try extracting from the JSON block first (most reliable)
      let parsedExtra = null;
      const jsonMatch = summary.match(/```json([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          const root = JSON.parse(jsonMatch[1].trim());
          parsedExtra = root.extracted_details || null;
        } catch (_) { /* ignore parse error */ }
      }

      if (parsedExtra) {
        let foundAny = false;
        if (parsedExtra.gross_income) {
          const val = parseInt(String(parsedExtra.gross_income).replace(/,/g, ''));
          if (val > 0) { setEligGrossSalary(String(val)); foundAny = true; }
        } else if (parsedExtra.monthly_income) {
          const val = parseInt(String(parsedExtra.monthly_income).replace(/,/g, ''));
          if (val > 0) { setEligGrossSalary(String(val)); foundAny = true; }
        }
        if (parsedExtra.pf) {
          const val = parseInt(String(parsedExtra.pf).replace(/,/g, ''));
          if (val > 0) { setEligPF(String(val)); foundAny = true; }
        }
        if (parsedExtra.income_tax) {
          const val = parseInt(String(parsedExtra.income_tax).replace(/,/g, ''));
          if (val > 0) { setEligIncomeTax(String(val)); foundAny = true; }
        }
        if (parsedExtra.profession_tax) {
          const val = parseInt(String(parsedExtra.profession_tax).replace(/,/g, ''));
          if (val > 0) { setEligProfessionTax(String(val)); foundAny = true; }
        }
        if (parsedExtra.rental_income) {
          const val = parseInt(String(parsedExtra.rental_income).replace(/,/g, ''));
          if (val > 0) { setEligRentalIncome(String(val)); foundAny = true; }
        }
        // Only skip regex fallback if we actually found financial fields in the JSON
        if (foundAny) return;
      }

      // 2) Fallback: strip markdown bold/italic markers and try regex patterns
      const text = summary.replace(/\*\*/g, '').replace(/\*/g, '');
      
      // Look for gross income patterns
      const incomePatterns = [
        /(?:gross\s+monthly\s+income|gross\s+salary|gross\s+income|monthly\s+income|salary\s+income|total\s+income)[:\s]*₹?\s*([\d,]+)/i,
        /(?:gross\s+monthly\s+income|gross\s+salary|gross\s+income|monthly\s+income|salary\s+income|total\s+income)[:\s]*rs?\.?\s*([\d,]+)/i,
        /(?:earns|income|salary)(?:\s+is|\s*~|\s*approx(?:imately)?)?\s*(?:₹|rs?\.?)?\s*([\d,]+)\s*(?:per\s+month|\/month|\/pm|monthly)/i
      ];
      let salaryVal = 0;
      for (const pattern of incomePatterns) {
        const match = text.match(pattern);
        if (match) {
          const val = parseInt(match[1].replace(/,/g, ''));
          if (val > 0) { salaryVal = val; break; }
        }
      }
      if (salaryVal > 0) setEligGrossSalary(String(salaryVal));

      // Look for PF / Provident Fund patterns
      const pfPatterns = [
        /(?:provident\s+fund|pf|p\.f\.)[:\s]*₹?\s*([\d,]+)/i,
        /(?:provident\s+fund|pf|p\.f\.)[:\s]*rs?\.?\s*([\d,]+)/i,
        /(?:pf|provident\s+fund)(?:\s+deduction|\s+contribution)?[\s:]*₹?\s*([\d,]+)/i
      ];
      let pfVal = 0;
      for (const pattern of pfPatterns) {
        const match = text.match(pattern);
        if (match) {
          const val = parseInt(match[1].replace(/,/g, ''));
          if (val > 0) { pfVal = val; break; }
        }
      }
      if (pfVal > 0) setEligPF(String(pfVal));

      // Look for Income Tax / TDS patterns
      const taxPatterns = [
        /(?:income\s+tax|tax\s+deduction|tax\s+deducted|tds)[:\s]*₹?\s*([\d,]+)/i,
        /(?:income\s+tax|tax\s+deduction|tds)[:\s]*rs?\.?\s*([\d,]+)/i
      ];
      let taxVal = 0;
      for (const pattern of taxPatterns) {
        const match = text.match(pattern);
        if (match) {
          const val = parseInt(match[1].replace(/,/g, ''));
          if (val > 0) { taxVal = val; break; }
        }
      }
      if (taxVal > 0) setEligIncomeTax(String(taxVal));
    } catch (err) {
      console.error('Failed to parse summary for eligibility:', err);
    }
  };

  // Reset & pre-fill when lead changes
  useEffect(() => {
    if (!selectedLead) return;
    // Reset all eligibility fields
    setEligPF('');
    setEligIncomeTax('');
    setEligProfessionTax('');
    setEligGrossSalary('');
    setEligRentalIncome('');
    setEligEmiNmiPercent('50');
    setEligBankEmis([{ bank: '', emi: '' }]);
    setEligPrincipal('100000');
    setEligRate('8.5');
    setEligPeriod('240');
    setEligCoapplicantGross('');
    // Set lead-specific defaults
    setEligHasCoapplicant(selectedLead.hasCoapplicant || false);
    const lt = (selectedLead.loanType || '').toLowerCase();
    if (lt.includes('education')) {
      setEligRate('10.5');
      setEligPeriod('120');
    } else if (lt.includes('lap')) {
      setEligRate('10');
      setEligPeriod('180');
    } else {
      setEligRate('8.5');
      setEligPeriod('240');
    }
  }, [selectedLead?.id]);

  // Try to pre-fill from AI summary when it changes
  useEffect(() => {
    if (summary) {
      prefillEligibilityFromSummary();
    }
  }, [summary]);

  // Computed eligibility values
  const eligCoapplicantGrossVal = eligHasCoapplicant ? eligNum(eligCoapplicantGross) : 0;
  const eligTotalDeductions = eligNum(eligPF) + eligNum(eligIncomeTax) + eligNum(eligProfessionTax);
  const eligNetSalary = (eligNum(eligGrossSalary) + eligCoapplicantGrossVal) - eligTotalDeductions;
  const eligNetIncome = eligNetSalary + eligNum(eligRentalIncome);
  const eligTotalExistingEmis = eligBankEmis.reduce((sum, b) => sum + eligNum(b.emi), 0);
  const eligEmiAvailable = (eligNetIncome * eligNum(eligEmiNmiPercent) / 100) - eligTotalExistingEmis;
  const eligMonthlyRate = eligNum(eligRate) / 100 / 12;
  const eligEmiPerLac = eligMonthlyRate > 0 && eligNum(eligPeriod) > 0
    ? (100000 * eligMonthlyRate * Math.pow(1 + eligMonthlyRate, eligNum(eligPeriod))) / (Math.pow(1 + eligMonthlyRate, eligNum(eligPeriod)) - 1)
    : 0;
  const eligEligibleAmount = eligEmiPerLac > 0 ? (Math.max(0, eligEmiAvailable) / eligEmiPerLac) * 100000 : 0;

  const eligAddBankEmi = () => setEligBankEmis([...eligBankEmis, { bank: '', emi: '' }]);
  const eligRemoveBankEmi = (i) => setEligBankEmis(eligBankEmis.filter((_, idx) => idx !== i));
  const eligUpdateBankEmi = (i, field, val) => {
    const updated = [...eligBankEmis];
    updated[i][field] = val;
    setEligBankEmis(updated);
  };

  const handleCheckEligibility = () => {
    setShowEligModal(true);
  };

  const handleDownloadEligPDF = async () => {
    setEligDownloading(true);
    try {
      await downloadEligibilityPDF({
        applicantName: selectedLead?.customerName || 'Applicant',
        loanType: (selectedLead?.loanType || '').replace(/_/g, ' '),
        mobile: selectedLead?.mobile || '',
        pf: eligNum(eligPF),
        incomeTax: eligNum(eligIncomeTax),
        professionTax: eligNum(eligProfessionTax),
        totalDeductions: eligTotalDeductions,
        grossSalary: eligNum(eligGrossSalary),
        netSalary: eligNetSalary,
        rentalIncome: eligNum(eligRentalIncome),
        netIncome: eligNetIncome,
        emiNmiPercent: eligNum(eligEmiNmiPercent),
        bankEmis: eligBankEmis.map(b => ({ bank: b.bank, emi: eligNum(b.emi) })),
        totalExistingEmis: eligTotalExistingEmis,
        emiAvailable: eligEmiAvailable,
        principal: eligNum(eligPrincipal),
        rate: eligNum(eligRate),
        period: eligNum(eligPeriod),
        emiPerLac: eligEmiPerLac,
        eligibleAmount: eligEligibleAmount,
        hasCoapplicant: eligHasCoapplicant,
        coapplicantGross: eligCoapplicantGrossVal,
      });
    } catch (err) {
      console.error('Eligibility PDF download failed:', err);
      setError('Failed to download eligibility report');
      setTimeout(() => setError(''), 5000);
    } finally {
      setEligDownloading(false);
    }
  };

  const handleShareEligWhatsApp = () => {
    const name = selectedLead?.customerName || 'Applicant';
    const loanType = (selectedLead?.loanType || '').replace(/_/g, ' ') || '';
    const eligible = eligEligibleAmount > 0 ? eligFormatNum(Math.round(eligEligibleAmount)) : 'Not Eligible';
    const coAppText = eligHasCoapplicant ? `Co-applicant Gross: ${eligFormatNum(eligCoapplicantGrossVal)}\n` : '';

    const msg =
      `*Eligibility Report - ${name}*\n` +
      `${loanType ? `Loan Type: ${loanType}\n` : ''}\n` +
      `*Income Details:*\n` +
      `Gross Salary: ${eligFormatNum(eligNum(eligGrossSalary))}\n` +
      coAppText +
      `Total Deductions: ${eligFormatDec(eligTotalDeductions)}\n` +
      `Net Salary: ${eligFormatDec(eligNetSalary)}\n` +
      `Rental Income: ${eligFormatNum(eligNum(eligRentalIncome))}\n` +
      `Net Income: ${eligFormatDec(eligNetIncome)}\n\n` +
      `*EMI Details:*\n` +
      `EMI/NMI%: ${eligNum(eligEmiNmiPercent)}%\n` +
      `Existing EMIs: ${eligFormatDec(eligTotalExistingEmis)}\n` +
      `EMI Available: ${eligFormatDec(eligEmiAvailable)}\n\n` +
      `*Loan Parameters:*\n` +
      `Rate: ${eligNum(eligRate)}% p.a.\n` +
      `Period: ${eligNum(eligPeriod)} months\n` +
      `EMI per LAC: ${eligFormatDec(eligEmiPerLac)}\n\n` +
      `*Eligible Loan Amount: ${eligible}*`;

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  };

  // Compute stats - now with array of files per document
  const uploadedCount = checklistItems.filter(item => {
    const files = checklistStatuses[item.id];
    return files && files.length > 0;
  }).length;
  const pendingRequiredCount = checklistItems.filter(item => {
    const files = checklistStatuses[item.id];
    return item.required && (!files || files.length === 0);
  }).length;

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Checklist & Document Management</h1>
        <p className="text-gray-500">Select a lead to view required documents and upload files.</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-6">
          {success}
        </div>
      )}

      {/* Leads Selection */}
      <div className="bg-white rounded-3xl shadow-xl p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Select Lead</h2>
        {loading ? (
          <div className="flex items-center justify-center py-8">Loading leads...</div>
        ) : (
          <div className="space-y-4">
            <select
              className="w-full border rounded-xl px-4 py-3"
              value={selectedLead?.id || ''}
              onChange={(e) => handleLeadSelect(e.target.value)}
            >
              <option value="">Select a lead</option>
              {leads.map(lead => (
                <option key={lead.id} value={lead.id}>
                  {lead.customerName} - {lead.mobile} ({lead.loanType})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Checklist and Upload Section */}
      {selectedLead && (
        <div className="space-y-8">
          {/* Lead Info */}
          <div className="bg-blue-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-blue-800 mb-3">Lead Information</h3>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Customer: </span>
                <span className="font-medium">{selectedLead.customerName}</span>
              </div>
              <div>
                <span className="text-gray-500">Mobile: </span>
                <span className="font-medium">{selectedLead.mobile}</span>
              </div>
              <div>
                <span className="text-gray-500">Loan Type: </span>
                <span className="font-medium">{selectedLead.loanType || 'Not specified'}</span>
              </div>
              <div>
                <span className="text-gray-500">Loan Status: </span>
                <span className="font-medium">{selectedLead.loanStatus || 'Not specified'}</span>
              </div>
              <div>
                <span className="text-gray-500">Income Source: </span>
                <span className="font-medium">{selectedLead.incomeSource || 'Not specified'}</span>
              </div>
              <div>
                <span className="text-gray-500">Resident Type: </span>
                <span className="font-medium">{selectedLead.residentType || 'Not specified'}</span>
              </div>
              {selectedLead.incomeSource === 'non_salaried' && (
                <div>
                  <span className="text-gray-500">Business Type: </span>
                  <span className="font-medium">{selectedLead.businessType || 'Not specified'}</span>
                </div>
              )}
            </div>
          </div>          {/* Checklist and Upload Section in Grid */}
          <div className="grid lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Checklist with Upload */}
            <div className="lg:col-span-7 bg-white rounded-3xl shadow-xl p-6 border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Required Documents ({checklistItems.filter(d => d.required).length})
                </h3>
                <div className="flex gap-3 text-sm">
                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">
                    {uploadedCount} Uploaded
                  </span>
                  <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full font-medium">
                    {pendingRequiredCount} Pending
                  </span>
                </div>
              </div>

              {checklistItems.length === 0 && (
                <p className="text-gray-500 text-center py-8">No checklist data available. Please ensure lead has all required information.</p>
              )}

              {checklistItems.length > 0 && (
                <div className="space-y-6">
                  {/* Group by category */}
                  {(() => {
                    const categoryOrder = ['kyc', 'income_proof', 'business_documents', 'property_documents', 'financial_documents', 'legal_documents', 'others'];
                    const categoryLabels = {
                      kyc: 'KYC Documents',
                      income_proof: 'Income Proof',
                      business_documents: 'Business Documents',
                      property_documents: 'Property Documents',
                      financial_documents: 'Financial Documents',
                      legal_documents: 'Legal Documents',
                      others: 'Others'
                    };

                    return categoryOrder.map(category => {
                      const items = checklistItems.filter(item => item.category === category);
                      if (items.length === 0) return null;

                      return (
                        <div key={category} className="border border-gray-200 rounded-xl overflow-hidden">
                          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                            <h4 className="font-semibold text-gray-900">{categoryLabels[category] || category}</h4>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {items.filter(i => i.required).length} required, {items.filter(i => !i.required).length} optional
                            </p>
                          </div>
                          <ul className="divide-y divide-gray-100">
                            {items.map(item => {
                              const uploadedFiles = checklistStatuses[item.id] || [];
                              const isUploading = uploadingDoc === item.id;
                              const showForm = showUploadForm === item.id;

                              return (
                                <li key={item.id} className={`px-5 py-4 ${uploadedFiles.length > 0 ? 'bg-green-50' : item.required ? 'bg-red-50/60' : ''}`}>
                                  {/* Document header row */}
                                  <div className="flex items-center gap-3 mb-2">
                                    {/* Status icon */}
                                    <div className="flex-shrink-0">
                                      {uploadedFiles.length > 0 ? (
                                        <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                      ) : item.required ? (
                                        <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                        </svg>
                                      ) : (
                                        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                    </div>

                                    {/* Document name */}
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm font-medium ${uploadedFiles.length > 0 ? 'text-green-800' : item.required ? 'text-gray-900' : 'text-gray-700'}`}>
                                        {item.name}
                                      </p>
                                      {uploadedFiles.length > 0 && (
                                        <p className="text-xs text-green-600 mt-0.5">
                                          {uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''} uploaded
                                        </p>
                                      )}
                                    </div>

                                    {/* Required/Optional badge */}
                                    <div className="flex-shrink-0">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                        item.required ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                                      }`}>
                                        {item.required ? 'Required' : 'Optional'}
                                      </span>
                                    </div>

                                    {/* Add File button */}
                                    <div className="flex-shrink-0">
                                      {showForm ? (
                                        <button
                                          onClick={() => { setShowUploadForm(null); setUploadDescription(''); }}
                                          className="text-xs text-gray-500 font-semibold bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200"
                                        >
                                          Cancel
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => setShowUploadForm(item.id)}
                                          className="text-xs text-blue-700 font-semibold bg-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-200"
                                        >
                                          + Add File
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Upload Form (inline) */}
                                  {showForm && (
                                    <div className="ml-8 mb-3 p-4 bg-white border border-blue-200 rounded-xl">
                                      <div className="space-y-3">
                                        {/* Description field (optional) */}
                                        <div>
                                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                                            Description <span className="text-gray-400 font-normal">(optional)</span>
                                          </label>
                                          <textarea
                                            value={uploadDescription}
                                            onChange={(e) => setUploadDescription(e.target.value)}
                                            placeholder="Describe this document (e.g. Front & back copy, Signed copy, etc.)"
                                            rows={2}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                                            disabled={isUploading}
                                          />
                                        </div>

                                        {/* File input + Upload button */}
                                        <div className="flex items-center gap-3">
                                          <label className={`flex-1 cursor-pointer text-sm px-4 py-2 rounded-lg font-medium text-center ${
                                            isUploading
                                              ? 'bg-gray-300 text-gray-500 cursor-wait'
                                              : 'bg-blue-600 text-white hover:bg-blue-700'
                                          }`}>
                                            {isUploading ? (
                                              <span className="flex items-center justify-center gap-2">
                                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                Uploading...
                                              </span>
                                            ) : (
                                              'Choose File & Upload'
                                            )}
                                            <input
                                              type="file"
                                              className="hidden"
                                              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                              disabled={isUploading}
                                              onChange={(e) => {
                                                if (e.target.files[0]) {
                                                  handleFileUpload(item.id, item.name, e.target.files[0], uploadDescription);
                                                }
                                              }}
                                            />
                                          </label>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Uploaded files list */}
                                  {uploadedFiles.length > 0 && (
                                    <div className="ml-8 space-y-2 mt-2">
                                      {uploadedFiles.map((file) => (
                                        <div
                                          key={file.id}
                                          className="flex items-center gap-3 bg-white border border-green-200 rounded-lg px-4 py-3"
                                        >
                                          {/* File icon */}
                                          <div className="flex-shrink-0">
                                            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                          </div>

                                          {/* File info */}
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">
                                              {file.description || 'No description'}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                              {file.originalFile || 'Unknown file'}
                                              {file.uploadedAt && (
                                                <span className="ml-2">
                                                  {new Date(file.uploadedAt).toLocaleDateString('en-IN', {
                                                    day: '2-digit',
                                                    month: 'short',
                                                    year: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                  })}
                                                </span>
                                              )}
                                            </p>
                                          </div>

                                          {/* View button */}
                                          <button
                                            onClick={() => handleViewDocument(file.id)}
                                            className="text-xs text-blue-700 font-semibold bg-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-200"
                                          >
                                            View
                                          </button>

                                          {/* Delete button */}
                                          <button
                                            onClick={() => handleDeleteDocument(file.id, file.description || item.name)}
                                            disabled={deletingDoc === file.id}
                                            className="text-xs text-red-700 font-semibold bg-red-100 px-3 py-1.5 rounded-lg hover:bg-red-200 disabled:opacity-50"
                                          >
                                            {deletingDoc === file.id ? '...' : 'Delete'}
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* Right Column: AI Underwriter Assistant */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <div className="bg-white rounded-3xl shadow-xl border border-indigo-100 overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 px-6 py-5 text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white bg-opacity-10 rounded-xl">
                      <svg className={`w-6 h-6 text-white ${summaryLoading ? 'animate-spin' : 'animate-pulse'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg leading-tight">AI Underwriter</h3>
                      <p className="text-xs text-indigo-200">Real-time profile & document analysis</p>
                    </div>
                  </div>
                  {uploadedCount > 0 && !summaryLoading && (
                    <button
                      onClick={handleSummarize}
                      className="text-xs font-semibold bg-white bg-opacity-20 hover:bg-opacity-30 text-white px-3 py-1.5 rounded-lg transition-all"
                    >
                      {summary ? 'Re-Analyze' : 'Analyze'}
                    </button>
                  )}
                </div>

                <div className="p-6 font-sans">
                  {summaryError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-2xl mb-4">
                      {summaryError}
                    </div>
                  )}

                  {summaryLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="relative w-16 h-16 mb-4">
                        <div className="absolute inset-0 rounded-full border-4 border-indigo-100"></div>
                        <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
                      </div>
                      <p className="font-semibold text-gray-900">Analyzing Uploaded Files...</p>
                      <p className="text-xs text-gray-500 mt-1 max-w-[250px]">Gemini is parsing documents, verifying data integrity, and conducting credit risk checks...</p>
                    </div>
                  ) : summary ? (
                    <div className="prose max-w-none text-sm max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
                      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-4 text-xs text-indigo-800 flex items-start gap-2.5">
                        <svg className="w-5 h-5 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <strong>AI Inspection Complete.</strong> The generated credit risk analysis and verification report has been permanently saved to Supabase storage.
                        </div>
                      </div>

                      {extractedProfile && (
                        <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mb-4">
                          <div className="flex items-center justify-between mb-3 pb-2 border-b border-indigo-100">
                            <div className="flex items-center gap-2">
                              <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                              </span>
                              <h4 className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider">AI Verified KYC Profile</h4>
                            </div>
                            {croppedPhoto && (
                              <div className="h-10 w-10 rounded-lg overflow-hidden border border-indigo-200 bg-white">
                                <img src={croppedPhoto} alt="Extracted Applicant" className="h-full w-full object-cover" />
                              </div>
                            )}
                          </div>
                          
                          <div className="space-y-2 text-xs text-gray-700">
                            <div className="grid grid-cols-3">
                              <span className="font-medium text-gray-500">Full Name</span>
                              <span className="col-span-2 font-semibold text-gray-900">{extractedProfile.full_name || 'N/A'}</span>
                            </div>
                            <div className="grid grid-cols-3">
                              <span className="font-medium text-gray-500">DOB / Gender</span>
                              <span className="col-span-2 font-semibold text-gray-900">
                                {extractedProfile.dob || 'N/A'} {extractedProfile.gender ? `(${extractedProfile.gender})` : ''}
                              </span>
                            </div>
                            <div className="grid grid-cols-3">
                              <span className="font-medium text-gray-500">Aadhaar No</span>
                              <span className="col-span-2 font-semibold text-gray-900 tracking-wider">{extractedProfile.aadhaar_number || 'N/A'}</span>
                            </div>
                            <div className="grid grid-cols-3">
                              <span className="font-medium text-gray-500">PAN Number</span>
                              <span className="col-span-2 font-semibold text-gray-900 tracking-wider">{extractedProfile.pan_number || 'N/A'}</span>
                            </div>
                            <div className="grid grid-cols-3">
                              <span className="font-medium text-gray-500">Address</span>
                              <span className="col-span-2 text-gray-600 leading-normal">{extractedProfile.address || 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {renderSummary(summary)}

                      <div className="mt-4 pt-4 border-t border-indigo-100">
                        <button
                          onClick={handleDownloadProfilePDF}
                          disabled={isGeneratingProfilePDF}
                          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-100 hover:shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                          {isGeneratingProfilePDF ? (
                            <>
                              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Generating Underwriting Report...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Download Underwriting Report (PDF)
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 flex flex-col items-center">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-400">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h4 className="font-bold text-gray-900 mb-1">No Profile Summary Generated</h4>
                      <p className="text-xs text-gray-500 max-w-xs mb-6">
                        {uploadedCount === 0 
                          ? "Please upload documents first in the checklist on the left before executing AI profile summarization."
                          : "All documents are uploaded! Click the button below to have Gemini automatically analyze and summarize this lead's credit profile."}
                      </p>
                      <button
                        onClick={handleSummarize}
                        disabled={uploadedCount === 0}
                        className={`w-full py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 ${
                          uploadedCount === 0
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100 hover:shadow-lg'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Analyze Documents & Summarize
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-4">
            {/* Download PDF */}
            <button
              onClick={handleDownloadPDF}
              disabled={checklistItems.length === 0 || isDownloading}
              className={`inline-flex items-center px-5 py-3 rounded-xl font-semibold text-sm transition-all ${
                checklistItems.length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-purple-700 text-white hover:bg-purple-800 shadow-sm hover:shadow-md'
              }`}
            >
              {isDownloading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download Checklist
                </>
              )}
            </button>

            {/* Share All via WhatsApp (includes bank name) */}
            <button
              onClick={async () => {
                if (checklistItems.length === 0) return;
                setIsSharing(true);
                try {
                  const bankName = getBankDetailsWithBranches() || getBankNamesString();
                  await shareOnWhatsApp({
                    loanType: selectedLead.loanType,
                    items: checklistItems.filter(i => i.required).map(item => ({
                      name: item.name,
                      category: item.category,
                      required: item.required
                    })),
                    bankName: bankName
                  });
                } catch (err) {
                  setError('Failed to share on WhatsApp');
                  setTimeout(() => setError(''), 5000);
                } finally {
                  setIsSharing(false);
                }
              }}
              disabled={checklistItems.length === 0 || isSharing}
              className={`inline-flex items-center px-5 py-3 rounded-xl font-semibold text-sm transition-all ${
                checklistItems.length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700 shadow-sm hover:shadow-md'
              }`}
            >
              {isSharing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Sharing...
                </>
              ) : (
                <>
                  <svg className="-ml-1 mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Share All via WhatsApp
                </>
              )}
            </button>

            {/* Share via Email */}
            <button
              onClick={handleShareEmail}
              disabled={checklistItems.length === 0 || pendingRequiredCount === 0}
              className={`inline-flex items-center px-5 py-3 rounded-xl font-semibold text-sm transition-all ${
                checklistItems.length === 0 || pendingRequiredCount === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md'
              }`}
            >
              <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Share via Email
            </button>

            {/* Share Pending via WhatsApp */}
            <button
              onClick={handleSharePendingWhatsApp}
              disabled={checklistItems.length === 0 || isSharing || pendingRequiredCount === 0}
              className={`inline-flex items-center px-5 py-3 rounded-xl font-semibold text-sm transition-all ${
                checklistItems.length === 0 || pendingRequiredCount === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-orange-500 text-white hover:bg-orange-600 shadow-sm hover:shadow-md'
              }`}
            >
              <>
                <svg className="-ml-1 mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Send Pending via WhatsApp ({pendingRequiredCount})
              </>
            </button>
          </div>

          {/* ===== Eligibility Calculator Section ===== */}
          {selectedLead && (
            <div className="bg-white rounded-3xl shadow-xl p-6 border border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-100 rounded-xl">
                  <svg className="w-6 h-6 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M15 14h.01M12 14h.01M15 17h.01M12 17h.01M9 11h.01M12 11h.01M15 11h.01M12 11h.01M9 14h.01M12 14h.01M15 14h.01M12 14h.01M9 17h.01M12 17h.01M15 17h.01M12 17h.01" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Eligibility Calculator</h3>
                  <p className="text-sm text-gray-500">Fields auto-populated from AI report where available</p>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-8">
                {/* Left: Input fields */}
                <div className="space-y-4">
                  {/* Statutory Deductions */}
                  <div className="bg-gray-50 rounded-2xl p-5">
                    <h4 className="text-sm font-bold text-blue-700 mb-3">Statutory Deductions</h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Provident Fund</label>
                        <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligPF} onChange={eligHandleNumInput(setEligPF)} placeholder="0" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Income Tax</label>
                        <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligIncomeTax} onChange={eligHandleNumInput(setEligIncomeTax)} placeholder="0" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Profession Tax</label>
                        <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligProfessionTax} onChange={eligHandleNumInput(setEligProfessionTax)} placeholder="0" />
                      </div>
                    </div>
                  </div>

                  {/* Income */}
                  <div className="bg-gray-50 rounded-2xl p-5">
                    <h4 className="text-sm font-bold text-blue-700 mb-3">Income</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Gross Salary (Monthly)</label>
                        <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligGrossSalary} onChange={eligHandleNumInput(setEligGrossSalary)} placeholder="0" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Proposed Rental Income</label>
                        <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligRentalIncome} onChange={eligHandleNumInput(setEligRentalIncome)} placeholder="0" />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 cursor-pointer select-none group">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                            checked={eligHasCoapplicant}
                            onChange={(e) => {
                              setEligHasCoapplicant(e.target.checked);
                              if (!e.target.checked) setEligCoapplicantGross('');
                            }}
                          />
                          <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700 transition-colors">
                            Include Co-applicant Income
                          </span>
                        </label>
                        {eligHasCoapplicant && (
                          <div className="mt-2">
                            <label className="text-xs text-gray-600 mb-1 block">
                              Co-applicant Monthly Gross {selectedLead?.coapplicantName ? `(${selectedLead.coapplicantName})` : ''}
                            </label>
                            <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligCoapplicantGross} onChange={eligHandleNumInput(setEligCoapplicantGross)} placeholder="0" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* EMI Details */}
                  <div className="bg-gray-50 rounded-2xl p-5">
                    <h4 className="text-sm font-bold text-blue-700 mb-3">EMI Details</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">EMI/NMI % (as per NAI)</label>
                        <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligEmiNmiPercent} onChange={eligHandleNumInput(setEligEmiNmiPercent)} placeholder="50" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Existing Bank EMIs</label>
                        {eligBankEmis.map((item, i) => (
                          <div key={i} className="flex gap-2 mb-2">
                            <input type="text" className="flex-1 border rounded-xl px-3 py-2 text-sm" placeholder="Bank name" value={item.bank} onChange={(e) => eligUpdateBankEmi(i, 'bank', e.target.value)} />
                            <input type="text" inputMode="decimal" className="w-32 border rounded-xl px-3 py-2 text-sm" placeholder="EMI" value={item.emi} onChange={(e) => eligUpdateBankEmi(i, 'emi', e.target.value)} />
                            {eligBankEmis.length > 1 && (
                              <button onClick={() => eligRemoveBankEmi(i)} className="text-red-500 hover:text-red-700 px-2">&times;</button>
                            )}
                          </div>
                        ))}
                        <button onClick={eligAddBankEmi} className="text-xs text-blue-600 hover:underline mt-1">+ Add another</button>
                      </div>
                    </div>
                  </div>

                  {/* Loan Parameters */}
                  <div className="bg-gray-50 rounded-2xl p-5">
                    <h4 className="text-sm font-bold text-blue-700 mb-3">Loan Parameters</h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Principal</label>
                        <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligPrincipal} onChange={eligHandleNumInput(setEligPrincipal)} placeholder="100000" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Rate (% p.a.)</label>
                        <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligRate} onChange={eligHandleNumInput(setEligRate)} placeholder="8.5" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Period (months)</label>
                        <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligPeriod} onChange={eligHandleNumInput(setEligPeriod)} placeholder="240" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Calculated Results */}
                <div className="space-y-4">
                  {/* Live Results */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
                    <h4 className="text-sm font-bold text-blue-800 mb-4">Calculated Results (live)</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between py-2 border-b border-blue-100">
                        <span className="text-sm text-gray-600">Total Deductions</span>
                        <span className="text-sm font-semibold">₹{eligFormatDec(eligTotalDeductions)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-blue-100">
                        <span className="text-sm text-gray-600">Net Salary</span>
                        <span className="text-sm font-semibold">₹{eligFormatDec(eligNetSalary)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-blue-100">
                        <span className="text-sm text-gray-600">Net Income</span>
                        <span className="text-sm font-bold text-green-700">₹{eligFormatDec(eligNetIncome)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-blue-100">
                        <span className="text-sm text-gray-600">Existing EMIs</span>
                        <span className="text-sm font-semibold">₹{eligFormatDec(eligTotalExistingEmis)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-blue-100">
                        <span className="text-sm text-gray-600">EMI Available</span>
                        <span className={`text-sm font-bold ${eligEmiAvailable < 0 ? 'text-red-600' : 'text-blue-700'}`}>₹{eligFormatDec(eligEmiAvailable)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-blue-100">
                        <span className="text-sm text-gray-600">EMI per LAC</span>
                        <span className="text-sm font-semibold">₹{eligFormatDec(eligEmiPerLac)}</span>
                      </div>
                      <div className={`mt-4 p-4 rounded-xl text-white text-center ${eligEligibleAmount > 0 ? 'bg-gradient-to-r from-blue-600 to-blue-700' : 'bg-gradient-to-r from-red-500 to-red-600'}`}>
                        <p className="text-xs opacity-80 mb-1">Eligible Loan Amount</p>
                        {eligEligibleAmount > 0 ? (
                          <p className="text-2xl font-bold">₹{eligFormatNum(Math.round(eligEligibleAmount))}</p>
                        ) : (
                          <p className="text-xl font-extrabold tracking-wide">NOT ELIGIBLE</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleCheckEligibility}
                      className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Check Eligibility
                    </button>
                    <button
                      onClick={handleShareEligWhatsApp}
                      className="px-4 py-3 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      Share
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!selectedLead && leads.length > 0 && (
        <div className="text-center py-8 text-gray-500">
          Please select a lead to view checklist and upload documents.
        </div>
      )}

      {/* Eligibility Results Modal */}
      {showEligModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={() => setShowEligModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-xl">
                  <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Eligibility Report</h3>
                  <p className="text-sm text-gray-500">{selectedLead?.customerName} | {(selectedLead?.loanType || '').replace(/_/g, ' ')}</p>
                </div>
              </div>
              <button onClick={() => setShowEligModal(false)} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">&times;</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Income Details */}
              <div className="bg-gray-50 rounded-2xl p-5">
                <h4 className="text-sm font-bold text-gray-800 mb-3 border-b pb-2">Income Details</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Gross Salary (Monthly)</span>
                    <span className="font-semibold">₹{eligFormatNum(eligNum(eligGrossSalary))}</span>
                  </div>
                  {eligHasCoapplicant && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Co-applicant Gross</span>
                      <span className="font-semibold">₹{eligFormatNum(eligCoapplicantGrossVal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Proposed Rental Income</span>
                    <span className="font-semibold">₹{eligFormatNum(eligNum(eligRentalIncome))}</span>
                  </div>
                </div>
              </div>

              {/* Statutory Deductions */}
              <div className="bg-gray-50 rounded-2xl p-5">
                <h4 className="text-sm font-bold text-gray-800 mb-3 border-b pb-2">Statutory Deductions</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Provident Fund</span>
                    <span className="font-semibold">₹{eligFormatNum(eligNum(eligPF))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Income Tax</span>
                    <span className="font-semibold">₹{eligFormatNum(eligNum(eligIncomeTax))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Profession Tax</span>
                    <span className="font-semibold">₹{eligFormatNum(eligNum(eligProfessionTax))}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t font-bold">
                    <span className="text-gray-800">Total Deductions</span>
                    <span className="text-gray-900">₹{eligFormatDec(eligTotalDeductions)}</span>
                  </div>
                </div>
              </div>

              {/* Net Income */}
              <div className="bg-green-50 rounded-2xl p-5 border border-green-200">
                <h4 className="text-sm font-bold text-green-800 mb-3 border-b border-green-200 pb-2">Net Income</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Net Salary</span>
                    <span className="font-semibold">₹{eligFormatDec(eligNetSalary)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">+ Rental Income</span>
                    <span className="font-semibold">₹{eligFormatNum(eligNum(eligRentalIncome))}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-green-200 font-bold">
                    <span className="text-green-800">Net Income</span>
                    <span className="text-green-700 text-lg">₹{eligFormatDec(eligNetIncome)}</span>
                  </div>
                </div>
              </div>

              {/* EMI Details */}
              <div className="bg-gray-50 rounded-2xl p-5">
                <h4 className="text-sm font-bold text-gray-800 mb-3 border-b pb-2">EMI Details</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">EMI/NMI %</span>
                    <span className="font-semibold">{eligNum(eligEmiNmiPercent)}%</span>
                  </div>
                  {eligBankEmis.filter(b => b.bank || eligNum(b.emi) > 0).map((b, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-600">{b.bank || `Bank ${i + 1}`}</span>
                      <span className="font-semibold">₹{eligFormatNum(eligNum(b.emi))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm pt-2 border-t font-bold">
                    <span className="text-gray-800">Total Existing EMIs</span>
                    <span className="text-gray-900">₹{eligFormatDec(eligTotalExistingEmis)}</span>
                  </div>
                  <div className={`flex justify-between text-sm p-2 rounded-lg ${eligEmiAvailable < 0 ? 'bg-red-50' : 'bg-blue-50'}`}>
                    <span className="text-gray-800 font-medium">EMI Available</span>
                    <span className={`font-bold ${eligEmiAvailable < 0 ? 'text-red-600' : 'text-blue-700'}`}>₹{eligFormatDec(eligEmiAvailable)}</span>
                  </div>
                </div>
              </div>

              {/* Loan Parameters */}
              <div className="bg-gray-50 rounded-2xl p-5">
                <h4 className="text-sm font-bold text-gray-800 mb-3 border-b pb-2">Loan Parameters</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Principal</span>
                    <span className="font-semibold">₹{eligFormatNum(eligNum(eligPrincipal))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Rate</span>
                    <span className="font-semibold">{eligNum(eligRate)}% p.a.</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Period</span>
                    <span className="font-semibold">{eligNum(eligPeriod)} months</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">EMI per LAC</span>
                    <span className="font-semibold">₹{eligFormatDec(eligEmiPerLac)}</span>
                  </div>
                </div>
              </div>

              {/* Eligible Amount */}
              <div className={`p-6 rounded-2xl text-white text-center ${eligEligibleAmount > 0 ? 'bg-gradient-to-r from-blue-600 to-blue-700' : 'bg-gradient-to-r from-red-500 to-red-600'}`}>
                <p className="text-sm opacity-80 mb-1">Eligible Loan Amount (as per Income)</p>
                {eligEligibleAmount > 0 ? (
                  <p className="text-3xl font-bold mt-2">₹{eligFormatNum(Math.round(eligEligibleAmount))}</p>
                ) : (
                  <>
                    <p className="text-4xl font-extrabold mt-2 tracking-wide">NOT ELIGIBLE</p>
                    <p className="text-sm opacity-80 mt-2">Existing EMIs exceed available EMI capacity</p>
                  </>
                )}
              </div>

              {/* Modal Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleDownloadEligPDF}
                  disabled={eligDownloading}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {eligDownloading ? 'Downloading...' : 'Download Report'}
                </button>
                <button
                  onClick={() => { setShowEligModal(false); setTimeout(handleShareEligWhatsApp, 300); }}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Share to WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Document Modal */}
      {viewDoc && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => { if (viewDoc.url) URL.revokeObjectURL(viewDoc.url); setViewDoc(null); }}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">Uploaded Document</h3>
              <div className="flex items-center gap-3">
                {viewDoc.url && (
                  <a
                    href={viewDoc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Open in new tab
                  </a>
                )}
                <button
                  onClick={() => { if (viewDoc.url) URL.revokeObjectURL(viewDoc.url); setViewDoc(null); }}
                  className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {viewDoc.loading ? (
                <div className="flex items-center justify-center h-[70vh] text-gray-500">Loading document...</div>
              ) : (
                <iframe
                  src={viewDoc.url}
                  title="Document Preview"
                  className="w-full h-[70vh] border rounded-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
