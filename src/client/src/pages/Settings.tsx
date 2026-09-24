import React, { useEffect, useState } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Trash2,
  RefreshCw,
  Key,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
  Lock,
} from 'lucide-react';
import { api, SettingsResponse, SuppressionItem } from '../api/client.js';

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [suppressions, setSuppressions] = useState<SuppressionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [smtpResult, setSmtpResult] = useState<{ connected: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Credential Input Form State (placeholders on website)
  const [inputGmailUser, setInputGmailUser] = useState('');
  const [inputAppPassword, setInputAppPassword] = useState('');
  const [inputFromName, setInputFromName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Suppression list inputs
  const [newEmail, setNewEmail] = useState('');
  const [newReason, setNewReason] = useState('');

  useEffect(() => {
    loadSettingsAndSuppression();
  }, []);

  const loadSettingsAndSuppression = async () => {
    try {
      setLoading(true);
      setError(null);
      const [sRes, supRes] = await Promise.all([
        api.getSettings(),
        api.getSuppressions(),
      ]);
      setSettings(sRes);
      setSuppressions(supRes.suppressions);
      if (sRes.defaultFromName) {
        setInputFromName(sRes.defaultFromName);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputGmailUser.trim() || !inputAppPassword.trim()) {
      setError('Please provide both your Gmail address and 16-character App Password.');
      return;
    }

    try {
      setSavingCreds(true);
      setError(null);
      setSuccessMessage(null);
      setSmtpResult(null);

      const res = await api.saveCredentials({
        gmailUser: inputGmailUser.trim(),
        gmailAppPassword: inputAppPassword.trim(),
        defaultFromName: inputFromName.trim() || undefined,
      });

      setSmtpResult({
        connected: res.connected,
        message: res.message,
      });

      // Clear password from form state for security
      setInputAppPassword('');

      if (res.connected) {
        setSuccessMessage('Credentials saved and Gmail SMTP verified successfully!');
      } else {
        setError(`Credentials saved, but verification failed: ${res.message}`);
      }

      await loadSettingsAndSuppression();
      window.dispatchEvent(new Event('smtp-settings-updated'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials.');
    } finally {
      setSavingCreds(false);
    }
  };

  const handleClearCredentials = async () => {
    if (!window.confirm('Are you sure you want to clear your saved credentials and revert to Mock Mode?')) {
      return;
    }
    try {
      setError(null);
      await api.clearCredentials();
      setInputGmailUser('');
      setInputAppPassword('');
      setSmtpResult(null);
      setSuccessMessage('Credentials removed successfully. Reverted to Mock Mode.');
      await loadSettingsAndSuppression();
      window.dispatchEvent(new Event('smtp-settings-updated'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to clear credentials.');
    }
  };

  const handleVerifySmtp = async () => {
    try {
      setVerifying(true);
      setSmtpResult(null);
      const res = await api.verifySmtp();
      setSmtpResult(res);
    } catch (err: unknown) {
      setSmtpResult({
        connected: false,
        message: err instanceof Error ? err.message : 'SMTP verification failed.',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleAddSuppression = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    try {
      setError(null);
      const res = await api.addSuppression(newEmail.trim(), newReason.trim() || 'Manual entry');
      setSuppressions((prev) => [res.suppression, ...prev]);
      setNewEmail('');
      setNewReason('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add suppression.');
    }
  };

  const handleRemoveSuppression = async (id: string, email: string) => {
    if (!window.confirm(`Remove ${email} from the suppression list? Future campaigns will be permitted to send to this address.`)) {
      return;
    }
    try {
      await api.removeSuppression(id);
      setSuppressions((prev) => prev.filter((s) => s.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to remove suppression.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Settings & SMTP Configuration</h1>
        <p className="text-sm text-slate-500 mt-1">
          Paste your Gmail credentials directly into the fields below, verify connectivity, and manage suppressions.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Interactive Credential Paste Form Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Enter / Paste Gmail SMTP Credentials</h2>
              <p className="text-xs text-slate-500">
                Paste your credentials directly into the fields below. Values are securely encrypted on your local server.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {settings?.isAppPasswordConfigured && (
              <button
                type="button"
                onClick={handleClearCredentials}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
              >
                Clear Credentials
              </button>
            )}
            <button
              type="button"
              onClick={handleVerifySmtp}
              disabled={verifying}
              className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${verifying ? 'animate-spin' : ''}`} />
              <span>{verifying ? 'Testing...' : 'Test Connection'}</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveCredentials} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Gmail User */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Gmail Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                value={inputGmailUser}
                onChange={(e) => setInputGmailUser(e.target.value)}
                placeholder="e.g. yourname@gmail.com"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                required
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Currently configured: <strong className="text-slate-700 font-mono">{settings?.gmailUserMasked || 'None'}</strong>
              </p>
            </div>

            {/* Google App Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Google App Password (16 Characters) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={inputAppPassword}
                  onChange={(e) => setInputAppPassword(e.target.value)}
                  placeholder="e.g. abcd efgh ijkl mnop"
                  className="w-full pl-3.5 pr-10 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-indigo-500"
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
              <p className="text-[11px] text-slate-400 mt-1">
                Status: {settings?.isAppPasswordConfigured ? (
                  <span className="text-emerald-700 font-bold">Active & Configured</span>
                ) : (
                  <span className="text-amber-600 font-bold">Using Mock Transport</span>
                )}
              </p>
            </div>
          </div>

          {/* Sender Display Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Default Sender Display Name (Optional)
            </label>
            <input
              type="text"
              value={inputFromName}
              onChange={(e) => setInputFromName(e.target.value)}
              placeholder="e.g. Logistics Air Cargo Dispatch"
              className="w-full max-w-md px-3.5 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={savingCreds || !inputGmailUser.trim() || !inputAppPassword.trim()}
              className="inline-flex items-center px-5 py-2.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-50 transition-all"
            >
              {savingCreds ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                  Saving & Verifying...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 mr-2" />
                  Save Credentials & Verify Connection
                </>
              )}
            </button>
          </div>
        </form>

        {smtpResult && (
          <div
            className={`p-4 rounded-lg border text-xs flex items-start space-x-2.5 ${
              smtpResult.connected
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {smtpResult.connected ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">{smtpResult.connected ? 'SMTP Connection Succeeded' : 'SMTP Connection Failed'}</p>
              <p className="mt-0.5">{smtpResult.message}</p>
            </div>
          </div>
        )}

        {/* Google App Password Guide */}
        <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 text-xs text-indigo-950 space-y-1.5">
          <p className="font-bold text-indigo-900 flex items-center space-x-1.5">
            <Lock className="w-3.5 h-3.5 text-indigo-600" />
            <span>How to generate an App Password from Google:</span>
          </p>
          <ol className="list-decimal list-inside space-y-1 text-slate-700 pl-1">
            <li>Ensure <strong>2-Step Verification</strong> is ON for your Google Account.</li>
            <li>Visit <strong>Google Account &gt; Security &gt; 2-Step Verification &gt; App passwords</strong>.</li>
            <li>Type <code className="bg-white px-1 py-0.5 rounded border border-indigo-200 font-mono">ReachCraft</code> and click <strong>Create</strong>.</li>
            <li>Copy the 16-character code and paste it above.</li>
          </ol>
        </div>
      </div>

      {/* Global Suppression List Management */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
        <div className="pb-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Global Suppression List</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Suppressed addresses are automatically skipped during campaign dispatch. Addresses remain suppressed unless deliberately removed here.
          </p>
        </div>

        {/* Add Suppression Form */}
        <form onSubmit={handleAddSuppression} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="Reason (e.g. Unsubscribed, Opt-out request, Bounce)"
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            <span>Add Suppression</span>
          </button>
        </form>

        {/* Suppression Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 font-bold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Suppressed Email</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Date Added</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {suppressions.length > 0 ? (
                suppressions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-slate-800 font-semibold">{s.email}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.reason || 'Manual entry'}</td>
                    <td className="px-4 py-2.5 text-slate-400">{new Date(s.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveSuppression(s.id, s.email)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                        title="Remove suppression"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    No suppressed addresses currently registered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
