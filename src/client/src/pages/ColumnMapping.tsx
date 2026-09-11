import React, { useEffect, useState } from 'react';
import { Columns, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, Download, RefreshCw, Layers, Sparkles, HelpCircle, Info } from 'lucide-react';
import { api, Campaign } from '../api/client.js';
import { Stepper } from '../components/Stepper.js';
import { StatusBadge } from '../components/StatusBadge.js';

interface ColumnMappingProps {
  campaignId: string;
  onNavigate: (page: string, campaignId?: string) => void;
}

export const ColumnMapping: React.FC<ColumnMappingProps> = ({ campaignId, onNavigate }) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState({
    email: '',
    firstName: '',
    lastName: '',
    company: '',
    phone: '',
    jobTitle: '',
  });
  const [dedupeStrategy, setDedupeStrategy] = useState<'keep_first' | 'remove_all_duplicates' | 'allow_all'>('keep_first');
  const [sampleRows, setSampleRows] = useState<Array<Record<string, string>>>([]);
  const [loading, setLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [validationSummary, setValidationSummary] = useState<{
    totalRows: number;
    readyCount: number;
    rejectedCount: number;
    duplicateCount: number;
    missingEmailCount: number;
    invalidEmailCount: number;
    missingRequiredCount: number;
    exceedsMaxRecipients: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [campaignId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getCampaign(campaignId);
      setCampaign(res.campaign);

      // Attempt to load detected columns and suggested mappings from uploaded file
      try {
        const uploadInfo = await api.getUploadInfo(campaignId);
        if (uploadInfo.columns && uploadInfo.columns.length > 0) {
          setDetectedColumns(uploadInfo.columns);
          if (uploadInfo.sampleRows) {
            setSampleRows(uploadInfo.sampleRows);
          }
          if (uploadInfo.suggestedMapping) {
            setMapping({
              email: uploadInfo.suggestedMapping.email || '',
              firstName: uploadInfo.suggestedMapping.firstName || '',
              lastName: uploadInfo.suggestedMapping.lastName || '',
              company: uploadInfo.suggestedMapping.company || '',
              phone: uploadInfo.suggestedMapping.phone || '',
              jobTitle: uploadInfo.suggestedMapping.jobTitle || '',
            });
          }
        }
      } catch {
        // Fallback: If recipients already exist, extract columns
        if (res.campaign.recipients && res.campaign.recipients.length > 0) {
          const colSet = new Set<string>(['Email address', 'First name', 'Last name', 'Phone number', 'Job title', 'Company name']);
          const first = res.campaign.recipients[0];
          if (first.customFields) {
            try {
              const parsed = JSON.parse(first.customFields);
              Object.keys(parsed).forEach((k) => colSet.add(k));
            } catch { /* ignore */ }
          }
          setDetectedColumns(Array.from(colSet));
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load campaign data.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyValidation = async () => {
    if (!mapping.email) {
      setError('Please select which column contains the recipient Email Address.');
      return;
    }

    try {
      setIsValidating(true);
      setError(null);

      const res = await api.applyMapping(campaignId, {
        mapping,
        dedupeOptions: { strategy: dedupeStrategy },
      });

      setValidationSummary(res.summary);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Validation failed.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleProceed = () => {
    if (!validationSummary) {
      setError('Please validate the mapping first before proceeding.');
      return;
    }
    if (validationSummary.readyCount === 0) {
      setError('Cannot proceed: No ready recipients found after validation.');
      return;
    }
    if (validationSummary.exceedsMaxRecipients) {
      setError('Cannot proceed: Total valid recipients exceeds 100 limit. Please filter your spreadsheet or exclude rows.');
      return;
    }
    onNavigate('template-editor', campaignId);
  };

  return (
    <div>
      <Stepper currentStep={2} onStepClick={(step) => {
        if (step === 1) onNavigate('new-campaign', campaignId);
      }} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-100 gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">Step 2: Column Mapping & Validation</h2>
              <p className="text-sm text-slate-500 mt-1">
                Map spreadsheet columns to campaign fields and define duplicate handling rules.
              </p>
            </div>
            {campaign?.originalFileName && (
              <div className="text-xs bg-slate-100 px-3 py-1.5 rounded-lg text-slate-700 font-mono border border-slate-200">
                File: {campaign.originalFileName} ({campaign.totalUploaded} rows)
              </div>
            )}
          </div>

          {error && (
            <div className="mt-6 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start space-x-2">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2 text-indigo-500" />
              <p className="text-sm">Loading spreadsheet headers...</p>
            </div>
          ) : (
            <div className="mt-6 space-y-8">
              {/* Detected Sample Preview */}
              {sampleRows.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Detected Spreadsheet Data (First Row Preview)</span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse bg-white rounded-lg overflow-hidden border border-slate-200">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          {detectedColumns.map((col) => (
                            <th key={col} className="px-3 py-2 border-r border-slate-200 last:border-0 whitespace-nowrap font-mono">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-100 text-slate-800">
                          {detectedColumns.map((col) => (
                            <td key={col} className="px-3 py-2 border-r border-slate-100 last:border-0 font-mono text-[11px] whitespace-nowrap">
                              {sampleRows[0][col] || '-'}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Section Explainer Banner */}
              <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs text-slate-700 space-y-2">
                <div className="flex items-center space-x-2 font-bold text-indigo-950 uppercase tracking-wider text-[11px]">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>What Should Appear in This Section?</span>
                </div>
                <p className="leading-relaxed">
                  This section links each column from your spreadsheet to the fields you can use in your email. 
                  ReachCraft has already <strong>auto-detected and pre-selected</strong> your columns based on your spreadsheet headers:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-medium text-slate-800">
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
                    <span className="text-indigo-600 font-bold block">1. Recipient Mailbox</span>
                    <span><strong>Email address</strong> &rarr; Where emails get delivered.</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
                    <span className="text-indigo-600 font-bold block">2. Personal Greeting</span>
                    <span><strong>First name</strong> &rarr; Used in greetings like <em>Hello Alfred,</em>.</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
                    <span className="text-indigo-600 font-bold block">3. Context Fields</span>
                    <span><strong>Job title</strong>, <strong>Company</strong>, <strong>Phone</strong> &rarr; Optional details.</span>
                  </div>
                </div>
                <p className="text-slate-500 text-[11px] pt-1">
                  If the dropdowns below match your columns, everything is good to go! Scroll down and click <strong>"Run Row Validation & Deduplication"</strong>.
                </p>
              </div>

              {/* Field Mapping Grid */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                    <Columns className="w-4 h-4 text-indigo-600" />
                    <span>Spreadsheet Column Connections</span>
                  </h3>
                  {detectedColumns.length > 0 && (
                    <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 font-semibold">
                      Auto-detected {detectedColumns.length} columns from spreadsheet
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Email (Required) */}
                  <div className="p-4 rounded-lg border-2 border-indigo-200 bg-indigo-50/40">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Email Address Column <span className="text-rose-500">* (Required)</span>
                      </label>
                      <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-bold">Mandatory</span>
                    </div>
                    {detectedColumns.length > 0 ? (
                      <select
                        value={mapping.email}
                        onChange={(e) => setMapping({ ...mapping, email: e.target.value })}
                        className="w-full px-3 py-2 rounded-md border border-indigo-300 text-sm font-semibold bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">-- Select Email Column --</option>
                        {detectedColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={mapping.email}
                        onChange={(e) => setMapping({ ...mapping, email: e.target.value })}
                        placeholder="e.g. Email address"
                        className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    )}
                    <p className="text-[11px] text-slate-600 mt-1.5">
                      <strong>What this does:</strong> Identifies which column contains each person's email address. Messages will be sent to this destination.
                    </p>
                  </div>

                  {/* First Name */}
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      First Name Column
                    </label>
                    {detectedColumns.length > 0 ? (
                      <select
                        value={mapping.firstName}
                        onChange={(e) => setMapping({ ...mapping, firstName: e.target.value })}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">-- Do not map --</option>
                        {detectedColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={mapping.firstName}
                        onChange={(e) => setMapping({ ...mapping, firstName: e.target.value })}
                        placeholder="e.g. First name"
                        className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    )}
                    <p className="text-[11px] text-slate-600 mt-1.5">
                      <strong>What this does:</strong> Used in greetings like <code className="text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded font-mono">Hello {"{{first name}}"},</code> to personalize each email.
                    </p>
                  </div>

                  {/* Last Name */}
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Last Name Column
                    </label>
                    {detectedColumns.length > 0 ? (
                      <select
                        value={mapping.lastName}
                        onChange={(e) => setMapping({ ...mapping, lastName: e.target.value })}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">-- Do not map --</option>
                        {detectedColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={mapping.lastName}
                        onChange={(e) => setMapping({ ...mapping, lastName: e.target.value })}
                        placeholder="e.g. Last name"
                        className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    )}
                    <p className="text-[11px] text-slate-600 mt-1.5">
                      <strong>What this does:</strong> The recipient's surname or family name (available as <code className="text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded font-mono">{"{{last name}}"}</code>).
                    </p>
                  </div>

                  {/* Job Title */}
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Job Title Column
                    </label>
                    {detectedColumns.length > 0 ? (
                      <select
                        value={mapping.jobTitle}
                        onChange={(e) => setMapping({ ...mapping, jobTitle: e.target.value })}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">-- Do not map --</option>
                        {detectedColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={mapping.jobTitle}
                        onChange={(e) => setMapping({ ...mapping, jobTitle: e.target.value })}
                        placeholder="e.g. Job title"
                        className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    )}
                    <p className="text-[11px] text-slate-600 mt-1.5">
                      <strong>What this does:</strong> The person's professional title or role (available as <code className="text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded font-mono">{"{{job title}}"}</code>).
                    </p>
                  </div>

                  {/* Company */}
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Company Name Column
                    </label>
                    {detectedColumns.length > 0 ? (
                      <select
                        value={mapping.company}
                        onChange={(e) => setMapping({ ...mapping, company: e.target.value })}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">-- Do not map --</option>
                        {detectedColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={mapping.company}
                        onChange={(e) => setMapping({ ...mapping, company: e.target.value })}
                        placeholder="e.g. Company name"
                        className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    )}
                    <p className="text-[11px] text-slate-600 mt-1.5">
                      <strong>What this does:</strong> The organization or company name (available as <code className="text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded font-mono">{"{{company name}}"}</code>).
                    </p>
                  </div>

                  {/* Phone */}
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Phone Number Column
                    </label>
                    {detectedColumns.length > 0 ? (
                      <select
                        value={mapping.phone}
                        onChange={(e) => setMapping({ ...mapping, phone: e.target.value })}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">-- Do not map --</option>
                        {detectedColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={mapping.phone}
                        onChange={(e) => setMapping({ ...mapping, phone: e.target.value })}
                        placeholder="e.g. Phone number"
                        className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    )}
                    <p className="text-[11px] text-slate-600 mt-1.5">
                      <strong>What this does:</strong> The recipient's phone number (available as <code className="text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded font-mono">{"{{phone number}}"}</code>).
                    </p>
                  </div>
                </div>
              </div>

              {/* Deduplication Strategy Selection */}
              <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="mb-3">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-slate-600" />
                    <span>Duplicate Email Resolution Strategy</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Controls what happens if the same email address appears on multiple rows in your spreadsheet. 
                    <strong>"Keep First Record"</strong> ensures no one receives repeated messages.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <label
                    className={`flex items-start p-3.5 rounded-lg border cursor-pointer transition-all ${
                      dedupeStrategy === 'keep_first'
                        ? 'border-indigo-600 bg-white ring-2 ring-indigo-50 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dedupe"
                      checked={dedupeStrategy === 'keep_first'}
                      onChange={() => setDedupeStrategy('keep_first')}
                      className="mt-1 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="ml-3">
                      <p className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                        <span>Keep First Record</span>
                        <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded font-bold">Standard</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Guarantees no repeated emails. Keeps the 1st row and drops repeated duplicates.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start p-3.5 rounded-lg border cursor-pointer transition-all ${
                      dedupeStrategy === 'allow_all'
                        ? 'border-emerald-600 bg-emerald-50/20 ring-2 ring-emerald-100'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dedupe"
                      checked={dedupeStrategy === 'allow_all'}
                      onChange={() => setDedupeStrategy('allow_all')}
                      className="mt-1 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="ml-3">
                      <p className="text-sm font-bold text-slate-900 flex items-center space-x-1">
                        <span>Allow All Rows</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Sends to every row without deduplication, even if the same email appears multiple times.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start p-3.5 rounded-lg border cursor-pointer transition-all ${
                      dedupeStrategy === 'remove_all_duplicates'
                        ? 'border-indigo-600 bg-white ring-2 ring-indigo-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dedupe"
                      checked={dedupeStrategy === 'remove_all_duplicates'}
                      onChange={() => setDedupeStrategy('remove_all_duplicates')}
                      className="mt-1 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="ml-3">
                      <p className="text-sm font-bold text-slate-900">Remove All Duplicates</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Excludes any email that appears more than once anywhere in the spreadsheet.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Validate Trigger Button */}
              <div>
                <button
                  type="button"
                  onClick={handleApplyValidation}
                  disabled={isValidating || !mapping.email}
                  className="w-full py-3 px-4 border border-indigo-600 rounded-lg text-sm font-bold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 transition-colors flex items-center justify-center space-x-2"
                >
                  <CheckCircle2 className={`w-4 h-4 ${isValidating ? 'animate-spin' : ''}`} />
                  <span>{isValidating ? 'Validating Spreadsheet Rows...' : 'Run Row Validation & Deduplication'}</span>
                </button>
              </div>

              {/* Validation Summary Card */}
              {validationSummary && (
                <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-slate-900">Validation Results</h4>
                    <span className="text-xs text-slate-500 font-mono">
                      {validationSummary.readyCount} / {validationSummary.totalRows} Ready
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <p className="text-xs font-semibold text-emerald-800">Ready to Send</p>
                      <p className="text-xl font-black text-emerald-700 mt-0.5">{validationSummary.readyCount}</p>
                    </div>

                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-xs font-semibold text-amber-800">Duplicates</p>
                      <p className="text-xl font-black text-amber-700 mt-0.5">{validationSummary.duplicateCount}</p>
                    </div>

                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                      <p className="text-xs font-semibold text-rose-800">Invalid / Missing</p>
                      <p className="text-xl font-black text-rose-700 mt-0.5">
                        {validationSummary.invalidEmailCount + validationSummary.missingEmailCount}
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <p className="text-xs font-semibold text-slate-700">Total Rejected</p>
                      <p className="text-xl font-black text-slate-800 mt-0.5">{validationSummary.rejectedCount}</p>
                    </div>
                  </div>

                  {validationSummary.rejectedCount > 0 && (
                    <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <p className="text-xs text-slate-600 font-medium">
                        {validationSummary.duplicateCount > 0 && dedupeStrategy === 'keep_first' ? (
                          <span className="text-emerald-700 font-semibold">
                            🛡️ Deduplication Active: {validationSummary.duplicateCount} duplicate rows filtered out so no recipient receives repeated emails.
                          </span>
                        ) : (
                          <span>Never invent or repair contact information automatically. All rejected rows are preserved.</span>
                        )}
                      </p>
                      <a
                        href={`/api/campaigns/${campaignId}/rejected/csv`}
                        download
                        className="inline-flex items-center text-xs font-bold text-indigo-600 hover:text-indigo-800 p-1.5 rounded hover:bg-indigo-50 shrink-0"
                      >
                        <Download className="w-3.5 h-3.5 mr-1" />
                        Download Rejected Rows (.CSV)
                      </a>
                    </div>
                  )}

                  {validationSummary.exceedsMaxRecipients && (
                    <div className="p-3 rounded-lg bg-rose-100 border border-rose-300 text-rose-800 text-xs font-bold flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>
                        Campaign contains {validationSummary.readyCount} ready recipients, exceeding the hard 100 maximum!
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Navigation */}
              <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onNavigate('new-campaign', campaignId)}
                  className="inline-flex items-center px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </button>

                <button
                  type="button"
                  onClick={handleProceed}
                  disabled={!validationSummary || validationSummary.readyCount === 0 || validationSummary.exceedsMaxRecipients}
                  className="inline-flex items-center px-6 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <span>Continue to Template Editor</span>
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
