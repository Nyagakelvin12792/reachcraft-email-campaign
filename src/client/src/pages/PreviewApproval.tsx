import React, { useEffect, useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Send,
  Mail,
  AlertTriangle,
  CheckCircle2,
  Search,
  Key,
  Edit3,
  RefreshCw,
  Eye,
  EyeOff,
  Save,
  Lock,
} from 'lucide-react';
import { api, Campaign, Recipient, SettingsResponse } from '../api/client.js';
import { Stepper } from '../components/Stepper.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Modal } from '../components/Modal.js';

interface PreviewApprovalProps {
  campaignId: string;
  onNavigate: (page: string, campaignId?: string) => void;
}

export const PreviewApproval: React.FC<PreviewApprovalProps> = ({ campaignId, onNavigate }) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick Credentials Modal State (paste credentials directly on website)
  const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
  const [inputGmailUser, setInputGmailUser] = useState('');
  const [inputAppPassword, setInputAppPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSavingCreds, setIsSavingCreds] = useState(false);
  const [credsSuccessMessage, setCredsSuccessMessage] = useState<string | null>(null);
  const [credsError, setCredsError] = useState<string | null>(null);

  // Edit Recipient Details Modal State (paste/fill details to resolve missing placeholders)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null);
  const [editFields, setEditFields] = useState({
    email: '',
    firstName: '',
    lastName: '',
    company: '',
    phone: '',
    jobTitle: '',
  });
  const [isSavingRecipient, setIsSavingRecipient] = useState(false);

  // Test Email Modal State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testEmailInput, setTestEmailInput] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testSuccessMessage, setTestSuccessMessage] = useState<string | null>(null);

  // Final SEND Confirmation Modal State
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [previewTab, setPreviewTab] = useState<'html' | 'text'>('html');

  useEffect(() => {
    loadCampaignData();
  }, [campaignId]);

  const loadCampaignData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [campRes, settingsRes] = await Promise.all([
        api.getCampaign(campaignId),
        api.getSettings(),
      ]);
      setCampaign(campRes.campaign);
      setRecipients(campRes.campaign.recipients || []);
      setSettings(settingsRes);
      if (settingsRes.gmailUserMasked && settingsRes.gmailUserMasked !== 'N/A') {
        // Preset email if already partially set
        setInputGmailUser(settingsRes.gmailUserMasked.replace(/\*/g, ''));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load campaign preview.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleExclude = async (recipientId: string) => {
    try {
      const res = await api.toggleExcludeRecipient(campaignId, recipientId);
      setRecipients((prev) =>
        prev.map((r) => (r.id === recipientId ? { ...r, isExcluded: res.isExcluded } : r))
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to toggle exclusion.');
    }
  };

  // Open Edit Modal for a specific recipient
  const openEditModal = (r: Recipient) => {
    setEditingRecipient(r);
    setEditFields({
      email: r.email || '',
      firstName: r.firstName || '',
      lastName: r.lastName || '',
      company: r.company || '',
      phone: r.phone || '',
      jobTitle: r.jobTitle || '',
    });
    setIsEditModalOpen(true);
  };

  // Save recipient detail overrides and clear missing placeholders
  const handleSaveRecipientDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecipient) return;

    try {
      setIsSavingRecipient(true);
      const res = await api.updateRecipient(campaignId, editingRecipient.id, editFields);
      setRecipients((prev) =>
        prev.map((item) => (item.id === editingRecipient.id ? res.recipient : item))
      );
      setIsEditModalOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update recipient details.');
    } finally {
      setIsSavingRecipient(false);
    }
  };

  // Save Credentials from modal
  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputGmailUser.trim() || !inputAppPassword.trim()) {
      setCredsError('Please provide both Gmail address and 16-character App Password.');
      return;
    }

    try {
      setIsSavingCreds(true);
      setCredsError(null);
      setCredsSuccessMessage(null);

      const res = await api.saveCredentials({
        gmailUser: inputGmailUser.trim(),
        gmailAppPassword: inputAppPassword.trim(),
      });

      setInputAppPassword('');

      if (res.connected) {
        setCredsSuccessMessage('Credentials saved and Gmail SMTP verified successfully!');
        setTimeout(() => {
          setIsCredsModalOpen(false);
          setCredsSuccessMessage(null);
        }, 1500);
      } else {
        setCredsError(`Credentials saved, but verification failed: ${res.message}`);
      }

      const updatedSettings = await api.getSettings();
      setSettings(updatedSettings);
    } catch (err: unknown) {
      setCredsError(err instanceof Error ? err.message : 'Failed to save credentials.');
    } finally {
      setIsSavingCreds(false);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailInput.trim()) return;

    try {
      setIsSendingTest(true);
      setError(null);
      const res = await api.sendTestEmail(campaignId, testEmailInput.trim());
      setTestSuccessMessage(res.message);
      if (campaign) {
        setCampaign({
          ...campaign,
          testEmailAddress: res.testEmailAddress,
          testEmailSentAt: res.testEmailSentAt,
        });
      }
      setTimeout(() => {
        setIsTestModalOpen(false);
        setTestSuccessMessage(null);
      }, 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Test email failed.');
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleFinalApprove = async () => {
    const confirmation = typedConfirmation.trim().toUpperCase();
    if (confirmation !== 'SEND') {
      alert("Please type 'SEND' to confirm authorization.");
      return;
    }

    try {
      setIsApproving(true);
      setError(null);
      await api.approveAndStart(campaignId, 'SEND');
      setIsApproveModalOpen(false);
      onNavigate('sending-progress', campaignId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Approval failed.');
      setIsApproving(false);
    }
  };

  // Filter recipients
  const filteredRecipients = useMemo(() => {
    return recipients.filter((r) => {
      const matchesSearch =
        !searchQuery ||
        (r.email && r.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (r.firstName && r.firstName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (r.lastName && r.lastName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (r.company && r.company.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (r.jobTitle && r.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'READY' && r.status === 'READY' && !r.isExcluded) ||
        (statusFilter === 'EXCLUDED' && r.isExcluded) ||
        (statusFilter === 'REJECTED' && r.status !== 'READY');

      return matchesSearch && matchesStatus;
    });
  }, [recipients, searchQuery, statusFilter]);

  // Current recipient for carousel preview
  const currentRecipient = recipients[currentIndex];
  const totalRecipientsCount = recipients.length;
  const readyApprovedCount = recipients.filter((r) => r.status === 'READY' && !r.isExcluded).length;

  let missingTokenList: string[] = [];
  if (currentRecipient?.missingPlaceholders) {
    try {
      missingTokenList = JSON.parse(currentRecipient.missingPlaceholders);
    } catch { /* ignore */ }
  }

  return (
    <div>
      <Stepper
        currentStep={4}
        onStepClick={(step) => {
          if (step === 1) onNavigate('new-campaign', campaignId);
          if (step === 2) onNavigate('column-mapping', campaignId);
          if (step === 3) onNavigate('template-editor', campaignId);
        }}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 space-y-6">
        {/* Top Header Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <h2 className="text-xl font-black text-slate-900">Step 4: Personalized Preview & Approval</h2>
              <StatusBadge status={campaign?.status || 'CONFIGURED'} />
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Verify individualized previews, send a real test email, and authorize dispatch to {readyApprovedCount} recipients.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Quick Credentials Setup Button */}
            <button
              type="button"
              onClick={() => setIsCredsModalOpen(true)}
              className={`inline-flex items-center px-3.5 py-2 rounded-lg text-xs font-bold border transition-colors ${
                settings?.isAppPasswordConfigured && !settings?.isMockMode
                  ? 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 animate-pulse'
              }`}
            >
              <Key className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
              <span>{settings?.isAppPasswordConfigured && !settings?.isMockMode ? 'Gmail Configured' : 'Paste Gmail Credentials'}</span>
            </button>

            {/* Test Email Button */}
            <button
              type="button"
              onClick={() => setIsTestModalOpen(true)}
              className={`inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                campaign?.testEmailSentAt
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 animate-pulse'
              }`}
            >
              {campaign?.testEmailSentAt ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-600" />
                  <span>Test Email Verified</span>
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-1.5 text-amber-600" />
                  <span>Send Test Email (Required)</span>
                </>
              )}
            </button>

            {/* Launch / Start Campaign Button */}
            <button
              type="button"
              onClick={() => setIsApproveModalOpen(true)}
              disabled={!campaign?.testEmailSentAt || readyApprovedCount === 0 || readyApprovedCount > 100}
              className="inline-flex items-center px-5 py-2.5 rounded-lg shadow-sm text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Send className="w-4 h-4 mr-2" />
              <span>Authorize & Launch Campaign ({readyApprovedCount})</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start space-x-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Carousel Preview Card */}
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2 text-indigo-500" />
            <p className="text-sm">Loading previews...</p>
          </div>
        ) : currentRecipient ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Carousel Header & Controls */}
            <div className="bg-slate-50 px-6 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Recipient Preview
                </span>
                <span className="text-xs font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                  {currentIndex + 1} of {totalRecipientsCount}
                </span>
                <StatusBadge status={currentRecipient.status} size="sm" />
                {currentRecipient.isExcluded && (
                  <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    Excluded from Campaign
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {/* Edit / Paste Details Button */}
                <button
                  type="button"
                  onClick={() => openEditModal(currentRecipient)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors flex items-center space-x-1"
                >
                  <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Edit / Fill Details</span>
                </button>

                {/* Exclude / Include Button */}
                <button
                  type="button"
                  onClick={() => handleToggleExclude(currentRecipient.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    currentRecipient.isExcluded
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                      : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                  }`}
                >
                  {currentRecipient.isExcluded ? 'Include This Recipient' : 'Exclude This Recipient'}
                </button>

                <div className="flex items-center space-x-1 border-l border-slate-200 pl-2">
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                    disabled={currentIndex === 0}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-30"
                    title="Previous Preview"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => Math.min(totalRecipientsCount - 1, prev + 1))}
                    disabled={currentIndex === totalRecipientsCount - 1}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-30"
                    title="Next Preview"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Missing Value Alert Banner */}
            {missingTokenList.length > 0 && (
              <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between text-xs text-amber-800">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>
                    <strong>Missing placeholder values detected:</strong>{' '}
                    {missingTokenList.map((t) => `{{${t}}}`).join(', ')}. These tokens are highlighted in the preview.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => openEditModal(currentRecipient)}
                  className="px-2.5 py-1 bg-amber-600 text-white rounded text-[11px] font-bold hover:bg-amber-700 shrink-0"
                >
                  Fill Details Now
                </button>
              </div>
            )}

            {/* Email Message View */}
            <div className="p-6 space-y-4 font-sans">
              <div className="text-xs space-y-1 pb-3 border-b border-slate-100">
                <p>
                  <strong className="text-slate-500 uppercase tracking-wider w-16 inline-block">To:</strong>{' '}
                  <span className="font-mono text-slate-900 font-semibold">{currentRecipient.email || '(Missing email)'}</span>
                </p>
                <p>
                  <strong className="text-slate-500 uppercase tracking-wider w-16 inline-block">Subject:</strong>{' '}
                  <span className="text-slate-900 font-bold">{currentRecipient.previewSubject || '(No subject rendered)'}</span>
                </p>
                <p>
                  <strong className="text-slate-500 uppercase tracking-wider w-16 inline-block">Recipient:</strong>{' '}
                  <span className="text-slate-800 font-semibold">
                    {[currentRecipient.firstName, currentRecipient.lastName].filter(Boolean).join(' ') || 'N/A'}
                  </span>
                  {currentRecipient.jobTitle && (
                    <span className="text-indigo-600 font-medium ml-1.5">• {currentRecipient.jobTitle}</span>
                  )}
                  {currentRecipient.company && (
                    <span className="text-slate-600 ml-1">at {currentRecipient.company}</span>
                  )}
                  {currentRecipient.phone && (
                    <span className="text-slate-500 text-[11px] ml-2 font-mono">({currentRecipient.phone})</span>
                  )}
                </p>
              </div>

              {/* Rendered Body */}
              <div className="rounded-lg border border-slate-200 overflow-hidden bg-white shadow-2xs">
                {currentRecipient.previewBodyHtml && (
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Preview Mode</span>
                    <div className="flex bg-slate-200/80 p-0.5 rounded text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => setPreviewTab('html')}
                        className={`px-3 py-1 rounded transition-colors ${
                          previewTab === 'html'
                            ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        🌐 Rich HTML
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewTab('text')}
                        className={`px-3 py-1 rounded transition-colors ${
                          previewTab === 'text'
                            ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        📄 Plain Text
                      </button>
                    </div>
                  </div>
                )}
                <div className="p-5 min-h-[160px] text-sm text-slate-800">
                  {currentRecipient.previewBodyHtml && previewTab === 'html' ? (
                    <div
                      className="email-html-preview max-w-full overflow-x-auto"
                      dangerouslySetInnerHTML={{ __html: currentRecipient.previewBodyHtml }}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap leading-relaxed font-sans text-slate-800">
                      {currentRecipient.previewBodyText}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Searchable Recipient Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">All Recipients ({recipients.length})</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Toggle exclusions, review validation reasons, or edit details to resolve missing placeholders.
              </p>
            </div>

            <div className="flex items-center space-x-3">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search recipients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 w-48"
                />
              </div>

              {/* Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Records</option>
                <option value="READY">Ready Only</option>
                <option value="EXCLUDED">Excluded Only</option>
                <option value="REJECTED">Rejected Only</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-bold text-slate-600 uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="px-4 py-3">Row</th>
                  <th className="px-4 py-3">Recipient Name</th>
                  <th className="px-4 py-3">Email Address</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Job Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRecipients.map((r) => {
                  const isCurrent = recipients[currentIndex]?.id === r.id;

                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isCurrent ? 'bg-indigo-50/40 font-medium' : ''
                      } ${r.isExcluded ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-slate-500">{r.rowNumber}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">{r.email || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.company || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.jobTitle || '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} size="sm" />
                        {r.rejectReason && (
                          <span className="block text-[10px] text-rose-600 truncate max-w-xs mt-0.5">
                            {r.rejectReason}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            const foundIdx = recipients.findIndex((item) => item.id === r.id);
                            if (foundIdx >= 0) setCurrentIndex(foundIdx);
                          }}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold"
                        >
                          Preview
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(r)}
                          className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold"
                        >
                          Edit Details
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleExclude(r.id)}
                          className={`px-2 py-1 rounded text-[11px] font-semibold ${
                            r.isExcluded
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                          }`}
                        >
                          {r.isExcluded ? 'Include' : 'Exclude'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Quick Credentials Setup Modal */}
      <Modal
        isOpen={isCredsModalOpen}
        onClose={() => setIsCredsModalOpen(false)}
        title="Paste Gmail SMTP Credentials"
        maxWidth="md"
      >
        <form onSubmit={handleSaveCredentials} className="space-y-4">
          <p className="text-xs text-slate-600">
            Paste your Gmail address and 16-character Google App Password below to send live emails directly from your account.
          </p>

          {credsError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{credsError}</span>
            </div>
          )}

          {credsSuccessMessage && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{credsSuccessMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Gmail Address <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              value={inputGmailUser}
              onChange={(e) => setInputGmailUser(e.target.value)}
              placeholder="e.g. yourname@gmail.com"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Google App Password (16 Chars) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={inputAppPassword}
                onChange={(e) => setInputAppPassword(e.target.value)}
                placeholder="e.g. abcd efgh ijkl mnop"
                className="w-full pl-3 pr-10 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 space-y-1">
            <p className="font-semibold text-slate-800">Need an App Password?</p>
            <p>1. Ensure 2-Step Verification is ON in your Google Account.</p>
            <p>2. Go to Google Account &gt; Security &gt; App passwords.</p>
            <p>3. Create an app password for ReachCraft and paste it above.</p>
          </div>

          <div className="pt-3 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsCredsModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingCreds || !inputGmailUser.trim() || !inputAppPassword.trim()}
              className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSavingCreds ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Verifying Connection...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  Save & Verify Connection
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit / Fill Recipient Details Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit / Fill Details for Row ${editingRecipient?.rowNumber || ''}`}
        maxWidth="md"
      >
        <form onSubmit={handleSaveRecipientDetails} className="space-y-4">
          <p className="text-xs text-slate-600">
            Paste or fill in missing information to eliminate highlighted placeholders in the personalized preview.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">First Name</label>
              <input
                type="text"
                value={editFields.firstName}
                onChange={(e) => setEditFields({ ...editFields, firstName: e.target.value })}
                placeholder="First Name"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Last Name</label>
              <input
                type="text"
                value={editFields.lastName}
                onChange={(e) => setEditFields({ ...editFields, lastName: e.target.value })}
                placeholder="Last Name"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              value={editFields.email}
              onChange={(e) => setEditFields({ ...editFields, email: e.target.value })}
              placeholder="user@example.com"
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Job Title</label>
              <input
                type="text"
                value={editFields.jobTitle}
                onChange={(e) => setEditFields({ ...editFields, jobTitle: e.target.value })}
                placeholder="Job Title / Position"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Company Name</label>
              <input
                type="text"
                value={editFields.company}
                onChange={(e) => setEditFields({ ...editFields, company: e.target.value })}
                placeholder="Company / Organization"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
            <input
              type="text"
              value={editFields.phone}
              onChange={(e) => setEditFields({ ...editFields, phone: e.target.value })}
              placeholder="+254 701 928871"
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="pt-3 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingRecipient}
              className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              <span>{isSavingRecipient ? 'Updating Preview...' : 'Save & Update Preview'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Test Email Modal */}
      <Modal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        title="Send Test Email (Approval Requirement)"
      >
        <form onSubmit={handleSendTestEmail} className="space-y-4">
          <p className="text-xs text-slate-600">
            Send a live test message to your personal email to verify template layout, formatting, and Gmail SMTP delivery.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Your Test Email Address <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              value={testEmailInput}
              onChange={(e) => setTestEmailInput(e.target.value)}
              placeholder="you@yourdomain.com"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          {testSuccessMessage && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{testSuccessMessage}</span>
            </div>
          )}

          <div className="pt-3 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsTestModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSendingTest || !testEmailInput.trim()}
              className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSendingTest ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Sending Test Email...
                </>
              ) : (
                <>
                  <Mail className="w-3.5 h-3.5 mr-1.5" />
                  Send Test Email
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* SEND Confirmation Approval Modal */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => setIsApproveModalOpen(false)}
        title="Authorize Campaign Launch"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-xs space-y-1">
            <p className="font-bold flex items-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Mandatory Safety Confirmation</span>
            </p>
            <p>
              You are about to queue <strong>{readyApprovedCount} authorized personalized emails</strong>. Each email will be sent sequentially with a {campaign?.sendDelayMs || 2000}ms delay to respect Gmail provider limits.
            </p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1">
            <p>
              <strong>Campaign:</strong> {campaign?.name}
            </p>
            <p>
              <strong>Approved Recipients:</strong> {readyApprovedCount} (Max 100 limit enforced)
            </p>
            <p>
              <strong>Test Email Verified:</strong> {campaign?.testEmailAddress}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Type <span className="font-mono text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">SEND</span> to confirm
              </label>
              <button
                type="button"
                onClick={() => setTypedConfirmation('SEND')}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 cursor-pointer"
              >
                Insert &quot;SEND&quot;
              </button>
            </div>
            <input
              type="text"
              value={typedConfirmation}
              onChange={(e) => setTypedConfirmation(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && typedConfirmation.trim().toUpperCase() === 'SEND' && !isApproving) {
                  e.preventDefault();
                  handleFinalApprove();
                }
              }}
              placeholder="SEND"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 font-mono text-sm uppercase tracking-wider focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              autoFocus
            />
          </div>

          <div className="pt-3 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsApproveModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFinalApprove}
              disabled={isApproving || typedConfirmation.trim().toUpperCase() !== 'SEND'}
              className="inline-flex items-center px-5 py-2.5 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all"
            >
              {isApproving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Starting Send Queue...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Confirm & Start Campaign
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
