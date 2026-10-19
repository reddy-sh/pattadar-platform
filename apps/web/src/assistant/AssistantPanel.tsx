/**
 * ChatGPT-like Pattadar assistant drawer.
 *
 * Conversations and messages are authoritative in services/assistant. The
 * browser only receives redacted capability readiness and never receives
 * model, database, tool-server configuration, URLs, or credentials.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { radii } from '@pattadar/tokens';
import { useLocation, useNavigate } from 'react-router';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HistoryIcon from '@mui/icons-material/History';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { apiErrorMessage, apiFetch } from '../api/client';
import { pageName } from '../w360/ui';
import { copyText } from './clipboard';
import {
  ASSISTANT_BASE, MODEL_KEY, PANEL_MIN_WIDTH, PANEL_WIDTH_KEY, PUBLIC_RECORDS_DISCLAIMER,
  clampPanelWidth, costLine, displayToolName, makeSseParser, newId, savedModel, savedPanelWidth,
} from './format';
import { Composer } from './composer/Composer';
import { EmptyState } from './composer/EmptyState';
import { FollowUps } from './rich/FollowUps';
import { ProposalCard } from './rich/ProposalCard';
import { ServiceOrderCard } from './rich/ServiceOrderCard';
import { AssistantLeaveContext } from './rich/CardLink';
import { isAppPath } from '../w360/appPath';
import { isServiceProposal, parseServiceProposal } from './serviceOrders';
import { RefinePanel, canRefine, describeRefinement } from './rich/RefinePanel';
import { parseProposal } from './proposals';
import { IncognitoIcon } from './rich/IncognitoIcon';
import { RecordViewCard } from './rich/RecordViewCard';
import {
  SPLIT_GUTTER, SPLIT_PANE_MIN, SPLIT_SIDEBAR_DEFAULT, SPLIT_SIDEBAR_MIN, SPLIT_STEP, SPLIT_THREAD_MIN,
  fitSplit, saveSplitWidths, savedSplitWidths,
} from './splitLayout';
import type { SplitWidths } from './splitLayout';
import { Markdown, preloadMarkdown } from './markdown/LazyMarkdown';
import { useSmoothText } from './markdown/useSmoothText';
import { JumpToLatest } from './messages/JumpToLatest';
import { MessageList } from './messages/MessageList';
import { useStickToBottom } from './messages/useStickToBottom';
import { ModelPicker } from './footer/ModelPicker';
import { UsageFooter } from './footer/UsageFooter';
import type {
  AssistantModel, AttachmentSelection, CapabilityResponse, ChatMessage, Conversation,
  PartySearchRequest, PartySearchResponse, Proposal, RecordView, RequestCost, ServiceProposal, StreamEvent, UsageSummary,
} from './types';

/** The readable column the conversation and composer share in a wide or full-screen panel. */
const COLUMN_MAX_WIDTH = 820;
/** Full screen on a wide window splits into conversations · thread · results. */
const SPLIT_MIN_WIDTH = 1100;
const SPLIT_COLUMN_MAX_WIDTH = 760;
const SIDEBAR_KEY = 'pattadar.assistant.sidebarCollapsed';

function savedSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}
/** A streamed reply may run for minutes (tools, long reports). */
const STREAM_TIMEOUT_MS = 600_000;
/** After a Stop the service may still be closing the previous run for a few seconds. */
const RUN_BUSY_RETRIES = 12;
const RUN_BUSY_WAIT_MS = 2_000;

/** Held while a reply streams: results show only once its text has finished (D4). */
const RESULTS_PLACEHOLDER_HEIGHT = 56;

/** Results, follow-ups, disclaimer and cost land together, with a short fade
 *  (none under reduced motion) instead of pushing the text about. */
const resultsFadeSx = {
  animation: 'assistantResultsIn 220ms ease-out both',
  '@keyframes assistantResultsIn': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
} as const;

/** Sum of the replies' costs, for a chat whose total the service did not send. */
const sumCosts = (list: ChatMessage[]) => list.reduce(
  (sum, message) => sum + (typeof message.cost?.cost_usd === 'number' ? message.cost.cost_usd : 0), 0,
);

/** One reply's text: revealed smoothly while it streams, rendered as safe markdown. */
function AssistantBody({ text, streaming }: { text: string; streaming: boolean }) {
  const shown = useSmoothText(text, streaming);
  return <Markdown text={shown} streaming={streaming} />;
}

/** How many matches a party search found, in words. */
const matchCount = (view: RecordView) => {
  const total = view.total ?? view.rows?.length ?? 0;
  return total === 1 ? '1 match' : `${total.toLocaleString('en-IN')} matches`;
};

/** In the split view a party search sits in the results pane; the thread keeps this card. */
function ResultsCard({ view, showing, onOpen }: { view: RecordView; showing: boolean; onOpen: (opener: HTMLElement) => void }) {
  return (
    <Box
      component="section"
      aria-label={view.title}
      sx={{
        mt: 1.25, display: 'flex', alignItems: 'center', gap: 1.25, px: 1.25, py: 1,
        border: 1, borderColor: showing ? 'primary.main' : 'divider', borderRadius: 1.5, bgcolor: 'background.paper',
      }}
    >
      <TableChartOutlinedIcon aria-hidden sx={{ color: 'primary.main' }} />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap title={view.title}>{view.title}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {matchCount(view)}{showing ? ' · shown alongside' : ''}
        </Typography>
      </Box>
      <Button size="small" variant="outlined" aria-label={`Open ${view.title}`} onClick={(event) => onOpen(event.currentTarget)}>
        Open
      </Button>
    </Box>
  );
}

export interface AssistantPanelProps {
  open: boolean;
  onClose: () => void;
  /** What a reply cost, the spend footer, the credit balance and the model
   *  picker. Platform admins only (admin.uids, `Portfolio.isPlatformAdmin`);
   *  an owner sees none of it, and it fails closed: left out means hidden. */
  showCosts?: boolean;
}

/** The vendor failures (services/assistant billing.py). An owner gets one
 *  sentence for all four; only an admin sees the vendor's own reason. */
const PROVIDER_FAILURES = new Set(['credit_exhausted', 'provider_auth', 'provider_rate_limited', 'provider_overloaded']);
const OWNER_UNAVAILABLE = 'The assistant is not available right now. Your properties and documents are safe. Try again in a few minutes.';

/** `[{label, prompt}]` as plain strings, at most four; anything else is dropped. */
function parseFollowUps(raw: unknown): Array<{ label: string; prompt: string }> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw.flatMap((item) => (
    item && typeof item === 'object'
      && typeof (item as { label?: unknown }).label === 'string'
      && typeof (item as { prompt?: unknown }).prompt === 'string'
      ? [{ label: (item as { label: string }).label.slice(0, 80), prompt: (item as { prompt: string }).prompt.slice(0, 300) }]
      : []
  )).slice(0, 4);
  return items.length ? items : undefined;
}

