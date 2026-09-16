/**
 * ChatGPT-like Pattadar assistant drawer.
 *
 * Conversations and messages are authoritative in services/assistant. The
 * browser only receives redacted capability readiness and never receives
 * model, database, tool-server configuration, URLs, or credentials.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import AddIcon from '@mui/icons-material/Add';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HistoryIcon from '@mui/icons-material/History';
import SendIcon from '@mui/icons-material/Send';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { apiErrorMessage, apiFetch } from '../api/client';

const ASSISTANT_BASE = '/api/gateway/assistant/api';
const PANEL_WIDTH = 520;

interface Conversation {
  id: string;
  title: string | null;
  status: 'active' | 'archived' | 'deleted';
  message_count: number;
  updated_at: string;
}

interface AttachmentSelection {
  id: string;
  fileName: string;
}

interface MessageActivity {
  id: string;
  label: string;
  state: 'running' | 'done' | 'error';
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  attachments?: string[];
  activities?: MessageActivity[];
}

interface StreamEvent {
  type?: 'token' | 'thinking' | 'tool_start' | 'tool_end' | 'action' | 'error';
  text?: string;
  name?: string;
  id?: string;
  content?: string;
  action?: string;
  path?: string;
  args?: Record<string, unknown>;
}

interface CapabilityResponse {
  public_records?: {
    ready?: boolean;
    status?: 'ready' | 'temporarily_unavailable';
    tool_count?: number;
    semantic_search_ready?: boolean;
  };
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  const output: ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  parts.forEach((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      output.push(<strong key={`${keyBase}-${index}`}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      output.push(
        <Box
          key={`${keyBase}-${index}`}
          component="code"
          sx={{ fontFamily: 'monospace', fontSize: '0.85em', px: 0.5, borderRadius: 0.5, bgcolor: 'action.hover' }}
        >
          {part.slice(1, -1)}
        </Box>,
      );
    } else if (part) {
      output.push(part);
    }
  });
  return output;
}

function MarkdownLite({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, index) => {
        const bullet = /^\s*[-*]\s+/.test(line);
        const content = bullet ? line.replace(/^\s*[-*]\s+/, '') : line;
        const heading = /^#{1,6}\s+/.test(content);
        const clean = heading ? content.replace(/^#{1,6}\s+/, '') : content;
        return (
          <Box key={index} sx={{ display: 'flex', gap: 0.75, minHeight: line.trim() ? undefined : '0.6em' }}>
            {bullet && <Box component="span">•</Box>}
            <Box component="span" sx={heading ? { fontWeight: 700 } : undefined}>
              {heading ? clean : renderInline(clean, `line-${index}`)}
            </Box>
          </Box>
        );
      })}
    </>
  );
}

/** Parse CRLF or LF SSE framing incrementally. */
function makeSseParser(onEvent: (payload: string) => void): (chunk: string) => void {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk.replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) onEvent(data);
      boundary = buffer.indexOf('\n\n');
    }
  };
}

