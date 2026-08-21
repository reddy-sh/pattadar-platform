/**
 * AssistantPanel — right-hand chat drawer for the in-app Pattadar Assistant.
 *
 * Talks to the assistant service THROUGH the gateway
 * (POST /api/gateway/assistant/api/chat/stream, SSE) using the shared Bearer
 * token seam (apiFetch). Conversation state lives in memory for the session:
 * a conversation is created lazily on the first message and reused after.
 *
 * v1 scope: streams `token` events into the assistant bubble; `thinking`,
 * `tool_*` and `action` events are ignored. If the endpoint is missing or
 * errors (e.g. local dev without the assistant running), the panel shows a
 * graceful "available soon" state — never a broken panel.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { apiFetch } from '../api/client';

const ASSISTANT_BASE = '/api/gateway/assistant/api';
const PANEL_WIDTH = 380;

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * Markdown-lite: **bold** and `code` inline, "- " bullets, blank-line
 * paragraph breaks. Deliberately tiny — no dependency, no HTML injection.
 */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Split keeping delimiters for **bold** and `code`.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  parts.forEach((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      out.push(<strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      out.push(
        <Box
          key={`${keyBase}-${i}`}
          component="code"
          sx={{ fontFamily: 'monospace', fontSize: '0.85em', px: 0.5, borderRadius: 0.5, bgcolor: 'action.hover' }}
        >
          {part.slice(1, -1)}
        </Box>,
      );
    } else if (part) {
      out.push(part);
    }
  });
  return out;
}

function MarkdownLite({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        const bullet = /^\s*[-*]\s+/.test(line);
        const content = bullet ? line.replace(/^\s*[-*]\s+/, '') : line;
        // Strip markdown heading markers — render as bold instead.
        const heading = /^#{1,6}\s+/.test(content);
        const clean = heading ? content.replace(/^#{1,6}\s+/, '') : content;
        return (
          <Box key={i} sx={{ display: 'flex', gap: 0.75, minHeight: line.trim() ? undefined : '0.6em' }}>
            {bullet && <Box component="span">•</Box>}
            <Box component="span" sx={heading ? { fontWeight: 700 } : undefined}>
              {heading ? clean : renderInline(clean, `l${i}`)}
            </Box>
          </Box>
        );
      })}
    </>
  );
}

/** Parse SSE bytes incrementally; invoke onEvent for each `data:` payload. */
function makeSseParser(onEvent: (payload: string) => void): (chunk: string) => void {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    let idx = buffer.indexOf('\n\n');
    while (idx >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of block.split('\n')) {
        if (line.startsWith('data: ')) onEvent(line.slice(6));
      }
      idx = buffer.indexOf('\n\n');
    }
  };
}

export interface AssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

export function AssistantPanel({ open, onClose }: AssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Keep the newest message in view while streaming.
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function ensureConversation(): Promise<string> {
    if (conversationIdRef.current) return conversationIdRef.current;
    const res = await apiFetch(`${ASSISTANT_BASE}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`conversation create failed: ${res.status}`);
    const body = (await res.json()) as { id: string };
    conversationIdRef.current = body.id;
    return body.id;
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }, { role: 'assistant', text: '' }]);
    setBusy(true);

    const appendToken = (t: string) => {
      setMessages((prev) => {
        const next = prev.slice();
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          next[next.length - 1] = { role: 'assistant', text: last.text + t };
        }
        return next;
      });
    };

    let streamErrored = false;
    try {
      const conversationId = await ensureConversation();
      const res = await apiFetch(`${ASSISTANT_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, message: text }),
      });
      if (!res.ok || !res.body) throw new Error(`chat stream failed: ${res.status}`);

      const parse = makeSseParser((payload) => {
        if (payload === '[DONE]') return;
        try {
          const evt = JSON.parse(payload) as { type?: string; text?: string };
          if (evt.type === 'token' && evt.text) appendToken(evt.text);
          else if (evt.type === 'error') streamErrored = true;
          // thinking / tool_start / tool_end / action: ignored in v1.
        } catch {
          // Not JSON (comment/keepalive) — ignore.
        }
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parse(decoder.decode(value, { stream: true }));
      }
    } catch {
      streamErrored = true;
    } finally {
      setBusy(false);
    }

    if (streamErrored) {
      setMessages((prev) => {
        const next = prev.slice();
        const last = next[next.length - 1];
        if (last && last.role === 'assistant' && !last.text) {
          // Nothing streamed at all — treat the assistant as unreachable.
          setUnavailable(true);
          next.pop();
          next.pop(); // Also drop the user bubble; the panel shows the soon-state.
        } else if (last && last.role === 'assistant') {
          next[next.length - 1] = {
            role: 'assistant',
            text: last.text + '\n\nSorry — I lost the connection there. Please try again.',
          };
        }
        return next;
      });
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
      sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', sm: PANEL_WIDTH } } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header — gold accent underline, close button */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.5,
            borderBottom: 2,
            borderColor: 'primary.main',
          }}
        >
          <SmartToyOutlinedIcon sx={{ color: 'primary.main' }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>
            Assistant
          </Typography>
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: 'primary.main',
            }}
          />
          <IconButton aria-label="Close assistant" onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Messages */}
        <Box ref={scrollRef} sx={{ flexGrow: 1, overflowY: 'auto', px: 2, py: 2 }}>
          {unavailable ? (
            <Box sx={{ textAlign: 'center', mt: 6, px: 2 }}>
              <SmartToyOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Assistant will be available soon
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                We couldn't reach the assistant right now. Your land records are safe — please
                try again a little later.
              </Typography>
            </Box>
          ) : empty ? (
            <Box sx={{ textAlign: 'center', mt: 6, px: 2 }}>
              <SmartToyOutlinedIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Hello! I'm your Pattadar assistant.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Ask about your land, documents or family records — in your own words.
              </Typography>
            </Box>
          ) : (
            messages.map((m, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                  mb: 1.25,
                }}
              >
                <Box
                  sx={(t) => ({
                    maxWidth: '85%',
                    px: 1.5,
                    py: 1,
                    borderRadius: 2.5,
                    fontSize: '0.9rem',
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    ...(m.role === 'user'
                      ? {
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                          borderBottomRightRadius: 6,
                        }
                      : {
                          bgcolor: 'background.default',
                          border: 1,
                          borderColor: 'divider',
                          borderBottomLeftRadius: 6,
                          ...t.applyStyles('dark', { bgcolor: (t.vars ?? t).palette.action.hover }),
                        }),
                  })}
                >
                  {m.role === 'assistant' ? (
                    m.text ? (
                      <MarkdownLite text={m.text} />
                    ) : (
                      <CircularProgress size={14} sx={{ color: 'primary.main', my: 0.5 }} />
                    )
                  ) : (
                    m.text
                  )}
                </Box>
              </Box>
            ))
          )}
        </Box>

        {/* Input */}
        {!unavailable && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 1,
              px: 1.5,
              py: 1.25,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <InputBase
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask the assistant…"
              multiline
              maxRows={4}
              fullWidth
              sx={{
                px: 1.5,
                py: 0.75,
                borderRadius: 2.5,
                border: 1,
                borderColor: 'divider',
                fontSize: '0.9rem',
              }}
              inputProps={{ 'aria-label': 'Message the assistant' }}
            />
            <IconButton
              aria-label="Send message"
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              sx={{ color: 'primary.main' }}
            >
              <SendIcon />
            </IconButton>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
