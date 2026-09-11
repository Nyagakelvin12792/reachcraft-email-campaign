import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar.js';
import { Dashboard } from './pages/Dashboard.js';
import { NewCampaign } from './pages/NewCampaign.js';
import { ColumnMapping } from './pages/ColumnMapping.js';
import { TemplateEditor } from './pages/TemplateEditor.js';
import { PreviewApproval } from './pages/PreviewApproval.js';
import { SendingProgress } from './pages/SendingProgress.js';
import { CampaignResults } from './pages/CampaignResults.js';
import { Settings } from './pages/Settings.js';

const campaignPages = new Set([
  'column-mapping',
  'template-editor',
  'preview-approval',
  'sending-progress',
  'campaign-results',
]);
const validPages = new Set([
  'dashboard',
  'new-campaign',
  'settings',
  ...campaignPages,
]);

const readLocation = () => {
  const params = new URLSearchParams(window.location.search);
  const requestedPageParam = params.get('page') || 'dashboard';
  const requestedPage = validPages.has(requestedPageParam) ? requestedPageParam : 'dashboard';
  const campaignId = params.get('campaignId') || undefined;

  if (campaignPages.has(requestedPage) && !campaignId) {
    return { page: 'dashboard', campaignId: undefined };
  }

  return { page: requestedPage, campaignId };
};

export const App: React.FC = () => {
  const initialLocation = readLocation();
  const [currentPage, setCurrentPage] = useState<string>(initialLocation.page);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | undefined>(initialLocation.campaignId);

  useEffect(() => {
    const handlePopState = () => {
      const location = readLocation();
      setCurrentPage(location.page);
      setSelectedCampaignId(location.campaignId);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (page: string, campaignId?: string) => {
    const needsCampaign = campaignPages.has(page);
    const nextCampaignId = campaignId || (needsCampaign ? selectedCampaignId : undefined);
    const nextPage = needsCampaign && !nextCampaignId ? 'dashboard' : page;

    setSelectedCampaignId(campaignId || (needsCampaign ? selectedCampaignId : undefined));
    setCurrentPage(nextPage);

    const url = new URL(window.location.href);
    if (nextPage === 'dashboard') {
      url.searchParams.delete('page');
    } else {
      url.searchParams.set('page', nextPage);
    }
    if (nextCampaignId) {
      url.searchParams.set('campaignId', nextCampaignId);
    } else {
      url.searchParams.delete('campaignId');
    }

    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar currentPage={currentPage} onNavigate={handleNavigate} />

      <main className="flex-1 pb-16">
        {currentPage === 'dashboard' && <Dashboard onNavigate={handleNavigate} />}

        {currentPage === 'new-campaign' && (
          <NewCampaign campaignId={selectedCampaignId} onNavigate={handleNavigate} />
        )}

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
        ReachCraft &bull; Personalized Gmail campaigns &bull; Review every message before sending
      </footer>
    </div>
  );
};