function displayToolName(name: string): string {
  const shortName = name.split('__').at(-1) ?? name;
  return shortName.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export interface AssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

export function AssistantPanel({ open, onClose }: AssistantPanelProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const activeConversationRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [notice, setNotice] = useState('');
  const [attachments, setAttachments] = useState<AttachmentSelection[]>([]);
  const [uploading, setUploading] = useState(false);
  const [publicRecordsReady, setPublicRecordsReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const setActive = useCallback((id: string | null) => {
    activeConversationRef.current = id;
    setActiveConversationId(id);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    setLoadingHistory(true);
    setNotice('');
    try {
      const response = await apiFetch(`${ASSISTANT_BASE}/conversations/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error(await apiErrorMessage(response, 'Conversation could not be loaded.'));
      const body = (await response.json()) as {
        messages?: Array<{ role: 'human' | 'ai' | 'user' | 'assistant'; content: string }>;
      };
      setMessages((body.messages ?? []).map((message) => ({
        id: newId(),
        role: message.role === 'human' || message.role === 'user' ? 'user' : 'assistant',
        text: message.content,
      })));
      setAttachments([]);
      setActive(id);
      setShowHistory(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Conversation could not be loaded.');
    } finally {
      setLoadingHistory(false);
    }
  }, [setActive]);

  const loadConversations = useCallback(async (selectNewest: boolean) => {
    const response = await apiFetch(`${ASSISTANT_BASE}/conversations?status=active&limit=50`);
    if (!response.ok) throw new Error(await apiErrorMessage(response, 'Conversation history is unavailable.'));
    const body = (await response.json()) as { conversations?: unknown };
    if (!Array.isArray(body.conversations)) {
      throw new Error('The assistant returned an invalid conversation response.');
    }
    const rows = body.conversations as Conversation[];
    setConversations(rows);
    if (selectNewest && !activeConversationRef.current && rows[0]) {
      await loadConversation(rows[0].id);
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
    } catch {
      setPublicRecordsReady(false);
    }
  }, []);

  const retryAssistant = useCallback(async () => {
    try {
      await loadConversations(true);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
    await loadCapabilities();
  }, [loadConversations, loadCapabilities]);

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

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, busy]);

  async function createConversation(): Promise<string> {
    const response = await apiFetch(`${ASSISTANT_BASE}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_context: {
          app: { name: 'Pattadar' },
          page: { path: location.pathname, menuItem: document.title },
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

  function startNewConversation() {
    if (busy) return;
    setActive(null);
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

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
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
    if (event.action === 'navigate' && event.path?.startsWith('/app')) {
      navigate(event.path);
    }
    const detail = { action: event.action, path: event.path, args: event.args ?? {} };
    window.dispatchEvent(new CustomEvent('pattadar:assistant-action', { detail }));
    window.dispatchEvent(new CustomEvent('shell-action', { detail }));
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || uploading) return;
    const selectedAttachments = attachments;
    const userMessage: ChatMessage = {
      id: newId(),
      role: 'user',
      text,
      attachments: selectedAttachments.map((attachment) => attachment.fileName),
    };
    const assistantId = newId();
    setInput('');
    setNotice('');
    setUnavailable(false);
    setMessages((previous) => [
      ...previous,
      userMessage,
      { id: assistantId, role: 'assistant', text: '', activities: [] },
    ]);
    setBusy(true);

    let streamError = '';
    try {
      const conversationId = await ensureConversation();
      const response = await apiFetch(`${ASSISTANT_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: text,
          run_id: newId(),
          attachment_ids: selectedAttachments.map((attachment) => attachment.id),
          application_context: {
            app: { name: 'Pattadar' },
            page: { path: location.pathname, menuItem: document.title },
          },
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error(await apiErrorMessage(response, 'The assistant could not answer.'));
      }

      const parser = makeSseParser((payload) => {
        if (payload === '[DONE]') return;
        try {
          const event = JSON.parse(payload) as StreamEvent;
          if (event.type === 'token' && event.text) {
            updateAssistantMessage(assistantId, (message) => ({ ...message, text: message.text + event.text }));
          } else if (event.type === 'thinking') {
            updateAssistantMessage(assistantId, (message) => {
              if (message.activities?.some((activity) => activity.id === 'thinking')) return message;
              return {
                ...message,
                activities: [...(message.activities ?? []), { id: 'thinking', label: 'Thinking', state: 'running' }],
              };
            });
          } else if (event.type === 'tool_start') {
            const toolId = event.id || `tool-${newId()}`;
            updateAssistantMessage(assistantId, (message) => ({
              ...message,
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
          } else if (event.type === 'action') {
            dispatchAction(event);
          } else if (event.type === 'error') {
            streamError = event.text || 'The assistant could not complete that request.';
          }
        } catch {
          // Ignore malformed or non-JSON service comments.
        }
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser(decoder.decode(value, { stream: true }));
      }
      parser(decoder.decode());
      setAttachments([]);
      await loadConversations(false);
    } catch (error) {
      streamError = error instanceof Error ? error.message : 'The assistant could not answer.';
    } finally {
      setBusy(false);
      updateAssistantMessage(assistantId, (message) => ({
        ...message,
        activities: (message.activities ?? []).map((activity) => ({ ...activity, state: 'done' })),
      }));
    }

    if (streamError) {
      updateAssistantMessage(assistantId, (message) => ({
        ...message,
        text: message.text ? `${message.text}\n\n${streamError}` : streamError,
        activities: [...(message.activities ?? []), { id: newId(), label: 'Request interrupted', state: 'error' }],
      }));
    }
  }

  const empty = messages.length === 0;

  return (
    <Drawer
      anchor="right"
      variant="temporary"
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', sm: PANEL_WIDTH }, maxWidth: '100vw' } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 1.25, borderBottom: 2, borderColor: 'primary.main' }}>
          <SmartToyOutlinedIcon sx={{ color: 'primary.main' }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>Pattadar Assistant</Typography>
          <Tooltip title="Conversation history">
            <IconButton aria-label="Conversation history" onClick={() => setShowHistory((value) => !value)} size="small">
              <HistoryIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="New conversation">
            <span>
              <IconButton aria-label="New conversation" onClick={startNewConversation} disabled={busy} size="small">
                <AddIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <IconButton aria-label="Close assistant" onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex', minHeight: 0, flexGrow: 1 }}>
          {showHistory && (
            <Box sx={{ width: { xs: 190, sm: 210 }, flexShrink: 0, borderRight: 1, borderColor: 'divider', overflowY: 'auto', bgcolor: 'background.default' }}>
              <Box sx={{ p: 1 }}>
                <Button fullWidth startIcon={<AddIcon />} onClick={startNewConversation} disabled={busy}>New chat</Button>
              </Box>
              <Divider />
              {conversations.length === 0 ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', p: 2 }}>No saved conversations yet.</Typography>
              ) : conversations.map((conversation) => (
                <Box
                  key={conversation.id}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.25, px: 0.75, py: 0.5, bgcolor: activeConversationId === conversation.id ? 'action.selected' : undefined }}
                >
                  <Button
                    onClick={() => void loadConversation(conversation.id)}
                    disabled={busy}
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
              ))}
            </Box>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flexGrow: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: publicRecordsReady ? 'success.main' : 'warning.main' }} />
              <Typography variant="caption" color="text.secondary">
                {publicRecordsReady
                  ? 'Public records ready'
                  : 'Public records temporarily unavailable'}
              </Typography>
            </Box>

            <Box ref={scrollRef} sx={{ flexGrow: 1, overflowY: 'auto', px: 2, py: 2 }}>
              {notice && (
                <Box role="status" sx={{ mb: 1.5, p: 1, borderRadius: 1.5, bgcolor: 'action.hover' }}>
                  <Typography variant="caption">{notice}</Typography>
                </Box>
              )}
              {unavailable ? (
                <Box sx={{ textAlign: 'center', mt: 6, px: 2 }}>
                  <SmartToyOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Assistant is temporarily unavailable</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Your records are safe. Please try again shortly.</Typography>
                  <Button sx={{ mt: 1.5 }} onClick={() => void retryAssistant()}>Try again</Button>
                </Box>
              ) : loadingHistory ? (
                <Box sx={{ display: 'grid', placeItems: 'center', mt: 6 }}><CircularProgress size={24} /></Box>
              ) : empty ? (
                <Box sx={{ textAlign: 'center', mt: 6, px: 2 }}>
                  <SmartToyOutlinedIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Hello! I'm your Pattadar assistant.</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Ask about land, documents, family holdings, or a file you upload. Questions outside Pattadar are declined.
                  </Typography>
                </Box>
              ) : messages.map((message) => (
                <Box key={message.id} sx={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start', mb: 1.25 }}>
                  <Box
                    sx={(theme) => ({
                      maxWidth: '88%', px: 1.5, py: 1, borderRadius: 2.5, fontSize: '0.9rem', lineHeight: 1.55,
                      whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                      ...(message.role === 'user'
                        ? { bgcolor: 'primary.main', color: 'primary.contrastText', borderBottomRightRadius: 6 }
                        : { bgcolor: 'background.default', border: 1, borderColor: 'divider', borderBottomLeftRadius: 6, ...theme.applyStyles('dark', { bgcolor: (theme.vars ?? theme).palette.action.hover }) }),
                    })}
                  >
                    {message.attachments?.map((fileName) => (
                      <Chip key={fileName} size="small" icon={<AttachFileIcon />} label={fileName} sx={{ mb: 0.75, mr: 0.5, maxWidth: '100%' }} />
                    ))}
                    {message.role === 'assistant' ? (
                      message.text ? <MarkdownLite text={message.text} /> : <CircularProgress size={14} sx={{ color: 'primary.main', my: 0.5 }} />
                    ) : message.text}
                    {message.activities && message.activities.length > 0 && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: message.text ? 1 : 0.25 }}>
                        {message.activities.map((activity) => (
                          <Chip
                            key={activity.id}
                            size="small"
                            variant="outlined"
                            color={activity.state === 'error' ? 'error' : 'default'}
                            icon={activity.state === 'running' ? <CircularProgress size={11} /> : <CheckCircleOutlinedIcon />}
                            label={activity.label}
                            sx={{ maxWidth: '100%' }}
                          />
                        ))}
                      </Box>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>

            {!unavailable && (
              <Box sx={{ borderTop: 1, borderColor: 'divider', px: 1.5, py: 1.25 }}>
                {attachments.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                    {attachments.map((attachment) => (
                      <Chip
                        key={attachment.id}
                        size="small"
                        icon={<AttachFileIcon />}
                        label={attachment.fileName}
                        onDelete={() => setAttachments((previous) => previous.filter((item) => item.id !== attachment.id))}
                        sx={{ maxWidth: '100%' }}
                      />
                    ))}
                  </Box>
                )}
                <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.75 }}>
                  <input ref={fileInputRef} hidden type="file" multiple onChange={(event) => void uploadFiles(event)} />
                  <Tooltip title="Attach documents or images">
                    <span>
                      <IconButton aria-label="Attach files" onClick={() => fileInputRef.current?.click()} disabled={busy || uploading}>
                        {uploading ? <CircularProgress size={20} /> : <AttachFileIcon />}
                      </IconButton>
                    </span>
                  </Tooltip>
                  <InputBase
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                    placeholder="Ask about Pattadar…"
                    multiline
                    maxRows={5}
                    fullWidth
                    sx={{ px: 1.5, py: 0.75, borderRadius: 2.5, border: 1, borderColor: 'divider', fontSize: '0.9rem' }}
                    inputProps={{ 'aria-label': 'Message the Pattadar assistant' }}
                  />
                  <IconButton aria-label="Send message" onClick={() => void send()} disabled={busy || uploading || !input.trim()} sx={{ color: 'primary.main' }}>
                    <SendIcon />
                  </IconButton>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 0.75 }}>
                  Historical reference results are not proof of current legal title.
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Drawer>
  );
}
