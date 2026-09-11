import React, { useEffect, useState } from 'react';
import { Download, CheckCircle2, AlertTriangle, RotateCcw, ArrowLeft, RefreshCw, LayoutDashboard } from 'lucide-react';
import { api, Campaign } from '../api/client.js';
import { Stepper } from '../components/Stepper.js';
import { StatusBadge } from '../components/StatusBadge.js';

interface CampaignResultsProps {
  campaignId: string;
  onNavigate: (page: string, campaignId?: string) => void;
}

export const CampaignResults: React.FC<CampaignResultsProps> = ({ campaignId, onNavigate }) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadResults();
  }, [campaignId]);

  const loadResults = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getCampaign(campaignId);
      setCampaign(res.campaign);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load campaign results.');
    } finally {
      setLoading(false);
    }
  };

  const handleRetryFailed = async () => {
    try {
      setRetrying(true);
      const res = await api.retryFailed(campaignId);
      alert(res.message);
      onNavigate('sending-progress', campaignId);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to retry failed recipients.');
    } finally {
      setRetrying(false);
    }
  };

  const job = campaign?.sendJob;
  const sentCount = job?.sentCount || 0;
  const failedCount = job?.failedCount || 0;
  const skippedCount = job?.skippedCount || 0;
  const totalCount = job?.totalRecipients || campaign?.approvedCount || 0;

  return (
    <div>
      <Stepper
        currentStep={6}
        onStepClick={(step) => {
          if (step <= 5) onNavigate('sending-progress', campaignId);
        }}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-100 gap-4">
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-xl font-black text-slate-900">Step 6: Campaign Execution Report</h2>
                <StatusBadge status={campaign?.status || 'COMPLETED'} />
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Campaign: <strong>{campaign?.name}</strong> • Completed: {job?.completedAt ? new Date(job.completedAt).toLocaleString() : 'In progress'}
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <a
                href={`/api/campaigns/${campaignId}/report/csv`}
                download
                className="inline-flex items-center px-4 py-2 rounded-lg shadow-sm text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Final Report (CSV)
              </a>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Outcome Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-6">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Approved Queue</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{totalCount}</p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Delivered (Sent)</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">{sentCount}</p>
            </div>

            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-center">
              <p className="text-xs font-bold text-rose-700 uppercase tracking-wider">Failed Deliveries</p>
              <p className="text-2xl font-black text-rose-700 mt-1">{failedCount}</p>
            </div>

            <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-center">
              <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">Suppressed / Skipped</p>
              <p className="text-2xl font-black text-purple-700 mt-1">{skippedCount}</p>
            </div>
          </div>

          {/* Retry Action if failed */}
          {failedCount > 0 && (
            <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-amber-900">Retry Failed Recipients</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {failedCount} recipients failed to deliver due to temporary connection errors.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRetryFailed}
                disabled={retrying}
                className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Retry Failed Deliveries
              </button>
            </div>
          )}

          {/* Recipient Outcomes Table */}
          <div className="mt-8">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
              Recipient Delivery Breakdown
            </h3>

            <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-80">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 font-bold text-slate-600 uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="px-4 py-3">Row</th>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Delivered At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {campaign?.recipients?.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-slate-500">{r.rowNumber}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-700">{r.email || '—'}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={r.sentAt ? 'SENT' : r.status} size="sm" />
                        {r.rejectReason && (
                          <span className="block text-[10px] text-rose-600 truncate max-w-xs mt-0.5">
                            {r.rejectReason}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {r.sentAt ? new Date(r.sentAt).toLocaleTimeString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Return to Dashboard */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="inline-flex items-center px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Return to Dashboard
            </button>

            <a
              href={`/api/campaigns/${campaignId}/report/csv`}
              download
              className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Full Report (.CSV)
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
