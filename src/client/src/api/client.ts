export interface Campaign {
  id: string;
  name: string;
  status: 'DRAFT' | 'MAPPED' | 'CONFIGURED' | 'READY' | 'SENDING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  originalFileName?: string | null;
  maxRecipients: number;
  totalUploaded: number;
  readyCount: number;
  rejectedCount: number;
  excludedCount: number;
  approvedCount: number;
  testEmailAddress?: string | null;
  testEmailSentAt?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  sendDelayMs: number;
  optOutEnabled: boolean;
  optOutText: string;
  createdAt: string;
  updatedAt: string;
  template?: Template;
  sendJob?: SendJob;
  recipients?: Recipient[];
}

export interface Recipient {
  id: string;
  campaignId: string;
  rowNumber: number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  awb?: string | null;
  destination?: string | null;
  customFields?: string | null;
  status: 'READY' | 'MISSING_EMAIL' | 'INVALID_EMAIL' | 'DUPLICATE' | 'MISSING_REQUIRED' | 'EXCLUDED' | 'SUPPRESSED' | 'FAILED';
  rejectReason?: string | null;
  isExcluded: boolean;
  previewSubject?: string | null;
  previewBodyText?: string | null;
  previewBodyHtml?: string | null;
  missingPlaceholders?: string | null;
  sentAt?: string | null;
}

export interface Template {
  id?: string;
  campaignId?: string;
  senderName?: string | null;
  replyTo?: string | null;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  signature?: string | null;
}

export interface SendJob {
  id: string;
  campaignId: string;
  status: 'QUEUED' | 'RUNNING' | 'PAUSED' | 'CANCELLED' | 'COMPLETED' | 'FAILED';
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt?: string | null;
  pausedAt?: string | null;
  completedAt?: string | null;
  lastError?: string | null;
}

export interface SendAttempt {
  id: string;
  campaignId: string;
  recipientId: string;
  maskedEmail: string;
  attemptNumber: number;
  status: string;
  smtpResponseCategory?: string | null;
  smtpCode?: number | null;
  responseMessage?: string | null;
  failureReason?: string | null;
  timestamp: string;
}

export interface ProgressMetrics {
  totalRecipients: number;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
  percentageComplete: number;
  estimatedSecondsRemaining: number;
}

export interface ProgressResponse {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  jobStatus: string;
  metrics: ProgressMetrics;
  recentAttempts: SendAttempt[];
}

export interface SettingsResponse {
  gmailUserMasked: string;
  isAppPasswordConfigured: boolean;
  isMockMode: boolean;
  defaultFromName: string;
  sendDelayMs: number;
  maxRetries: number;
  maxRecipients: number;
  environment: string;
}

export interface SuppressionItem {
  id: string;
  email: string;
  reason?: string | null;
  createdAt: string;
}

const BASE_URL = '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    let errorMsg = data.error || 'An error occurred during request.';
    if (data.details && typeof data.details === 'object') {
      const fieldDetails = Object.entries(data.details)
        .map(([field, errs]) => `${field}: ${Array.isArray(errs) ? errs.join(', ') : errs}`)
        .join('; ');
      if (fieldDetails) {
        errorMsg = `${errorMsg} (${fieldDetails})`;
      }
    }
    throw new Error(errorMsg);
  }
  return data;
}

