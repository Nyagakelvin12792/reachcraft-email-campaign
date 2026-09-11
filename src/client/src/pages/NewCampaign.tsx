import React, { useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, ArrowRight, CheckCircle2, Loader2, ClipboardPaste } from 'lucide-react';
import { api } from '../api/client.js';
import { Stepper } from '../components/Stepper.js';

interface NewCampaignProps {
  onNavigate: (page: string, campaignId?: string) => void;
}

export const NewCampaign: React.FC<NewCampaignProps> = ({ onNavigate }) => {
  const [name, setName] = useState('');
  const [sendDelayMs, setSendDelayMs] = useState(2000);
  const [inputMode, setInputMode] = useState<'upload' | 'paste'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      const ext = selected.name.split('.').pop()?.toLowerCase();
      if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
        setError('Only .csv, .xlsx, and .xls spreadsheet files are accepted.');
        return;
      }
      if (selected.size > 5 * 1024 * 1024) {
        setError('File exceeds 5MB size limit.');
        return;
      }
      setError(null);
      setFile(selected);
      if (!name) {
        // Auto-populate campaign name from file name
        setName(selected.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      }
    }
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

    try {
      setIsUploading(true);
      setError(null);

      // 1. Create Campaign
      const campaignRes = await api.createCampaign({
        name: name.trim(),
        sendDelayMs,
        optOutEnabled: true,
      });

      const campaignId = campaignRes.campaign.id;

      // 2. Upload file or process pasted spreadsheet data
      if (inputMode === 'paste') {
        await api.pasteSpreadsheetData(campaignId, pastedText, name.trim());
      } else if (file) {
        await api.uploadSpreadsheet(campaignId, file);
      }

      // 3. Navigate to Step 2: Column Mapping
      onNavigate('column-mapping', campaignId);
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
            <h2 className="text-xl font-black text-slate-900">Step 1: Upload Contact Spreadsheet</h2>
            <p className="text-sm text-slate-500 mt-1">
              Upload your customer or consignee spreadsheet (CSV or Excel). Max 100 authorized recipients.
            </p>
          </div>

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

            {/* Delay setting */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Dispatch Rate Throttle (Milliseconds per Email)
              </label>
              <div className="flex items-center space-x-3">
                <input
                  type="number"
                  min={500}
                  max={10000}
                  step={500}
                  value={sendDelayMs}
                  onChange={(e) => setSendDelayMs(Number(e.target.value))}
                  className="w-40 px-3.5 py-2 rounded-lg border border-slate-300 shadow-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
                <span className="text-xs text-slate-500">
                  (Recommended: 2,000 ms to protect Gmail account reputation and prevent quota tripwires)
                </span>
              </div>
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
                    onClick={() => setInputMode('paste')}
                    className={`px-3 py-1 rounded-md transition-all flex items-center space-x-1.5 ${
                      inputMode === 'paste'
                        ? 'bg-white text-indigo-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    <span>Paste Spreadsheet Data</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('upload')}
                    className={`px-3 py-1 rounded-md transition-all flex items-center space-x-1.5 ${
                      inputMode === 'upload'
                        ? 'bg-white text-indigo-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload File</span>
                  </button>
                </div>
              </div>

              {inputMode === 'paste' ? (
                <div className="space-y-2">
                  <textarea
                    rows={8}
                    value={pastedText}
                    onChange={(e) => {
                      setPastedText(e.target.value);
                      if (!name && e.target.value.trim()) {
                        setName(`Campaign - ${new Date().toLocaleDateString()}`);
                      }
                    }}
                    placeholder={`Paste spreadsheet rows directly from Excel, Google Sheets, or CSV here:\n\nFirst name\tLast name\tEmail address\tPhone number\tJob title\tCompany name\nAlfred\tOdhiambo\tsewedhunnes@gmail.com\t+254 701 928871\tSenior Moderator\tAspire Institute\n...`}
                    className="w-full p-3.5 font-mono text-xs rounded-xl border border-slate-300 shadow-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 leading-relaxed bg-slate-50/50"
                  />
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>💡 Tip: Select your table in Excel or Google Sheets, press <strong>Ctrl+C</strong> (or Cmd+C), and paste directly here.</span>
                    {pastedText.trim() && (
                      <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        ~{pastedText.trim().split('\n').length - 1} rows detected
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex justify-center px-6 pt-8 pb-8 border-2 border-slate-300 border-dashed rounded-xl hover:border-indigo-400 transition-colors bg-slate-50/50">
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
                      <div className="pt-2 flex items-center justify-center space-x-2 text-xs text-emerald-700 font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

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
                disabled={isUploading || (inputMode === 'upload' ? !file : !pastedText.trim()) || !name.trim()}
                className="inline-flex items-center px-6 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Parsing Spreadsheet...
                  </>
                ) : (
                  <>
                    <span>Continue to Column Mapping</span>
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
