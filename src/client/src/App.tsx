import React, { useState } from 'react';
import { Navbar } from './components/Navbar.js';
import { Dashboard } from './pages/Dashboard.js';
import { NewCampaign } from './pages/NewCampaign.js';
import { ColumnMapping } from './pages/ColumnMapping.js';
import { TemplateEditor } from './pages/TemplateEditor.js';
import { PreviewApproval } from './pages/PreviewApproval.js';
import { SendingProgress } from './pages/SendingProgress.js';
import { CampaignResults } from './pages/CampaignResults.js';
import { Settings } from './pages/Settings.js';

export const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<string>('dashboard');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | undefined>(undefined);

  const handleNavigate = (page: string, campaignId?: string) => {
    if (campaignId) {
      setSelectedCampaignId(campaignId);
    }
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar currentPage={currentPage} onNavigate={handleNavigate} />

      <main className="flex-1 pb-16">
        {currentPage === 'dashboard' && <Dashboard onNavigate={handleNavigate} />}

        {currentPage === 'new-campaign' && <NewCampaign onNavigate={handleNavigate} />}

        {currentPage === 'column-mapping' && selectedCampaignId && (
          <ColumnMapping campaignId={selectedCampaignId} onNavigate={handleNavigate} />
        )}

        {currentPage === 'template-editor' && selectedCampaignId && (
          <TemplateEditor campaignId={selectedCampaignId} onNavigate={handleNavigate} />
        )}

        {currentPage === 'preview-approval' && selectedCampaignId && (
          <PreviewApproval campaignId={selectedCampaignId} onNavigate={handleNavigate} />
        )}

        {currentPage === 'sending-progress' && selectedCampaignId && (
          <SendingProgress campaignId={selectedCampaignId} onNavigate={handleNavigate} />
        )}

        {currentPage === 'campaign-results' && selectedCampaignId && (
          <CampaignResults campaignId={selectedCampaignId} onNavigate={handleNavigate} />
        )}

        {currentPage === 'settings' && <Settings />}
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        ReachCraft &bull; Secure Gmail SMTP Personalized Email Campaigns &bull; Max 100 Recipients per Campaign
      </footer>
    </div>
  );
};