export const api = {
  // Campaigns
  async getCampaigns(): Promise<{ campaigns: Campaign[] }> {
    return request('/campaigns');
  },

  async getCampaign(id: string): Promise<{ campaign: Campaign }> {
    return request(`/campaigns/${id}`);
  },

  async createCampaign(payload: { name: string; sendDelayMs?: number; optOutEnabled?: boolean; optOutText?: string }): Promise<{ campaign: Campaign }> {
    return request('/campaigns', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateCampaign(id: string, payload: { name?: string; sendDelayMs?: number }): Promise<{ campaign: Campaign }> {
    return request(`/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteCampaign(id: string): Promise<{ message: string }> {
    return request(`/campaigns/${id}`, { method: 'DELETE' });
  },

  // File upload & mapping
  async pasteSpreadsheetData(campaignId: string, rawText: string, fileName?: string): Promise<{
    fileName: string;
    columns: string[];
    suggestedMapping: Record<string, string>;
    totalRows: number;
    sampleRows: Array<Record<string, string>>;
  }> {
    return request(`/campaigns/${campaignId}/paste`, {
      method: 'POST',
      body: JSON.stringify({ rawText, fileName }),
    });
  },

  async uploadSpreadsheet(campaignId: string, file: File): Promise<{
    fileName: string;
    columns: string[];
    suggestedMapping: Record<string, string>;
    totalRows: number;
    sampleRows: Array<Record<string, string>>;
  }> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${BASE_URL}/campaigns/${campaignId}/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'File upload failed.');
    }
    return data;
  },

  async getUploadInfo(campaignId: string): Promise<{
    fileName: string;
    columns: string[];
    suggestedMapping: Record<string, string>;
    totalRows: number;
    sampleRows: Array<Record<string, string>>;
  }> {
    return request(`/campaigns/${campaignId}/upload`);
  },

  async applyMapping(
    campaignId: string,
    payload: {
      mapping: {
        email: string;
        firstName?: string;
        lastName?: string;
        company?: string;
        phone?: string;
        jobTitle?: string;
        awb?: string;
        destination?: string;
        requiredFields?: string[];
      };
      dedupeOptions: { strategy: 'remove_all_duplicates' | 'keep_first' | 'allow_all' };
    }
  ): Promise<{
    success: boolean;
    summary: {
      totalRows: number;
      readyCount: number;
      rejectedCount: number;
      duplicateCount: number;
      missingEmailCount: number;
      invalidEmailCount: number;
      missingRequiredCount: number;
      exceedsMaxRecipients: boolean;
    };
  }> {
    return request(`/campaigns/${campaignId}/map`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Templates
  async getTemplate(campaignId: string): Promise<{ template: Template | null }> {
    return request(`/campaigns/${campaignId}/template`);
  },

  async saveTemplate(campaignId: string, template: Template): Promise<{ template: Template }> {
    return request(`/campaigns/${campaignId}/template`, {
      method: 'PUT',
      body: JSON.stringify(template),
    });
  },

  async uploadTemplateImage(campaignId: string, file: File): Promise<{ url: string; fileName: string; size: number }> {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`/api/campaigns/${campaignId}/upload-image`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to upload image.');
    }
    return data;
  },

  async generatePreviews(campaignId: string): Promise<{
    success: boolean;
    totalPreviews: number;
    placeholdersUsed: string[];
    previews: Recipient[];
  }> {
    return request(`/campaigns/${campaignId}/preview`, { method: 'POST' });
  },

  // Exclusions
  async toggleExcludeRecipient(campaignId: string, recipientId: string): Promise<{ success: boolean; isExcluded: boolean }> {
    return request(`/campaigns/${campaignId}/recipients/${recipientId}/toggle-exclude`, { method: 'POST' });
  },

  async bulkExclude(campaignId: string, recipientIds: string[], isExcluded: boolean): Promise<{ success: boolean; count: number }> {
    return request(`/campaigns/${campaignId}/recipients/bulk-exclude`, {
      method: 'POST',
      body: JSON.stringify({ recipientIds, isExcluded }),
    });
  },

  // Test Email & Approval
  async sendTestEmail(campaignId: string, testEmail: string): Promise<{ success: boolean; message: string; testEmailAddress: string; testEmailSentAt: string }> {
    return request(`/campaigns/${campaignId}/test-email`, {
      method: 'POST',
      body: JSON.stringify({ testEmail }),
    });
  },

  async approveAndStart(campaignId: string, confirmationText: string): Promise<{ success: boolean; message: string; campaign: Campaign; sendJob: SendJob }> {
    return request(`/campaigns/${campaignId}/approve-and-start`, {
      method: 'POST',
      body: JSON.stringify({ confirmationText }),
    });
  },

  // Queue Controls
  async getProgress(campaignId: string): Promise<ProgressResponse> {
    return request(`/campaigns/${campaignId}/progress`);
  },

  async pauseCampaign(campaignId: string): Promise<{ success: boolean; message: string }> {
    return request(`/campaigns/${campaignId}/pause`, { method: 'POST' });
  },

  async resumeCampaign(campaignId: string): Promise<{ success: boolean; message: string }> {
    return request(`/campaigns/${campaignId}/resume`, { method: 'POST' });
  },

  async cancelCampaign(campaignId: string): Promise<{ success: boolean; message: string }> {
    return request(`/campaigns/${campaignId}/cancel`, { method: 'POST' });
  },

  async retryFailed(campaignId: string): Promise<{ success: boolean; message: string; retriedCount: number }> {
    return request(`/campaigns/${campaignId}/retry`, { method: 'POST' });
  },

  // Suppression
  async getSuppressions(): Promise<{ suppressions: SuppressionItem[] }> {
    return request('/suppression');
  },

  async addSuppression(email: string, reason?: string): Promise<{ suppression: SuppressionItem }> {
    return request('/suppression', {
      method: 'POST',
      body: JSON.stringify({ email, reason }),
    });
  },

  async removeSuppression(id: string): Promise<{ message: string }> {
    return request(`/suppression/${id}`, { method: 'DELETE' });
  },

  // Recipient detail updates (override / paste details to resolve missing placeholders)
  async updateRecipient(
    campaignId: string,
    recipientId: string,
    data: {
      email?: string;
      firstName?: string;
      lastName?: string;
      company?: string;
      phone?: string;
      jobTitle?: string;
      awb?: string;
      destination?: string;
    }
  ): Promise<{ success: boolean; recipient: Recipient }> {
    return request(`/campaigns/${campaignId}/recipients/${recipientId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Settings
  async getSettings(): Promise<SettingsResponse> {
    return request('/settings');
  },

  async verifySmtp(): Promise<{ connected: boolean; category?: string; message: string }> {
    return request('/settings/verify-smtp', { method: 'POST' });
  },

  async saveCredentials(payload: {
    gmailUser: string;
    gmailAppPassword: string;
    defaultFromName?: string;
  }): Promise<{
    success: boolean;
    connected: boolean;
    message: string;
    gmailUserMasked: string;
    isAppPasswordConfigured: boolean;
    isMockMode: boolean;
  }> {
    return request('/settings/credentials', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async clearCredentials(): Promise<{
    success: boolean;
    message: string;
    isAppPasswordConfigured: boolean;
    isMockMode: boolean;
    gmailUserMasked: string;
  }> {
    return request('/settings/credentials', { method: 'DELETE' });
  },
};
