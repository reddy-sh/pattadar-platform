/** Shared shapes for the assistant drawer and its rich displays. */

export interface Conversation {
  id: string;
  title: string | null;
  status: 'active' | 'archived' | 'deleted';
  message_count: number;
  updated_at: string;
}

export interface AttachmentSelection {
  id: string;
  fileName: string;
}

export interface MessageActivity {
  id: string;
  label: string;
  state: 'running' | 'done' | 'error';
}

export type ViewCell = string | number | null;

/** A public-record result the service hands over for display (domain/record_views.py). */
export interface RecordView {
  id: string;
  kind: 'table' | 'report';
  title: string;
  columns?: Array<{ key: string; label: string }>;
  rows?: Array<Record<string, ViewCell>>;
  total?: number;
  note?: string | null;
  markdown?: string;
  /** Tap-to-ask next questions worked out from the rows (domain/follow_ups.py). */
  follow_ups?: Array<{ label: string; prompt: string }>;
  /** Headline figures for a party search (domain/record_views.py); drawn as stat cards. */
  summary?: RecordSummary;
  /** Party search only: counts over every matched row, for the refine panel (contract C5). */
  facets?: RecordFacets;
  /** Party search only: the search these rows answer, so a refinement starts from it (C5). */
  query?: RecordQuery;
}

export interface FacetCount {
  name: string;
  count: number;
}

export interface RecordFacets {
  /** Top 15 villages over all matched rows, not just the rows returned. */
  villages?: FacetCount[];
  /** Top 10 SROs. */
  sros?: FacetCount[];
  /** Match counts by name confidence: exact (100%), high (>=90%), medium (>=70%), low. */
  confidence?: { exact: number; high: number; medium: number; low: number };
  /** The name is so common that these counts come from a capped sample, not every match. */
  sampled?: boolean;
}

export interface RecordQuery {
  name: string;
  villages: string[];
  sro: string | null;
  min_similarity: number;
  side: string | null;
}

export type PartySide = 'claimant' | 'executant';

/** POST /api/records/party-search (contract C6): a refinement with no model call. */
export interface PartySearchRequest {
  name: string;
  villages?: string[];
  sro?: string;
  min_similarity?: number;
  side?: PartySide;
  conversation_id?: string;
  incognito?: boolean;
}

export interface PartySearchResponse {
  view: RecordView;
  text: string;
}

export type Stake = 'owned' | 'managed' | 'watch';
export type ProposalStatus = 'draft' | 'saved' | 'partial' | 'dismissed';

/** One deed in a proposal, built by the service from the public record (contract C3). */
export interface ProposalItem {
  index: number;
  rid: string;
  s_no: string | number | null;
  kind: 'parcel' | 'property';
  title: string;
  village: string;
  mandal: string;
  district: string;
  survey_no: string;
  extent: number | null;
  extent_unit: 'ac' | 'sq.yd' | 'sq.ft' | null;
  doc_no: string;
  sro: string;
  reg_date: string;
  consideration: number | null;
  /** The registry's government (market) value — never the owner's estimate. */
  market_value: number | null;
  /** The registry's transaction class (SALE, GIFT, PARTITION, MORTGAGE…). */
  txn_class: string;
  exec_date: string;
  plot_no: string;
  house_no: string;
  land_class: string;
  boundary_north: string;
  boundary_south: string;
  boundary_east: string;
  boundary_west: string;
  seller_name: string;
  buyer_name: string;
  source_ref: string;
  buyer_matches_user: boolean | null;
  record_id: string | null;
  error: string | null;
  /** The stake this item was saved with (stored with its outcome), which may
   *  differ from the model's draft stake; absent until saved. */
  saved_stake?: Stake | null;
}

/** A confirmation card: nothing is saved until the reader clicks Save. */
export interface Proposal {
  id: string;
  status: ProposalStatus;
  stake: Stake | null;
  items: ProposalItem[];
  /** The holding the card grouped its saved records into (D2), when it did. */
  holding_id?: string | null;
}

