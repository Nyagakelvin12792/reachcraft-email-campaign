import React, { useEffect, useState } from 'react';
import { PlusCircle, Mail, Send, CheckCircle2, Clock, Trash2, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';
import { api, Campaign } from '../api/client.js';
import { StatusBadge } from '../components/StatusBadge.js';

interface DashboardProps {
  onNavigate: (page: string, campaignId?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getCampaigns();
      setCampaigns(res.campaigns);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load campaigns.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete campaign "${name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      setDeletingId(id);
      await api.deleteCampaign(id);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete campaign.');
    } finally {
      setDeletingId(null);
    }
  };

  const getCampaignAction = (campaign: Campaign) => {
    switch (campaign.status) {
      case 'DRAFT':
        return { label: 'Continue Upload', page: 'new-campaign' };
      case 'MAPPED':
        return { label: 'Configure Template', page: 'template-editor' };
      case 'CONFIGURED':
      case 'READY':
        return { label: 'Review & Approve', page: 'preview-approval' };
      case 'SENDING':
      case 'PAUSED':
        return { label: 'View Live Progress', page: 'sending-progress' };
      case 'COMPLETED':
      case 'CANCELLED':
      case 'FAILED':
        return { label: 'View Results & Report', page: 'campaign-results' };
      default:
        return { label: 'Open Campaign', page: 'preview-approval' };
    }
  };

  // Quick statistics
  const totalEmailsSent = campaigns.reduce((sum, c) => sum + (c.sendJob?.sentCount || 0), 0);
  const activeCampaigns = campaigns.filter((c) => c.status === 'SENDING' || c.status === 'PAUSED').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Campaign Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage personalized email campaigns sent via Gmail SMTP with persistent delivery gating.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={loadCampaigns}
            disabled={loading}
            className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            title="Refresh campaigns"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => onNavigate('new-campaign')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-semibold rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            New Campaign
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Campaigns</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{campaigns.length}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Send className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Emails Dispatched</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{totalEmailsSent}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Sending Jobs</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{activeCampaigns}</p>
          </div>
        </div>
      </div>

      {/* Campaign List */}
      <div className="mt-8">
        <h2 className="text-base font-bold text-slate-900 mb-4">All Campaigns</h2>

        {error && (
          <div className="mb-4 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2 text-indigo-500" />
            <p className="text-sm">Loading campaigns...</p>
          </div>
        )}

        {!loading && campaigns.length === 0 && (
          <div className="text-center py-16 px-4 bg-white rounded-xl border border-dashed border-slate-300">
            <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <Mail className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">No campaigns yet</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              Upload a spreadsheet with contacts, configure your template, preview personalized messages, and send.
            </p>
            <div className="mt-6">
              <button
                onClick={() => onNavigate('new-campaign')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-semibold rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
              >
                <PlusCircle className="w-4 h-4 mr-2" />
                Create First Campaign
              </button>
            </div>
          </div>
        )}

        {!loading && campaigns.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
            {campaigns.map((c) => {
              const action = getCampaignAction(c);
              const job = c.sendJob;

              return (
                <div key={c.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-base font-bold text-slate-900 truncate">{c.name}</h3>
                      <StatusBadge status={c.status} size="sm" />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      {c.originalFileName && (
                        <span>File: <strong className="text-slate-700 font-medium">{c.originalFileName}</strong></span>
                      )}
                      <span>Ready: <strong className="text-slate-700 font-medium">{c.readyCount}</strong></span>
                      {job && (
                        <span>
                          Sent: <strong className="text-emerald-700 font-medium">{job.sentCount}</strong> / {job.totalRecipients}
                        </span>
                      )}
                      <span>Created: {new Date(c.createdAt).toLocaleDateString()}</span>
                      {c.testEmailSentAt && (
                        <span className="text-indigo-600 flex items-center space-x-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Test Email Verified</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      onClick={() => onNavigate(action.page, c.id)}
                      className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                    >
                      <span>{action.label}</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </button>

                    <button
                      onClick={() => handleDelete(c.id, c.name)}
                      disabled={deletingId === c.id}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Delete Campaign"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
