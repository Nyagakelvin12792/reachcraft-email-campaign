import React, { useEffect, useState } from 'react';
import { Mail, Settings, PlusCircle, ShieldCheck, ShieldAlert, LayoutDashboard } from 'lucide-react';
import { api, SettingsResponse } from '../api/client.js';

interface NavbarProps {
  currentPage: string;
  onNavigate: (page: string, campaignId?: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPage, onNavigate }) => {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);

  useEffect(() => {
    const refreshSettings = () => {
      api.getSettings()
        .then(setSettings)
        .catch((err) => console.error('Failed to fetch settings:', err));
    };

    refreshSettings();
    window.addEventListener('smtp-settings-updated', refreshSettings);
    return () => window.removeEventListener('smtp-settings-updated', refreshSettings);
  }, []);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <button
            onClick={() => onNavigate('dashboard')}
            className="flex items-center space-x-2 text-indigo-600 font-bold text-lg hover:opacity-90 transition-opacity"
          >
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm">
              <Mail className="w-5 h-5" />
            </div>
            <span className="tracking-tight text-slate-900 font-extrabold text-xl">Reach<span className="text-indigo-600">Craft</span></span>
          </button>

          <nav className="hidden md:flex space-x-1">
            <button
              onClick={() => onNavigate('dashboard')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                currentPage === 'dashboard'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => onNavigate('new-campaign')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                currentPage === 'new-campaign'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>New Campaign</span>
            </button>

            <button
              onClick={() => onNavigate('settings')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                currentPage === 'settings'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          {/* SMTP Status Indicator */}
          {settings && (
            <div className="hidden xl:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs">
              {settings.isAppPasswordConfigured && !settings.isMockMode ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-slate-700 font-medium">
                    Gmail SMTP: <span className="font-mono text-slate-900">{settings.gmailUserMasked}</span>
                  </span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-slate-700 font-medium">
                    SMTP: <span className="text-amber-700 font-semibold">Mock Mode</span>
                  </span>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => onNavigate('new-campaign')}
            className="inline-flex items-center px-3.5 py-1.5 border border-transparent text-sm font-semibold rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <PlusCircle className="w-4 h-4 mr-1.5" />
            Start Campaign
          </button>
        </div>
      </div>
    </header>
  );
};