export function AssistantPanel({ open, onClose, showCosts = false }: AssistantPanelProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const activeConversationRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // A zero-model refinement of a party search is in flight (POST records/party-search).
  const [refining, setRefining] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [notice, setNotice] = useState('');
  const [attachments, setAttachments] = useState<AttachmentSelection[]>([]);
  const [uploading, setUploading] = useState(false);
  const [publicRecordsReady, setPublicRecordsReady] = useState(false);
  const [recordsCoverage, setRecordsCoverage] = useState('');
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [models, setModels] = useState<AssistantModel[]>([]);
  const [model, setModel] = useState<string>(savedModel);
  const [usageRefreshing, setUsageRefreshing] = useState(false);
  const [usageCheckedAt, setUsageCheckedAt] = useState<Date | null>(null);
  // Incognito: the history lives in this component only; the service writes nothing.
  const [incognito, setIncognito] = useState(false);
  const [incognitoSpend, setIncognitoSpend] = useState(0);
  // What the open saved chat has cost so far (GET conversation total_cost_usd, D5).
  const [chatSpend, setChatSpend] = useState<number | null>(null);
  // Replies streamed in this window: their results fade in when they land.
  const streamedIdsRef = useRef<Set<string>>(new Set());
  const [panelWidth, setPanelWidth] = useState(savedPanelWidth);
  const [maximized, setMaximized] = useState(false);
  const wide = useMediaQuery(`(min-width:${SPLIT_MIN_WIDTH}px)`);
  const split = maximized && wide;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(savedSidebarCollapsed);
  // Below this the open results pane folds the sidebar away (not remembered),
  // as Claude does with an artifact, so the thread keeps a readable width.
  const roomy = useMediaQuery('(min-width:1440px)');
  const [sidebarPeek, setSidebarPeek] = useState(false);
  const [paneNotice, setPaneNotice] = useState('');
  // The conversation list's own read state, for the split view's sidebar.
  const [listState, setListState] = useState<'loading' | 'ready' | 'failed'>('loading');
  // The result the split view's results pane shows: one view of one reply.
  const [paneTarget, setPaneTarget] = useState<{ messageId: string; viewId: string } | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);
  const paneOpenerRef = useRef<HTMLElement | null>(null);
  const autoOpenedRef = useRef<Set<string>>(new Set());
  const [resizing, setResizing] = useState(false);
  // The split view's column widths (separators between its panes) and the grid they fit in.
  const [splitWidths, setSplitWidths] = useState<SplitWidths>(savedSplitWidths);
  const [splitDrag, setSplitDrag] = useState<'sidebar' | 'pane' | null>(null);
  const [gridWidth, setGridWidth] = useState(() => window.innerWidth);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // The in-flight reply: its id (for the streaming caret) and the controller Stop aborts.
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Bumped by every reader action that decides what the chat shows (ask, open a
  // chat, new chat, incognito). A history load started before the bump is stale.
  const interactionRef = useRef(0);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastMessage = messages.at(-1);
  const { atBottom, scrollToBottom } = useStickToBottom(
    scrollRef,
    `${messages.length}:${lastMessage?.text.length ?? 0}:${lastMessage?.activities?.length ?? 0}:${lastMessage?.views?.length ?? 0}:${streamingId ?? ''}`,
  );

  // A reply still streaming when the panel unmounts is abandoned, not left running.
  useEffect(() => () => abortRef.current?.abort(), []);

  const commitPanelWidth = useCallback((width: number) => {
    const next = clampPanelWidth(width);
    setPanelWidth(next);
    try {
      window.localStorage.setItem(PANEL_WIDTH_KEY, String(next));
    } catch {
      // Width is a per-browser convenience; the default is fine without storage.
    }
  }, []);

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (maximized) setMaximized(false);
    setResizing(true);
  }

  function moveResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (resizing) setPanelWidth(clampPanelWidth(window.innerWidth - event.clientX));
  }

  function endResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!resizing) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setResizing(false);
    commitPanelWidth(window.innerWidth - event.clientX);
  }

  const setActive = useCallback((id: string | null) => {
    activeConversationRef.current = id;
    setActiveConversationId(id);
  }, []);

  /**
   * Opens a saved chat. A reader's click starts a new generation; the
   * select-newest path passes the generation it started under, and either way
   * the result is dropped if the reader has acted since.
   */
  const loadConversation = useCallback(async (id: string, generation?: number) => {
    const started = generation ?? ++interactionRef.current;
    if (started !== interactionRef.current) return;
    setLoadingHistory(true);
    setNotice('');
    try {
      const response = await apiFetch(`${ASSISTANT_BASE}/conversations/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error(await apiErrorMessage(response, 'Conversation could not be loaded.'));
      const body = (await response.json()) as {
        messages?: Array<{
          role: 'human' | 'ai' | 'user' | 'assistant'; content: string; views?: RecordView[];
          proposals?: unknown[]; service_proposals?: unknown[];
          cost_usd?: number | null; model?: string | null; run_id?: string | null;
          follow_ups?: unknown;
        }>;
        total_cost_usd?: number | null;
      };
      if (started !== interactionRef.current) return;
      const loaded: ChatMessage[] = (body.messages ?? []).map((message) => {
        // Service cards may come back among the proposals (one table, a kind
        // column) or on their own list; either way each is drawn once.
        const stored = [
          ...(Array.isArray(message.proposals) ? message.proposals : []),
          ...(Array.isArray(message.service_proposals) ? message.service_proposals.map((item) => (
            item && typeof item === 'object' ? { type: 'service_proposal', ...(item as object) } : item
          )) : []),
        ];
        const services = stored.filter(isServiceProposal).map(parseServiceProposal)
          .filter((item): item is ServiceProposal => item !== null)
          .filter((item, position, list) => list.findIndex((other) => other.id === item.id) === position);
        const proposals = stored.filter((item) => !isServiceProposal(item)).map(parseProposal)
          .filter((item): item is Proposal => item !== null);
        return {
          id: newId(),
          role: message.role === 'human' || message.role === 'user' ? 'user' : 'assistant',
          runId: typeof message.run_id === 'string' ? message.run_id : undefined,
          text: message.content,
          views: Array.isArray(message.views) ? message.views : undefined,
          // Rebuilt with their stored outcome, so a saved card cannot be saved twice.
          proposals: Array.isArray(message.proposals) ? proposals : undefined,
          serviceProposals: services.length ? services : undefined,
          followUps: parseFollowUps(message.follow_ups),
          cost: typeof message.cost_usd === 'number' ? { cost_usd: message.cost_usd, model: message.model ?? undefined } : undefined,
        };
      });
      setMessages(loaded);
      // Without the service's total, the footer sums the replies on screen.
      setChatSpend(typeof body.total_cost_usd === 'number' ? body.total_cost_usd : null);
      setIncognito(false);
      setAttachments([]);
      setActive(id);
      setShowHistory(false);
      window.requestAnimationFrame(() => scrollToBottom('auto'));
    } catch (error) {
      if (started === interactionRef.current) {
        setNotice(error instanceof Error ? error.message : 'Conversation could not be loaded.');
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [setActive, scrollToBottom]);

  const loadConversations = useCallback(async (selectNewest: boolean) => {
    const generation = interactionRef.current;
    const response = await apiFetch(`${ASSISTANT_BASE}/conversations?status=active&limit=50`);
    if (!response.ok) throw new Error(await apiErrorMessage(response, 'Conversation history is unavailable.'));
    const body = (await response.json()) as { conversations?: unknown };
    if (!Array.isArray(body.conversations)) {
      throw new Error('The assistant returned an invalid conversation response.');
    }
    const rows = body.conversations as Conversation[];
    setConversations(rows);
    // Opening the newest chat must never land on top of something the reader
    // started meanwhile (a question in flight, an incognito chat, a new chat).
    if (selectNewest && generation === interactionRef.current && !activeConversationRef.current && rows[0]) {
      await loadConversation(rows[0].id, generation);
    }
  }, [loadConversation]);

  const loadCapabilities = useCallback(async () => {
    try {
      const response = await apiFetch(`${ASSISTANT_BASE}/capabilities`);
      if (!response.ok) {
        setPublicRecordsReady(false);
        return;
      }
      const body = (await response.json()) as CapabilityResponse;
      setPublicRecordsReady(body.public_records?.ready === true && body.public_records.status === 'ready');
      setRecordsCoverage(typeof body.public_records?.coverage === 'string' ? body.public_records.coverage : '');
    } catch {
      setPublicRecordsReady(false);
    }
  }, []);

  // The newest conversation is opened once, when the panel first connects.
  // The 3 s readiness poll below must not repeat it: with no active
  // conversation it would pull the last chat straight back over a fresh one
  // the moment someone pressed New conversation.
  const openedNewestRef = useRef(false);

  // Fetched when the panel opens, after every reply, and on a click. It reads
  // the service's own database, so it is free; the polling loop leaves it alone.
  const loadUsage = useCallback(async () => {
    if (!showCosts) return;
    setUsageRefreshing(true);
    try {
      const response = await apiFetch(`${ASSISTANT_BASE}/usage`);
      if (response.ok) {
        setUsage((await response.json()) as UsageSummary);
        setUsageCheckedAt(new Date());
      }
    } catch {
      // Spend is informational; the chat works without it.
    } finally {
      setUsageRefreshing(false);
    }
  }, [showCosts]);

  /** The open saved chat's running cost, re-read from the service after each reply (D5). */
  const loadChatSpend = useCallback(async (conversationId: string) => {
    try {
      // The total only: the messages are already on screen.
      const response = await apiFetch(`${ASSISTANT_BASE}/conversations/${encodeURIComponent(conversationId)}?include_messages=false`);
      if (!response.ok) return;
      const body = (await response.json()) as { total_cost_usd?: number | null };
      if (activeConversationRef.current !== conversationId) return;
      if (typeof body.total_cost_usd === 'number') setChatSpend(body.total_cost_usd);
    } catch {
      // Spend is informational; the chat works without it.
    }
  }, []);

  const retryAssistant = useCallback(async () => {
    try {
      await loadConversations(!openedNewestRef.current);
      openedNewestRef.current = true;
      setUnavailable(false);
      setListState('ready');
    } catch {
      setUnavailable(true);
      setListState('failed');
    }
    await loadCapabilities();
  }, [loadConversations, loadCapabilities]);

  useEffect(() => {
    if (!open) return;
    void loadUsage();
    preloadMarkdown();
  }, [open, loadUsage]);

  useEffect(() => {
    if (!open || models.length) return;
    void (async () => {
      try {
        const response = await apiFetch(`${ASSISTANT_BASE}/models`);
        if (!response.ok) return;
        const body = (await response.json()) as { models?: AssistantModel[] };
        const offered = Array.isArray(body.models) ? body.models : [];
        setModels(offered);
        // A remembered pick the admin has since switched off falls back to the default.
        setModel((current) => (offered.some((item) => item.id === current) ? current : ''));
      } catch {
        // The default model still answers without the list.
      }
    })();
  }, [open, models.length]);

  function chooseModel(id: string) {
    setModel(id);
    try {
      if (id) window.localStorage.setItem(MODEL_KEY, id);
      else window.localStorage.removeItem(MODEL_KEY);
    } catch {
      // Per-browser convenience only.
    }
  }

  async function setCreditBalance(balance: number) {
    const response = await apiFetch(`${ASSISTANT_BASE}/usage/credit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance_usd: balance }),
    });
    if (!response.ok) throw new Error(await apiErrorMessage(response, 'The balance could not be saved.'));
    await loadUsage();
  }

  useEffect(() => {
    if (!open) return;
    setUnavailable(false);
    const retry = () => void retryAssistant();
    retry();
    const timer = window.setInterval(retry, 3000);
    window.addEventListener('focus', retry);
    window.addEventListener('online', retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', retry);
      window.removeEventListener('online', retry);
    };
  }, [open, retryAssistant]);


  async function createConversation(): Promise<string> {
    const response = await apiFetch(`${ASSISTANT_BASE}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_context: {
          app: { name: 'Pattadar' },
          page: { path: location.pathname, menuItem: pageName() },
        },
      }),
    });
    if (!response.ok) throw new Error(await apiErrorMessage(response, 'A new conversation could not be created.'));
    const conversation = (await response.json()) as Conversation;
    setConversations((previous) => [conversation, ...previous.filter((item) => item.id !== conversation.id)]);
    setActive(conversation.id);
    return conversation.id;
  }

  async function ensureConversation(): Promise<string> {
    return activeConversationRef.current ?? createConversation();
  }

  function toggleIncognito() {
    if (busy) return;
    interactionRef.current += 1;
    // Either way the visible chat is dropped: leaving incognito erases it, and
    // entering it must not carry a saved conversation's history along.
    openedNewestRef.current = true;
    setIncognito((value) => !value);
    setActive(null);
    setChatSpend(null);
    setMessages([]);
    setAttachments([]);
    setNotice('');
    setShowHistory(false);
  }

  function startNewConversation() {
    if (busy) return;
    interactionRef.current += 1;
    setActive(null);
    setChatSpend(null);
    setMessages([]);
    setAttachments([]);
    setNotice('');
    setUnavailable(false);
    setShowHistory(false);
  }

  async function renameConversation(conversation: Conversation) {
    const title = window.prompt('Rename conversation', conversation.title || 'New conversation')?.trim();
    if (!title || title === conversation.title) return;
    const response = await apiFetch(`${ASSISTANT_BASE}/conversations/${encodeURIComponent(conversation.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      setNotice(await apiErrorMessage(response, 'The conversation could not be renamed.'));
      return;
    }
    setConversations((previous) => previous.map((item) => (
      item.id === conversation.id ? { ...item, title } : item
    )));
  }

  async function archiveConversation(conversation: Conversation) {
    if (!window.confirm(`Archive “${conversation.title || 'New conversation'}”?`)) return;
    const response = await apiFetch(`${ASSISTANT_BASE}/conversations/${encodeURIComponent(conversation.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    });
    if (!response.ok) {
      setNotice(await apiErrorMessage(response, 'The conversation could not be archived.'));
      return;
    }
    setConversations((previous) => previous.filter((item) => item.id !== conversation.id));
    if (activeConversationRef.current === conversation.id) startNewConversation();
  }

  async function uploadFiles(files: File[]) {
    if (!files.length || uploading || busy) return;
    setUploading(true);
    setNotice('');
    try {
      const conversationId = await ensureConversation();
      const uploaded: AttachmentSelection[] = [];
      for (const file of files) {
        const data = new FormData();
        data.set('conversation_id', conversationId);
        data.set('attachment_type', file.type.startsWith('image/') ? 'image' : 'file');
        data.set('file', file);
        const response = await apiFetch(`${ASSISTANT_BASE}/attachments`, { method: 'POST', body: data });
        if (!response.ok) throw new Error(await apiErrorMessage(response, `${file.name} could not be uploaded.`));
        const body = (await response.json()) as { id: string; file_name?: string };
        uploaded.push({ id: body.id, fileName: body.file_name || file.name });
      }
      setAttachments((previous) => [...previous, ...uploaded]);
      await loadConversations(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The file could not be uploaded.');
    } finally {
      setUploading(false);
    }
  }

  function updateAssistantMessage(id: string, update: (message: ChatMessage) => ChatMessage) {
    setMessages((previous) => previous.map((message) => message.id === id ? update(message) : message));
  }

  function dispatchAction(event: StreamEvent) {
    if (event.action === 'navigate' && isAppPath(event.path)) {
      navigate(event.path);
    }
    const detail = { action: event.action, path: event.path, args: event.args ?? {} };
    window.dispatchEvent(new CustomEvent('pattadar:assistant-action', { detail }));
    window.dispatchEvent(new CustomEvent('shell-action', { detail }));
  }

  /**
   * Streams one turn. `prior` is the conversation before the question, `user`
   * the question itself (new, edited, or the same one again for Regenerate);
   * a fresh assistant reply is appended after it. `replaces` is the question
   * being redone: in a saved chat the service drops that earlier turn once the
   * new reply is saved, so history matches what the reader sees.
   */
  async function runTurn(
    prior: ChatMessage[],
    question: ChatMessage,
    selectedAttachments: AttachmentSelection[],
    replaces?: ChatMessage,
  ) {
    interactionRef.current += 1;
    const text = question.text;
    const runId = newId();
    const user: ChatMessage = { ...question, runId };
    const assistantId = newId();
    const controller = new AbortController();
    abortRef.current = controller;
    setNotice('');
    setUnavailable(false);
    setLoadingHistory(false);
    setMessages([
      ...prior,
      user,
      { id: assistantId, role: 'assistant', text: '', activities: [] },
    ]);
    streamedIdsRef.current.add(assistantId);
    setStreamingId(assistantId);
    setBusy(true);
    // Asking is a deliberate act: follow the new reply even if the reader had scrolled up.
    scrollToBottom('auto');

    // Tokens are appended once per animation frame, not once per network chunk.
    let pendingText = '';
    let flushFrame = 0;
    const flushText = () => {
      if (flushFrame) window.cancelAnimationFrame(flushFrame);
      flushFrame = 0;
      if (!pendingText) return;
      const chunk = pendingText;
      pendingText = '';
      updateAssistantMessage(assistantId, (message) => ({ ...message, text: message.text + chunk }));
    };

    let streamError = '';
    let stopped = false;
    try {
      const applicationContext = {
        app: { name: 'Pattadar' },
        page: { path: location.pathname, menuItem: pageName() },
      };
      // The service keeps nothing in incognito, so the history comes from here:
      // only answered pairs, never a browser-side error or an unanswered question.
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      if (incognito) {
        for (let index = 0; index < prior.length - 1; index += 1) {
          const asked = prior[index];
          const answer = prior[index + 1];
          if (asked.role !== 'user' || answer.role !== 'assistant' || !asked.text.trim() || !answer.text.trim()) continue;
          history.push(
            { role: 'user', content: asked.text.slice(0, 8000) },
            { role: 'assistant', content: answer.text.slice(0, 8000) },
          );
          index += 1;
        }
      }
      const conversationId = incognito ? null : await ensureConversation();
      const request = () => (incognito
        ? apiFetch(`${ASSISTANT_BASE}/chat/incognito/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          // Replies stream for minutes; the default 20 s deadline would cut them off.
          timeoutMs: STREAM_TIMEOUT_MS,
          body: JSON.stringify({
            message: text,
            model: model || undefined,
            history: history.slice(-20),
            application_context: applicationContext,
          }),
        })
        : apiFetch(`${ASSISTANT_BASE}/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          timeoutMs: STREAM_TIMEOUT_MS,
          body: JSON.stringify({
            conversation_id: conversationId,
            message: text,
            model: model || undefined,
            run_id: runId,
            replaces_run_id: replaces?.runId || undefined,
            attachment_ids: selectedAttachments.map((attachment) => attachment.id),
            application_context: applicationContext,
          }),
        }));

      // A Stop just before this turn can leave the previous run winding down on
      // the service for a few seconds; it answers `run_busy`, and we try again.
      for (let attempt = 0; ; attempt += 1) {
        let runBusy = false;
        const response = await request();
        if (!response.ok || !response.body) {
          throw new Error(await apiErrorMessage(response, 'The assistant could not answer.'));
        }

        const parser = makeSseParser((payload) => {
          if (payload === '[DONE]') return;
          try {
            const event = JSON.parse(payload) as StreamEvent;
            if (event.type === 'token') {
              if (!event.text) return;
              pendingText += event.text;
              if (!flushFrame) flushFrame = window.requestAnimationFrame(flushText);
              return;
            }
            // Anything else lands after the text that preceded it.
            flushText();
            if (event.type === 'thinking') {
              updateAssistantMessage(assistantId, (message) => {
                if (message.activities?.some((activity) => activity.id === 'thinking')) return message;
                return {
                  ...message,
                  activities: [...(message.activities ?? []), { id: 'thinking', label: 'Thinking', state: 'running' }],
                };
              });
            } else if (event.type === 'tool_start') {
              const toolId = event.id || `tool-${newId()}`;
              const recordsTool = (event.name || '').includes('pattadar_records');
              updateAssistantMessage(assistantId, (message) => ({
                ...message,
                usedRecords: message.usedRecords || recordsTool,
                activities: [
                  ...(message.activities ?? []).map((activity) => activity.id === 'thinking' ? { ...activity, state: 'done' as const } : activity),
                  { id: toolId, label: `Using ${displayToolName(event.name || 'tool')}`, state: 'running' },
                ],
              }));
            } else if (event.type === 'tool_end') {
              updateAssistantMessage(assistantId, (message) => ({
                ...message,
                activities: (message.activities ?? []).map((activity) => (
                  activity.state === 'running' && activity.id !== 'thinking'
                    ? { ...activity, state: 'done' }
                    : activity
                )),
              }));
            } else if (event.type === 'records' && (event.kind === 'table' || event.kind === 'report')) {
              const view: RecordView = {
                id: event.id || newId(),
                kind: event.kind,
                title: event.title || 'Public records',
                columns: event.columns,
                rows: event.rows,
                total: event.total,
                note: event.note,
                markdown: event.markdown,
                follow_ups: Array.isArray(event.follow_ups) ? event.follow_ups : undefined,
                summary: event.summary && typeof event.summary === 'object' ? event.summary : undefined,
                facets: event.facets && typeof event.facets === 'object' ? event.facets : undefined,
                query: event.query && typeof event.query === 'object' ? event.query : undefined,
              };
              updateAssistantMessage(assistantId, (message) => (
                message.views?.some((item) => item.id === view.id)
                  ? message
                  : { ...message, views: [...(message.views ?? []), view] }
              ));
            } else if (event.type === 'proposal') {
              // Never through dispatchAction: a proposal is only ever a card,
              // and nothing is written until the reader clicks Save on it.
              // Incognito writes nowhere, so its proposals are dropped here too.
              if (incognito) return;
              const proposal = parseProposal(event);
              if (!proposal) return;
              updateAssistantMessage(assistantId, (message) => ({
                ...message,
                proposals: [...(message.proposals ?? []).filter((item) => item.id !== proposal.id), proposal],
              }));
            } else if (event.type === 'service_proposal') {
              // Like a proposal: only ever a card, never an action, and dropped
              // in incognito, where nothing may be ordered.
              if (incognito) return;
              const service = parseServiceProposal(event);
              if (!service) return;
              updateAssistantMessage(assistantId, (message) => ({
                ...message,
                serviceProposals: [...(message.serviceProposals ?? []).filter((item) => item.id !== service.id), service],
              }));
            } else if (event.type === 'action') {
              dispatchAction(event);
            } else if (event.type === 'usage') {
              const cost: RequestCost = {
                model: event.model,
                cost_usd: event.cost_usd, cache_read_tokens: event.cache_read_tokens,
                cache_write_tokens: event.cache_write_tokens, input_tokens: event.input_tokens,
                output_tokens: event.output_tokens,
              };
              const followUps = incognito ? undefined : parseFollowUps(event.follow_ups);
              updateAssistantMessage(assistantId, (message) => ({ ...message, cost, ...(followUps ? { followUps } : {}) }));
              if (incognito && typeof event.cost_usd === 'number') {
                setIncognitoSpend((spent) => spent + (event.cost_usd ?? 0));
              }
            } else if (event.type === 'error') {
              if (event.code === 'run_busy' && attempt < RUN_BUSY_RETRIES) {
                runBusy = true;
                return;
              }
              streamError = !showCosts && PROVIDER_FAILURES.has(event.code ?? '')
                ? OWNER_UNAVAILABLE
                : event.text || 'The assistant could not complete that. Try again.';
              if (event.code === 'credit_exhausted') {
                setUsage((current) => current ? { ...current, credit_status: 'exhausted' } : current);
              }
            }
          } catch {
            // Ignore malformed or non-JSON service comments.
          }
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const stopReading = () => void reader.cancel().catch(() => undefined);
        controller.signal.addEventListener('abort', stopReading, { once: true });
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done || controller.signal.aborted) break;
            parser(decoder.decode(value, { stream: true }));
          }
          if (!controller.signal.aborted) parser(decoder.decode());
        } finally {
          controller.signal.removeEventListener('abort', stopReading);
        }
        if (!runBusy || controller.signal.aborted) break;
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, RUN_BUSY_WAIT_MS);
          controller.signal.addEventListener('abort', () => { window.clearTimeout(timer); resolve(); }, { once: true });
        });
        if (controller.signal.aborted) break;
      }
      flushText();
      // From here the reply is complete: Stop no longer applies to it.
      stopped = controller.signal.aborted;
      if (abortRef.current === controller) abortRef.current = null;
      if (!stopped) {
        // Only the files that went with this question leave the composer.
        if (selectedAttachments.length) {
          const sent = new Set(selectedAttachments.map((attachment) => attachment.id));
          setAttachments((previous) => previous.filter((attachment) => !sent.has(attachment.id)));
        }
        // Not awaited: the finished reply's results must not wait on the
        // sidebar list (D4 — they land when the text finishes).
        if (!incognito) void loadConversations(false).catch(() => undefined);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        stopped = true;
      } else if (error instanceof DOMException && error.name === 'TimeoutError') {
        streamError = 'The server did not answer in time.';
      } else {
        streamError = error instanceof Error ? error.message : 'The assistant could not answer.';
      }
    } finally {
      flushText();
      if (abortRef.current === controller) abortRef.current = null;
      // Every request, answered or not, refreshes the spend line.
      void loadUsage();
      const spentIn = !incognito ? activeConversationRef.current : null;
      if (spentIn) void loadChatSpend(spentIn);
      setBusy(false);
      setStreamingId(null);
      // The error is kept apart from the reply text, so it is never sent back
      // to the model as something the assistant said.
      updateAssistantMessage(assistantId, (message) => ({
        ...message,
        stopped: stopped || undefined,
        error: streamError || undefined,
        activities: [
          ...(message.activities ?? []).map((activity) => ({ ...activity, state: 'done' as const })),
          ...(streamError ? [{ id: newId(), label: 'Reply interrupted', state: 'error' as const }] : []),
        ],
      }));
      // A stopped stored chat still has its question saved; refresh the list quietly.
      if (stopped && !incognito) void loadConversations(false).catch(() => undefined);
    }
  }

  /** Keeps a service card's outcome on its message, so a re-render shows the same state. */
  function updateServiceProposal(messageId: string, proposal: ServiceProposal) {
    setMessages((previous) => previous.map((message) => (
      message.id === messageId
        ? { ...message, serviceProposals: (message.serviceProposals ?? []).map((item) => (item.id === proposal.id ? proposal : item)) }
        : message
    )));
  }

  /** Keeps a card's outcome on its message, so a re-render shows the same state. */
  function updateProposal(messageId: string, proposal: Proposal) {
    setMessages((previous) => previous.map((message) => (
      message.id === messageId
        ? { ...message, proposals: (message.proposals ?? []).map((item) => (item.id === proposal.id ? proposal : item)) }
        : message
    )));
  }

  /**
   * Narrows a party search with no model call (contract C6). The refinement
   * and its answer are appended as a question-and-reply pair; in a saved chat
   * the service stores the same pair, so a reload shows it too.
   */
  async function refineRecords(request: PartySearchRequest) {
    if (busy || uploading || refining) throw new Error('Wait for the current reply to finish.');
    interactionRef.current += 1;
    const generation = interactionRef.current;
    setRefining(true);
    setNotice('');
    try {
      const conversationId = incognito ? null : activeConversationRef.current;
      const response = await apiFetch(`${ASSISTANT_BASE}/records/party-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...request,
          conversation_id: conversationId ?? undefined,
          incognito: incognito || undefined,
        }),
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response, 'The refinement could not run.'));
      const body = (await response.json()) as Partial<PartySearchResponse>;
      const view = body.view;
      if (!view || typeof view !== 'object' || (view.kind !== 'table' && view.kind !== 'report')) {
        throw new Error('The public records service returned an unexpected answer.');
      }
      // The reader moved on (another chat, a new chat) while this ran.
      if (generation !== interactionRef.current) return;
      const shown: RecordView = { ...view, id: view.id || newId(), title: view.title || 'Public records' };
      const replyId = newId();
      // The split view's results pane follows the refinement to its new answer.
      autoOpenedRef.current.add(replyId);
      if (split) {
        setPaneTarget({ messageId: replyId, viewId: shown.id });
        // The pane remounts on the new answer; keep the keyboard inside it.
        window.requestAnimationFrame(() => paneRef.current?.focus());
      }
      setMessages((previous) => [
        ...previous,
        { id: newId(), role: 'user', text: describeRefinement(request) },
        {
          id: replyId,
          role: 'assistant',
          text: typeof body.text === 'string' ? body.text : '',
          views: [shown],
          usedRecords: true,
        },
      ]);
      scrollToBottom('smooth');
      if (!incognito && conversationId) void loadConversations(false).catch(() => undefined);
    } finally {
      setRefining(false);
    }
  }

  // A row's Add asks for that one deed by RID; the assistant answers with the
  // save card (propose_add_records), so nothing is saved without a confirm.
  // Through a ref so the memoised table is not re-rendered by every keystroke.
  const sendRef = useRef<(asked?: string) => Promise<void>>(async () => {});
  const addDeed = useCallback((row: Record<string, unknown>) => {
    const sNo = row.s_no === null || row.s_no === undefined || row.s_no === '' ? '' : `, schedule ${String(row.s_no)}`;
    void sendRef.current(`Add the deed with RID ${String(row.rid)}${sNo} to my properties.`);
  }, []);

  async function send(asked?: string) {
    const text = (asked ?? input).trim();
    if (!text || busy || uploading || refining) return;
    const selectedAttachments = attachments;
    if (asked === undefined) setInput('');
    await runTurn(messages, {
      id: newId(),
      role: 'user',
      text,
      attachments: selectedAttachments.map((attachment) => attachment.fileName),
    }, selectedAttachments);
  }
  sendRef.current = send;

  /** Index of the newest question; Regenerate and Edit act on it only. */
  function lastUserIndex(): number {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'user') return index;
    }
    return -1;
  }

  /** Asks the newest question again; the new reply replaces the old one. */
  function regenerate() {
    if (busy || uploading) return;
    const index = lastUserIndex();
    if (index < 0) return;
    void runTurn(messages.slice(0, index), messages[index], [], messages[index]);
  }

  /** Replaces the newest question's text, drops the reply after it and asks again. */
  function editAndResend(messageId: string, newText: string) {
    if (busy || uploading) return;
    const index = lastUserIndex();
    const text = newText.trim();
    if (index < 0 || messages[index].id !== messageId || !text) return;
    void runTurn(messages.slice(0, index), { ...messages[index], text }, [], messages[index]);
    // The edit form is gone; the reader carries on from the composer.
    composerInputRef.current?.focus();
  }

  function stop() {
    abortRef.current?.abort();
  }

  function copyMessage(message: ChatMessage) {
    void copyText(message.text);
  }

  // A party search that finishes streaming in the split view opens in the
  // results pane; the thread keeps a compact card that reopens it.
  useEffect(() => {
    if (!split || streamingId) return;
    const reply = [...messages].reverse().find((message) => message.role === 'assistant');
    if (!reply || !streamedIdsRef.current.has(reply.id) || autoOpenedRef.current.has(reply.id)) return;
    const view = reply.views?.find(canRefine);
    if (!view) return;
    autoOpenedRef.current.add(reply.id);
    setPaneTarget({ messageId: reply.id, viewId: view.id });
    // Focus stays with whoever is typing; a screen reader still hears it.
    setPaneNotice(`${view.title || 'Public records'} opened alongside the conversation.`);
  }, [split, streamingId, messages]);

  const paneMessage = split && paneTarget ? messages.find((message) => message.id === paneTarget.messageId) : undefined;
  const paneView = paneMessage?.views?.find((view) => view.id === paneTarget?.viewId);
  const sidebarShown = !sidebarCollapsed && (roomy || !paneView || sidebarPeek);
  // A separator that unmounts mid-drag (the pane folding the sidebar) never
  // sees its pointerup; drop the drag with it.
  useEffect(() => {
    if ((splitDrag === 'sidebar' && !sidebarShown) || (splitDrag === 'pane' && !paneView)) setSplitDrag(null);
  }, [splitDrag, sidebarShown, paneView]);
  const splitFit = fitSplit(splitWidths, gridWidth, sidebarShown, Boolean(paneView));

  // The grid's own width, so the panes re-clamp when the window changes size.
  useEffect(() => {
    const grid = gridRef.current;
    if (!split || !grid) return;
    const observer = new ResizeObserver(() => setGridWidth(grid.clientWidth));
    observer.observe(grid);
    return () => observer.disconnect();
  }, [split]);

  /** Sets one split column, fitted so the thread keeps its minimum; `persist` remembers it in this browser. */
  function setSplitColumn(which: 'sidebar' | 'pane', width: number | null, persist: boolean) {
    setSplitWidths((previous) => {
      const wanted = { ...previous, [which]: width };
      const fit = fitSplit(wanted, gridRef.current?.clientWidth ?? gridWidth, sidebarShown, Boolean(paneView));
      const next = { ...previous, [which]: width === null ? null : fit[which] };
      if (persist) saveSplitWidths(next);
      return next;
    });
  }

  function splitPointerWidth(which: 'sidebar' | 'pane', clientX: number) {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return which === 'sidebar' ? clientX - rect.left - SPLIT_GUTTER : rect.right - SPLIT_GUTTER - clientX;
  }

  function splitSeparator(which: 'sidebar' | 'pane') {
    const now = splitFit[which];
    const min = which === 'sidebar' ? SPLIT_SIDEBAR_MIN : SPLIT_PANE_MIN;
    const max = which === 'sidebar' ? splitFit.sidebarMax : splitFit.paneMax;
    // The results pane grows leftwards, the sidebar rightwards.
    const grow = which === 'sidebar' ? 'ArrowRight' : 'ArrowLeft';
    const shrink = which === 'sidebar' ? 'ArrowLeft' : 'ArrowRight';
    return (
      <Box
        role="separator"
        aria-orientation="vertical"
        aria-label={which === 'sidebar' ? 'Resize conversations' : 'Resize results'}
        aria-valuenow={now}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setSplitDrag(which);
        }}
        onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
          if (splitDrag !== which) return;
          const width = splitPointerWidth(which, event.clientX);
          if (width !== null) setSplitColumn(which, width, false);
        }}
        onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => {
          if (splitDrag !== which) return;
          event.currentTarget.releasePointerCapture(event.pointerId);
          setSplitDrag(null);
          const width = splitPointerWidth(which, event.clientX);
          if (width !== null) setSplitColumn(which, width, true);
        }}
        onPointerCancel={() => setSplitDrag(null)}
        onLostPointerCapture={() => setSplitDrag(null)}
        onDoubleClick={() => setSplitColumn(which, which === 'sidebar' ? SPLIT_SIDEBAR_DEFAULT : null, true)}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          const next = event.key === grow ? now + SPLIT_STEP : event.key === shrink ? now - SPLIT_STEP
            : event.key === 'Home' ? min : event.key === 'End' ? max : null;
          if (next === null) return;
          event.preventDefault();
          setSplitColumn(which, next, true);
        }}
        sx={{
          position: 'relative', cursor: 'col-resize', touchAction: 'none', borderRadius: `${radii.sm}px`,
          '&::after': {
            content: '""', position: 'absolute', left: '50%', top: 12, bottom: 12, width: 2, transform: 'translateX(-50%)',
            borderRadius: `${radii.pill}px`, bgcolor: splitDrag === which ? 'primary.main' : 'transparent', transition: 'background-color 120ms',
          },
          '&:hover::after, &:focus-visible::after': { bgcolor: 'primary.main' },
          '&:focus-visible': { outline: 'none' },
          '@media (prefers-reduced-motion: reduce)': { '&::after': { transition: 'none' } },
        }}
      />
    );
  }
  /** Each split-view pane is its own rounded surface on the backdrop. */
  const splitSurface = split ? {
    bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: `${radii.lg}px`, overflow: 'hidden',
  } : {};

  function openResults(messageId: string, viewId: string, opener: HTMLElement) {
    paneOpenerRef.current = opener;
    setPaneTarget({ messageId, viewId });
    window.requestAnimationFrame(() => paneRef.current?.focus());
  }

  function closeResults() {
    setPaneTarget(null);
    setSidebarPeek(false);
    setPaneNotice('');
    const opener = paneOpenerRef.current;
    paneOpenerRef.current = null;
    window.requestAnimationFrame(() => (opener?.isConnected ? opener : composerInputRef.current)?.focus());
  }

  function toggleSidebar() {
    // Folded only by the results pane: show it for now without changing the saved choice.
    if (!sidebarCollapsed && !sidebarShown) return setSidebarPeek(true);
    setSidebarPeek(false);
    setSidebarCollapsed((value) => {
      try {
        window.localStorage.setItem(SIDEBAR_KEY, value ? '0' : '1');
      } catch {
        // Per-browser convenience only.
      }
      return !value;
    });
  }

  const empty = messages.length === 0;
  // Follow-ups are offered on the latest answer only; older ones are history.
  const lastAssistantId = [...messages].reverse().find((message) => message.role === 'assistant')?.id;

  const renderAssistantBody = (message: ChatMessage) => (
    <AssistantBody text={message.text} streaming={message.id === streamingId} />
  );

  const renderAssistantExtras = (message: ChatMessage) => {
    const hasCards = (message.views?.length ?? 0) > 0 || (message.proposals?.length ?? 0) > 0
      || (message.serviceProposals?.length ?? 0) > 0;
    const isLast = message.id === lastAssistantId;
    const showDisclaimer = message.usedRecords || hasCards;
    const streaming = message.id === streamingId;
    // D4: while the reply streams, its text comes first. Results, cards,
    // follow-ups, the disclaimer and the cost line wait for the stream to end
    // and then land together, so nothing renders above the text and pushes it.
    if (streaming) {
      if (!hasCards) return null;
      return (
        <Box
          role="status"
          aria-label="Preparing results"
          sx={{
            mt: 1.25, height: RESULTS_PLACEHOLDER_HEIGHT, display: 'flex', alignItems: 'center', gap: 1, px: 1.25,
            border: 1, borderColor: 'divider', borderStyle: 'dashed', borderRadius: 1.5, color: 'text.secondary',
          }}
        >
          <CircularProgress size={14} color="inherit" aria-hidden />
          <Typography variant="caption">Preparing results…</Typography>
        </Box>
      );
    }
    if (!hasCards && !isLast && !showDisclaimer && !message.cost && !message.stopped && !message.error) return null;
    const fade = streamedIdsRef.current.has(message.id);
    return (
      <Box sx={fade ? resultsFadeSx : undefined}>
        {message.error && (
          <Typography
            variant="body2"
            sx={{ mt: message.text ? 1 : 0.25, color: 'error.main', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
          >
            {message.error}
          </Typography>
        )}
        {message.views?.map((view) => split && canRefine(view) ? (
          <ResultsCard
            key={view.id}
            view={view}
            showing={paneView?.id === view.id && paneMessage?.id === message.id}
            onOpen={(opener) => openResults(message.id, view.id, opener)}
          />
        ) : (
          <Box key={view.id}>
            <RecordViewCard view={view} onAdd={incognito ? undefined : addDeed} />
            {canRefine(view) && (
              <RefinePanel
                view={view}
                defaultOpen={isLast}
                disabled={busy || uploading || refining}
                onRefine={refineRecords}
              />
            )}
          </Box>
        ))}
        {!incognito && message.proposals?.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            incognito={incognito}
            onChange={(next) => updateProposal(message.id, next)}
          />
        ))}
        {!incognito && message.serviceProposals?.map((proposal) => (
          <ServiceOrderCard
            key={proposal.id}
            proposal={proposal}
            incognito={incognito}
            onChange={(next) => updateServiceProposal(message.id, next)}
          />
        ))}
        {isLast && (
          <FollowUps views={message.views} extra={message.followUps} disabled={busy || uploading || refining} onAsk={(prompt) => void send(prompt)} />
        )}
        {message.stopped && (
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: message.text ? 0.75 : 0.25, color: 'text.secondary' }}>
            <StopCircleOutlinedIcon aria-hidden sx={{ fontSize: 15 }} />
            <Typography variant="caption">Stopped</Typography>
          </Box>
        )}
        {showDisclaimer && (
          <Typography
            variant="caption"
            role="note"
            color="text.secondary"
            sx={{ display: 'block', mt: 1.25, px: 1.25, py: 0.75, borderLeft: 3, borderColor: 'warning.main', borderRadius: 1, bgcolor: 'action.hover', lineHeight: 1.5 }}
          >
            {recordsCoverage ? `Public records ${recordsCoverage}. ` : ''}{PUBLIC_RECORDS_DISCLAIMER}
          </Typography>
        )}
        {showCosts && message.cost && (
          <Typography
            variant="caption"
            color="text.secondary"
            title="What this reply cost (cached input bills at a tenth of the input price)"
            sx={{ display: 'block', mt: 0.75, fontVariantNumeric: 'tabular-nums' }}
          >
            {costLine(message.cost)}
          </Typography>
        )}
      </Box>
    );
  };

  // D5: this chat's running cost. A saved chat reads the service's total; an
  // incognito one (or a service that sent none) sums the replies on screen.
  const thisChatSpend: number | null = incognito
    ? (messages.length ? sumCosts(messages) : null)
    : activeConversationId
      ? (chatSpend ?? sumCosts(messages))
      : (messages.length ? sumCosts(messages) : null);

  // The saved conversations: the history overlay (drawer) and the sidebar (split view) share these rows.
  const conversationRows = listState === 'loading' && conversations.length === 0 ? (
    <Box role="status" aria-label="Loading conversations" sx={{ px: 1.5, py: 1 }}>
      {[0, 1, 2].map((row) => <Skeleton key={row} aria-hidden height={32} />)}
    </Box>
  ) : listState === 'failed' && conversations.length === 0 ? (
    <Box role="alert" sx={{ px: 1.5, py: 1.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>Conversations did not load</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Check your connection and try again.</Typography>
      <Button size="small" sx={{ mt: 0.75 }} onClick={() => void retryAssistant()}>Try again</Button>
    </Box>
  ) : conversations.length === 0 ? (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', p: 2 }}>No saved conversations yet.</Typography>
  ) : conversations.map((conversation) => (
    <Box
      key={conversation.id}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.25, px: 0.75, py: 0.5, bgcolor: activeConversationId === conversation.id ? 'action.selected' : undefined }}
    >
      <Button
        onClick={() => void loadConversation(conversation.id)}
        disabled={busy}
        aria-current={activeConversationId === conversation.id ? 'true' : undefined}
        sx={{ flexGrow: 1, minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', color: 'text.primary', overflow: 'hidden' }}
      >
        <Typography variant="body2" noWrap>{conversation.title || 'New conversation'}</Typography>
      </Button>
      <Tooltip title="Rename">
        <IconButton size="small" aria-label={`Rename ${conversation.title || 'conversation'}`} onClick={() => void renameConversation(conversation)}>
          <EditOutlinedIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Archive">
        <IconButton size="small" aria-label={`Archive ${conversation.title || 'conversation'}`} onClick={() => void archiveConversation(conversation)}>
          <DeleteOutlineOutlinedIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Box>
  ));
  const columnMaxWidth = split ? SPLIT_COLUMN_MAX_WIDTH : COLUMN_MAX_WIDTH;

  return (
    <AssistantLeaveContext.Provider value={onClose}>
    <Drawer
      anchor="right"
      variant="temporary"
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', sm: maximized ? '100vw' : panelWidth },
          maxWidth: '100vw',
          // A docked panel is a sheet laid over the app, so its open edge is
          // rounded; full screen and phones keep square corners.
          borderTopLeftRadius: { xs: 0, sm: maximized ? 0 : 20 },
          borderBottomLeftRadius: { xs: 0, sm: maximized ? 0 : 20 },
          overflow: 'hidden',
          ...(resizing ? { transition: 'none', userSelect: 'none' } : {}),
        },
      }}
    >
      <Box
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize assistant panel"
        aria-valuemin={PANEL_MIN_WIDTH}
        aria-valuenow={maximized ? undefined : panelWidth}
        tabIndex={0}
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onDoubleClick={() => setMaximized((value) => !value)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          setMaximized(false);
          commitPanelWidth(panelWidth + (event.key === 'ArrowLeft' ? 40 : -40));
        }}
        sx={{
          display: { xs: 'none', sm: maximized ? 'none' : 'block' },
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, zIndex: 2,
          cursor: 'col-resize', touchAction: 'none',
          '&::after': {
            content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
            bgcolor: resizing ? 'primary.main' : 'transparent', transition: 'background-color 120ms',
          },
          '&:hover::after, &:focus-visible::after': { bgcolor: 'primary.main' },
          '&:focus-visible': { outline: 'none' },
        }}
      />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 1.25, borderBottom: 2, borderColor: 'primary.main' }}>
          {split && (
            <Tooltip title={sidebarShown ? 'Hide conversations' : 'Show conversations'}>
              <IconButton
                aria-label={sidebarShown ? 'Hide conversations' : 'Show conversations'}
                aria-expanded={sidebarShown}
                onClick={toggleSidebar}
                size="small"
              >
                <ViewSidebarOutlinedIcon fontSize="small" sx={{ transform: 'scaleX(-1)' }} />
              </IconButton>
            </Tooltip>
          )}
          <SmartToyOutlinedIcon sx={{ color: 'primary.main' }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>Pattadar Assistant</Typography>
          {!split && (
            <Tooltip title="Conversation history">
              <IconButton aria-label="Conversation history" onClick={() => setShowHistory((value) => !value)} size="small">
                <HistoryIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {(!split || !sidebarShown) && (<>
          <Tooltip title="New conversation">
            <span>
              <IconButton aria-label="New conversation" onClick={startNewConversation} disabled={busy} size="small">
                <AddIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={incognito ? 'Leave incognito (erases this conversation)' : 'Incognito conversation, nothing is saved'}>
            <span>
              <IconButton
                aria-label={incognito ? 'Leave incognito conversation' : 'Start an incognito conversation'}
                aria-pressed={incognito}
                onClick={toggleIncognito}
                disabled={busy}
                size="small"
                sx={incognito ? { color: 'primary.contrastText', bgcolor: 'text.primary', '&:hover': { bgcolor: 'text.secondary' } } : undefined}
              >
                <IncognitoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          </>)}
          <Tooltip title={maximized ? 'Restore size' : 'Full screen'}>
            <IconButton
              aria-label={maximized ? 'Restore assistant size' : 'Expand assistant to full screen'}
              aria-pressed={maximized}
              onClick={() => setMaximized((value) => !value)}
              size="small"
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              {maximized ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <IconButton aria-label="Close assistant" onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box
          ref={gridRef}
          sx={split ? {
            display: 'grid', minHeight: 0, flexGrow: 1, gridTemplateRows: 'minmax(0, 1fr)',
            p: `${SPLIT_GUTTER}px`, bgcolor: 'background.default',
            gridTemplateColumns: [
              sidebarShown ? `${splitFit.sidebar}px ${SPLIT_GUTTER}px` : '',
              `minmax(${SPLIT_THREAD_MIN}px, 1fr)`,
              paneView ? `${SPLIT_GUTTER}px ${splitFit.pane}px` : '',
            ].filter(Boolean).join(' '),
            ...(splitDrag ? { userSelect: 'none', cursor: 'col-resize' } : {}),
          } : { display: 'flex', minHeight: 0, flexGrow: 1 }}
        >
          {split && (
            <Box role="status" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
              {paneNotice}
            </Box>
          )}
          {split && sidebarShown && (
            <Box
              component="nav"
              aria-label="Conversations"
              sx={{ minHeight: 0, overflowY: 'auto', ...splitSurface }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, p: 1 }}>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={startNewConversation}
                  disabled={busy}
                  sx={{ flexGrow: 1, justifyContent: 'flex-start' }}
                >
                  New conversation
                </Button>
                <Tooltip title={incognito ? 'Leave incognito (erases this conversation)' : 'Incognito conversation, nothing is saved'}>
                  <span>
                    <IconButton
                      aria-label={incognito ? 'Leave incognito conversation' : 'Start an incognito conversation'}
                      aria-pressed={incognito}
                      onClick={toggleIncognito}
                      disabled={busy}
                      sx={incognito ? { color: 'primary.contrastText', bgcolor: 'text.primary', '&:hover': { bgcolor: 'text.secondary' } } : undefined}
                    >
                      <IncognitoIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
              <Divider />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.5, pt: 1, fontWeight: 700 }}>
                Conversations
              </Typography>
              {conversationRows}
            </Box>
          )}
          {split && sidebarShown && splitSeparator('sidebar')}
          {!split && showHistory && (
            <Box sx={{ width: { xs: 190, sm: 210 }, flexShrink: 0, borderRight: 1, borderColor: 'divider', overflowY: 'auto', bgcolor: 'background.default' }}>
              <Box sx={{ p: 1 }}>
                <Button fullWidth startIcon={<AddIcon />} onClick={startNewConversation} disabled={busy}>New conversation</Button>
              </Box>
              <Divider />
              {conversationRows}
            </Box>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flexGrow: 1, ...splitSurface }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: publicRecordsReady ? 'success.main' : 'warning.main' }} />
              <Typography variant="caption" color="text.secondary">
                {publicRecordsReady
                  ? `Public records ready${recordsCoverage ? ` (${recordsCoverage})` : ''} · reference only`
                  : 'Public records temporarily unavailable'}
              </Typography>
            </Box>

            {incognito && (
              <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75, bgcolor: 'text.primary', color: 'background.paper' }}>
                <IncognitoIcon sx={{ fontSize: 16 }} />
                <Typography variant="caption" sx={{ lineHeight: 1.4 }}>
                  Incognito: this conversation is not saved to your history and the assistant keeps no copy. Leaving it or closing the page erases it.
                </Typography>
              </Box>
            )}
            <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
              <Box
                ref={scrollRef}
                sx={{ flexGrow: 1, overflowY: 'auto', overscrollBehavior: 'contain', px: 2, py: 2, scrollbarGutter: 'stable' }}
              >
                <Box sx={{ maxWidth: columnMaxWidth, mx: 'auto', minWidth: 0 }}>
                  {notice && (
                    <Box role="status" sx={{ mb: 1.5, p: 1, borderRadius: 1.5, bgcolor: 'action.hover' }}>
                      <Typography variant="caption">{notice}</Typography>
                    </Box>
                  )}
                  {unavailable ? (
                    <Box sx={{ textAlign: 'center', mt: 6, px: 2 }}>
                      <SmartToyOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>The assistant is not available right now</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Your properties and documents are safe. Try again in a few minutes.</Typography>
                      <Button sx={{ mt: 1.5 }} onClick={() => void retryAssistant()}>Try again</Button>
                    </Box>
                  ) : loadingHistory ? (
                    <Box sx={{ display: 'grid', placeItems: 'center', mt: 6 }}><CircularProgress size={24} aria-label="Loading conversation" /></Box>
                  ) : (
                    <>
                      {empty && (
                        <EmptyState
                          onAsk={(prompt) => void send(prompt)}
                          incognito={incognito}
                          coverage={publicRecordsReady ? recordsCoverage : ''}
                          disabled={busy || uploading}
                        />
                      )}
                      {/* Kept mounted across a new chat so its first messages animate in;
                          a loaded history remounts it and renders in place. */}
                      <MessageList
                        messages={messages}
                        busy={busy}
                        lastAssistantId={lastAssistantId ?? null}
                        streamingId={streamingId}
                        renderAssistantBody={renderAssistantBody}
                        renderAssistantExtras={renderAssistantExtras}
                        onCopy={copyMessage}
                        onRegenerate={regenerate}
                        onEditResend={editAndResend}
                      />
                    </>
                  )}
                </Box>
              </Box>
              {!unavailable && !empty && (
                <JumpToLatest atBottom={atBottom} onClick={() => scrollToBottom()} streaming={busy} />
              )}
            </Box>

            {!unavailable && (
              <Box sx={{ px: 1.5, pt: 0.75, pb: 1 }}>
                <Box sx={{ maxWidth: columnMaxWidth, mx: 'auto' }}>
                  <Composer
                    inputRef={composerInputRef}
                    value={input}
                    onChange={setInput}
                    onSend={() => void send()}
                    onStop={stop}
                    busy={busy}
                    uploading={uploading}
                    incognito={incognito}
                    attachments={attachments}
                    onRemoveAttachment={(id) => setAttachments((previous) => previous.filter((item) => item.id !== id))}
                    onPickFiles={(files) => void uploadFiles(files)}
                    modelSlot={showCosts ? <ModelPicker models={models} value={model} onChange={chooseModel} disabled={busy} /> : undefined}
                  />
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 1.5, rowGap: 0.25, mt: 0.5, px: 0.5 }}>
                    {showCosts && <UsageFooter
                      usage={usage}
                      incognitoSpend={incognitoSpend}
                      chatSpend={thisChatSpend}
                      refreshing={usageRefreshing}
                      checkedAt={usageCheckedAt}
                      onRefresh={() => {
                        void loadUsage();
                        if (!incognito && activeConversationRef.current) void loadChatSpend(activeConversationRef.current);
                      }}
                      onSetBalance={setCreditBalance}
                    />}
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 0.25 }}>
                    These are old registration records. They do not prove who owns the land today.
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
          {paneView && paneMessage && splitSeparator('pane')}
          {paneView && paneMessage && (
            <Box
              component="aside"
              aria-label="Results"
              ref={paneRef}
              tabIndex={-1}
              onKeyDown={(event) => {
                // Esc inside the pane closes the pane, not the whole assistant.
                if (event.key !== 'Escape') return;
                event.stopPropagation();
                closeResults();
              }}
              sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, ...splitSurface, '&:focus-visible': { outline: 'none' } }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography component="h2" variant="body2" sx={{ fontWeight: 700 }} noWrap title={paneView.title}>
                    Public records · {paneView.query?.name || paneView.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {matchCount(paneView)}
                  </Typography>
                </Box>
                <Tooltip title="Close results">
                  <IconButton aria-label="Close results" onClick={closeResults} size="small">
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', px: 1.5, pb: 2 }}>
                <RefinePanel
                  key={`${paneMessage.id}:${paneView.id}`}
                  view={paneView}
                  defaultOpen
                  disabled={busy || uploading || refining}
                  onRefine={refineRecords}
                />
                <RecordViewCard key={`${paneMessage.id}:${paneView.id}`} view={paneView} onAdd={incognito ? undefined : addDeed} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Drawer>
    </AssistantLeaveContext.Provider>
  );
}
