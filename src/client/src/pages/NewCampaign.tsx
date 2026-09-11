import React, { useEffect, useMemo, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, ArrowRight, CheckCircle2, Loader2, ClipboardPaste, X, SlidersHorizontal } from 'lucide-react';
import { api } from '../api/client.js';
import { Stepper } from '../components/Stepper.js';

interface NewCampaignProps {
  campaignId?: string;
  onNavigate: (page: string, campaignId?: string) => void;
}

export const NewCampaign: React.FC<NewCampaignProps> = ({ campaignId, onNavigate }) => {
  const [name, setName] = useState('');
  const [sendDelayMs, setSendDelayMs] = useState(2000);
  const [inputMode, setInputMode] = useState<'upload' | 'paste'>('paste');
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [activeDraftId, setActiveDraftId] = useState<string | undefined>(campaignId);
  const [existingUploadName, setExistingUploadName] = useState<string | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pasteStats = useMemo(() => {
    const lines = pastedText.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const header = lines[0] || '';
    const delimiter = header.includes('\t') ? '\t' : ',';
    return {
      rows: Math.max(0, lines.length - 1),
      columns: header ? header.split(delimiter).length : 0,
    };
  }, [pastedText]);

  useEffect(() => {
    let cancelled = false;

    const loadDraft = async () => {
      if (!campaignId) {
        setActiveDraftId(undefined);
        setExistingUploadName(null);
        setName('');
        setSendDelayMs(2000);
        setFile(null);
        setPastedText('');
        setInputMode('paste');
        setError(null);
        return;
      }

      try {
        setIsLoadingDraft(true);
        setError(null);
        const { campaign } = await api.getCampaign(campaignId);
        if (cancelled) return;

        if (campaign.status !== 'DRAFT') {
          onNavigate('dashboard');
          return;
        }

        setActiveDraftId(campaign.id);
        setName(campaign.name);
        setSendDelayMs(campaign.sendDelayMs);

        try {
          const upload = await api.getUploadInfo(campaign.id);
          if (!cancelled) setExistingUploadName(upload.fileName);
        } catch {
          if (!cancelled) setExistingUploadName(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to resume this draft campaign.');
        }
      } finally {
        if (!cancelled) setIsLoadingDraft(false);
      }
    };

    loadDraft();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const selectFile = (selected: File) => {
    const ext = selected.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
      setFile(null);
      setError('Choose a CSV, XLSX, or XLS spreadsheet.');
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setFile(null);
      setError('Choose a spreadsheet smaller than 5 MB.');
      return;
    }

    setError(null);
    setFile(selected);
    if (!name) {
      setName(selected.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      selectFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) selectFile(droppedFile);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a name for this campaign.');
      return;
    }
    if (inputMode === 'upload' && !file) {
      setError('Please select a spreadsheet file (.csv, .xlsx, .xls) to upload.');
      return;
    }
    if (inputMode === 'paste' && !pastedText.trim()) {
      setError('Please paste your spreadsheet data (copy rows from Excel, Google Sheets, or CSV).');
      return;
    }
    if (inputMode === 'paste' && pasteStats.rows === 0) {
      setError('The pasted data needs one header row and at least one contact row.');
      return;
    }
    if (inputMode === 'paste' && pasteStats.rows > 100) {
      setError(`This campaign has ${pasteStats.rows} contact rows. Keep each campaign to 100 contacts or fewer.`);
      return;
    }

    try {
      setIsUploading(true);
      setError(null);

      let campaignIdToUse = activeDraftId;
      if (campaignIdToUse) {
        await api.updateCampaign(campaignIdToUse, {
          name: name.trim(),
          sendDelayMs,
        });
      } else {
        const campaignRes = await api.createCampaign({
          name: name.trim(),
          sendDelayMs,
          optOutEnabled: true,
        });
        campaignIdToUse = campaignRes.campaign.id;
        setActiveDraftId(campaignIdToUse);
        onNavigate('new-campaign', campaignIdToUse);
      }

      if (inputMode === 'paste') {
        await api.pasteSpreadsheetData(campaignIdToUse, pastedText, name.trim());
      } else if (file) {
        await api.uploadSpreadsheet(campaignIdToUse, file);
      }

      onNavigate('column-mapping', campaignIdToUse);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign and process spreadsheet data.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      <Stepper currentStep={1} />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8">
          <div className="border-b border-slate-100 pb-5 mb-6">
            <h2 className="text-xl font-black text-slate-900">Step 1: Add Your Contacts</h2>
            <p className="text-sm text-slate-500 mt-1">
              Paste rows from your spreadsheet or upload the file. You will review every contact before sending.
            </p>
          </div>

          {isLoadingDraft && (
            <div className="mb-6 p-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-sm flex items-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Loading your saved draft...</span>
            </div>
          )}

          {activeDraftId && !isLoadingDraft && (
            <div className="mb-6 p-4 rounded-lg bg-indigo-50 border border-indigo-200 text-sm flex items-start justify-between gap-4">
              <div>
                <p className="font-bold text-indigo-950">Draft campaign resumed</p>
                <p className="text-indigo-800 mt-0.5">
                  {existingUploadName
                    ? `${existingUploadName} is still available. Continue with those contacts or replace them below.`
                    : 'Add the contacts below. Retrying will update this draft instead of creating a duplicate.'}
                </p>
              </div>
              {existingUploadName && (
                <button
                  type="button"
                  onClick={() => onNavigate('column-mapping', activeDraftId)}
                  className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
                >
                  Continue
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Campaign Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Campaign Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dallas High-Value Freight Consignee Updates"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 shadow-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                required
              />
            </div>

            {/* Spreadsheet Input Method Switcher */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Spreadsheet Source <span className="text-rose-500">*</span>
                </label>
                <div className="flex space-x-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode('paste');
                      setError(null);
                    }}
                    className={`px-3 py-1 rounded-md transition-all flex items-center space-x-1.5 ${
                      inputMode === 'paste'
                        ? 'bg-white text-indigo-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    <span>Paste rows</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode('upload');
                      setError(null);
                    }}
                    className={`px-3 py-1 rounded-md transition-all flex items-center space-x-1.5 ${
                      inputMode === 'upload'
                        ? 'bg-white text-indigo-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload file</span>
                  </button>
                </div>
              </div>

              {inputMode === 'paste' ? (
                <div className="space-y-2">
                  <textarea
                    rows={9}
                    value={pastedText}
                    onChange={(e) => {
                      setPastedText(e.target.value);
                      if (!name && e.target.value.trim()) {
                        setName(`Campaign - ${new Date().toLocaleDateString()}`);
                      }
                    }}
                    placeholder={`Paste rows copied from Excel or Google Sheets here.\n\nFirst name\tLast name\tEmail address\tCompany name\nJane\tDoe\tjane@example.com\tExample Company`}
                    className="w-full p-3.5 font-mono text-xs rounded-xl border border-slate-300 shadow-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 leading-relaxed bg-slate-50/50"
                  />
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                    <span>Include the header row. ReachCraft will match the columns on the next screen.</span>
                    {pastedText.trim() && (
                      <span className={`font-semibold px-2 py-1 rounded border ${
                        pasteStats.rows > 100
                          ? 'text-rose-700 bg-rose-50 border-rose-200'
                          : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      }`}>
                        {pasteStats.rows} contacts, {pasteStats.columns} columns
                      </span>
                    )}
                  </div>
                  {pasteStats.rows > 100 && (
                    <p className="text-xs font-semibold text-rose-700">
                      Remove {pasteStats.rows - 100} contact rows before continuing. The limit is 100 contacts per campaign.
                    </p>
                  )}
                </div>
              ) : (
                <div
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`mt-1 flex justify-center px-6 pt-8 pb-8 border-2 border-dashed rounded-xl transition-colors ${
                    isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50'
                  }`}
                >
                  <div className="space-y-3 text-center">
                    <div className="mx-auto w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      {file ? <FileSpreadsheet className="w-6 h-6 text-emerald-600" /> : <Upload className="w-6 h-6" />}
                    </div>

                    <div className="flex text-sm text-slate-600 justify-center">
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer bg-white rounded-md font-semibold text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500 px-2 py-1 shadow-xs border border-slate-200"
                      >
                        <span>Choose spreadsheet</span>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                          className="sr-only"
                          onChange={handleFileChange}
                        />
                      </label>
                      <p className="pl-2 pt-1 text-xs text-slate-500">or drag and drop</p>
                    </div>
                    <p className="text-xs text-slate-400">CSV, XLSX, XLS up to 5MB (Max 100 rows per campaign)</p>

                    {file && (
                      <div className="pt-2 flex items-center justify-center gap-2 text-xs text-emerald-700 font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                        <button
                          type="button"
                          onClick={() => setFile(null)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          aria-label="Remove selected file"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <details className="rounded-xl border border-slate-200 bg-slate-50/60">
              <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-sm font-semibold text-slate-700">
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-slate-500" />
                  Sending pace
                </span>
                <span className="text-xs font-normal text-slate-500">{sendDelayMs / 1000} seconds between emails</span>
              </summary>
              <div className="px-4 pb-4 pt-1 border-t border-slate-200">
                <label className="block text-xs font-bold text-slate-700 mb-2" htmlFor="send-delay">
                  Delay between emails
                </label>
                <select
                  id="send-delay"
                  value={sendDelayMs}
                  onChange={(e) => setSendDelayMs(Number(e.target.value))}
                  className="w-full sm:w-64 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value={1000}>1 second</option>
                  <option value={2000}>2 seconds, recommended</option>
                  <option value={3000}>3 seconds</option>
                  <option value={5000}>5 seconds</option>
                </select>
                <p className="text-xs text-slate-500 mt-2">A two-second pause is selected by default.</p>
              </div>
            </details>

            {/* Action Bar */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isUploading || isLoadingDraft || (inputMode === 'upload' ? !file : !pastedText.trim() || pasteStats.rows === 0 || pasteStats.rows > 100) || !name.trim()}
                className="inline-flex items-center px-6 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Parsing Spreadsheet...
                  </>
                ) : (
                  <>
                    <span>Review Columns</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
