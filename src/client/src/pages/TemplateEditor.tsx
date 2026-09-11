import React, { useEffect, useState, useRef } from 'react';
import {
  FileEdit,
  ArrowRight,
  ArrowLeft,
  Tag,
  Code,
  Eye,
  Save,
  AlertCircle,
  Sparkles,
  Wand2,
  Mail,
  CheckCircle2,
  Image as ImageIcon,
  Upload,
  X,
  Link as LinkIcon,
} from 'lucide-react';
import { api, Template, Campaign, Recipient } from '../api/client.js';
import { Stepper } from '../components/Stepper.js';
import { STRATHMORE_BODY_TEXT, STRATHMORE_MASTER_HTML } from '../constants/strathmoreTemplate.js';

interface TemplateEditorProps {
  campaignId: string;
  onNavigate: (page: string, campaignId?: string) => void;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({ campaignId, onNavigate }) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [sampleRecipient, setSampleRecipient] = useState<Recipient | null>(null);
  const [senderName, setSenderName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [signature, setSignature] = useState('');
  const [activeTab, setActiveTab] = useState<'text' | 'html'>('text');
  const [previewTab, setPreviewTab] = useState<'html' | 'text'>('html');
  const [availableTokens, setAvailableTokens] = useState<string[]>([
    'first name',
    'last name',
    'email address',
    'company name',
    'phone number',
    'job title',
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Image Inserter Modal State
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageMode, setImageMode] = useState<'upload' | 'url'>('upload');
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageAltInput, setImageAltInput] = useState('Strathmore University Business School');
  const [imagePlacement, setImagePlacement] = useState<'header' | 'inline' | 'footer'>('header');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const textRef = useRef<HTMLTextAreaElement>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [lastFocused, setLastFocused] = useState<'subject' | 'text' | 'html'>('text');

  useEffect(() => {
    loadTemplateData();
  }, [campaignId]);

  const loadTemplateData = async () => {
    try {
      const campRes = await api.getCampaign(campaignId);
      setCampaign(campRes.campaign);

      // Collect available columns from recipients if present
      if (campRes.campaign.recipients && campRes.campaign.recipients.length > 0) {
        const readyRec = campRes.campaign.recipients.find((r) => r.status === 'READY') || campRes.campaign.recipients[0];
        setSampleRecipient(readyRec);

        const tokens = new Set(availableTokens);
        if (readyRec.customFields) {
          try {
            const custom = JSON.parse(readyRec.customFields);
            Object.keys(custom).forEach((k) => {
              const cleaned = k.toLowerCase().trim();
              if (cleaned && !cleaned.startsWith('__empty')) {
                tokens.add(cleaned);
              }
            });
          } catch { /* ignore */ }
        }
        setAvailableTokens(Array.from(tokens));
      }

      const tempRes = await api.getTemplate(campaignId);
      if (tempRes.template && tempRes.template.subject) {
        setSenderName(tempRes.template.senderName || '');
        setReplyTo(tempRes.template.replyTo || '');
        setSubject(tempRes.template.subject || '');
        setBodyText(tempRes.template.bodyText || STRATHMORE_BODY_TEXT);
        setBodyHtml(tempRes.template.bodyHtml || STRATHMORE_MASTER_HTML);
        setSignature(tempRes.template.signature || '');
      } else {
        // Set friendly professional initial template draft matching the spreadsheet
        applyPreset('strathmore');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load template.');
    }
  };

  const generateHtmlFromBody = (text: string): string => {
    if (!text) return '';
    let html = text;
    // Replace markdown images ![Alt](url) and [Image: Alt - url]
    html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/api\/images\/[^\s)]+)\)/g, '<div style="text-align: center; margin: 18px 0;"><img src="$2" alt="$1" style="max-width: 100%; height: auto; border-radius: 6px; display: inline-block;" /></div>');
    html = html.replace(/\[Image:\s*([^\]-]+?)\s*-\s*(https?:\/\/[^\s\]]+|\/api\/images\/[^\s\]]+)\]/gi, '<div style="text-align: center; margin: 18px 0;"><img src="$2" alt="$1" style="max-width: 100%; height: auto; border-radius: 6px; display: inline-block;" /></div>');
    // Replace markdown links [Label](url) with styled <a>
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: #1d4ed8; text-decoration: underline; font-weight: 600;">$1</a>');
    // Replace standalone URLs not inside href with styled <a>
    html = html.replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer" style="color: #1d4ed8; text-decoration: underline;">$2</a>');
    // Replace standalone www. links
    html = html.replace(/(^|[\s(])(www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s)<]*)/g, '$1<a href="http://$2" target="_blank" rel="noopener noreferrer" style="color: #1d4ed8; text-decoration: underline;">$2</a>');
    // Split into paragraphs by double newlines
    const paragraphs = html.split(/\n\s*\n/);
    const formatted = paragraphs
      .map((para) => {
        const trimmed = para.trim();
        if (!trimmed) return '';
        if (trimmed === '---') {
          return '<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />';
        }
        const lines = trimmed.split('\n').join('<br />');
        return `<p style="margin: 0 0 14px 0; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #1e293b;">${lines}</p>`;
      })
      .filter(Boolean)
      .join('\n');

    return `<div style="max-width: 680px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; background-color: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0;">\n${formatted}\n</div>`;
  };

  const convertTextToHtml = () => {
    if (!bodyHtml || bodyHtml.trim().length === 0) {
      setBodyHtml(generateHtmlFromBody(bodyText));
    }
    setActiveTab('html');
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingImage(true);
      setImageError(null);
      const res = await api.uploadTemplateImage(campaignId, file);
      setImageUrlInput(res.url);
      if (!imageAltInput || imageAltInput === 'Strathmore University Business School') {
        setImageAltInput(file.name.replace(/\.[^/.]+$/, ''));
      }
    } catch (err: unknown) {
      setImageError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleInsertImage = () => {
    if (!imageUrlInput.trim()) {
      setImageError('Please choose an image file or paste an image URL.');
      return;
    }

    const url = imageUrlInput.trim();
    const alt = imageAltInput.trim() || 'Email Image';
    const imgHtml = `<div style="text-align: center; margin: 18px 0;"><img src="${url}" alt="${alt}" style="max-width: 100%; height: auto; border-radius: 6px; display: inline-block;" /></div>`;

    if (imagePlacement === 'header') {
      setBodyHtml((prev) => imgHtml + '\n' + (prev || generateHtmlFromBody(bodyText)));
      setBodyText((prev) => `[Image: ${alt} - ${url}]\n\n` + prev);
    } else if (imagePlacement === 'footer') {
      setBodyHtml((prev) => (prev || generateHtmlFromBody(bodyText)) + '\n' + imgHtml);
      setBodyText((prev) => prev + `\n\n[Image: ${alt} - ${url}]`);
    } else {
      if (activeTab === 'html' && htmlRef.current) {
        const start = htmlRef.current.selectionStart || 0;
        const end = htmlRef.current.selectionEnd || 0;
        setBodyHtml(bodyHtml.substring(0, start) + imgHtml + bodyHtml.substring(end));
      } else if (textRef.current) {
        const start = textRef.current.selectionStart || 0;
        const end = textRef.current.selectionEnd || 0;
        const tag = `[Image: ${alt} - ${url}]`;
        setBodyText(bodyText.substring(0, start) + tag + bodyText.substring(end));
      } else {
        setBodyText((prev) => prev + `\n\n[Image: ${alt} - ${url}]`);
      }
    }

    setIsImageModalOpen(false);
    setImageUrlInput('');
  };

  const renderInterpolatedPreview = (raw: string) => {
    if (!raw || !sampleRecipient) return raw;
    let res = raw;
    res = res.replace(/\{\{\s*first\s*name\s*\}\}/gi, sampleRecipient.firstName || '[First Name]');
    res = res.replace(/\{\{\s*(name|full\s*name|recipient)\s*\}\}/gi, `${sampleRecipient.firstName || ''} ${sampleRecipient.lastName || ''}`.trim() || '[Name]');
    res = res.replace(/\[\s*(first\s*name|name|recipient)\s*\]/gi, sampleRecipient.firstName || '[First Name]');
    res = res.replace(/\{\{\s*last\s*name\s*\}\}/gi, sampleRecipient.lastName || '[Last Name]');
    res = res.replace(/\[\s*last\s*name\s*\]/gi, sampleRecipient.lastName || '[Last Name]');
    res = res.replace(/\{\{\s*email(\s*address)?\s*\}\}/gi, sampleRecipient.email || '[Email]');
    res = res.replace(/\{\{\s*company(\s*name)?\s*\}\}/gi, sampleRecipient.company || '[Company]');
    res = res.replace(/\[\s*company(\s*name)?\s*\]/gi, sampleRecipient.company || '[Company]');
    res = res.replace(/\{\{\s*phone(\s*number)?\s*\}\}/gi, sampleRecipient.phone || '[Phone]');
    res = res.replace(/\{\{\s*job\s*title\s*\}\}/gi, sampleRecipient.jobTitle || '[Job Title]');

    if (sampleRecipient.customFields) {
      try {
        const custom = JSON.parse(sampleRecipient.customFields);
        for (const [k, v] of Object.entries(custom)) {
          const regex = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'gi');
          res = res.replace(regex, String(v || ''));
        }
      } catch { /* ignore */ }
    }
    return res;
  };

  const applyPreset = (presetType: 'strathmore' | 'professional' | 'webinar' | 'brief') => {
    if (presetType === 'strathmore') {
      const subjectLine = 'Invitation: Fiscal Decentralization Executive Programme for {{first name}}';
      setSubject(subjectLine);
      setBodyText(STRATHMORE_BODY_TEXT);
      setBodyHtml(STRATHMORE_MASTER_HTML);
      setSignature(''); // Signature is already embedded in the rich HTML and body text
      setSenderName('Strathmore University Business School');
      setReplyTo('smukami@strathmore.edu');
    } else if (presetType === 'webinar') {
      setSubject('Webinar Invitation for {{first name}} - {{company name}}');
      setBodyText(
        `Hello {{first name}},\n\nWe are pleased to invite you to our upcoming interactive webinar session.\n\nGiven your role as {{job title}} at {{company name}}, we believe this session will offer practical and high-value insights.\n\nPlease confirm your attendance by replying to this email, or reach our team at {{phone number}} if you have any questions.\n\nWarm regards,`
      );
      setSignature('Webinar Coordination Team\nReachCraft Platform');
    } else if (presetType === 'professional') {
      setSubject('Connecting with {{first name}} - {{company name}}');
      setBodyText(
        `Hello {{first name}} {{last name}},\n\nI hope this message finds you well.\n\nI am reaching out regarding your work as {{job title}} at {{company name}}.\n\nWe would appreciate the opportunity to connect with you. Please let us know when would be a convenient time for a brief discussion, or feel free to reply directly to this email or reach us at {{phone number}}.\n\nBest regards,`
      );
      setSignature('Executive Outreach Team\nReachCraft Platform');
    } else if (presetType === 'brief') {
      setSubject('Quick update for {{first name}}');
      setBodyText(
        `Hi {{first name}},\n\nJust reaching out to check in with you in your role at {{company name}}.\n\nLooking forward to speaking soon.\n\nBest regards,`
      );
      setSignature('Outreach Team');
    }
  };

  const insertAllTokens = () => {
    const allTokensText = availableTokens.map((t) => `{{${t}}}`).join(' ');
    if (lastFocused === 'subject' && subjectRef.current) {
      const start = subjectRef.current.selectionStart || 0;
      const end = subjectRef.current.selectionEnd || 0;
      setSubject(subject.substring(0, start) + allTokensText + subject.substring(end));
    } else if (textRef.current) {
      const start = textRef.current.selectionStart || 0;
      const end = textRef.current.selectionEnd || 0;
      setBodyText(bodyText.substring(0, start) + allTokensText + bodyText.substring(end));
    }
  };

  const insertToken = (token: string) => {
    const placeholder = `{{${token}}}`;

    if (lastFocused === 'subject' && subjectRef.current) {
      const start = subjectRef.current.selectionStart || 0;
      const end = subjectRef.current.selectionEnd || 0;
      const updated = subject.substring(0, start) + placeholder + subject.substring(end);
      setSubject(updated);
    } else if (lastFocused === 'html' && htmlRef.current) {
      const start = htmlRef.current.selectionStart || 0;
      const end = htmlRef.current.selectionEnd || 0;
      const updated = bodyHtml.substring(0, start) + placeholder + bodyHtml.substring(end);
      setBodyHtml(updated);
    } else if (textRef.current) {
      const start = textRef.current.selectionStart || 0;
      const end = textRef.current.selectionEnd || 0;
      const updated = bodyText.substring(0, start) + placeholder + bodyText.substring(end);
      setBodyText(updated);
    }
  };

  const handleBodyTextChange = (val: string) => {
    // Auto-normalize bracket placeholders like [Name] or [First Name] if pasted
    const normalized = val
      .replace(/\[\s*(first\s*name|name|recipient)\s*\]/gi, '{{first name}}')
      .replace(/\{\s*(first\s*name|name|recipient)\s*\}/gi, '{{first name}}')
      .replace(/\[\s*(company(\s*name)?)\s*\]/gi, '{{company name}}');
    setBodyText(normalized);
  };

  const formatGreetingWithName = () => {
    if (!bodyText.trim()) {
      setBodyText(`Hello {{first name}},\n\n`);
      return;
    }
    const greetingMatch = bodyText.match(/^(dear|hello|hi|hey|greetings)\s*([^,\n]*)([,!:]?)/i);
    if (greetingMatch) {
      const greetingWord = greetingMatch[1];
      const punctuation = greetingMatch[3] || ',';
      const rest = bodyText.replace(/^(dear|hello|hi|hey|greetings)\s*([^,\n]*)([,!:]?)/i, `${greetingWord} {{first name}}${punctuation}`);
      setBodyText(rest);
    } else {
      setBodyText(`Hello {{first name}},\n\n${bodyText}`);
    }
  };

  const handleSaveAndPreview = async () => {
    if (!subject.trim()) {
      setError('Subject line is required.');
      return;
    }
    if (!bodyText.trim()) {
      setError('Plain-text email body is required.');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      // 1. Save Template
      await api.saveTemplate(campaignId, {
        senderName: senderName.trim(),
        replyTo: replyTo.trim(),
        subject: subject.trim(),
        bodyText: bodyText.trim(),
        bodyHtml: bodyHtml.trim() ? bodyHtml.trim() : STRATHMORE_MASTER_HTML,
        signature: signature.trim() ? signature.trim() : null,
      });

      // 2. Generate Previews for all recipients
      await api.generatePreviews(campaignId);

      // 3. Move to Step 4: Preview & Approval
      onNavigate('preview-approval', campaignId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save template and generate previews.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <Stepper
        currentStep={3}
        onStepClick={(step) => {
          if (step === 1) onNavigate('new-campaign', campaignId);
          if (step === 2) onNavigate('column-mapping', campaignId);
        }}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-100 gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">Step 3: Master Email Template Configuration</h2>
              <p className="text-sm text-slate-600 mt-1">
                Author your master email template once using placeholder tokens. When sending, ReachCraft automatically generates an individual, personalized email for each recipient with their specific name, company, and details.
              </p>
            </div>
            {campaign && (
              <div className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg font-medium">
                Campaign: <strong>{campaign.name}</strong>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-6 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Automated Template Presets & Auto-Fill */}
          <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center space-x-2">
                <Wand2 className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Automate Placeholders & One-Click Presets
                </span>
              </div>
              <span className="text-[11px] text-indigo-700 bg-white/80 px-2.5 py-0.5 rounded-full border border-indigo-200 font-medium">
                Auto-merges spreadsheet columns per recipient
              </span>
            </div>
            <p className="text-xs text-slate-600 mb-3">
              Click a preset below to instantly populate your subject, body, and signature with mapped spreadsheet placeholders. ReachCraft will automatically personalize each email during sending.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPreset('strathmore')}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                <span>🏛️ Strathmore Executive Programme</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('webinar')}
                className="px-3 py-1.5 bg-white hover:bg-indigo-600 hover:text-white border border-indigo-300 rounded-lg text-xs font-semibold text-indigo-900 transition-all shadow-xs flex items-center space-x-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 hover:text-white" />
                <span>🎓 General Webinar Invitation</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('professional')}
                className="px-3 py-1.5 bg-white hover:bg-indigo-600 hover:text-white border border-indigo-300 rounded-lg text-xs font-semibold text-indigo-900 transition-all shadow-xs flex items-center space-x-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 hover:text-white" />
                <span>💼 Corporate Outreach</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('brief')}
                className="px-3 py-1.5 bg-white hover:bg-indigo-600 hover:text-white border border-indigo-300 rounded-lg text-xs font-semibold text-indigo-900 transition-all shadow-xs flex items-center space-x-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 hover:text-white" />
                <span>✉️ Quick Greeting</span>
              </button>
            </div>
          </div>

          {/* Token Pills Toolbar */}
          <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Tag className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Click to Insert Individual Placeholder Token</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Click any pill to insert it into your subject or body at the cursor position.
                </p>
              </div>
              <button
                type="button"
                onClick={insertAllTokens}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 bg-white border border-indigo-200 px-2.5 py-1 rounded hover:bg-indigo-50 transition-colors"
                title="Inserts all available column placeholder tokens at your cursor position"
              >
                <Sparkles className="w-3 h-3 text-indigo-500" />
                <span>Insert All Tokens at Cursor</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableTokens.map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => insertToken(token)}
                  className="px-2.5 py-1 bg-white hover:bg-indigo-50 border border-slate-300 hover:border-indigo-300 rounded-md text-xs font-mono text-slate-800 transition-colors shadow-2xs flex items-center space-x-1"
                >
                  <span className="text-indigo-600 font-bold">{`{{`}</span>
                  <span>{token}</span>
                  <span className="text-indigo-600 font-bold">{`}}`}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 space-y-6">
            {/* Sender and Reply-To */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Sender Display Name
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="e.g. Alfred Odhiambo / Webinar Team"
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  The name recipients see in their email inbox (e.g. your name or team name).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Reply-To Address
                </label>
                <input
                  type="email"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="e.g. webinar@yourdomain.com"
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Where responses will be sent when a recipient clicks "Reply".
                </p>
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Email Subject Line <span className="text-rose-500">*</span>
              </label>
              <input
                ref={subjectRef}
                type="text"
                value={subject}
                onFocus={() => setLastFocused('subject')}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Invitation for {{first name}} - {{company name}}"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-indigo-500"
                required
              />
              <p className="text-[11px] text-slate-500 mt-1">
                The subject line of the email. You can include personalizing tokens like <code className="text-indigo-700 font-mono">{"{{first name}}"}</code>.
              </p>
            </div>

            {/* Message Body Tabs */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2 mb-2 gap-2">
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('text')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center space-x-1.5 transition-colors ${
                      activeTab === 'text'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <FileEdit className="w-3.5 h-3.5" />
                    <span>Plain-Text Message (Required)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('html')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center space-x-1.5 transition-colors ${
                      activeTab === 'html'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>HTML Template (Optional)</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsImageModalOpen(true)}
                    className="text-xs font-bold text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-colors shadow-2xs"
                    title="Upload or link an image, banner, or university logo into your email"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-sky-600" />
                    <span>🖼️ Insert Image / Logo</span>
                  </button>

                  <button
                    type="button"
                    onClick={convertTextToHtml}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-colors shadow-2xs"
                    title="Converts markdown links [Text](url) and raw URLs into clickable HTML links and formats paragraphs"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Auto-Format HTML Links</span>
                  </button>

                  <button
                    type="button"
                    onClick={formatGreetingWithName}
                    className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-colors shadow-2xs"
                    title="Automatically adds or updates the greeting to address each recipient by name (e.g. Dear {{first name}},)"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Auto-Personalize Greeting with Name</span>
                  </button>
                </div>
              </div>

              {activeTab === 'text' ? (
                <div>
                  <textarea
                    ref={textRef}
                    rows={10}
                    value={bodyText}
                    onFocus={() => setLastFocused('text')}
                    onChange={(e) => handleBodyTextChange(e.target.value)}
                    placeholder="Dear {{first name}},&#10;&#10;Paste your message here..."
                    className="w-full p-3.5 rounded-lg border border-slate-300 text-sm font-sans focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    This message stays identical for everyone. Only <code className="text-indigo-700 font-mono">{"{{first name}}"}</code> will change to each person's real name.
                  </p>
                </div>
              ) : (
                <div>
                  <textarea
                    ref={htmlRef}
                    rows={10}
                    value={bodyHtml}
                    onFocus={() => setLastFocused('html')}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    placeholder="<div style='font-family: sans-serif;'><p>Dear <strong>{{first name}}</strong>,</p></div>"
                    className="w-full p-3.5 rounded-lg border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-indigo-500 leading-relaxed text-slate-800 bg-slate-900/5"
                  />
                </div>
              )}
            </div>

            {/* Email Signature */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Email Signature <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                <span className="text-[11px] text-slate-500 italic">Leave blank if your draft already includes your signature & contacts</span>
              </div>
              <textarea
                rows={3}
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder="Leave blank if your message above already contains your sign-off, address, or contact details..."
                className="w-full p-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 font-sans"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                <strong>Do you need this?</strong> Only if your message body above does not already end with a signature. If your email draft above already has contacts and address, leave this box completely empty so it doesn't repeat twice.
              </p>
            </div>
          </div>

          {/* Live Personalization Preview Card */}
          {sampleRecipient && (
            <div className="mt-6 p-5 rounded-xl border-2 border-emerald-300 bg-emerald-50/40">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center space-x-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Live Personalization Check — How Recipient #1 ({sampleRecipient.firstName || sampleRecipient.email}) Will See It</span>
                  </h4>
                </div>
                <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-semibold">
                  Each recipient automatically receives their own individual email
                </span>
              </div>

              <div className="bg-white rounded-lg border border-emerald-200 p-4 space-y-3 shadow-2xs text-sm">
                <div className="text-xs text-slate-600 pb-2.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <span className="text-slate-400 font-semibold uppercase text-[10px] block">To Recipient:</span>
                    <strong className="text-slate-800 font-mono">{sampleRecipient.email}</strong> ({sampleRecipient.firstName} {sampleRecipient.lastName})
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-slate-400 font-semibold uppercase text-[10px] block">Spreadsheet Details:</span>
                    <span className="text-slate-700 font-medium">
                      {sampleRecipient.jobTitle ? `${sampleRecipient.jobTitle} • ` : ''}
                      {sampleRecipient.company || 'No Company'} 
                      {sampleRecipient.phone ? ` • ${sampleRecipient.phone}` : ''}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Rendered Subject Line:</span>
                  <p className="font-bold text-slate-900 text-sm">{renderInterpolatedPreview(subject) || '(Enter a subject line above)'}</p>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Rendered Email Body:</span>
                    <div className="flex items-center space-x-1.5 bg-slate-100 p-0.5 rounded-md border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setPreviewTab('html')}
                        className={`px-2.5 py-0.5 text-[11px] font-bold rounded transition-colors ${
                          previewTab === 'html'
                            ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        🎨 Formatted View (Images & Links)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewTab('text')}
                        className={`px-2.5 py-0.5 text-[11px] font-bold rounded transition-colors ${
                          previewTab === 'text'
                            ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        📄 Plain Text
                      </button>
                    </div>
                  </div>

                  {previewTab === 'html' ? (
                    <div
                      className="p-5 bg-white border border-slate-200 rounded-lg max-h-96 overflow-y-auto font-sans text-slate-800 shadow-inner"
                      dangerouslySetInnerHTML={{
                        __html: renderInterpolatedPreview(bodyHtml || generateHtmlFromBody(bodyText)),
                      }}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap font-sans text-slate-800 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200 leading-relaxed max-h-96 overflow-y-auto">
                      {renderInterpolatedPreview(bodyText) || '(Enter body text above)'}
                      {signature && (
                        <div className="mt-3 pt-2.5 border-t border-slate-200 text-slate-600">
                          {renderInterpolatedPreview(signature)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Bottom Actions */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onNavigate('column-mapping', campaignId)}
              className="inline-flex items-center px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </button>

            <button
              type="button"
              onClick={handleSaveAndPreview}
              disabled={isSaving || !subject.trim() || !bodyText.trim()}
              className="inline-flex items-center px-6 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Eye className="w-4 h-4 mr-2" />
              <span>{isSaving ? 'Rendering Previews...' : 'Save & Review Personalized Previews'}</span>
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </div>
        </div>
      </div>

      {/* Insert Image / Logo Modal Dialog */}
      {isImageModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Insert Image, Logo, or Flyer</h3>
                  <p className="text-[11px] text-slate-500">Add university logos, header banners, or faculty headshots to your email</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImageModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {imageError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{imageError}</span>
                </div>
              )}

              {/* Mode Toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setImageMode('upload')}
                  className={`py-1.5 rounded-md flex items-center justify-center space-x-1.5 transition-all ${
                    imageMode === 'upload' ? 'bg-white text-sky-800 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload from Computer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImageMode('url')}
                  className={`py-1.5 rounded-md flex items-center justify-center space-x-1.5 transition-all ${
                    imageMode === 'url' ? 'bg-white text-sky-800 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>Image Web Link (URL)</span>
                </button>
              </div>

              {imageMode === 'upload' ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-sky-300 hover:border-sky-500 rounded-xl p-6 text-center cursor-pointer bg-sky-50/30 hover:bg-sky-50/60 transition-colors"
                  >
                    <Upload className="w-8 h-8 text-sky-600 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-800">
                      {isUploadingImage ? 'Uploading image...' : 'Click to browse an image file'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">PNG, JPG, WebP, GIF, or SVG (Up to 10MB)</p>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                    Image Public Web Address (URL)
                  </label>
                  <input
                    type="url"
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="https://sbs.strathmore.edu/wp-content/uploads/.../logo.png"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-sky-500 font-mono"
                  />
                </div>
              )}

              {imageUrlInput && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Image Preview</span>
                  <img
                    src={imageUrlInput}
                    alt="Preview"
                    className="max-h-32 mx-auto rounded object-contain border border-slate-200 bg-white"
                    onError={() => setImageError('Failed to load image from URL. Please check the address.')}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Image Description (Alt Text)</label>
                  <input
                    type="text"
                    value={imageAltInput}
                    onChange={(e) => setImageAltInput(e.target.value)}
                    placeholder="e.g. Strathmore Business School"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Placement in Email</label>
                  <select
                    value={imagePlacement}
                    onChange={(e) => setImagePlacement(e.target.value as any)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-900 focus:ring-2 focus:ring-sky-500 font-medium"
                  >
                    <option value="header">Top Header Banner (Recommended)</option>
                    <option value="inline">Inside Body (At Cursor)</option>
                    <option value="footer">Bottom / Above Signature</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsImageModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInsertImage}
                disabled={!imageUrlInput || isUploadingImage}
                className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Insert into Email</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