export type ServiceProposalStatus = 'draft' | 'ordered' | 'partial' | 'dismissed';

/** One order placed from a service card, as the server named it. */
export interface ServiceOrderRef {
  id: string;
  ref: string;
  kind: string;
  title: string;
}

/** What happened for one record on a service card (stored outcome, C4). */
export interface ServiceProposalResult {
  record_id: string;
  /** Catalogue keys placed for this record. */
  kinds: string[];
  batch_id: string | null;
  batch_ref: string | null;
  orders: ServiceOrderRef[];
  error: string | null;
}

/**
 * "Request these services" — a `service_proposal` event (D3). The model only
 * names what the reader asked for; the card loads the real catalogue and
 * prices, and nothing is ordered until the reader clicks Place request.
 */
export interface ServiceProposal {
  id: string;
  status: ServiceProposalStatus;
  records: Array<{ record_id: string; title: string }>;
  /** What the reader asked for, in their words (free text, matched to offers in the browser). */
  requested: string[];
  note: string;
  results: ServiceProposalResult[];
}

/** Party-search headline figures, worked out by the service over every match. */
export interface RecordSummary {
  total_matches: number;
  exact_matches: number;
  as_buyer: number;
  as_seller: number;
  consideration_total: number | null;
  first_date: string | null;
  last_date: string | null;
  /** The distinct village names among the matches (record_views.py `_party_summary`). */
  villages: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  attachments?: string[];
  activities?: MessageActivity[];
  views?: RecordView[];
  /** Add-to-your-properties cards the reply offered (never in incognito). */
  proposals?: Proposal[];
  /** Request-a-service cards the reply offered (never in incognito). */
  serviceProposals?: ServiceProposal[];
  /** Chat-level next questions (the final `usage` event, or GET per message). */
  followUps?: Array<{ label: string; prompt: string }>;
  /** True once a public-record tool ran for this reply; it carries the disclaimer. */
  usedRecords?: boolean;
  /** What this reply cost, from the service (domain/billing.py). */
  cost?: RequestCost;
  /** True when the reader stopped this reply mid-stream; its partial text is kept. */
  stopped?: boolean;
  /** Why this reply failed, shown under it; never part of `text` (or the model's history). */
  error?: string;
  /** The service run that asked this question (saved chats), so a redo can replace it. */
  runId?: string;
}

export interface RequestCost {
  model?: string;
  cost_usd?: number | null;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface UsageSummary {
  today_usd: number;
  month_usd: number;
  requests_today: number;
  credit_status: 'ok' | 'exhausted' | 'unknown';
  /** Estimated remaining credit: the balance someone entered minus spend since. */
  balance_usd?: number | null;
  balance_set_at?: string | null;
}

export interface AssistantModel {
  id: string;
  name: string;
  tier: string;
  input_per_mtok: number | null;
  output_per_mtok: number | null;
  default: boolean;
}

export interface StreamEvent extends Partial<Omit<RecordView, 'id'>> {
  type?: 'token' | 'thinking' | 'tool_start' | 'tool_end' | 'action' | 'records' | 'proposal' | 'service_proposal' | 'usage' | 'error';
  text?: string;
  code?: string;
  model?: string;
  cost_usd?: number | null;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  name?: string;
  id?: string;
  content?: string;
  action?: string;
  path?: string;
  args?: Record<string, unknown>;
  /** `proposal` and `service_proposal` events (contract C3, D3). */
  status?: ProposalStatus | ServiceProposalStatus;
  stake?: Stake | null;
  items?: ProposalItem[];
  /** `service_proposal` events (D3). */
  records?: Array<{ record_id: string; title: string }>;
  requested?: string[];
}

export interface CapabilityResponse {
  public_records?: {
    ready?: boolean;
    status?: 'ready' | 'temporarily_unavailable';
    tool_count?: number;
    semantic_search_ready?: boolean;
    coverage?: string;
  };
}
