--
-- PostgreSQL database dump
--

-- Dumped from database version 17.4 (Homebrew)
-- Dumped by pg_dump version 17.4 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: ref; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA ref;


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: vectorscale; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vectorscale WITH SCHEMA public;


--
-- Name: EXTENSION vectorscale; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vectorscale IS 'diskann access method for vector search';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: document_access_logs; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.document_access_logs (
    id integer NOT NULL,
    document_id integer NOT NULL,
    user_id integer NOT NULL,
    action character varying(50) NOT NULL,
    status character varying(20) NOT NULL,
    ip_address character varying(45),
    user_agent character varying(500),
    session_id character varying(100),
    via_sharing boolean,
    shared_by_user_id integer,
    document_metadata jsonb,
    error_message character varying(500),
    "timestamp" timestamp without time zone
);


--
-- Name: document_access_logs_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.document_access_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_access_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.document_access_logs_id_seq OWNED BY app.document_access_logs.id;


--
-- Name: document_sharing; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.document_sharing (
    id integer NOT NULL,
    document_id integer NOT NULL,
    shared_with_user_id integer NOT NULL,
    shared_by_user_id integer NOT NULL,
    encrypted_file_key character varying(1000) NOT NULL,
    permission_level character varying(20),
    can_download boolean,
    can_share boolean,
    can_edit boolean,
    expires_at timestamp without time zone,
    is_active boolean,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    revoked_at timestamp without time zone
);


--
-- Name: document_sharing_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.document_sharing_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_sharing_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.document_sharing_id_seq OWNED BY app.document_sharing.id;


--
-- Name: documents; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.documents (
    id integer NOT NULL,
    group_id uuid NOT NULL,
    uploaded_by integer NOT NULL,
    original_filename character varying(255) NOT NULL,
    file_size integer NOT NULL,
    file_type character varying(100) NOT NULL,
    file_extension character varying(20) NOT NULL,
    title character varying(255) NOT NULL,
    description character varying(1000),
    category_id integer,
    tags jsonb,
    s3_bucket character varying(255) NOT NULL,
    s3_key character varying(500) NOT NULL,
    s3_version_id character varying(100),
    encryption_key_id integer NOT NULL,
    is_private boolean,
    is_shared boolean,
    access_level character varying(20),
    status character varying(50),
    version integer,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    deleted_at timestamp without time zone
);


--
-- Name: documents_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.documents_id_seq OWNED BY app.documents.id;


--
-- Name: group_members; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.group_members (
    id integer NOT NULL,
    group_id uuid NOT NULL,
    user_id integer NOT NULL,
    role_code character varying(50),
    nickname character varying(100),
    joined_at timestamp without time zone,
    updated_at timestamp without time zone,
    deleted_at timestamp without time zone
);


--
-- Name: groups; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.groups (
    id uuid NOT NULL,
    name character varying(150) NOT NULL,
    plan character varying(50) NOT NULL,
    description character varying,
    group_type character varying(50),
    avatar_url character varying(255),
    images jsonb,
    cover_url character varying(255),
    is_active boolean,
    is_private boolean,
    is_public boolean,
    visibility character varying(20) NOT NULL,
    motto character varying(500),
    established_date timestamp without time zone,
    heritage character varying(500),
    email character varying(255),
    phone_number character varying(50),
    website_url character varying(255),
    address character varying(500),
    city character varying(100),
    state character varying(100),
    country character varying(100),
    zip_code character varying(20),
    legal_entity_type character varying(100),
    tax_id character varying(100),
    registration_number character varying(100),
    beneficiary_percentage jsonb,
    inheritance_rules character varying,
    property_transfer_rules character varying,
    trust_documents jsonb,
    property_preferences jsonb,
    total_members integer,
    total_properties integer,
    total_documents integer,
    total_value integer,
    net_worth integer,
    emergency_contacts jsonb,
    important_dates jsonb,
    achievements jsonb,
    cultural_traditions jsonb,
    social_links jsonb,
    tags jsonb,
    created_by integer NOT NULL,
    owned_by integer NOT NULL,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    deleted_at timestamp without time zone,
    CONSTRAINT chk_group_visibility CHECK (((visibility)::text = ANY ((ARRAY['PUBLIC'::character varying, 'PRIVATE'::character varying, 'RESTRICTED'::character varying])::text[])))
);


--
-- Name: COLUMN groups.images; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.images IS 'Array of image URLs for group photo gallery';


--
-- Name: COLUMN groups.cover_url; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.cover_url IS 'URL of the group cover image';


--
-- Name: COLUMN groups.is_active; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.is_active IS 'Whether the group is active';


--
-- Name: COLUMN groups.is_private; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.is_private IS 'Whether the group is private';


--
-- Name: COLUMN groups.visibility; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.visibility IS 'Group visibility: PUBLIC (anyone can view), PRIVATE (members only), RESTRICTED (invite only)';


--
-- Name: COLUMN groups.motto; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.motto IS 'Family motto or values statement';


--
-- Name: COLUMN groups.established_date; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.established_date IS 'When the family/group was established';


--
-- Name: COLUMN groups.heritage; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.heritage IS 'Family origin, heritage, or history';


--
-- Name: COLUMN groups.email; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.email IS 'Primary contact email for the group';


--
-- Name: COLUMN groups.phone_number; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.phone_number IS 'Primary contact phone number';


--
-- Name: COLUMN groups.website_url; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.website_url IS 'Group website or social media page';


--
-- Name: COLUMN groups.address; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.address IS 'Primary address for the group';


--
-- Name: COLUMN groups.city; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.city IS 'City where group is based';


--
-- Name: COLUMN groups.state; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.state IS 'State/Province where group is based';


--
-- Name: COLUMN groups.country; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.country IS 'Country where group is based';


--
-- Name: COLUMN groups.zip_code; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.zip_code IS 'Postal/ZIP code';


--
-- Name: COLUMN groups.legal_entity_type; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.legal_entity_type IS 'Type of legal entity (Trust, LLC, etc.)';


--
-- Name: COLUMN groups.tax_id; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.tax_id IS 'Tax ID or EIN for the group';


--
-- Name: COLUMN groups.registration_number; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.registration_number IS 'Legal registration number for the entity';


--
-- Name: COLUMN groups.beneficiary_percentage; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.beneficiary_percentage IS 'JSON object mapping user IDs to beneficiary percentages';


--
-- Name: COLUMN groups.inheritance_rules; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.inheritance_rules IS 'Rules for inheritance and succession';


--
-- Name: COLUMN groups.property_transfer_rules; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.property_transfer_rules IS 'Rules and guidelines for property transfer within the group';


--
-- Name: COLUMN groups.trust_documents; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.trust_documents IS 'Links or references to trust documents';


--
-- Name: COLUMN groups.property_preferences; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.property_preferences IS 'Property management preferences and settings';


--
-- Name: COLUMN groups.total_members; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.total_members IS 'Total number of group members';


--
-- Name: COLUMN groups.total_properties; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.total_properties IS 'Total number of properties owned/managed';


--
-- Name: COLUMN groups.total_documents; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.total_documents IS 'Total number of documents stored';


--
-- Name: COLUMN groups.total_value; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.total_value IS 'Total value of all properties owned by the group';


--
-- Name: COLUMN groups.net_worth; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.net_worth IS 'Net worth of the group after liabilities';


--
-- Name: COLUMN groups.emergency_contacts; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.emergency_contacts IS 'Array of emergency contact objects';


--
-- Name: COLUMN groups.important_dates; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.important_dates IS 'Array of important dates (anniversaries, reunions, etc.)';


--
-- Name: COLUMN groups.achievements; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.achievements IS 'Array of group achievements and milestones';


--
-- Name: COLUMN groups.cultural_traditions; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.cultural_traditions IS 'Cultural traditions and customs of the family/group';


--
-- Name: COLUMN groups.social_links; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.social_links IS 'Social media and other online links';


--
-- Name: COLUMN groups.tags; Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON COLUMN app.groups.tags IS 'Searchable tags for the group';


--
-- Name: users; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.users (
    id integer NOT NULL,
    username character varying(50),
    name character varying(100),
    email character varying(100) NOT NULL,
    hashed_password character varying(255) NOT NULL,
    family_id integer,
    first_name character varying(50),
    middle_name character varying(50),
    last_name character varying(50),
    gender character varying(10),
    date_of_birth character varying,
    marital_status character varying(20),
    role character varying(50),
    about character varying,
    company character varying(100),
    school character varying(100),
    country character varying(100),
    state character varying(100),
    city character varying(100),
    address character varying,
    zip_code character varying(20),
    phone_number character varying(20),
    website_url character varying(255),
    profile_url character varying(255),
    avatar_url character varying(255),
    cover_url character varying(255),
    photo_url character varying(255),
    social_links jsonb,
    total_followers integer,
    total_following integer,
    total_posts integer,
    is_active boolean,
    is_verified boolean,
    is_superuser boolean,
    is_public boolean,
    status character varying(50),
    bio_data character varying,
    workspace_state character varying(50),
    last_login timestamp without time zone,
    login_count integer,
    last_password_change timestamp without time zone,
    created_by integer,
    updated_by integer,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    deleted_at timestamp without time zone
);


--
-- Name: group_details; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.group_details AS
 SELECT concat(gm.group_id, '-', gm.user_id) AS id,
    gm.group_id,
    gm.user_id,
    g.name AS group_name,
    g.description AS group_description,
    g.created_at AS group_created_at,
    u.username,
    u.name,
    u.email,
    u.phone_number,
    u.company,
    u.role,
    u.first_name,
    u.last_name,
    u.is_active,
    u.is_verified,
    u.is_superuser,
    u.is_public,
    u.created_at,
    u.updated_at
   FROM ((app.groups g
     JOIN app.group_members gm ON (((gm.group_id = g.id) AND (gm.deleted_at IS NULL))))
     JOIN app.users u ON (((u.id = gm.user_id) AND (u.deleted_at IS NULL))))
  WHERE (g.deleted_at IS NULL);


--
-- Name: group_events; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.group_events (
    id integer NOT NULL,
    group_id uuid,
    user_id integer,
    event_type character varying(50),
    details jsonb,
    created_at timestamp without time zone
);


--
-- Name: group_events_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.group_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: group_events_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.group_events_id_seq OWNED BY app.group_events.id;


--
-- Name: group_invitations; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.group_invitations (
    id integer NOT NULL,
    group_id uuid NOT NULL,
    invited_user_id integer NOT NULL,
    invited_by_user_id integer,
    status character varying(20),
    token character varying(36),
    created_at timestamp without time zone,
    responded_at timestamp without time zone,
    deleted_at timestamp without time zone
);


--
-- Name: group_invitations_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.group_invitations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: group_invitations_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.group_invitations_id_seq OWNED BY app.group_invitations.id;


--
-- Name: group_members_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.group_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: group_members_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.group_members_id_seq OWNED BY app.group_members.id;


--
-- Name: group_messages; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.group_messages (
    id integer NOT NULL,
    group_id uuid NOT NULL,
    sender_id integer NOT NULL,
    message character varying,
    attachments jsonb,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    deleted_at timestamp without time zone
);


--
-- Name: group_messages_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.group_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: group_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.group_messages_id_seq OWNED BY app.group_messages.id;


--
-- Name: properties; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.properties (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    description character varying,
    property_category_id integer NOT NULL,
    property_type_id integer NOT NULL,
    property_ownership_type_id integer NOT NULL,
    ownership_mode character varying(20) NOT NULL,
    price integer NOT NULL,
    price_currency character varying(10),
    price_history jsonb,
    address_street character varying(255),
    address_city character varying(100) NOT NULL,
    address_state character varying(100) NOT NULL,
    address_zip_code character varying(20),
    address_country character varying(100) NOT NULL,
    spatial_data jsonb,
    total_area integer,
    built_area integer,
    year_built integer,
    bedrooms integer,
    bathrooms integer,
    garages integer,
    floors integer,
    features jsonb,
    custom_fields jsonb,
    images jsonb,
    status character varying(20) NOT NULL,
    is_active boolean,
    is_featured boolean,
    views integer,
    favorites integer,
    tags jsonb,
    listing_date timestamp without time zone,
    group_id uuid NOT NULL,
    created_by integer NOT NULL,
    owned_by integer NOT NULL,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    deleted_at timestamp without time zone
);


--
-- Name: properties_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.properties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: properties_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.properties_id_seq OWNED BY app.properties.id;


--
-- Name: property_documents; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.property_documents (
    id integer NOT NULL,
    property_id integer NOT NULL,
    name character varying(255) NOT NULL,
    document_type character varying(50) NOT NULL,
    file_url character varying(500) NOT NULL,
    file_size integer,
    file_mime_type character varying(100),
    description character varying,
    tags jsonb,
    uploaded_by integer NOT NULL,
    is_public boolean,
    uploaded_at timestamp without time zone,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: property_documents_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.property_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.property_documents_id_seq OWNED BY app.property_documents.id;


--
-- Name: property_favorites; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.property_favorites (
    id integer NOT NULL,
    property_id integer NOT NULL,
    user_id integer NOT NULL,
    notes character varying,
    favorited_at timestamp without time zone
);


--
-- Name: property_favorites_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.property_favorites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_favorites_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.property_favorites_id_seq OWNED BY app.property_favorites.id;


--
-- Name: property_owners; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.property_owners (
    id integer NOT NULL,
    property_id integer NOT NULL,
    user_id integer NOT NULL,
    ownership_percentage integer,
    ownership_type character varying(50),
    is_primary_owner boolean,
    contact_phone character varying(20),
    contact_email character varying(100),
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: property_owners_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.property_owners_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_owners_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.property_owners_id_seq OWNED BY app.property_owners.id;


--
-- Name: property_views; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.property_views (
    id integer NOT NULL,
    property_id integer NOT NULL,
    user_id integer,
    ip_address character varying(45),
    user_agent character varying(500),
    referrer character varying(500),
    session_id character varying(100),
    viewed_at timestamp without time zone
);


--
-- Name: property_views_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.property_views_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_views_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.property_views_id_seq OWNED BY app.property_views.id;


--
-- Name: user_encryption_keys; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_encryption_keys (
    id integer NOT NULL,
    user_id integer NOT NULL,
    encrypted_key character varying(1000) NOT NULL,
    key_algorithm character varying(50),
    encryption_method character varying(50),
    key_version integer,
    is_active boolean,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: user_encryption_keys_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_encryption_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_encryption_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_encryption_keys_id_seq OWNED BY app.user_encryption_keys.id;


--
-- Name: user_networks; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_networks (
    id integer NOT NULL,
    user_id integer NOT NULL,
    related_user_id integer NOT NULL,
    network_type character varying(50) NOT NULL,
    rank_kind character varying(50),
    note character varying,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    deleted_at timestamp without time zone
);


--
-- Name: user_networks_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_networks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_networks_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_networks_id_seq OWNED BY app.user_networks.id;


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.users_id_seq OWNED BY app.users.id;


--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_events (
    id text NOT NULL,
    actor text DEFAULT ''::text NOT NULL,
    action text DEFAULT ''::text NOT NULL,
    target text DEFAULT ''::text NOT NULL,
    details text DEFAULT ''::text NOT NULL,
    "timestamp" text DEFAULT ''::text NOT NULL
);


--
-- Name: beneficiaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beneficiaries (
    id text NOT NULL,
    parcel_id text DEFAULT ''::text NOT NULL,
    person_name text NOT NULL,
    person_contact text DEFAULT ''::text NOT NULL,
    relationship text DEFAULT ''::text NOT NULL,
    share_pct real DEFAULT 0 NOT NULL,
    kind text DEFAULT 'coowner'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    owner_user_id text DEFAULT ''::text NOT NULL,
    present_address text DEFAULT ''::text NOT NULL,
    dob text DEFAULT ''::text NOT NULL,
    marital_status text DEFAULT ''::text NOT NULL,
    spouse_name text DEFAULT ''::text NOT NULL,
    spouse_contact text DEFAULT ''::text NOT NULL,
    spouse_status text DEFAULT ''::text NOT NULL,
    guardian_name text DEFAULT ''::text NOT NULL,
    guardian_contact text DEFAULT ''::text NOT NULL,
    invite_token text DEFAULT ''::text NOT NULL,
    is_minor boolean DEFAULT false NOT NULL,
    aadhaar_masked text DEFAULT ''::text NOT NULL,
    gender text DEFAULT ''::text NOT NULL,
    photo text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL
);


--
-- Name: deed_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deed_types (
    id text NOT NULL,
    reg_type_en text DEFAULT ''::text NOT NULL,
    reg_type_te text DEFAULT ''::text NOT NULL,
    nature_en text DEFAULT ''::text NOT NULL,
    nature_te text DEFAULT ''::text NOT NULL
);


--
-- Name: districts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.districts (
    id text NOT NULL,
    name text NOT NULL,
    code text DEFAULT ''::text NOT NULL,
    state_id text DEFAULT ''::text NOT NULL
);


--
-- Name: document_parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_parties (
    id text NOT NULL,
    document_id text NOT NULL,
    role text DEFAULT 'seller'::text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    parentage text DEFAULT ''::text NOT NULL,
    age text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    is_gpa boolean DEFAULT false NOT NULL,
    created_at text DEFAULT ''::text NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id text NOT NULL,
    parcel_id text NOT NULL,
    doc_type text DEFAULT 'other'::text NOT NULL,
    file_ref text DEFAULT ''::text NOT NULL,
    doc_no text DEFAULT ''::text NOT NULL,
    sro_code text DEFAULT ''::text NOT NULL,
    reg_year text DEFAULT ''::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    source text DEFAULT 'upload'::text NOT NULL,
    tags text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL,
    owner_user_id text DEFAULT 'system'::text NOT NULL,
    passbook_id text DEFAULT ''::text NOT NULL,
    property_id text DEFAULT ''::text NOT NULL
);


--
-- Name: family_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.family_members (
    id text NOT NULL,
    owner_user_id text DEFAULT 'system'::text NOT NULL,
    name text NOT NULL,
    relation text DEFAULT 'other'::text NOT NULL,
    gender text DEFAULT ''::text NOT NULL,
    dob text DEFAULT ''::text NOT NULL,
    contact text DEFAULT ''::text NOT NULL,
    bio text DEFAULT ''::text NOT NULL,
    is_beneficiary boolean DEFAULT true NOT NULL,
    share_pct real DEFAULT 0 NOT NULL,
    invite_status text DEFAULT ''::text NOT NULL,
    photo text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    is_self boolean DEFAULT false NOT NULL,
    father_id text DEFAULT ''::text NOT NULL,
    mother_id text DEFAULT ''::text NOT NULL,
    spouse_id text DEFAULT ''::text NOT NULL,
    present_address text DEFAULT ''::text NOT NULL,
    aadhaar_masked text DEFAULT ''::text NOT NULL,
    guardian_name text DEFAULT ''::text NOT NULL,
    guardian_contact text DEFAULT ''::text NOT NULL,
    marital_status text DEFAULT ''::text NOT NULL,
    spouse_name text DEFAULT ''::text NOT NULL,
    spouse_contact text DEFAULT ''::text NOT NULL,
    spouse_status text DEFAULT ''::text NOT NULL,
    kind text DEFAULT ''::text NOT NULL,
    status text DEFAULT ''::text NOT NULL,
    invite_token text DEFAULT ''::text NOT NULL,
    parcel_id text DEFAULT ''::text NOT NULL,
    legacy_beneficiary_id text DEFAULT ''::text NOT NULL,
    is_minor boolean DEFAULT false NOT NULL,
    group_id text DEFAULT ''::text NOT NULL,
    role text DEFAULT ''::text NOT NULL,
    phone_verified boolean DEFAULT false NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    invite_channel text DEFAULT ''::text NOT NULL
);


--
-- Name: family_notifiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.family_notifiers (
    id text NOT NULL,
    owner_user_id text DEFAULT ''::text NOT NULL,
    group_id text DEFAULT ''::text NOT NULL,
    member_id text DEFAULT ''::text NOT NULL,
    priority integer DEFAULT 1 NOT NULL,
    created_at text DEFAULT ''::text NOT NULL
);


--
-- Name: fee_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_schedule (
    id text NOT NULL,
    tmaj_code text DEFAULT ''::text NOT NULL,
    tmin_code text DEFAULT ''::text NOT NULL,
    reg_type_en text DEFAULT ''::text NOT NULL,
    nature_en text DEFAULT ''::text NOT NULL,
    sample_consideration real DEFAULT 0 NOT NULL,
    stamp_duty real DEFAULT 0 NOT NULL,
    transfer_duty real DEFAULT 0 NOT NULL,
    registration_fee real DEFAULT 0 NOT NULL,
    user_charges real DEFAULT 0 NOT NULL,
    stamp_rate real DEFAULT 0 NOT NULL,
    transfer_rate real DEFAULT 0 NOT NULL,
    reg_rate real DEFAULT 0 NOT NULL,
    user_rate real DEFAULT 0 NOT NULL
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id text NOT NULL,
    owner_user_id text DEFAULT ''::text NOT NULL,
    type text DEFAULT 'family'::text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL,
    updated_at text DEFAULT ''::text NOT NULL
);


--
-- Name: inactivity_escalations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inactivity_escalations (
    id text NOT NULL,
    owner_user_id text DEFAULT ''::text NOT NULL,
    group_id text DEFAULT ''::text NOT NULL,
    stage text DEFAULT ''::text NOT NULL,
    current_priority integer DEFAULT 0 NOT NULL,
    last_notified_at text DEFAULT ''::text NOT NULL,
    acknowledged boolean DEFAULT false NOT NULL,
    ack_token text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL,
    updated_at text DEFAULT ''::text NOT NULL
);


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id text NOT NULL,
    scope_type text DEFAULT 'parcel'::text NOT NULL,
    scope_id text DEFAULT ''::text NOT NULL,
    role text DEFAULT 'view'::text NOT NULL,
    invitee_contact text DEFAULT ''::text NOT NULL,
    token text DEFAULT ''::text NOT NULL,
    expiry text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL
);


--
-- Name: mandals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mandals (
    id text NOT NULL,
    name text NOT NULL,
    district_id text NOT NULL
);


--
-- Name: market_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_values (
    id text NOT NULL,
    district text NOT NULL,
    mandal text NOT NULL,
    village text NOT NULL,
    classification text DEFAULT 'agri'::text NOT NULL,
    rate_per_unit real DEFAULT 0 NOT NULL,
    unit text DEFAULT 'Acres-Guntas'::text NOT NULL,
    effective_from text DEFAULT ''::text NOT NULL
);


--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    id text NOT NULL,
    owner_user_id text DEFAULT 'system'::text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    body text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL
);


--
-- Name: notification_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_log (
    id text NOT NULL,
    owner_user_id text DEFAULT ''::text NOT NULL,
    channel text DEFAULT ''::text NOT NULL,
    recipient text DEFAULT ''::text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    provider text DEFAULT ''::text NOT NULL,
    status text DEFAULT ''::text NOT NULL,
    error text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL
);


--
-- Name: parcel_owners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parcel_owners (
    id text NOT NULL,
    parcel_id text NOT NULL,
    owner_name text DEFAULT ''::text NOT NULL,
    acquisition_source text DEFAULT ''::text NOT NULL,
    extent real DEFAULT 0 NOT NULL,
    mutation_type text DEFAULT 'acquisition'::text NOT NULL,
    mutation_date text DEFAULT ''::text NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_at text DEFAULT ''::text NOT NULL
);


--
-- Name: parcels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parcels (
    id text NOT NULL,
    passbook_id text NOT NULL,
    survey_no text NOT NULL,
    subdivision text DEFAULT ''::text NOT NULL,
    extent real DEFAULT 0 NOT NULL,
    unit text DEFAULT 'Acres-Guntas'::text NOT NULL,
    classification text DEFAULT 'agri'::text NOT NULL,
    acquisition_source text DEFAULT 'sale'::text NOT NULL,
    geo_point text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL,
    parent_parcel_id text DEFAULT ''::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    status text DEFAULT 'owned'::text NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    boundary_north text DEFAULT ''::text NOT NULL,
    boundary_south text DEFAULT ''::text NOT NULL,
    boundary_east text DEFAULT ''::text NOT NULL,
    boundary_west text DEFAULT ''::text NOT NULL,
    purchase_price double precision DEFAULT 0 NOT NULL,
    purchase_date text DEFAULT ''::text NOT NULL,
    guideline_value double precision DEFAULT 0 NOT NULL,
    market_value double precision DEFAULT 0 NOT NULL,
    stamp_duty double precision DEFAULT 0 NOT NULL,
    loan_amount double precision DEFAULT 0 NOT NULL,
    encumbrance_status text DEFAULT ''::text NOT NULL,
    reg_doc_no text DEFAULT ''::text NOT NULL,
    sro text DEFAULT ''::text NOT NULL,
    reg_date text DEFAULT ''::text NOT NULL,
    ec_status text DEFAULT ''::text NOT NULL,
    ec_date text DEFAULT ''::text NOT NULL,
    mutation_status text DEFAULT ''::text NOT NULL,
    tax_paid_upto text DEFAULT ''::text NOT NULL,
    rera_no text DEFAULT ''::text NOT NULL,
    litigation boolean DEFAULT false NOT NULL,
    litigation_note text DEFAULT ''::text NOT NULL,
    stake text DEFAULT 'owned'::text NOT NULL
);


--
-- Name: passbooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passbooks (
    id text NOT NULL,
    owner_user_id text DEFAULT 'system'::text NOT NULL,
    pattadar_no text NOT NULL,
    district text NOT NULL,
    mandal text NOT NULL,
    village text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL,
    state text DEFAULT ''::text NOT NULL,
    owner_name text DEFAULT ''::text NOT NULL,
    father_husband_name text DEFAULT ''::text NOT NULL,
    photo text DEFAULT ''::text NOT NULL,
    group_id text DEFAULT ''::text NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id text NOT NULL,
    owner_user_id text DEFAULT 'system'::text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    builder_name text DEFAULT ''::text NOT NULL,
    project_type text DEFAULT ''::text NOT NULL,
    rera_no text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    city text DEFAULT ''::text NOT NULL,
    geo_point text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL
);


--
-- Name: properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.properties (
    id text NOT NULL,
    owner_user_id text DEFAULT 'system'::text NOT NULL,
    group_id text DEFAULT ''::text NOT NULL,
    project_id text DEFAULT ''::text NOT NULL,
    type text DEFAULT 'open_plot'::text NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    locality text DEFAULT ''::text NOT NULL,
    city text DEFAULT ''::text NOT NULL,
    district text DEFAULT ''::text NOT NULL,
    geo_point text DEFAULT ''::text NOT NULL,
    land_area double precision DEFAULT 0 NOT NULL,
    land_unit text DEFAULT 'Sq.yd'::text NOT NULL,
    builtup_area double precision DEFAULT 0 NOT NULL,
    builtup_unit text DEFAULT 'Sq.ft'::text NOT NULL,
    acquisition_mode text DEFAULT 'purchase'::text NOT NULL,
    holding_status text DEFAULT 'owned'::text NOT NULL,
    purchase_price double precision DEFAULT 0 NOT NULL,
    purchase_date text DEFAULT ''::text NOT NULL,
    guideline_value double precision DEFAULT 0 NOT NULL,
    market_value double precision DEFAULT 0 NOT NULL,
    current_value double precision DEFAULT 0 NOT NULL,
    reg_doc_no text DEFAULT ''::text NOT NULL,
    sro text DEFAULT ''::text NOT NULL,
    reg_date text DEFAULT ''::text NOT NULL,
    ghmc_assessment_no text DEFAULT ''::text NOT NULL,
    khata_no text DEFAULT ''::text NOT NULL,
    rera_no text DEFAULT ''::text NOT NULL,
    ec_status text DEFAULT ''::text NOT NULL,
    ec_date text DEFAULT ''::text NOT NULL,
    mutation_status text DEFAULT ''::text NOT NULL,
    tax_paid_upto text DEFAULT ''::text NOT NULL,
    litigation boolean DEFAULT false NOT NULL,
    litigation_note text DEFAULT ''::text NOT NULL,
    attributes text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL,
    stake text DEFAULT 'owned'::text NOT NULL
);


--
-- Name: property_owners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_owners (
    id text NOT NULL,
    property_id text NOT NULL,
    owner_name text DEFAULT ''::text NOT NULL,
    user_id text DEFAULT ''::text NOT NULL,
    group_id text DEFAULT ''::text NOT NULL,
    share_pct double precision DEFAULT 0 NOT NULL,
    role text DEFAULT 'owner'::text NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_at text DEFAULT ''::text NOT NULL
);


--
-- Name: registered_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registered_documents (
    id text NOT NULL,
    owner_user_id text DEFAULT 'system'::text NOT NULL,
    doc_type text DEFAULT ''::text NOT NULL,
    document_no text DEFAULT ''::text NOT NULL,
    reg_year text DEFAULT ''::text NOT NULL,
    book_no text DEFAULT ''::text NOT NULL,
    sro text DEFAULT ''::text NOT NULL,
    registration_date text DEFAULT ''::text NOT NULL,
    execution_date text DEFAULT ''::text NOT NULL,
    consideration real DEFAULT 0 NOT NULL,
    stamp_duty real DEFAULT 0 NOT NULL,
    transfer_duty real DEFAULT 0 NOT NULL,
    registration_fee real DEFAULT 0 NOT NULL,
    user_charges real DEFAULT 0 NOT NULL,
    total_fee real DEFAULT 0 NOT NULL,
    village text DEFAULT ''::text NOT NULL,
    mandal text DEFAULT ''::text NOT NULL,
    district text DEFAULT ''::text NOT NULL,
    survey_no text DEFAULT ''::text NOT NULL,
    plot_no text DEFAULT ''::text NOT NULL,
    extent text DEFAULT ''::text NOT NULL,
    classification text DEFAULT ''::text NOT NULL,
    boundary_north text DEFAULT ''::text NOT NULL,
    boundary_south text DEFAULT ''::text NOT NULL,
    boundary_east text DEFAULT ''::text NOT NULL,
    boundary_west text DEFAULT ''::text NOT NULL,
    prior_document text DEFAULT ''::text NOT NULL,
    gpa_document text DEFAULT ''::text NOT NULL,
    scanning_id text DEFAULT ''::text NOT NULL,
    file_ref text DEFAULT ''::text NOT NULL,
    passbook_id text DEFAULT ''::text NOT NULL,
    parcel_id text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL
);


--
-- Name: service_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_requests (
    id text NOT NULL,
    req_type text DEFAULT ''::text NOT NULL,
    parcel_id text DEFAULT ''::text NOT NULL,
    sro_code text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    details text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL
);


--
-- Name: sro_offices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sro_offices (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    dr_zone text DEFAULT ''::text NOT NULL,
    district text DEFAULT ''::text NOT NULL,
    mandal text DEFAULT ''::text NOT NULL
);


--
-- Name: states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.states (
    id text NOT NULL,
    name text NOT NULL,
    code text DEFAULT ''::text NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    mobile text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    kyc_ref_masked text DEFAULT ''::text NOT NULL,
    roles text DEFAULT 'owner'::text NOT NULL,
    notification_prefs text DEFAULT 'email,sms'::text NOT NULL,
    districts_of_interest text DEFAULT ''::text NOT NULL,
    mfa_enabled boolean DEFAULT false NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    last_active_at text DEFAULT ''::text NOT NULL
);


--
-- Name: villages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.villages (
    id text NOT NULL,
    name text NOT NULL,
    mandal_id text NOT NULL
);


--
-- Name: division; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.division (
    row_id integer NOT NULL,
    country_code character varying(2),
    division_code character varying(20) NOT NULL,
    division_name character varying(255),
    division_type character varying(10) NOT NULL,
    is_active boolean,
    localized_names jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    created_by character varying(50),
    updated_by character varying(50)
);


--
-- Name: division_row_id_seq; Type: SEQUENCE; Schema: ref; Owner: -
--

CREATE SEQUENCE ref.division_row_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: division_row_id_seq; Type: SEQUENCE OWNED BY; Schema: ref; Owner: -
--

ALTER SEQUENCE ref.division_row_id_seq OWNED BY ref.division.row_id;


--
-- Name: division_type; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.division_type (
    row_id integer NOT NULL,
    division_type character varying(10) NOT NULL,
    division_name character varying(100) NOT NULL,
    division_description character varying,
    division_level integer NOT NULL,
    parent_id integer,
    is_active boolean,
    localized_names jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    created_by character varying(50),
    updated_by character varying(50)
);


--
-- Name: division_type_row_id_seq; Type: SEQUENCE; Schema: ref; Owner: -
--

CREATE SEQUENCE ref.division_type_row_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: division_type_row_id_seq; Type: SEQUENCE OWNED BY; Schema: ref; Owner: -
--

ALTER SEQUENCE ref.division_type_row_id_seq OWNED BY ref.division_type.row_id;


--
-- Name: document_categories; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.document_categories (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(500),
    parent_id integer,
    icon character varying(100),
    color character varying(20),
    is_active boolean,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: document_categories_id_seq; Type: SEQUENCE; Schema: ref; Owner: -
--

CREATE SEQUENCE ref.document_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: ref; Owner: -
--

ALTER SEQUENCE ref.document_categories_id_seq OWNED BY ref.document_categories.id;


--
-- Name: document_file_type; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.document_file_type (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description character varying,
    extension character varying(10),
    mime_type character varying(100),
    icon character varying(50),
    color character varying(20),
    is_active boolean,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    created_by character varying(50),
    updated_by character varying(50)
);


--
-- Name: document_file_type_id_seq; Type: SEQUENCE; Schema: ref; Owner: -
--

CREATE SEQUENCE ref.document_file_type_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_file_type_id_seq; Type: SEQUENCE OWNED BY; Schema: ref; Owner: -
--

ALTER SEQUENCE ref.document_file_type_id_seq OWNED BY ref.document_file_type.id;


--
-- Name: group_roles; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.group_roles (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    label character varying(100) NOT NULL,
    description character varying,
    is_active boolean,
    created_at timestamp without time zone
);


--
-- Name: group_roles_id_seq; Type: SEQUENCE; Schema: ref; Owner: -
--

CREATE SEQUENCE ref.group_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: group_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: ref; Owner: -
--

ALTER SEQUENCE ref.group_roles_id_seq OWNED BY ref.group_roles.id;


--
-- Name: property_category; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.property_category (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    description character varying,
    created_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by integer,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: property_category_id_seq; Type: SEQUENCE; Schema: ref; Owner: -
--

CREATE SEQUENCE ref.property_category_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_category_id_seq; Type: SEQUENCE OWNED BY; Schema: ref; Owner: -
--

ALTER SEQUENCE ref.property_category_id_seq OWNED BY ref.property_category.id;


--
-- Name: property_feature; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.property_feature (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description character varying,
    icon character varying(50),
    category character varying(50),
    is_active boolean,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    created_by integer,
    updated_by integer
);


--
-- Name: property_feature_id_seq; Type: SEQUENCE; Schema: ref; Owner: -
--

CREATE SEQUENCE ref.property_feature_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_feature_id_seq; Type: SEQUENCE OWNED BY; Schema: ref; Owner: -
--

ALTER SEQUENCE ref.property_feature_id_seq OWNED BY ref.property_feature.id;


--
-- Name: property_ownership_mode; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.property_ownership_mode (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description character varying,
    is_active boolean,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    created_by integer,
    updated_by integer
);


--
-- Name: property_ownership_mode_id_seq; Type: SEQUENCE; Schema: ref; Owner: -
--

CREATE SEQUENCE ref.property_ownership_mode_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_ownership_mode_id_seq; Type: SEQUENCE OWNED BY; Schema: ref; Owner: -
--

ALTER SEQUENCE ref.property_ownership_mode_id_seq OWNED BY ref.property_ownership_mode.id;


--
-- Name: property_ownership_type; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.property_ownership_type (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    description character varying,
    created_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by integer,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: property_ownership_type_id_seq; Type: SEQUENCE; Schema: ref; Owner: -
--

CREATE SEQUENCE ref.property_ownership_type_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_ownership_type_id_seq; Type: SEQUENCE OWNED BY; Schema: ref; Owner: -
--

ALTER SEQUENCE ref.property_ownership_type_id_seq OWNED BY ref.property_ownership_type.id;


--
-- Name: property_status; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.property_status (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description character varying,
    color character varying(7),
    is_active boolean,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    created_by integer,
    updated_by integer
);


--
-- Name: property_status_id_seq; Type: SEQUENCE; Schema: ref; Owner: -
--

CREATE SEQUENCE ref.property_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_status_id_seq; Type: SEQUENCE OWNED BY; Schema: ref; Owner: -
--

ALTER SEQUENCE ref.property_status_id_seq OWNED BY ref.property_status.id;


--
-- Name: property_type; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.property_type (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    short_code character varying(10) NOT NULL,
    label character varying(50),
    country_code character varying(10) NOT NULL,
    avatar_url character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    created_by integer,
    updated_by integer
);


--
-- Name: property_type_id_seq; Type: SEQUENCE; Schema: ref; Owner: -
--

CREATE SEQUENCE ref.property_type_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_type_id_seq; Type: SEQUENCE OWNED BY; Schema: ref; Owner: -
--

ALTER SEQUENCE ref.property_type_id_seq OWNED BY ref.property_type.id;


--
-- Name: subdivision_portal; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.subdivision_portal (
    row_id integer NOT NULL,
    division_code character varying(20),
    division_type character varying(10),
    division_short_code character varying(10),
    division_name character varying(255),
    subdivision_type character varying(10),
    subdivision_short_code character varying(10),
    subdivision_name character varying(100) NOT NULL,
    portal_name character varying(150),
    portal_url character varying(500),
    portal_type character varying(50),
    portal_category character varying(50),
    portal_subcategory character varying(50),
    portal_description character varying,
    is_active boolean,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    created_by character varying(50),
    updated_by character varying(50)
);


--
-- Name: subdivision_portal_row_id_seq; Type: SEQUENCE; Schema: ref; Owner: -
--

CREATE SEQUENCE ref.subdivision_portal_row_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subdivision_portal_row_id_seq; Type: SEQUENCE OWNED BY; Schema: ref; Owner: -
--

ALTER SEQUENCE ref.subdivision_portal_row_id_seq OWNED BY ref.subdivision_portal.row_id;


--
-- Name: user_network_rank_kind; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.user_network_rank_kind (
    code character varying(50) NOT NULL,
    description character varying
);


--
-- Name: user_network_type; Type: TABLE; Schema: ref; Owner: -
--

CREATE TABLE ref.user_network_type (
    code character varying(50) NOT NULL,
    description character varying
);


--
-- Name: document_access_logs id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.document_access_logs ALTER COLUMN id SET DEFAULT nextval('app.document_access_logs_id_seq'::regclass);


--
-- Name: document_sharing id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.document_sharing ALTER COLUMN id SET DEFAULT nextval('app.document_sharing_id_seq'::regclass);


--
-- Name: documents id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.documents ALTER COLUMN id SET DEFAULT nextval('app.documents_id_seq'::regclass);


--
-- Name: group_events id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_events ALTER COLUMN id SET DEFAULT nextval('app.group_events_id_seq'::regclass);


--
-- Name: group_invitations id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_invitations ALTER COLUMN id SET DEFAULT nextval('app.group_invitations_id_seq'::regclass);


--
-- Name: group_members id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_members ALTER COLUMN id SET DEFAULT nextval('app.group_members_id_seq'::regclass);


--
-- Name: group_messages id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_messages ALTER COLUMN id SET DEFAULT nextval('app.group_messages_id_seq'::regclass);


--
-- Name: properties id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.properties ALTER COLUMN id SET DEFAULT nextval('app.properties_id_seq'::regclass);


--
-- Name: property_documents id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_documents ALTER COLUMN id SET DEFAULT nextval('app.property_documents_id_seq'::regclass);


--
-- Name: property_favorites id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_favorites ALTER COLUMN id SET DEFAULT nextval('app.property_favorites_id_seq'::regclass);


--
-- Name: property_owners id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_owners ALTER COLUMN id SET DEFAULT nextval('app.property_owners_id_seq'::regclass);


--
-- Name: property_views id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_views ALTER COLUMN id SET DEFAULT nextval('app.property_views_id_seq'::regclass);


--
-- Name: user_encryption_keys id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_encryption_keys ALTER COLUMN id SET DEFAULT nextval('app.user_encryption_keys_id_seq'::regclass);


--
-- Name: user_networks id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_networks ALTER COLUMN id SET DEFAULT nextval('app.user_networks_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users ALTER COLUMN id SET DEFAULT nextval('app.users_id_seq'::regclass);


--
-- Name: division row_id; Type: DEFAULT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.division ALTER COLUMN row_id SET DEFAULT nextval('ref.division_row_id_seq'::regclass);


--
-- Name: division_type row_id; Type: DEFAULT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.division_type ALTER COLUMN row_id SET DEFAULT nextval('ref.division_type_row_id_seq'::regclass);


--
-- Name: document_categories id; Type: DEFAULT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.document_categories ALTER COLUMN id SET DEFAULT nextval('ref.document_categories_id_seq'::regclass);


--
-- Name: document_file_type id; Type: DEFAULT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.document_file_type ALTER COLUMN id SET DEFAULT nextval('ref.document_file_type_id_seq'::regclass);


--
-- Name: group_roles id; Type: DEFAULT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.group_roles ALTER COLUMN id SET DEFAULT nextval('ref.group_roles_id_seq'::regclass);


--
-- Name: property_category id; Type: DEFAULT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.property_category ALTER COLUMN id SET DEFAULT nextval('ref.property_category_id_seq'::regclass);


--
-- Name: property_feature id; Type: DEFAULT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.property_feature ALTER COLUMN id SET DEFAULT nextval('ref.property_feature_id_seq'::regclass);


--
-- Name: property_ownership_mode id; Type: DEFAULT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.property_ownership_mode ALTER COLUMN id SET DEFAULT nextval('ref.property_ownership_mode_id_seq'::regclass);


--
-- Name: property_ownership_type id; Type: DEFAULT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.property_ownership_type ALTER COLUMN id SET DEFAULT nextval('ref.property_ownership_type_id_seq'::regclass);


--
-- Name: property_status id; Type: DEFAULT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.property_status ALTER COLUMN id SET DEFAULT nextval('ref.property_status_id_seq'::regclass);


--
-- Name: property_type id; Type: DEFAULT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.property_type ALTER COLUMN id SET DEFAULT nextval('ref.property_type_id_seq'::regclass);


--
-- Name: subdivision_portal row_id; Type: DEFAULT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.subdivision_portal ALTER COLUMN row_id SET DEFAULT nextval('ref.subdivision_portal_row_id_seq'::regclass);


--
-- Data for Name: document_access_logs; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.document_access_logs (id, document_id, user_id, action, status, ip_address, user_agent, session_id, via_sharing, shared_by_user_id, document_metadata, error_message, "timestamp") FROM stdin;
\.


--
-- Data for Name: document_sharing; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.document_sharing (id, document_id, shared_with_user_id, shared_by_user_id, encrypted_file_key, permission_level, can_download, can_share, can_edit, expires_at, is_active, created_at, updated_at, revoked_at) FROM stdin;
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.documents (id, group_id, uploaded_by, original_filename, file_size, file_type, file_extension, title, description, category_id, tags, s3_bucket, s3_key, s3_version_id, encryption_key_id, is_private, is_shared, access_level, status, version, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: group_events; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.group_events (id, group_id, user_id, event_type, details, created_at) FROM stdin;
\.


--
-- Data for Name: group_invitations; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.group_invitations (id, group_id, invited_user_id, invited_by_user_id, status, token, created_at, responded_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: group_members; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.group_members (id, group_id, user_id, role_code, nickname, joined_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: group_messages; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.group_messages (id, group_id, sender_id, message, attachments, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: groups; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.groups (id, name, plan, description, group_type, avatar_url, images, cover_url, is_active, is_private, is_public, visibility, motto, established_date, heritage, email, phone_number, website_url, address, city, state, country, zip_code, legal_entity_type, tax_id, registration_number, beneficiary_percentage, inheritance_rules, property_transfer_rules, trust_documents, property_preferences, total_members, total_properties, total_documents, total_value, net_worth, emergency_contacts, important_dates, achievements, cultural_traditions, social_links, tags, created_by, owned_by, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: properties; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.properties (id, title, description, property_category_id, property_type_id, property_ownership_type_id, ownership_mode, price, price_currency, price_history, address_street, address_city, address_state, address_zip_code, address_country, spatial_data, total_area, built_area, year_built, bedrooms, bathrooms, garages, floors, features, custom_fields, images, status, is_active, is_featured, views, favorites, tags, listing_date, group_id, created_by, owned_by, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: property_documents; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.property_documents (id, property_id, name, document_type, file_url, file_size, file_mime_type, description, tags, uploaded_by, is_public, uploaded_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: property_favorites; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.property_favorites (id, property_id, user_id, notes, favorited_at) FROM stdin;
\.


--
-- Data for Name: property_owners; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.property_owners (id, property_id, user_id, ownership_percentage, ownership_type, is_primary_owner, contact_phone, contact_email, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: property_views; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.property_views (id, property_id, user_id, ip_address, user_agent, referrer, session_id, viewed_at) FROM stdin;
\.


--
-- Data for Name: user_encryption_keys; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.user_encryption_keys (id, user_id, encrypted_key, key_algorithm, encryption_method, key_version, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_networks; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.user_networks (id, user_id, related_user_id, network_type, rank_kind, note, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: app; Owner: -
--

COPY app.users (id, username, name, email, hashed_password, family_id, first_name, middle_name, last_name, gender, date_of_birth, marital_status, role, about, company, school, country, state, city, address, zip_code, phone_number, website_url, profile_url, avatar_url, cover_url, photo_url, social_links, total_followers, total_following, total_posts, is_active, is_verified, is_superuser, is_public, status, bio_data, workspace_state, last_login, login_count, last_password_change, created_by, updated_by, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: audit_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_events (id, actor, action, target, details, "timestamp") FROM stdin;
ae01	Ramesh Kumar	create_passbook	pb01	Created passbook PB-ATP-2024-001	2024-01-15T10:30:00
ae02	Ramesh Kumar	add_parcel	pc01	Added survey 45/1 to passbook	2024-01-15T10:35:00
ae03	Ramesh Kumar	upload_document	doc01	Uploaded passbook copy	2024-01-16T09:00:00
ae04	Ramesh Kumar	add_beneficiary	b01	Added Sita Devi as co-owner	2024-01-20T14:00:00
ae05	Sita Devi	create_passbook	pb03	Created passbook PB-CTR-2024-003	2024-03-10T11:00:00
ae06	Venkat Rao	create_passbook	pb04	Created passbook PB-GNT-2024-004	2024-04-05T08:30:00
ae07	system	send_invitation	inv01	Invitation sent to 9876543220	2024-07-01T12:00:00
ae08	Suresh Reddy	upload_document	doc08	Sale deed for Pendurthi parcel	2024-06-02T16:45:00
d0530491-788	system	create_passbook	4fe7f1d2-c70	Pattadar TEST-KHATA-9999	2026-07-11T02:35:28.705243
6df39210-125	system	create_parcel	be0189ac-860	Survey 45/1	2026-07-11T02:35:28.712539
e51ebade-f73	system	delete_parcel	be0189ac-860		2026-07-11T02:35:28.730151
96839db1-39f	system	delete_passbook	4fe7f1d2-c70		2026-07-11T02:35:28.736997
7bfdbf98-141	system	create_passbook	6ee8d6a7-daa	Pattadar E2E-9998	2026-07-11T02:38:10.663384
2d3ee8d9-8f9	system	create_parcel	475264d0-be0	Survey 12/3	2026-07-11T02:38:10.680282
576e3db4-571	system	upload_document	cddc6b15-3d5	Type sale_deed	2026-07-11T02:38:10.693599
7bbfebbb-cc2	system	add_beneficiary	0f701b20-242	Test Nominee (nominee)	2026-07-11T02:38:10.702036
19b36e86-c18	system	send_invitation	73048cc9-ab4	To 9990002222	2026-07-11T02:38:10.709398
2198aace-96c	system	update_invitation_status	73048cc9-ab4	Status -> accepted	2026-07-11T02:38:10.721154
b5541339-f39	system	delete_document	cddc6b15-3d5		2026-07-11T02:38:10.729057
0af2c08d-0d6	system	delete_parcel	475264d0-be0		2026-07-11T02:38:10.735421
c4172d91-30d	system	delete_passbook	6ee8d6a7-daa		2026-07-11T02:38:10.743784
bb5cbdf5-d16	sankara	update_profile	sankara	profile updated	2026-07-11T02:43:50.981958
2fe12d5d-29d	system	delete_passbook	f2bdac25-caf		2026-07-11T02:55:53.414011
8ac6f9fd-def	system	delete_passbook	9b9e3876-7b2		2026-07-11T02:55:53.418104
85fb03c7-e28	system	delete_passbook	7661c3b9-85f		2026-07-11T02:55:53.425608
74484756-aaa	statetest	create_passbook	33e2f154-0fc	Pattadar STATE-TEST	2026-07-11T03:19:09.183813
96a2fbd9-b23	statetest	delete_passbook	33e2f154-0fc		2026-07-11T03:19:09.192491
579c47dd-ff5	sankara.telukutla	create_passbook	976ddd85-f6a	Pattadar 1422	2026-07-11T03:54:46.546624
24de832a-6a3	importtest	create_passbook	2c38be48-994	Pattadar 1422	2026-07-11T04:09:33.677771
59ddc56a-0a9	importtest	create_parcel	211ad1b0-3f2	Survey 183	2026-07-11T04:09:33.690404
b0854b4a-a83	importtest	create_parcel	c286c11f-ed9	Survey 183	2026-07-11T04:09:33.698082
625c9cfa-480	importtest	create_parcel	07e09457-d94	Survey 120	2026-07-11T04:09:33.705206
bcdccfa6-0fe	importtest	delete_passbook	2c38be48-994		2026-07-11T04:09:33.715554
4529bf61-808	sankara.telukutla	delete_passbook	976ddd85-f6a		2026-07-11T04:10:40.008600
151d9b63-713	sankara.telukutla	create_passbook	b57c940f-240	Pattadar 1422	2026-07-11T04:10:52.947183
5514784c-9d5	sankara.telukutla	create_parcel	66a8c476-010	Survey 183	2026-07-11T04:10:52.962728
f9651b0b-15d	sankara.telukutla	create_parcel	e1a9e4f2-33d	Survey 183	2026-07-11T04:10:52.973840
a670ddf2-ba4	sankara.telukutla	create_parcel	9c0e85c7-cf6	Survey 183	2026-07-11T04:10:52.985071
b2bc1c76-580	sankara.telukutla	create_parcel	050d98b4-4ab	Survey 120	2026-07-11T04:10:52.996303
958475ff-1ab	sankara.telukutla	create_parcel	b2948326-ffd	Survey 741	2026-07-11T04:10:53.007667
6b21867d-29c	sankara.telukutla	create_parcel	55dae4a7-037	Survey 740	2026-07-11T04:10:53.018966
5740f18e-6f2	sankara.telukutla	create_parcel	3840568c-e47	Survey 398	2026-07-11T04:10:53.030699
0c1f61d9-209	owntest	create_passbook	dd454c9b-e7b	Pattadar 1422	2026-07-11T04:22:01.500305
a826635a-227	owntest	create_parcel	af0af913-934	Survey 183	2026-07-11T04:22:01.512519
0db63193-91c	owntest	record_mutation	af0af913-934	gift -> Ramaiah Naidu	2026-07-11T04:22:01.521952
6604c8f5-7c0	owntest	delete_passbook	dd454c9b-e7b		2026-07-11T04:22:01.549615
edf75dc8-e58	sankara.telukutla	delete_passbook	b57c940f-240		2026-07-11T04:34:28.245683
8ba484c8-f83	sankara.telukutla	create_passbook	8229066a-703	Pattadar 1422	2026-07-11T04:48:17.175995
31975ad8-478	sankara.telukutla	create_parcel	425d6c0f-464	Survey 183	2026-07-11T04:48:17.204803
6a07f011-5d1	sankara.telukutla	create_parcel	ab5842af-dd7	Survey 183	2026-07-11T04:48:17.222232
4b1a55e1-a5e	sankara.telukutla	create_parcel	f6c30cd5-6ad	Survey 183	2026-07-11T04:48:17.236444
3ef01520-c08	sankara.telukutla	create_parcel	fbf3304f-da2	Survey 120	2026-07-11T04:48:17.248782
9608f219-c7b	sankara.telukutla	create_parcel	124ddce0-111	Survey 741	2026-07-11T04:48:17.260544
ce7ab128-638	sankara.telukutla	create_parcel	b06bbf75-f91	Survey 740	2026-07-11T04:48:17.276134
9cd55106-ade	sankara.telukutla	create_parcel	763ac144-51e	Survey 398	2026-07-11T04:48:17.288182
7146546b-710	sankara.telukutla	delete_passbook	8229066a-703		2026-07-11T04:54:08.991073
95f569c3-e00	sankara.telukutla	create_passbook	ed003ec0-f20	Pattadar 1422	2026-07-11T04:54:35.548440
e8f4c0de-cee	sankara.telukutla	create_parcel	fc4c483a-0a3	Survey 183	2026-07-11T04:54:35.573161
746c0ba1-cfe	sankara.telukutla	create_parcel	e25951cb-5f4	Survey 183	2026-07-11T04:54:35.593207
c5e58bdf-d0e	sankara.telukutla	create_parcel	d7774d23-c51	Survey 183	2026-07-11T04:54:35.609414
bad303f9-ca0	sankara.telukutla	create_parcel	27d9b749-b1f	Survey 120	2026-07-11T04:54:35.625534
4a884a9c-094	sankara.telukutla	create_parcel	30aae226-472	Survey 398	2026-07-11T04:54:35.675365
1657002f-525	sankara.telukutla	create_parcel	5c753fca-a64	Survey 741	2026-07-11T04:54:35.645393
c59ff6bd-3bd	sankara.telukutla	create_parcel	c17af883-fad	Survey 740	2026-07-11T04:54:35.660378
239d99ed-e93	sankara.telukutla	delete_passbook	ed003ec0-f20		2026-07-11T04:55:18.208769
39831ed0-b77	deedtest	create_registered_document	063f596c-048	2056	2026-07-11T05:20:29.421194
ba653856-fc5	deedtest	create_passbook	2b367d8e-f56	Pattadar K-1	2026-07-11T05:20:29.430682
e6391ffb-68e	deedtest	parcel_from_document	00ef51a4-d14	063f596c-048	2026-07-11T05:20:29.444736
df08657a-939	deedtest	delete_passbook	2b367d8e-f56		2026-07-11T05:20:29.452728
57b37380-73a	sankara.telukutla	create_passbook	f915435e-8d9	Pattadar 1422	2026-07-11T05:51:34.723205
345e05e9-750	sankara.telukutla	create_parcel	a28c1ac0-e2a	Survey 183	2026-07-11T05:51:34.740521
79ebebfd-f79	sankara.telukutla	create_parcel	1e613205-1a3	Survey 183	2026-07-11T05:51:34.756425
20a75d33-e79	sankara.telukutla	create_parcel	35b21fe2-32d	Survey 183	2026-07-11T05:51:34.774344
b271b3c2-4dc	sankara.telukutla	create_parcel	caf598fe-fab	Survey 120	2026-07-11T05:51:34.788013
45a340fd-228	sankara.telukutla	create_parcel	b103f7b0-606	Survey 741	2026-07-11T05:51:34.799852
aff3886a-88e	sankara.telukutla	create_parcel	1c3a9685-038	Survey 740	2026-07-11T05:51:34.812173
dd48043d-d80	sankara.telukutla	create_parcel	1a6eb58a-548	Survey 398	2026-07-11T05:51:34.824015
5bc3b1db-436	geotest	create_passbook	8617ff45-3be	Pattadar G-1	2026-07-11T06:06:22.365368
7c369efd-0ec	geotest	create_parcel	220ac5c7-c2b	Survey 191	2026-07-11T06:06:22.377656
4f794230-519	geotest	update_parcel_geo	220ac5c7-c2b	location set	2026-07-11T06:06:22.386080
cf60e71a-219	geotest	delete_passbook	8617ff45-3be		2026-07-11T06:06:22.392942
dd3d88f3-a02	sankara.telukutla	delete_passbook	f915435e-8d9		2026-07-11T07:56:16.321572
d1cf9b14-f6e	sankara.telukutla	create_passbook	359d05c0-4ce	Pattadar 1422	2026-07-11T07:56:31.121001
96ef4d01-e79	sankara.telukutla	create_parcel	38452269-025	Survey 183	2026-07-11T07:56:31.138579
deff701a-902	sankara.telukutla	create_parcel	f45770e5-58a	Survey 183	2026-07-11T07:56:31.152313
7486b4f3-59a	sankara.telukutla	create_parcel	f2495781-f60	Survey 183	2026-07-11T07:56:31.165118
574e4d1a-725	sankara.telukutla	create_parcel	e8cdbf5d-715	Survey 120	2026-07-11T07:56:31.180045
c51909b9-73c	sankara.telukutla	create_parcel	905282f1-16c	Survey 741	2026-07-11T07:56:31.193919
3224e537-048	sankara.telukutla	create_parcel	16eaafbe-973	Survey 740	2026-07-11T07:56:31.206794
d4475b89-169	sankara.telukutla	create_parcel	5339e6c8-56c	Survey 398	2026-07-11T07:56:31.218574
085daeb3-d59	sankara.telukutla	update_parcel_geo	5339e6c8-56c	location set	2026-07-11T07:57:25.271226
6d423de1-f05	sankara.telukutla	delete_passbook	359d05c0-4ce		2026-07-11T08:11:09.759365
80b6d989-9fb	sankara.telukutla	create_passbook	54118ed7-8e2	Pattadar 1422	2026-07-11T08:13:17.301644
e36929de-b74	sankara.telukutla	create_parcel	b76b4d1e-493	Survey 183	2026-07-11T08:13:17.319984
1303932c-6ad	sankara.telukutla	create_parcel	77987e39-a2c	Survey 183	2026-07-11T08:13:17.336523
68f5f9b2-8f0	sankara.telukutla	create_parcel	2543c26c-cf8	Survey 183	2026-07-11T08:13:17.350760
df2dbe05-c90	sankara.telukutla	create_parcel	8530c0a4-10d	Survey 120	2026-07-11T08:13:17.368379
9f19b626-a82	sankara.telukutla	create_parcel	e67004b4-d8f	Survey 741	2026-07-11T08:13:17.385453
38c735fb-a40	sankara.telukutla	create_parcel	2396d835-19b	Survey 740	2026-07-11T08:13:17.401502
c98fad89-bbd	sankara.telukutla	create_parcel	8898e7e5-46c	Survey 398	2026-07-11T08:13:17.416522
ce193fdf-9b1	sankara.telukutla	update_parcel_geo	8530c0a4-10d	location set	2026-07-11T08:13:48.643145
ed8b8e69-7f2	sankara.telukutla	upload_document	33f874a6-ecc	Type sale_deed	2026-07-11T08:15:02.079392
33e6e56e-3ca	sankara.telukutla	create_passbook	9dba6df8-f23	Pattadar 1422	2026-07-11T08:21:51.858687
d7e46b42-441	sankara.telukutla	create_parcel	dd81b408-9bc	Survey 183	2026-07-11T08:21:51.878093
7ccc85de-c5f	sankara.telukutla	create_parcel	4a63e4ab-193	Survey 183	2026-07-11T08:21:51.893632
18137f23-fc8	sankara.telukutla	create_parcel	d9fa88e8-51d	Survey 183	2026-07-11T08:21:51.912275
9f60afa0-93a	sankara.telukutla	create_parcel	987fe2d9-9e8	Survey 120	2026-07-11T08:21:51.928438
e4193251-92d	sankara.telukutla	create_parcel	9d2a7d00-d2f	Survey 741	2026-07-11T08:21:51.942145
a27a27ae-754	sankara.telukutla	create_parcel	a32f8fd8-1e1	Survey 740	2026-07-11T08:21:51.954600
196e6381-f2f	sankara.telukutla	create_parcel	b467efe4-c4b	Survey 398	2026-07-11T08:21:51.968759
930fd77b-44b	sankara.telukutla	delete_passbook	9dba6df8-f23		2026-07-11T08:21:59.343407
fdbd6f8b-533	sankara.telukutla	update_parcel_geo	8530c0a4-10d	location set	2026-07-11T19:20:04.078159
28faf8c8-b2c	sankara.telukutla	update_parcel_geo	2543c26c-cf8	location set	2026-07-12T01:23:41.913706
7eb3ef5f-62c	sankara.telukutla	create_passbook	452526ed-266	Pattadar 573	2026-07-12T01:25:06.610673
3588a28d-df0	sankara.telukutla	create_parcel	72ef7729-871	Survey 119	2026-07-12T01:25:06.636669
7d79345e-191	sankara.telukutla	create_parcel	02c64969-8b4	Survey 128	2026-07-12T01:25:06.651558
88396744-24e	sankara.telukutla	create_parcel	d0ef0571-304	Survey 128	2026-07-12T01:25:06.666183
7d6c5a3b-e9e	sankara.telukutla	create_parcel	faae9253-026	Survey 70	2026-07-12T01:25:06.682191
94fc54ec-a1b	sankara.telukutla	create_parcel	3360c68c-717	Survey 71	2026-07-12T01:25:06.694906
12abb64e-5a6	sankara.telukutla	create_parcel	81276fd4-4f2	Survey 128	2026-07-12T01:25:06.711639
893c6855-b58	sankara.telukutla	create_parcel	4acf7722-b97	Survey 126	2026-07-12T01:25:06.729014
143b3ced-de7	sankara.telukutla	create_parcel	a31cc12a-a58	Survey 124	2026-07-12T01:25:06.743774
0674cf22-a25	sankara.telukutla	create_parcel	fdc36256-6f9	Survey 125	2026-07-12T01:25:06.756760
19334c28-969	sankara.telukutla	create_parcel	3988d651-ca0	Survey 125	2026-07-12T01:25:06.768584
eb03c9fb-6ab	sankara.telukutla	create_parcel	11ad13fa-877	Survey 124	2026-07-12T01:25:06.784161
f4f3c2be-0a7	sankara.telukutla	create_parcel	ceb50389-4bf	Survey 126	2026-07-12T01:25:06.798578
00257de5-94b	sankara.telukutla	create_passbook	f9299f10-9bf	Pattadar 567	2026-07-12T01:49:52.285303
abbce75d-654	sankara.telukutla	create_parcel	4c742b5d-ee1	Survey 567	2026-07-12T01:49:52.302526
faa4d4d7-717	sankara.telukutla	update_parcel_geo	4c742b5d-ee1	location set	2026-07-12T01:50:09.895879
d9104ab3-db6	sankara.telukutla	upload_document	0d62803d-876	Type gift_deed	2026-07-12T01:53:30.281925
bae9eeb2-72c	sankara.telukutla	create_passbook	e46f9990-d02	Pattadar 567	2026-07-12T02:26:04.662737
82c6139f-453	sankara.telukutla	create_parcel	630f5571-d55	Survey 1	2026-07-12T02:26:04.684971
383f1c11-b21	sankara.telukutla	create_passbook	77ca6cf0-184	Pattadar 573	2026-07-12T02:27:07.607571
1d29b417-dff	sankara.telukutla	create_parcel	79419b6a-ee6	Survey 119	2026-07-12T02:27:07.627300
337352ed-71f	sankara.telukutla	create_parcel	e7260e05-d9c	Survey 128	2026-07-12T02:27:07.644846
57ccbb4e-f6e	sankara.telukutla	create_parcel	373cbf58-04b	Survey 128	2026-07-12T02:27:07.661825
f751bc22-392	sankara.telukutla	create_parcel	7220cf13-d90	Survey 70	2026-07-12T02:27:07.678712
a665cc4c-112	sankara.telukutla	create_parcel	bdc8988b-f86	Survey 71	2026-07-12T02:27:07.694232
feb1203c-66e	sankara.telukutla	create_parcel	56fc6aff-b6f	Survey 128	2026-07-12T02:27:07.710578
145f5285-039	sankara.telukutla	create_parcel	4b52617e-ab7	Survey 126	2026-07-12T02:27:07.722319
65ee0fb0-83a	sankara.telukutla	create_parcel	a5340c9d-d32	Survey 124	2026-07-12T02:27:07.736271
154a3160-fca	sankara.telukutla	create_parcel	202adf5b-0e8	Survey 125	2026-07-12T02:27:07.748237
2a6ac714-ea8	sankara.telukutla	create_parcel	c10373c9-1c2	Survey 125	2026-07-12T02:27:07.760536
8db5cc77-541	sankara.telukutla	create_parcel	69f6c79f-73d	Survey 124	2026-07-12T02:27:07.771919
930a9f17-bad	sankara.telukutla	create_parcel	21d0f7c0-f89	Survey 126	2026-07-12T02:27:07.784585
e6cd4815-27b	sankara.telukutla	create_passbook	b32617ac-2d7	Pattadar 593	2026-07-12T02:57:31.640316
fd3698c1-32d	sankara.telukutla	create_parcel	076673fb-fc2	Survey 119	2026-07-12T02:57:31.662239
e1d964b5-77b	sankara.telukutla	create_parcel	c0cf22db-886	Survey 123	2026-07-12T02:57:31.680305
01825acd-94a	sankara.telukutla	create_parcel	48d625de-c1b	Survey 125	2026-07-12T02:57:31.696047
d20e0ed3-4f3	sankara.telukutla	create_parcel	2d3bf83c-e48	Survey 127	2026-07-12T02:57:31.711151
6b75c138-a35	sankara.telukutla	create_parcel	c0b31fa5-159	Survey 442	2026-07-12T02:57:31.724448
8c5def2f-832	sankara.telukutla	create_parcel	e1b8cfe1-648	Survey 455	2026-07-12T02:57:31.737740
b07c13be-617	sankara.telukutla	create_parcel	53208375-bb1	Survey 455	2026-07-12T02:57:31.749691
a38d5f02-33c	sankara.telukutla	create_parcel	bf94c003-84d	Survey 458	2026-07-12T02:57:31.761987
acc45472-0f8	sankara.telukutla	create_parcel	e14d6edf-617	Survey 81	2026-07-12T02:57:31.773244
325477ac-b2c	sankara.telukutla	create_parcel	2303ffd7-373	Survey 456	2026-07-12T02:57:31.785732
9afdb18b-4b76-4f58-9ae4-fb72b170719d	sankara.telukutla	create_passbook	fa6673ab-1e33-4f77-8694-e8d5e231ea42	Pattadar ZZTEST	2026-07-12T03:28:29.209865
2d72743b-10a8-48a1-9f51-45f042e2e53e	sankara.telukutla	delete_passbook	fa6673ab-1e33-4f77-8694-e8d5e231ea42		2026-07-12T03:28:29.273728
53d9326f-737e-47e9-bba0-f79e15583131	sankara.telukutla	create_passbook	7591620f-1ff6-45f9-aae5-e8ef11d31ca8	Pattadar 567	2026-07-12T03:35:38.689432
50cfb663-8432-4028-a905-38804702f3ed	sankara.telukutla	create_parcel	a6aead58-df7c-4c32-b243-68f803cd2633	Survey 1	2026-07-12T03:35:38.712918
d5df1a4e-ce03-42df-ac6f-0cf98c1382a0	sankara.telukutla	create_passbook	24bf845c-d144-4c0c-9252-b16db47ac233	Pattadar ZZCASCADE	2026-07-12T04:00:41.509239
93220097-8d50-45fa-b677-20bbeb1a5b70	sankara.telukutla	create_parcel	c36e92c4-5326-481e-9b69-f1bcce14209f	Survey 999	2026-07-12T04:00:41.535144
454d6cca-d943-41cc-b222-94651f452552	sankara.telukutla	delete_passbook	24bf845c-d144-4c0c-9252-b16db47ac233		2026-07-12T04:00:41.586148
68308d56-fdf5-44b0-b2ca-c98cc7103e50	sankara.telukutla	delete_passbook	7591620f-1ff6-45f9-aae5-e8ef11d31ca8		2026-07-12T05:16:41.609691
f32f82ed-a5bb-471d-98d0-7d0aa24ec00e	sankara.telukutla	delete_passbook	b32617ac-2d7		2026-07-12T05:16:41.609944
8495b02d-9632-48aa-8f3c-4c2603ad0624	sankara.telukutla	delete_passbook	77ca6cf0-184		2026-07-12T05:16:41.614100
adb4144b-3aae-4e00-9613-8ba9ec76f7ff	sankara.telukutla	delete_passbook	e46f9990-d02		2026-07-12T05:16:41.615856
65e23091-6d90-499f-92e4-26ad4a409c78	sankara.telukutla	delete_passbook	452526ed-266		2026-07-12T05:16:41.616122
6272784f-63ab-4ffc-a8ea-ed3d3a49a7af	sankara.telukutla	delete_passbook	54118ed7-8e2		2026-07-12T05:16:41.618458
5f8e2b80-30f8-4d34-a31c-3fb8dff69e0e	sankara.telukutla	delete_passbook	f9299f10-9bf		2026-07-12T05:16:41.626905
174fa7d8-53d4-4fca-a469-07f276f9c736	sankara.telukutla	create_passbook	72583fd4-94cf-44d9-9ade-b693e6214082	Pattadar 593	2026-07-12T05:19:04.663430
5b89c6a8-658b-4c24-ba23-1bd877274740	sankara.telukutla	create_parcel	9798f48f-577d-4470-954b-412fc58e8525	Survey 119	2026-07-12T05:19:04.684751
97475bc3-63dd-4b4c-abf1-c15cc9d21a23	sankara.telukutla	create_parcel	321c05e1-a933-4d50-aac7-4c7a8b015e93	Survey 123	2026-07-12T05:19:04.700598
f983310f-1c13-4b3a-9c68-2f58b9adad89	sankara.telukutla	create_parcel	d5933b0e-1b41-4244-a98b-4a84d87cb0f7	Survey 125	2026-07-12T05:19:04.716426
1bddf956-c20f-4071-a76e-f92c85991e65	sankara.telukutla	create_parcel	8e11b648-cd36-4000-8e5a-0f30eef32981	Survey 127	2026-07-12T05:19:04.730502
ef07b3b9-fe20-4510-9129-167453c42d08	sankara.telukutla	create_parcel	7bd496b3-5bc7-4a14-9a8f-375733e9f1d6	Survey 442	2026-07-12T05:19:04.745875
a6cd6613-b7b2-41a2-af41-7422c1d80b76	sankara.telukutla	create_parcel	d9dbf5c1-749c-43b5-a07d-6c432b293603	Survey 455	2026-07-12T05:19:04.761945
176c3123-fdad-436d-a29b-55fd0c50a7f5	sankara.telukutla	create_parcel	22f406e8-23db-4978-8e6e-8491c227ada5	Survey 455	2026-07-12T05:19:04.774954
62e3e12b-7dbb-4522-b4a8-ba27b5db947e	sankara.telukutla	create_parcel	cbbe058a-7209-467c-b734-e283c190636d	Survey 458	2026-07-12T05:19:04.788786
a9ed5d13-4c48-4b60-b98a-21cd807cb315	sankara.telukutla	create_parcel	bf249d37-11d6-482d-9ed5-7608f4f2d043	Survey 81	2026-07-12T05:19:04.801848
4e972f54-c90d-4c1c-837e-574f83934d7f	sankara.telukutla	create_parcel	3f6f2222-96ec-4d93-8b23-8a9d4b55b2de	Survey 456	2026-07-12T05:19:04.815172
1b97119a-19b5-4a50-8a91-9a593f8ec316	sankara.telukutla	delete_parcel	cbbe058a-7209-467c-b734-e283c190636d		2026-07-12T05:31:21.244105
b4c29c32-3746-4143-8c2a-a55e82efba85	sankara.telukutla	delete_parcel	bf249d37-11d6-482d-9ed5-7608f4f2d043		2026-07-12T05:31:21.243931
7236c9be-81f1-440f-8777-17823549ce26	sankara.telukutla	delete_parcel	22f406e8-23db-4978-8e6e-8491c227ada5		2026-07-12T05:31:21.244152
60eaa72a-b38b-4d6a-9df2-3e324584a98a	sankara.telukutla	delete_parcel	8e11b648-cd36-4000-8e5a-0f30eef32981		2026-07-12T05:31:21.246211
8e8f6bf6-512e-4595-9242-a12d1b5a320d	sankara.telukutla	delete_parcel	7bd496b3-5bc7-4a14-9a8f-375733e9f1d6		2026-07-12T05:31:21.245976
db69115c-5baa-49a7-ab36-b7e5ca8bad53	sankara.telukutla	delete_parcel	9798f48f-577d-4470-954b-412fc58e8525		2026-07-12T05:31:21.246278
a93bb01e-c757-4a97-933b-f5ddd10d7ed0	sankara.telukutla	delete_parcel	3f6f2222-96ec-4d93-8b23-8a9d4b55b2de		2026-07-12T05:31:21.246730
153692f3-a837-4fba-b7c6-96a06f86edce	sankara.telukutla	create_parcel	b7069648-cd25-4250-ba5b-eabe168c967d	Survey 127	2026-07-12T05:31:53.279225
01dfdbb0-b955-4768-8981-3c935cd25f25	sankara.telukutla	create_parcel	59915dde-8315-4bf2-9880-ad868bbb636a	Survey 442	2026-07-12T05:31:53.295550
589c7410-e479-4199-8c0c-9140571ed05e	sankara.telukutla	create_parcel	79cd38c7-5424-491a-98af-4c9d18bce552	Survey 455	2026-07-12T05:31:53.310916
625e2e59-3a9d-421c-9f14-6097180213b7	sankara.telukutla	create_parcel	5af46780-7e81-4f90-a215-56f3c238f9d7	Survey 455	2026-07-12T05:31:53.328026
2fc6e30f-9506-4cca-a151-201a2d569212	sankara.telukutla	create_parcel	a8806a0d-14d5-49b2-b468-e219d00f33ff	Survey 1	2026-07-12T05:33:09.728025
deb38034-9165-4471-9aa3-4462382a3587	sankara.telukutla	create_passbook	aa4fb175-f7d9-45e5-8a77-0954102dfdf0	Pattadar 573	2026-07-12T05:33:26.099618
6e0ddf31-1d7e-492f-b3ed-1a11fab4d8db	sankara.telukutla	create_parcel	b365a40a-6978-406b-a75f-22e0bdef3e3b	Survey 70	2026-07-12T05:33:26.165261
f4f15fb7-74b7-4bab-96bb-277b4bfc5af7	sankara.telukutla	create_parcel	fdbd732f-fec6-4f3b-9b1a-cf3b8803bd05	Survey 71	2026-07-12T05:33:26.179791
baf5970a-94fa-4884-a277-740d61333c0d	sankara.telukutla	create_parcel	abacd6b9-6dce-42a8-8e23-38ea13f1c44d	Survey 126	2026-07-12T05:33:26.206935
d97dedf7-eaf3-4d0f-98bf-be03dd747d90	sankara.telukutla	create_parcel	39e589e6-efd0-43ae-8926-3e42a2ef83d6	Survey 125	2026-07-12T05:33:26.244662
44f5ff78-488f-4d63-9267-39088d632a64	sankara.telukutla	create_passbook	154852a4-4758-42f9-8239-9121bb306c7e	Pattadar 1422	2026-07-12T05:40:21.415333
4b833ee1-05e8-4542-8b2a-74b921fa308b	sankara.telukutla	create_parcel	9c24da58-9183-4e57-b074-d194486213d3	Survey 183	2026-07-12T05:40:21.488776
b922a1f9-ed2d-408d-98e7-32edf456cdd3	sankara.telukutla	create_parcel	fb574e1f-8b48-4b07-befd-5bead547ca36	Survey 740	2026-07-12T05:40:21.532587
8a59b855-bc7f-409e-b216-101ee642a775	sankara.telukutla	delete_parcel	d9dbf5c1-749c-43b5-a07d-6c432b293603		2026-07-12T05:31:21.247745
2a000a39-0761-4b0a-b9b5-544c92a24622	sankara.telukutla	delete_parcel	d5933b0e-1b41-4244-a98b-4a84d87cb0f7		2026-07-12T05:31:21.249503
0c97ee5c-1f9e-4029-a618-366cab3fc25b	sankara.telukutla	delete_parcel	321c05e1-a933-4d50-aac7-4c7a8b015e93		2026-07-12T05:31:21.251298
b4859bf0-f27a-43e3-92bd-d06493ba14c2	sankara.telukutla	create_parcel	ff68ff4f-ac89-4461-a21b-97283b2ae8f3	Survey 458	2026-07-12T05:31:53.342010
1d28dd1b-4559-435a-b93d-395a39649e3f	sankara.telukutla	create_passbook	194a6624-276f-46c8-9b1c-90b282a285e9	Pattadar 567	2026-07-12T05:33:09.709527
7b087546-242a-405d-8997-20fddb2f28d3	sankara.telukutla	create_parcel	c437f4bc-140c-43d7-b851-0bd2f9741d81	Survey 128	2026-07-12T05:33:26.150566
06949a71-8005-4095-8346-3fea7e16f999	sankara.telukutla	create_parcel	ef3d3536-1d9f-43fe-921f-a68ca0a754d0	Survey 120	2026-07-12T05:40:21.502500
ce6744f3-e8da-4524-8140-ca7dacc3b51a	sankara.telukutla	delete_passbook	72583fd4-94cf-44d9-9ade-b693e6214082		2026-07-12T05:31:26.692869
ac95d0ec-75b5-4e86-8758-595bce789102	sankara.telukutla	create_passbook	f1dcdd47-0048-42de-a2e1-77c21afdf427	Pattadar 593	2026-07-12T05:31:53.207641
4c35a2d8-c939-4b94-a4f3-6d39658f39be	sankara.telukutla	create_parcel	c4f7e01c-83ed-4be5-a2b4-92eedc0227c3	Survey 119	2026-07-12T05:31:53.229735
75534d91-7eb0-4ce1-956e-436aeaf88214	sankara.telukutla	create_parcel	00978396-f90a-424a-aec8-defb2c746a9b	Survey 123	2026-07-12T05:31:53.251377
ded2216f-b652-4ae5-9f6a-d62c3a580204	sankara.telukutla	create_parcel	22175844-0a41-439f-baa6-5f6484be1e0e	Survey 125	2026-07-12T05:31:53.264800
e5496ada-f18b-490c-8812-183ba6b991f4	sankara.telukutla	create_parcel	75b075f4-d7df-4474-8c3c-0b6bef4abb13	Survey 81	2026-07-12T05:31:53.359881
f4770c1b-f39d-4ad9-b557-316d366f0a15	sankara.telukutla	create_parcel	7ef753db-deec-4955-8ad0-a699903594b9	Survey 456	2026-07-12T05:31:53.373272
46a6bccc-591d-4cef-82a5-68a9ffc71d8d	sankara.telukutla	create_parcel	aa8cb706-ae64-404f-965d-e4822000e038	Survey 119	2026-07-12T05:33:26.118760
09f23c6d-dba6-4fb8-b954-3c16ad3422ba	sankara.telukutla	create_parcel	a3ff7ea1-61ec-4e43-9adb-b579b448d472	Survey 128	2026-07-12T05:33:26.134433
924039a2-efc7-4cce-8b2d-03d5fe93394e	sankara.telukutla	create_parcel	318d4a97-ed3a-495c-b2c8-3f70465ab1ed	Survey 128	2026-07-12T05:33:26.193187
aaeaca84-d810-466a-9349-fea3a72f5e97	sankara.telukutla	create_parcel	219e3da2-282e-4d01-b7d8-46e4b28b64ec	Survey 124	2026-07-12T05:33:26.219755
3f4cf15e-950e-4d08-b746-9b38ad15e9c9	sankara.telukutla	create_parcel	cbcb5e1f-9173-4b20-9f20-815553454bb8	Survey 125	2026-07-12T05:33:26.231884
d39576b0-b2e9-4909-9b2c-dadd883023f4	sankara.telukutla	create_parcel	e83f3163-40ef-4e5e-bb2c-23fb70d39552	Survey 124	2026-07-12T05:33:26.255983
b8730c41-cfb3-4aa9-9408-c086c1dfb3c3	sankara.telukutla	create_parcel	02d84acf-8999-4630-b90f-b98c73bd8e65	Survey 126	2026-07-12T05:33:26.268135
b39a77ed-fed8-4df3-a8e3-4e944d67d0df	sankara.telukutla	create_passbook	75174d92-4d6e-45fb-82cd-7dd75ad5bdae	Pattadar 5001	2026-07-12T05:38:15.709963
0a126597-d6b6-4370-b574-8f00be887c30	sankara.telukutla	create_parcel	6fa9e032-5c09-422a-8187-3bedf00c6462	Survey 183	2026-07-12T05:40:21.457427
fec8c291-36cb-4efb-9663-57cb5b2c6b7f	sankara.telukutla	create_parcel	7b01471a-9328-4a2a-a8f2-65457fc0f37b	Survey 183	2026-07-12T05:40:21.474616
e26da9ba-094b-49fe-b642-fb922bf95689	sankara.telukutla	create_parcel	3c882d21-5fd9-4b89-9007-fc161a70baa5	Survey 741	2026-07-12T05:40:21.516694
496f8dc6-8bc8-4637-9377-5a4c6e44ad6b	sankara.telukutla	create_parcel	ce2dfdf5-93c4-48c1-a6cd-05eac36280a1	Survey 398	2026-07-12T05:40:21.545643
afe8ae11-4baa-46e4-86e9-f2313ba81cc2	sankara.telukutla	create_parcel	3bc4fdba-fb42-492c-b3ff-2c869e43fee4	Survey 1	2026-07-12T05:38:15.727884
b1b3f3d2-f91b-4d3c-8382-5275f9748031	sankara.telukutla	create_parcel	08a41faf-94dc-475a-b76c-ca7cf1c45149	Survey 1	2026-07-12T05:38:15.743962
8c36eee4-9686-447d-ae5f-5f833f9fdee5	sankara.telukutla	create_passbook	b1293495-142b-4f2a-9935-4757966d0ee5	Pattadar 567	2026-07-12T07:40:38.151584
72675e14-b38f-4e93-b108-02e01f8927b4	sankara.telukutla	create_parcel	a5ab33be-04f8-43bb-96e4-8a36772a5f32	Survey 567	2026-07-12T07:40:38.171513
c48bd2bf-cc9c-4a49-bdb9-23e8384cf535	sankara.telukutla	delete_passbook	aa4fb175-f7d9-45e5-8a77-0954102dfdf0		2026-07-12T10:16:56.373323
8ba5aec5-ac12-4a13-96bf-bda051110c14	sankara.telukutla	delete_passbook	75174d92-4d6e-45fb-82cd-7dd75ad5bdae		2026-07-12T10:16:56.373410
e0314377-8f1b-4cb3-a7fb-19b34751a9ed	sankara.telukutla	delete_passbook	f1dcdd47-0048-42de-a2e1-77c21afdf427		2026-07-12T10:16:56.374737
f6709ac6-6a24-4054-af52-035d543e3319	sankara.telukutla	delete_passbook	b1293495-142b-4f2a-9935-4757966d0ee5		2026-07-12T10:16:56.374890
61c9b30d-14c8-49fc-b8c1-326b63da927a	sankara.telukutla	delete_passbook	154852a4-4758-42f9-8239-9121bb306c7e		2026-07-12T10:16:56.377404
0d52e79b-8bde-4199-9ecc-5f2888992f64	sankara.telukutla	delete_passbook	194a6624-276f-46c8-9b1c-90b282a285e9		2026-07-12T10:16:56.380343
ccf07596-4c48-44d4-8134-3c81b0e500fa	sankara.telukutla	create_passbook	bff51db1-c601-4531-8f35-1b7ee4f44087	Pattadar 1422	2026-07-12T10:18:06.433937
01b7a4e8-3bf7-4c55-9cec-3429c0233647	sankara.telukutla	create_parcel	2a045f79-0050-421d-ad6b-fabf8591f977	Survey 183	2026-07-12T10:18:06.448668
5b749040-6a75-42d5-9456-0f1bfde6fe2c	sankara.telukutla	create_parcel	f6ebfc3d-8165-498c-9db0-39c8fc0dac8d	Survey 183	2026-07-12T10:18:06.460895
231d15af-ea70-4150-a972-706be46b79dc	sankara.telukutla	create_parcel	0f108c5d-a132-4013-9a80-ee82ad48ffd5	Survey 183	2026-07-12T10:18:06.472428
4800c79a-1320-4778-82d6-49cc239837cf	sankara.telukutla	create_parcel	5a16ab84-9e2e-4ae5-83b2-25a3dac4b337	Survey 120	2026-07-12T10:18:06.485188
139f0a42-771b-4f56-a135-7e95ef0b0609	sankara.telukutla	create_parcel	135de2d4-c067-4331-9b06-c2dca955d8b3	Survey 741	2026-07-12T10:18:06.496951
5ea235ca-38cd-4717-adf0-334504c03ea2	sankara.telukutla	create_parcel	da97a59f-cd5b-4429-b479-f3125f799513	Survey 740	2026-07-12T10:18:06.510493
ef5a03ee-d915-4507-8960-32a6bebd5bea	sankara.telukutla	create_parcel	e2cd1f12-9239-4d2d-bb6f-bbdafa719632	Survey 398	2026-07-12T10:18:06.523561
1d696566-6136-4285-a662-95a013c3ee8e	sankara.telukutla	create_passbook	c16a3600-d186-4b5a-96c1-18fcbc527269	Pattadar 573	2026-07-12T10:19:22.521288
984f1a4d-b293-43d6-b732-189300024491	sankara.telukutla	create_parcel	603dc9c5-f467-4103-b586-4b10f2b42664	Survey 119	2026-07-12T10:19:22.538226
3e3653c4-b57e-464c-bfe2-9759ccb4c9e4	sankara.telukutla	create_parcel	93a477a5-7dfc-4431-9189-0600f6532638	Survey 128	2026-07-12T10:19:22.551597
4b87fa3e-4125-498a-aab4-3f05dd4bd049	sankara.telukutla	create_parcel	3073b950-e37b-4a4d-ab43-db2d8ec7dba2	Survey 128	2026-07-12T10:19:22.567773
9a71ac14-f1a2-413a-8a49-de92627fb468	sankara.telukutla	create_parcel	e1263b3d-3708-4922-9ca0-e44beffa693b	Survey 70	2026-07-12T10:19:22.581545
267803f0-bcf0-4245-bf21-60c25f109377	sankara.telukutla	create_parcel	59e92ade-c095-4834-9a7f-9e0648f56416	Survey 71	2026-07-12T10:19:22.597172
62b2381d-ce51-403e-9a05-f9a8d53daa7f	sankara.telukutla	create_parcel	7c766929-bf2a-4712-a702-63c98d557b23	Survey 128	2026-07-12T10:19:22.610809
f2b56328-db16-40cf-af45-096e4fd91edb	sankara.telukutla	create_parcel	544ec8f4-0da5-4d43-bc4a-b8840c86ab2d	Survey 126	2026-07-12T10:19:22.623455
55832c32-799a-472b-a19b-87694d632d26	sankara.telukutla	create_parcel	c33e61f4-b53a-41fe-9711-bbea42722cfc	Survey 124	2026-07-12T10:19:22.635831
6770ded9-2735-47f3-ac54-9c5da3ff78fe	sankara.telukutla	create_parcel	88f8b13f-df6e-4984-9655-0cb75002106d	Survey 125	2026-07-12T10:19:22.648858
2339443b-998f-48a5-a8ff-8016b1a4b976	sankara.telukutla	create_parcel	9d1908a9-747a-4a57-8b65-8c568d280925	Survey 125	2026-07-12T10:19:22.663917
99762a4b-0323-4f29-bb79-0153bb7b8ef4	sankara.telukutla	create_parcel	716f9f25-6f33-4387-a7ef-6fe282c71b43	Survey 124	2026-07-12T10:19:22.676164
57d2ba24-766d-4cc6-bdfb-b1c28070f729	sankara.telukutla	create_parcel	c17d3f77-7344-49d5-8d14-2f0cb0a7a3ac	Survey 126	2026-07-12T10:19:22.690461
26390733-9bbf-47d6-8bc9-d68c8a488fa7	sankara.telukutla	create_passbook	3431e440-04db-4c4b-9e68-564d2fa65dec	Pattadar 593	2026-07-12T10:19:54.336224
bb98a189-b986-45d3-886b-706e145d5436	sankara.telukutla	create_parcel	5d1c39c2-8e30-4dbc-861b-fdf7a115e5fd	Survey 119	2026-07-12T10:19:54.351651
3ccad41d-35a0-4a91-bd85-2068389bd8ce	sankara.telukutla	create_parcel	a8fdddc6-8e8c-41f4-a8d3-57e8ec1d6208	Survey 123	2026-07-12T10:19:54.363966
53f9cb9a-7f22-45c0-a464-4a5611e232d8	sankara.telukutla	create_parcel	b5150e11-6586-4da7-b437-0214c095a643	Survey 125	2026-07-12T10:19:54.376062
73355294-cfd1-4738-8a9a-81689135de11	sankara.telukutla	create_parcel	35a76448-519d-46c4-ac65-ee1ba504a45e	Survey 127	2026-07-12T10:19:54.388589
e9df515d-8710-428e-8b1d-241cc07d54c1	sankara.telukutla	create_parcel	b63c3d87-ea24-4222-bc9d-487d5c60b3d1	Survey 442	2026-07-12T10:19:54.404978
38be476f-9f64-4a35-a939-9e074d5a32c2	sankara.telukutla	create_parcel	11e0921e-ca9e-40d7-8e91-24031c41934a	Survey 455	2026-07-12T10:19:54.420212
7ef3eb3a-b761-48a4-9969-3b79f221cae0	sankara.telukutla	create_parcel	d3e38b96-b1a9-478d-9a8d-6f937e72e5fb	Survey 455	2026-07-12T10:19:54.435195
fb58930b-72e5-4361-be90-d10368d23936	sankara.telukutla	create_parcel	a433384c-ed08-49d5-9c01-cb0ec801c034	Survey 458	2026-07-12T10:19:54.447569
3aa56df6-1afb-41a6-924b-78f280237301	sankara.telukutla	create_parcel	587ceff1-ea44-4c86-a100-817dcde66138	Survey 81	2026-07-12T10:19:54.463678
17be205b-82f4-4693-a876-815d34f482d0	sankara.telukutla	create_parcel	951788aa-3ee6-4dad-8d99-916b15e53fe3	Survey 456	2026-07-12T10:19:54.475466
03c28176-1bcb-43da-8a48-30da37e963a7	sankara.telukutla	create_passbook	21025732-9cc2-40ac-8556-9d7e87976155	Pattadar 5001	2026-07-12T10:20:31.471420
50513374-ed77-4c23-a062-0d342b1cc49e	sankara.telukutla	create_parcel	db2972e3-d4b7-49ad-8d8f-00b14be4dd3f	Survey 1	2026-07-12T10:20:31.485940
019fbe8e-13d0-409f-b2c3-26760a290803	sankara.telukutla	create_parcel	17779483-e257-418f-bb83-88b9411f58c6	Survey 1	2026-07-12T10:20:31.500263
2533fe32-a227-430a-b901-70e10eded0bd	sankara.telukutla	create_passbook	bb434ce9-3dca-4d63-b147-f14fd9f99527	Pattadar 567	2026-07-12T10:20:56.410289
9215ccd6-d7c7-4b4b-be7f-1ea05229cb45	sankara.telukutla	create_parcel	86c78df1-1100-4dfd-9274-0b1236dd4ccf	Survey 1	2026-07-12T10:20:56.425118
3a32df85-e288-4428-94f9-7f2ac828f42b	sankara.telukutla	update_parcel_geo	5d1c39c2-8e30-4dbc-861b-fdf7a115e5fd	location set	2026-07-12T10:21:38.603394
6478a8ba-f2b7-46ff-bea0-ac3dbd7458e3	sankara.telukutla	update_parcel_geo	a8fdddc6-8e8c-41f4-a8d3-57e8ec1d6208	location set	2026-07-12T10:21:52.350177
773e2b68-d0e6-43bb-b37c-d05b294172de	sankara.telukutla	update_parcel_geo	b5150e11-6586-4da7-b437-0214c095a643	location set	2026-07-12T10:21:57.907414
95682b80-1626-4293-82d1-9855baf34ff7	sankara.telukutla	create_parcel	d920f244-4204-48e4-bc7f-8de32da7e5e9	Survey 451	2026-07-12T10:26:43.064865
13fc09cb-2392-47af-856e-2344e9bbc175	sankara.telukutla	add_beneficiary	f9f107ff-94b3-4b77-8557-2466ae666b68	Praneel Reddy Telukutla (nominee)	2026-07-12T10:23:21.571268
397f70d6-4cba-4f99-ae38-2e63b32ac339	sankara.telukutla	create_passbook	f6e636ba-0d5a-4153-855e-57e25e96feb5	Pattadar 1415	2026-07-12T10:26:43.048587
7d28d998-b221-4fc0-9756-f13b9f12b2d5	sankara.telukutla	update_parcel_geo	1441bfe2-8673-42e5-a877-be71d194344e	location set	2026-07-12T10:27:27.945032
503af904-9f72-48ef-abe3-a12a68a0c2f0	sankara.telukutla	delete_passbook	f6e636ba-0d5a-4153-855e-57e25e96feb5		2026-07-12T10:29:54.591143
eb300180-f7fa-417c-84fc-f828ebb22aa4	sankara.telukutla	create_parcel	1441bfe2-8673-42e5-a877-be71d194344e	Survey 450	2026-07-12T10:26:43.079715
77b0a857-46ad-490e-8360-7b389dccca6d	sankara.telukutla	create_parcel	52401805-65c6-42fc-9520-55cdde3e6cb0	Survey 401	2026-07-12T10:26:43.093345
a5e7406a-9914-40e8-ade0-af57f54ab973	sankara.telukutla	update_parcel_geo	52401805-65c6-42fc-9520-55cdde3e6cb0	location set	2026-07-12T10:27:18.690632
08811296-cb5e-453f-a8a7-c1f4d690fdb2	sankara.telukutla	update_parcel_geo	d920f244-4204-48e4-bc7f-8de32da7e5e9	location set	2026-07-12T10:27:34.363630
2c73b507-5c59-4b50-a06b-eaa6da57f1b6	sankara.telukutla	upload_document	9f1d1039-a748-42b1-a7d4-ed8247e5a8cd	Type gift_deed	2026-07-12T10:28:49.722124
75e21793-9bb1-4dc0-8fe2-7e7fd934a60c	sankara.telukutla	create_passbook	0b4c44de-fc13-454a-a84a-0d44ae816fe9	Pattadar 60602	2026-07-12T10:40:51.453236
956e8e59-2680-49b3-8574-1d636e81ca44	sankara.telukutla	create_parcel	e438621d-f2a2-4b53-94d4-2163febf4b1d	Survey 37	2026-07-12T10:40:51.471556
6985cc9c-215e-4521-9ac6-9d37cd761826	sankara.telukutla	add_note	9387749e-ef0d-4944-8037-8cd072899bc3	passbook:test-pb-1	2026-07-12T11:03:50.230626
f9402553-9742-4021-848d-caefbff4284e	sankara.telukutla	add_note	c4c0f3f6-3de0-45cc-a73a-55341b71ac65	passbook:test-pb-1	2026-07-12T11:03:50.250976
d525072c-d500-4aee-adca-8a1d5368bfe9	sankara.telukutla	add_note	5b2c15f8-62d4-41d3-9bc4-22ce8841fb5a	passbook:21025732-9cc2-40ac-8556-9d7e87976155	2026-07-12T18:13:30.519483
5d2fc83e-abe5-400c-af67-922de8df8d96	sankara.telukutla	upload_document	fee2c10a-2812-48b1-8eb8-46da31cb3565	Type other	2026-07-13T08:32:27.344137
3ac8f33a-f89f-4e7f-9a5a-a9a65b7f1658	sankara.telukutla	upload_document	ac98ee16-29ad-40cf-90f3-ad822bb3fe05	Type photo	2026-07-14T04:14:24.903239
ecdc53d2-467b-44d6-a472-3098f3466347	sankara.telukutla	update_parcel_geo	5d1c39c2-8e30-4dbc-861b-fdf7a115e5fd	location set	2026-07-14T04:30:48.214493
ea5fc821-4261-4a80-95fd-9c0fe18a3311	sankara.telukutla	upload_document	a292351d-42b3-436b-9e29-cf3c6c332573	Type photo	2026-07-14T04:54:46.187686
c3a7d0c9-8f2d-4cc8-b62b-ee108ac0f76d	sankara.telukutla	upload_document	30d19d51-5085-4405-a7c1-9aad03a7c141	Type photo	2026-07-14T13:16:40.067205
408a6ae8-5695-4da2-9f0a-ffd5a6f4c1d9	sankara.telukutla	update_parcel_geo	35a76448-519d-46c4-ac65-ee1ba504a45e	location set	2026-07-15T08:33:43.958719
8af57cda-c1aa-4ab3-84ec-46b903eff966	sankara.telukutla	upload_document	df179188-6038-48c1-aba9-366a2a55c025	Type photo	2026-07-15T08:34:09.501877
fe1dc174-edcb-41c4-acb7-fcf1a0f582b1	sankara.telukutla	upload_document	cd4c6bae-3fda-4ed7-a4d9-4c2aff45642f	Type other	2026-07-15T08:35:04.720695
f84ba164-74ba-4ed7-96ba-845675daca07	sankara.telukutla	add_note	22477b80-f182-4a6d-a597-be7dccc8be6e	parcel:86c78df1-1100-4dfd-9274-0b1236dd4ccf	2026-07-15T08:45:56.305380
20ecfa79-8adf-45aa-970e-4fbedfb96933	sankara.telukutla	update_parcel_geo	86c78df1-1100-4dfd-9274-0b1236dd4ccf	location set	2026-07-16T02:24:48.689489
7181ca33-ce96-474d-bb51-07e1365252ae	sankara.telukutla	add_note	40fa5436-1e9d-4dbe-b5db-840720e29f66	parcel:86c78df1-1100-4dfd-9274-0b1236dd4ccf	2026-07-16T02:29:59.800175
e3ed3c0e-fb07-4f96-a9a6-206825f001db	e2e-family-test	add_family_member	aa4b39ee-a9ed-410e-a117-09f4f44058f6	son: Test Son	2026-07-16T06:22:47.232343
034158a6-779d-4ff7-8b97-0cf17642e008	sankara.telukutla	update_parcel_geo	f6ebfc3d-8165-498c-9db0-39c8fc0dac8d	location set	2026-07-16T06:24:57.878177
d2b92435-82e5-4406-b77b-bf4278c3dbb1	sankara.telukutla	add_family_member	05761134-25a8-4a78-a71a-c5248841190d	spouse: Swetha Telukutla	2026-07-16T06:58:11.163011
429350cd-f21c-4518-abc7-db1913e968bf	sankara.telukutla	add_family_member	79414665-3e77-4aa3-9e85-10bbfedf382a	son: Praneel Reddy	2026-07-16T06:59:18.365230
1d5f1d81-031c-4f39-b6cd-de22adff96a5	sankara.telukutla	add_family_member	31fc04a4-76fb-4422-bee8-b663a8ed1945	daughter: Sloka Reddy	2026-07-16T07:00:02.792732
9f14a0bc-707f-4d0e-983f-7c528122ff8f	e2e-fam2	add_family_member	fece3c1e-01d8-4fa0-9748-00857f410f83	spouse: Swetha	2026-07-16T07:03:50.144503
6309e011-5348-45e0-83dc-f095a430b798	u01	update_parcel	pc01	dossier updated	2026-07-16T07:04:15.338148
4705ee68-d614-4bec-9573-ec56a069f062	sankara.telukutla	delete_passbook	bff51db1-c601-4531-8f35-1b7ee4f44087		2026-07-16T15:44:14.173917
48ca67d8-db0a-442d-89b3-d017463aa455	sankara.telukutla	delete_passbook	0b4c44de-fc13-454a-a84a-0d44ae816fe9		2026-07-16T15:44:14.173652
d60fb4ac-dcd8-43e7-9329-7cbcfd06bb9d	sankara.telukutla	delete_passbook	c16a3600-d186-4b5a-96c1-18fcbc527269		2026-07-16T15:44:14.173832
1cb454e9-c479-46ec-8b05-7e39ae331710	sankara.telukutla	delete_passbook	3431e440-04db-4c4b-9e68-564d2fa65dec		2026-07-16T15:44:14.173651
4dfcfee5-6e91-4b1d-80e1-608c6d1847bc	sankara.telukutla	delete_passbook	bb434ce9-3dca-4d63-b147-f14fd9f99527		2026-07-16T15:44:14.174450
ccbb0d78-c9da-412e-905a-0a7c6845a9cd	sankara.telukutla	delete_passbook	21025732-9cc2-40ac-8556-9d7e87976155		2026-07-16T15:44:14.174369
80087f18-bf26-4f7a-8281-f37fb067e6db	sankara.telukutla	create_passbook	dabd5097-d19a-47ba-a9ac-96e9af352a50	Pattadar 573	2026-07-16T15:45:07.217634
f5bf0cef-fd6e-4106-97ad-e7faf23da4f8	sankara.telukutla	create_parcel	e76c09a8-51bc-45b9-ac72-896028a836a4	Survey 119	2026-07-16T15:45:07.249499
7f32a29e-fe50-428e-ba61-10a17da8cd63	sankara.telukutla	create_parcel	670c35f4-7001-454a-a72a-ddd19525b039	Survey 128	2026-07-16T15:45:07.272906
ccf5fe46-209e-42a1-b5bf-216204755489	sankara.telukutla	create_parcel	74c45552-10a4-4c68-8873-f871b1455e0c	Survey 128	2026-07-16T15:45:07.296442
7ce7400a-845e-428e-b664-724663e42ec6	sankara.telukutla	create_parcel	99ea04da-6c2e-450b-b0cc-8af68e45754e	Survey 70	2026-07-16T15:45:07.316746
cc3ab121-3b8e-4cad-8133-91fa60a10fb6	sankara.telukutla	create_parcel	bc8c8c09-c130-4615-8547-bb9268c578ec	Survey 71	2026-07-16T15:45:07.338619
8abd2dbb-c1ca-4313-9ee8-5fa747cd5715	sankara.telukutla	create_parcel	b5408e5b-21cf-483c-89aa-11e07365044d	Survey 128	2026-07-16T15:45:07.357991
8299ee5c-5171-4b5c-bb76-d1de1d114c21	sankara.telukutla	create_parcel	b46637b3-7d39-476a-a1fa-c459a407e4d8	Survey 126	2026-07-16T15:45:07.380164
62f682f2-c2c0-46da-ad8d-caa8feaaaedd	sankara.telukutla	create_parcel	1f68a921-fd40-4205-83b3-45cee890de4e	Survey 124	2026-07-16T15:45:07.397238
0b5e2528-e472-4cd5-a6cc-ef3d35ce62b7	sankara.telukutla	create_parcel	d5cc0b79-9612-4312-a68a-9c82a23bf953	Survey 125	2026-07-16T15:45:07.416496
f7f35b0a-186e-4a7c-8321-cf714649d529	sankara.telukutla	create_parcel	fec2d9cc-f174-4df0-a192-e012f82d0250	Survey 125	2026-07-16T15:45:07.431089
051d5290-79fa-4dbe-82b5-b91609b30e07	sankara.telukutla	create_parcel	00d9cf4d-5376-4298-ab25-5ca9ec4043d9	Survey 124	2026-07-16T15:45:07.449848
5daf8ce8-cc1c-44ff-b8f2-5c8ab2c43637	sankara.telukutla	create_parcel	e52d6975-f49c-41f7-841e-c73e00f70cdd	Survey 126	2026-07-16T15:45:07.472506
69dfe369-8613-4466-bff1-6c0dea65692e	sankara.telukutla	create_registered_document	1f79045f-51ed-4db2-acab-27d6ec4d4f2a	9221	2026-07-16T15:50:15.176141
b2ad63e3-c78b-410b-91d7-40f9998de0b4	sankara.telukutla	create_passbook	3cb41489-e2af-44b0-9855-7aaff547c734	Pattadar 5001	2026-07-16T18:47:22.304333
94a64491-4815-47f7-87f0-b3b76019a2b1	sankara.telukutla	create_parcel	4c6c9aee-2504-461d-9fa0-351227ec0e04	Survey 1	2026-07-16T18:47:22.332523
f537859e-408b-4d6a-962c-d6c23331bdce	sankara.telukutla	create_parcel	f80d25a9-49bf-47b8-8262-4f57f44897fb	Survey 1	2026-07-16T18:47:22.354589
9fc646a9-fafe-4bdc-ada4-58a0ef9ecddd	sankara.telukutla	delete_passbook	dabd5097-d19a-47ba-a9ac-96e9af352a50		2026-07-16T18:47:31.807662
65ab47b5-b52a-4da4-b25f-721311f9bd85	sankara.telukutla	delete_passbook	3cb41489-e2af-44b0-9855-7aaff547c734		2026-07-19T15:13:12.400369
52818def-5fef-49f0-8f03-b288831c00a3	sankara.telukutla	create_passbook	4e78ed3d-b270-42da-8cb9-4315b2033ddb	Pattadar 1422	2026-07-19T15:14:17.683149
cdd28ef2-2542-4b8f-a2cd-f975a39ec8f0	sankara.telukutla	create_parcel	c83ce98d-7542-4b8c-9e4f-2d32e42a5920	Survey 183	2026-07-19T15:14:17.703283
3abeb9cd-c6a8-4d24-9fd3-4d159a67899d	sankara.telukutla	create_parcel	808ae52c-f738-402a-a8b7-7ccef317bfaa	Survey 183	2026-07-19T15:14:17.719092
34e3ae2a-85a6-4971-8c5a-2c5651dd0ed4	sankara.telukutla	create_parcel	cac3f797-0c69-415a-b5b0-c2fd0bebf318	Survey 183	2026-07-19T15:14:17.736065
f8ed429e-9e46-4d82-9d60-d04cb4776142	sankara.telukutla	create_parcel	8db7eb07-eb41-4e59-98a6-16d0240cf0f7	Survey 120	2026-07-19T15:14:17.752793
2be850f3-0725-4e6a-b4dc-fea938794ba2	sankara.telukutla	create_parcel	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	Survey 741	2026-07-19T15:14:17.771125
191a1872-0149-47c7-a3d5-898f2c75892f	sankara.telukutla	create_parcel	3a1bc549-a231-44c4-ab49-a08ea62ae9b1	Survey 740	2026-07-19T15:14:17.785074
76208baf-b40d-4500-b79f-ce667a2e0dca	sankara.telukutla	create_parcel	95172fc1-ca3f-47d9-a45d-da7e3887bc7b	Survey 398	2026-07-19T15:14:17.798112
4f86ab14-2ff6-489c-8009-2e079c9c1c00	sankara.telukutla	create_passbook	6ffbb764-d1dc-4635-a62e-66701b94cab2	Pattadar 573	2026-07-19T16:41:30.339990
61c36ba4-cbaf-424d-a891-fb0882a44938	sankara.telukutla	create_parcel	f920e31c-3eaf-42e3-8946-d14b3c53b431	Survey 119	2026-07-19T16:41:30.368509
b84fdcfe-9c44-4d6c-ae9e-0fc13e966a2a	sankara.telukutla	create_parcel	41edc1c6-3e1c-4191-935d-3cb0acdf8f14	Survey 128	2026-07-19T16:41:30.384930
e7f81b3e-6299-4974-ac30-24ddac22c9db	sankara.telukutla	create_parcel	1e997a65-1f0c-4b41-83f8-fc61dde4f099	Survey 128	2026-07-19T16:41:30.399292
0bd99c1f-b964-42a8-8e55-05a9618ba7c3	sankara.telukutla	create_parcel	4e3e4152-c6d1-4aba-8ee3-ce0dd54fac01	Survey 70	2026-07-19T16:41:30.413152
824429a0-ffc1-4dbb-9162-5b9a075effde	sankara.telukutla	create_parcel	f41d7235-cc1f-4adb-8345-11d20e2a4432	Survey 71	2026-07-19T16:41:30.427571
c8b18660-9fef-4c74-8ec8-da87c789cdc7	sankara.telukutla	create_parcel	71ba8638-c36c-4c40-90d0-1ba083bbc490	Survey 128	2026-07-19T16:41:30.442210
3fe3fd45-ad15-44fd-b8a3-3e0e1f5f080f	sankara.telukutla	create_parcel	43269bdb-44e8-47a9-bfb8-5a8594393101	Survey 126	2026-07-19T16:41:30.456837
796683d7-305a-403b-ac20-038e31be9fc1	sankara.telukutla	create_parcel	1174bfbd-4255-4889-9d86-dc12bb81eda1	Survey 124	2026-07-19T16:41:30.470717
32a4c54f-c69f-42a1-ba2b-5de2af80b6a5	sankara.telukutla	create_parcel	4c0a1315-7d93-44d9-847e-e9a86f84223f	Survey 125	2026-07-19T16:41:30.489051
2a1380f8-e9c5-4a8e-a261-560bc9f31a7b	sankara.telukutla	create_parcel	b709273a-f007-4305-9d0c-ea99f37794e1	Survey 125	2026-07-19T16:41:30.502927
23a75bd9-eebc-4096-ba57-c9c6b522e672	sankara.telukutla	create_parcel	7d032ac3-9786-4c5d-bc8a-617d4040d17e	Survey 124	2026-07-19T16:41:30.522669
74d6db6a-63e9-4c41-895a-e3948425c716	sankara.telukutla	create_parcel	f4c469ae-6945-44f2-bb3b-e2b354fbee6b	Survey 126	2026-07-19T16:41:30.534225
270e744f-8073-4b3b-ab7d-94d32fcebb68	sankara.telukutla	create_passbook	6d1dce38-ea47-48e8-8d65-89acf3826edc	Pattadar 593	2026-07-19T16:42:03.822390
9f534837-7a26-4cb1-a882-8ecb5adf6ba2	sankara.telukutla	create_parcel	ee11eff1-db9d-4812-875d-e4393adc8b9e	Survey 119	2026-07-19T16:42:03.842862
8dcb54a1-f91b-4903-8351-dc6360228cb2	sankara.telukutla	create_parcel	dd881cac-dff7-4295-9ca8-cc96305bf9ef	Survey 123	2026-07-19T16:42:03.861372
5ccf6381-b459-46a0-b146-6e173b61fe5d	sankara.telukutla	create_parcel	03ac5459-e1c0-4d7c-b36f-016ea4417bac	Survey 125	2026-07-19T16:42:03.879836
f5c0f9ce-dc8c-4133-b3ee-44a76c34c01c	sankara.telukutla	create_parcel	5c5f347d-248e-49ee-ad7b-c41b8c8a38ed	Survey 127	2026-07-19T16:42:03.894542
b3ea8285-4415-4e4d-b9cb-f6b0281c4dce	sankara.telukutla	create_parcel	a2c9cecd-f941-44ea-97c8-6173c53ead1a	Survey 442	2026-07-19T16:42:03.907418
fe5f243c-bc44-4f60-8c43-ece757751767	sankara.telukutla	create_parcel	afe8e3ed-e0e6-48bc-9002-e38b2b6cb1d8	Survey 455	2026-07-19T16:42:03.935880
518a8e27-dd16-442a-91d9-2aa96da19b4f	sankara.telukutla	create_parcel	01994a38-7fe2-403e-9efe-b607d6c7554b	Survey 455	2026-07-19T16:42:03.953438
fb7ea248-97e6-4fa1-982f-859103ae93d0	sankara.telukutla	create_parcel	baafc09e-f36e-4f02-96ea-23d8aa9551a9	Survey 458	2026-07-19T16:42:03.969528
8611e55d-9217-4c29-bf94-6d4980f4dd5d	sankara.telukutla	create_parcel	734cdde3-bb3c-4866-9117-5d4891e5baf4	Survey 81	2026-07-19T16:42:03.984964
e5b57308-030c-4977-af6b-ad0b61ff66a4	sankara.telukutla	create_parcel	4aa8ab18-9aa6-4eb9-8042-c2e4a8f7cd1e	Survey 456	2026-07-19T16:42:04.011646
5cb028ac-17ea-4b6c-8496-24dc61b9d8b8	sankara.telukutla	create_passbook	8f2efb1d-2c48-4828-9964-881350f9ab7d	Pattadar 567	2026-07-19T16:42:36.337537
be04106a-e79f-4d8b-ad09-07ef496c39a4	sankara.telukutla	create_parcel	fe5ea55f-bc7a-4f66-a3a0-b6622dd6c2d1	Survey 1	2026-07-19T16:42:36.361820
cf9afa0c-574a-411b-bdbc-00022c47fbd6	sankara.telukutla	create_passbook	d5282dbb-08ae-448e-8d42-cc89d17e61a4	Pattadar 5001	2026-07-19T16:42:54.932240
fbca12bf-b8f0-4842-b153-69be53f8a68d	sankara.telukutla	create_parcel	34b16a54-4f60-4f2c-b64d-95b05499905e	Survey 1	2026-07-19T16:42:54.953881
3d4908db-2ecb-4889-851b-bed051fb6068	sankara.telukutla	create_parcel	5f82bb90-94e4-4a10-a4d3-19084f50015b	Survey 1	2026-07-19T16:42:54.970396
61ceabda-ab7b-4350-8e1e-6150f4663a09	sankara.telukutla	create_passbook	c257edb4-650f-4fe6-a187-65f9bf09056e	Pattadar 60602	2026-07-19T17:04:23.716447
44b81d26-bf08-4a52-b61d-a6d16a8c3947	sankara.telukutla	create_parcel	fc28d570-727d-448a-bf20-418ed6dafd26	Survey 37	2026-07-19T17:04:23.761550
2364658c-c071-4b87-a3ff-617cca24ad73	sankara.telukutla	upload_document	67b4b123-7d2d-41b8-b8aa-4b3e463e2e3d	Type sale_deed	2026-07-22T13:39:10.086702
ad628471-71a5-445c-9ff7-30c5854bfe8d	benef-test-user	add_beneficiary	44138a74-de13-4cbf-aff3-054b434cc9c2	Ramesh Reddy (coowner) — invite sent, pending verification	2026-07-22T13:48:35.850417
0eb004d2-0181-4706-9061-72713864c9a8	benef-test-user	verify_beneficiary	44138a74-de13-4cbf-aff3-054b434cc9c2	Ramesh Reddy verified	2026-07-22T13:48:35.867632
d6c01201-5725-4155-81fc-583d7b56b259	sg-user	add_beneficiary	56358c8c-f5dc-480d-a9e0-2c5d753dd006	Heir One (legalheir) — invite sent, pending verification	2026-07-22T14:05:44.727860
74c847b5-0812-4ac4-9335-476dd362c58a	sg-user	add_beneficiary	ad09b693-24ad-4f84-9513-dc3f992fc9d2	Ok Share (coowner) — invite sent, pending verification	2026-07-22T14:05:44.755823
123fc558-7ddf-464e-92cd-27fc9690c099	pe-test	add_beneficiary	c0906044-2a79-4190-8a32-6224e3891bd3	Ravi (coowner) — invite sent, pending verification	2026-07-22T15:04:34.867077
82670c51-0676-47ef-bb7c-b1bb0eb1a7a0	pe-test	add_beneficiary	399b77b6-df6f-4661-bcf1-9d6b87d4d1a5	Sita (coowner) — invite sent, pending verification	2026-07-22T15:04:34.886570
27f73263-28d4-444b-bc60-faa0c8c6a65c	sankara.telukutla	update_parcel_geo	fe5ea55f-bc7a-4f66-a3a0-b6622dd6c2d1	location set	2026-07-22T18:58:35.095706
23feb93a-dde0-40e9-82f4-bcde3bd2d01d	t5user	create_group	d419cf0f-7a84-4ac7-bf70-85ac2e90ee4a	partnership: Reddy & Sons	2026-07-23T08:13:16.775216
f8d44d55-1a21-4260-b003-6983400c4464	t5user	create_group	08b37b58-b29d-4380-96ed-01317d3830be	partnership: Reddy & Sons	2026-07-23T08:18:44.976436
3846b591-76b8-46e8-8b1e-23fbee44d4cc	t5user	add_member	b00d7ee7-d28d-44c7-8ab4-1f78aacc4669	Partner: Ravi	2026-07-23T08:18:45.035951
a2148dd8-de4e-4ddf-8980-16d4d4c75aa9	t5fix	create_group	1a7b78bb-fed3-4d06-9f9a-09a7e6f2b9ae	family: Fix Test Group	2026-07-23T08:29:54.959678
4d0bdbff-ba77-4234-b3fc-7319cc1b35b8	t5fix	create_passbook	26ee5b67-b4e0-45e8-b938-2b6a3556c829	Pattadar PB-FIX-2	2026-07-23T08:30:12.235217
db970d8b-6486-4e92-9f5f-8a52c447ca32	t5fix	create_passbook	b791b1b8-3313-4509-93f5-3518304d7831	Pattadar PB-FIX-3	2026-07-23T08:30:15.658458
bb2b1ba7-74ed-45df-a07b-9001810cb3d5	sankara.telukutla	assign_land_to_group	c257edb4-650f-4fe6-a187-65f9bf09056e	Made personal	2026-07-23T09:59:52.816949
61094aff-593d-4584-8295-dc51201d5da0	sankara.telukutla	assign_land_to_group	8f2efb1d-2c48-4828-9964-881350f9ab7d	Made personal	2026-07-23T09:59:54.674526
52119fd9-f29f-4be9-8eb6-ec2cdb2fb09c	sankara.telukutla	assign_land_to_group	6d1dce38-ea47-48e8-8d65-89acf3826edc	Made personal	2026-07-23T09:59:57.674033
3001344e-74e5-489f-9eb9-a0c4504706fa	sankara.telukutla	assign_land_to_group	6ffbb764-d1dc-4635-a62e-66701b94cab2	Made personal	2026-07-23T09:59:58.237846
4cc379bf-9686-46c0-8653-1870bb6ec94c	sankara.telukutla	assign_land_to_group	d5282dbb-08ae-448e-8d42-cc89d17e61a4	Made personal	2026-07-23T09:59:59.247204
4708ac18-9788-4217-b10a-748cdb0170b0	sankara.telukutla	assign_land_to_group	4e78ed3d-b270-42da-8cb9-4315b2033ddb	Made personal	2026-07-23T09:59:59.889794
eec9faea-3e90-4a33-992e-5d5a36f9aa16	sankara.telukutla	assign_land_to_group	c257edb4-650f-4fe6-a187-65f9bf09056e	Assigned to a group	2026-07-23T10:00:05.693346
1f8db81d-a973-4eb9-8957-751eab9bd4a6	sankara.telukutla	assign_land_to_group	8f2efb1d-2c48-4828-9964-881350f9ab7d	Assigned to a group	2026-07-23T10:00:07.637014
cf9721eb-7cc1-48b8-b2c4-bf8d5597a90e	sankara.telukutla	assign_land_to_group	d5282dbb-08ae-448e-8d42-cc89d17e61a4	Assigned to a group	2026-07-23T10:00:08.961671
966e0bbc-0901-4aaf-892d-adc39b804f6e	sankara.telukutla	assign_land_to_group	6d1dce38-ea47-48e8-8d65-89acf3826edc	Assigned to a group	2026-07-23T10:00:10.126678
e5de1145-468d-4ee3-832a-3f44fbd9fb35	sankara.telukutla	assign_land_to_group	6ffbb764-d1dc-4635-a62e-66701b94cab2	Assigned to a group	2026-07-23T10:00:11.599223
e43ed3ae-3b64-4c82-b695-bd47c5df7242	sankara.telukutla	assign_land_to_group	4e78ed3d-b270-42da-8cb9-4315b2033ddb	Assigned to a group	2026-07-23T10:00:12.699339
dfb89b96-e227-4983-b5b9-902b3d17f188	sankara.telukutla	create_group	8bd71ece-f339-42eb-8063-a56809c64bc0	partnership: Reddy Brothers	2026-07-23T10:00:59.043867
e88eedc2-7110-44a4-bb11-c2179dbe13b3	notif_smoke	invite_member	smoke_notif_1	Invited +91 99999 00000 via whatsapp	2026-07-23T13:45:57.280312
ffca9893-59e3-48d3-8100-49d766ccc2f6	sankara.telukutla	set_notifiers	75fc1d4d-1c31-40e2-9b0a-e42378b312b6	3 notifier(s)	2026-07-23T16:34:58.859621
73841e7c-e669-4939-b50c-c98ac94c7549	sankara.telukutla	create_property	f177d39f-792d-4052-a91c-6e96e387a6d3	open_plot: Ankireddipalem Plot No.60, 210 Sq.yd	2026-07-23T20:55:16.397354
0303cedd-4649-47ff-aafb-ae1f3615dd13	sankara.telukutla	create_property	1aa5d9cb-1e37-4b48-9fa4-4477573066a2	open_plot: Nallapadu 200-sqyd plot GPA-cum-Sale	2026-07-23T20:57:37.736415
6ff89e1e-d6b8-483e-9123-d4590c862d04	sankara.telukutla	create_property	52c8e81d-2640-4f36-a681-b149a38f4a0c	open_plot: Nallapadu 418.5-sqyd plot	2026-07-23T21:04:08.306935
c99f9cc9-30d4-489e-a250-bed9ad782134	sankara.telukutla	create_property	45b13f42-bab1-4778-be69-c15ac0956634	open_plot: Ankireddypalem 191 Sq.yd plot	2026-07-23T21:07:37.827224
1638011d-3c47-4e43-aa1b-68f680cb52fe	sankara.telukutla	create_property	0b66f5e9-deb3-431d-b146-31fe65112287	open_plot: __DEBUG_TEST_PROPERTY__	2026-07-23T23:13:42.525879
33099a91-5946-4bc0-a9e9-a9e1571f753e	sankara.telukutla	upload_document	12104a6a-3c59-467e-b8a1-326a9659db0d	Uploaded a document	2026-07-23T23:13:42.530643
1d8bcee8-1629-4b20-8118-409c64224c3f	sankara.telukutla	create_property	653777f4-5958-4eee-878c-6b648e9ab7a5	open_plot: Ankireddipalem 191 Sq.yd Plot No.92	2026-07-24T06:47:47.331202
79ceaf89-0a7a-4658-a6ec-c8d78e6b73c3	sankara.telukutla	upload_document	40530160-d975-4350-bfb2-6da7d7ce5077	Uploaded a document	2026-07-24T06:47:47.358348
e313779e-4641-46c9-9aec-2068c35d067c	sankara.telukutla	delete_property	45b13f42-bab1-4778-be69-c15ac0956634	Deleted property	2026-07-24T06:48:37.015855
08b885d6-d5a8-4eda-9ff7-c5897ba52255	sankara.telukutla	delete_property	653777f4-5958-4eee-878c-6b648e9ab7a5	Deleted property	2026-07-24T06:48:37.016061
2d52f89e-aae9-4924-9aa7-9c26e7d85258	sankara.telukutla	delete_property	f177d39f-792d-4052-a91c-6e96e387a6d3	Deleted property	2026-07-24T06:48:37.017364
218fffb9-cccb-4f98-af91-ffccd3447502	sankara.telukutla	delete_property	52c8e81d-2640-4f36-a681-b149a38f4a0c	Deleted property	2026-07-24T06:48:37.023543
7ebd112f-ffdd-4d20-923f-96f2a7b75882	sankara.telukutla	delete_property	1aa5d9cb-1e37-4b48-9fa4-4477573066a2	Deleted property	2026-07-24T06:48:37.091765
7d739365-848d-4b5d-ab0e-574550a5ccad	sankara.telukutla	create_property	d02320f6-c2e6-4921-8178-1a7a64698497	open_plot: Nallapadu 200 Sq.yd Plot No.150 - GPA cum Sale	2026-07-24T06:58:20.063323
dbd4bd4d-c25e-444b-a5f1-f19d27f9425d	sankara.telukutla	upload_document	2cda32f0-d8a8-4b95-b845-5629455af6ff	Uploaded a document	2026-07-24T06:58:20.082279
dfe3f8cc-27ac-4c61-95d4-b43327ee31a5	sankara.telukutla	create_property	59cd5b67-4fe2-4062-bde0-055cf3849686	open_plot: Ankireddipalem 210 Sq.yd Plot No.60	2026-07-24T07:00:59.834117
d3a3f101-ec39-44e6-a23d-b9e56f929bc1	sankara.telukutla	upload_document	a517e78e-ebad-4634-b5a4-15864ff0ac53	Uploaded a document	2026-07-24T07:00:59.884192
1bb9b41a-2b7f-436f-9e32-5af50c065c93	sankara.telukutla	delete_property	d02320f6-c2e6-4921-8178-1a7a64698497	Deleted property	2026-07-24T07:24:54.616665
8386cb9c-dd1a-42ce-bb57-3465782b0009	sankara.telukutla	delete_property	59cd5b67-4fe2-4062-bde0-055cf3849686	Deleted property	2026-07-24T07:24:54.634336
a3dba9ab-3afb-48c7-ac92-1665ca0356db	sankara.telukutla	create_property	f0b523a0-9654-4cd6-ab12-8ea598c551f6	open_plot: Nallapadu 418.5 sq.yd plot, Guntur	2026-07-24T07:41:18.977925
b61b79d2-f229-414f-9815-f67e6e0f177d	sankara.telukutla	upload_document	755bdda2-8bb0-498c-b82e-c550ccc17770	Uploaded a document	2026-07-24T07:41:19.007320
d70558f3-8daf-4e47-844c-79ca68e7bec1	sankara.telukutla	create_property	3b3e3bc7-967d-4a89-8c4a-fcd17159a89f	open_plot: Nallapadu 200 sq.yd plot (GPA-cum-Sale)	2026-07-24T07:41:19.035918
254dfaf9-12f8-4b68-950b-b042fb790afc	sankara.telukutla	upload_document	de0b2c45-5e4c-4a46-a168-ee4ea85cfe30	Uploaded a document	2026-07-24T07:41:19.057557
6539f226-f016-466d-b2d9-0e353829d081	sankara.telukutla	create_property	69a211c1-e81c-4b89-9243-124931348193	open_plot: Ankireddipalem 210-sqyd plot	2026-07-24T07:41:19.085011
1434403a-bf0e-4181-a621-85078fc4ffea	sankara.telukutla	upload_document	24046c06-ac31-45f6-a6d9-bbc1356bb771	Uploaded a document	2026-07-24T07:41:19.105713
cdfe3bea-18b3-4d56-a6da-327cfc7dc057	sankara.telukutla	delete_property	3b3e3bc7-967d-4a89-8c4a-fcd17159a89f	Deleted property	2026-07-24T07:54:29.413714
f1e4c15c-cddc-4c25-9eeb-ad3187889180	sankara.telukutla	delete_property	f0b523a0-9654-4cd6-ab12-8ea598c551f6	Deleted property	2026-07-24T07:54:29.414972
69eb0bd2-0d5a-4c0c-9deb-727dd1371383	sankara.telukutla	delete_property	69a211c1-e81c-4b89-9243-124931348193	Deleted property	2026-07-24T07:54:29.416192
445a9386-4ef3-4b77-bc44-ee58932a3ea8	sankara.telukutla	create_property	7d0a9d6a-6bb5-4dd7-98a5-cd1c1b2d6b56	open_plot: Ankireddipalem Plot No.92 - 191 Sq.yd	2026-07-24T07:58:53.187735
4d1acbd5-5c79-4cdc-809f-b435a5dfd7c1	sankara.telukutla	upload_document	eaaff000-53b2-49ec-a39f-f40192454667	Uploaded a document	2026-07-24T07:58:53.212843
b4712cef-2120-4d23-8e4e-2030e84dec50	sankara.telukutla	create_property	78af226e-92e4-4351-a677-5a0c09ad078f	open_plot: Nallapadu 418.5-sqyd plot	2026-07-24T07:58:53.227900
64e9b301-5fa3-465e-98fb-1f3132bd9a0a	sankara.telukutla	upload_document	0c0b31a7-c0f0-49cc-affc-fcd83e9bbb08	Uploaded a document	2026-07-24T07:58:53.240653
4e131d50-cd64-4a9a-8405-05cce851dd00	sankara.telukutla	create_property	abf0dd0c-e1a1-4b56-a636-f47983edd575	open_plot: Nallapadu 200-sqyd plot No.150 (GPA cum Sale)	2026-07-24T07:58:53.254951
baae060b-bbe1-4d8a-a713-9a35941dda29	sankara.telukutla	upload_document	bd79e8ea-1a69-43a9-b942-37fa11bb1ba4	Uploaded a document	2026-07-24T07:58:53.272297
458cad5b-9033-4039-bb20-e820b0f39e60	sankara.telukutla	create_property	7063df06-e82b-4254-a4d5-2f189222e133	open_plot: Ankireddipalem 210-sqyd plot	2026-07-24T07:58:53.289915
47a04c00-db68-49b4-a6a0-e9f1ebde27fd	sankara.telukutla	upload_document	a5e213b3-1555-4b9a-9eeb-101afb1c071e	Uploaded a document	2026-07-24T07:58:53.312827
140970c4-b078-43f4-bb0e-9dc15019b024	sankara.telukutla	delete_property	abf0dd0c-e1a1-4b56-a636-f47983edd575	Deleted property	2026-07-24T08:29:24.053205
1df846fd-4199-42f3-a6d2-4a7cc5a9a32d	sankara.telukutla	delete_property	7063df06-e82b-4254-a4d5-2f189222e133	Deleted property	2026-07-24T08:29:24.052873
26987e1d-5521-41b9-bf16-7b447c9605c4	sankara.telukutla	delete_property	78af226e-92e4-4351-a677-5a0c09ad078f	Deleted property	2026-07-24T08:29:24.056793
025c58d3-bc76-4fa0-9c5a-dac5fa9da609	sankara.telukutla	delete_property	7d0a9d6a-6bb5-4dd7-98a5-cd1c1b2d6b56	Deleted property	2026-07-24T08:29:24.060241
3d124186-e09b-470f-97fe-858fdeccbd25	sankara.telukutla	create_property	2e72b03c-54b1-4cfb-92e2-53197eb3ef29	open_plot: Nallapadu 200-sqyd house site, Plot No.150	2026-07-24T08:40:29.236602
9cc95fc1-9874-498d-bd54-47d6d9ecf7fe	sankara.telukutla	upload_document	72dc6750-5791-4e4b-9524-324fdea3f9e3	Uploaded a document	2026-07-24T08:40:29.256863
b0756fa2-8ebd-4e6d-907d-2f4a0ab5fe6d	sankara.telukutla	create_property	5db0b703-d539-4723-a94e-a12785a31ca1	open_plot: Ankireddipalem 210-sqyd house site	2026-07-24T08:40:29.295389
ab4c4fcb-285b-4a67-8512-e0cb5a1bb3c6	sankara.telukutla	upload_document	253c0d76-553a-481d-8ec8-4f1d763a740b	Uploaded a document	2026-07-24T08:40:29.312197
b0973715-ce12-4104-94a3-e3eaf2306b5a	sankara.telukutla	delete_property	2e72b03c-54b1-4cfb-92e2-53197eb3ef29	Deleted property	2026-07-24T08:43:34.402286
9f80b19e-5780-41c9-b5eb-cf1e8803eeb7	sankara.telukutla	delete_property	5db0b703-d539-4723-a94e-a12785a31ca1	Deleted property	2026-07-24T08:43:34.402212
755da5c0-e8a5-467a-b416-562cec449a13	sankara.telukutla	create_property	5856a70c-c590-4652-9afe-0df27abe11f0	open_plot: Ankireddipalem 191 sq.yd Plot No.92	2026-07-24T08:46:15.315025
20f5140a-217b-475e-982f-6c1d20b9c8da	sankara.telukutla	upload_document	e5e7a7fa-5426-4033-9148-078cb5a4689e	Uploaded a document	2026-07-24T08:46:15.409543
ce5ba0b8-ec83-4f13-a9d9-da0c13ad5ad6	sankara.telukutla	create_property	55c53a41-178b-4953-96a6-416ae8b91f6a	open_plot: Nallapadu Plot No.150 - 200 Sq.yd	2026-07-24T08:46:15.429940
d07ebfea-2615-4cbd-ada0-75e531068b79	sankara.telukutla	upload_document	ac05ae4f-6816-4059-8eee-1bcbe5603625	Uploaded a document	2026-07-24T08:46:15.446522
e89a477b-c480-49fb-9deb-003f8611c88b	sankara.telukutla	create_property	0f6f01a9-e42d-4c69-aa4f-868a5030d28f	open_plot: Ankireddipalem 210-sqyd plot	2026-07-24T08:46:15.466983
5d9de7ba-793a-41fe-b3f3-159930ddf119	sankara.telukutla	upload_document	7e3efd9a-b97e-467d-8a4b-472fffa94f01	Uploaded a document	2026-07-24T08:46:15.484533
001f48c8-4f14-4046-bea5-2a05411cb93c	sankara.telukutla	delete_property	55c53a41-178b-4953-96a6-416ae8b91f6a	Deleted property	2026-07-24T08:48:32.425664
5918d562-c8d6-40bf-a0e3-89b9ef837bd7	sankara.telukutla	delete_property	5856a70c-c590-4652-9afe-0df27abe11f0	Deleted property	2026-07-24T08:48:32.531773
1f3e94ac-348b-4211-8cc2-49420bbf08b8	sankara.telukutla	delete_property	0f6f01a9-e42d-4c69-aa4f-868a5030d28f	Deleted property	2026-07-24T08:48:32.529774
d81b03a5-3a06-4af1-9e70-6eca749111db	sankara.telukutla	create_property	6d6d23df-27d9-49e2-87d2-1b0b67cfc3c7	open_plot: Nallapadu 200-sqyd plot GPA-cum-Sale	2026-07-24T09:06:12.428570
0ee39394-4094-4a7d-b9fd-e20abe179955	sankara.telukutla	upload_document	ee998828-19d1-44aa-9a44-586f31f6f186	Uploaded a document	2026-07-24T09:06:12.452693
4eabbee4-3fa5-4584-bd94-5acd5c1fa264	sankara.telukutla	create_property	7ec4b020-7040-40d9-945f-475e86a79058	open_plot: Ankireddypalem 210 Sq.yd plot	2026-07-24T09:06:12.471969
d56250fc-6427-4a03-bbf2-4bdb4b32495f	sankara.telukutla	upload_document	d49beabb-9029-49d7-92bc-cac0ded81240	Uploaded a document	2026-07-24T09:06:12.488505
7384f912-0026-4bd9-b220-2db73f10598a	sankara.telukutla	delete_property	7ec4b020-7040-40d9-945f-475e86a79058	Deleted property	2026-07-24T09:31:12.006854
1ef2131f-5f2d-41b9-9135-928851a0bfdc	sankara.telukutla	delete_property	6d6d23df-27d9-49e2-87d2-1b0b67cfc3c7	Deleted property	2026-07-24T09:31:12.010861
9a26c374-f599-4a54-9136-101971c831d6	sankara.telukutla	create_property	123c7f12-469d-4ed6-8e2e-b50e904c2966	open_plot: Ankireddipalem Plot No.92, 191 Sq.yd	2026-07-24T09:33:17.423010
9ff46fc0-9f35-44d3-8f5d-5f160a07a857	sankara.telukutla	upload_document	a94e6e52-7c48-436a-8730-5d6617f58210	Uploaded a document	2026-07-24T09:33:17.455937
619b7263-fb0d-4c4e-908e-f159facf0bf1	sankara.telukutla	create_property	e188de36-bcba-482d-86f9-4f66a1a39499	open_plot: Nallapadu 200-sqyd plot (Plot No.150) - GPA cum Agreement	2026-07-24T09:33:17.469333
50681d11-1af0-4b4c-845f-9fcbc5487d51	sankara.telukutla	upload_document	fec40aff-79bc-4fee-ac1d-4ed432191b48	Uploaded a document	2026-07-24T09:33:17.480983
004f36ff-121c-4154-890d-b95d9cad1f08	sankara.telukutla	create_property	ff7a1cf5-d50c-49ed-979e-b755c02e0da3	open_plot: Ankireddipalem 210-sqyd plot (No.60)	2026-07-24T09:33:17.494794
3e4b77ef-b7f1-4e5c-a746-404e739f398b	sankara.telukutla	upload_document	f0896220-07dd-4ff4-be9a-79d3e128cfeb	Uploaded a document	2026-07-24T09:33:17.512452
9a0b8645-31a8-4600-a0e0-8bb431a4a955	sankara.telukutla	delete_property	ff7a1cf5-d50c-49ed-979e-b755c02e0da3	Deleted property	2026-07-24T09:46:50.306890
99e096a1-a97a-49a9-af2b-a892a2016fb2	sankara.telukutla	delete_property	e188de36-bcba-482d-86f9-4f66a1a39499	Deleted property	2026-07-24T09:46:50.310944
7f0e420c-01c3-43f7-ac8c-c675c9c9a891	sankara.telukutla	delete_property	123c7f12-469d-4ed6-8e2e-b50e904c2966	Deleted property	2026-07-24T09:46:50.327485
dc98bdcf-ed93-42bf-9030-6ad73de631bb	sankara.telukutla	create_property	9a29ba98-87fc-4b31-a91e-9c8e833d1f7b	open_plot: Ankireddipalem Plot No.92 - 191 Sq.yd	2026-07-24T09:59:17.656370
d1d1493e-eb91-47ca-9911-9e646ef59b77	sankara.telukutla	upload_document	3a7ff48f-a5a8-4692-9806-3abb36f1b9da	Uploaded a document	2026-07-24T09:59:17.703967
8b286ff9-9852-4577-bbf8-f4b4508277bd	sankara.telukutla	create_property	b451ac30-d122-4e24-a1fb-fd4eb27282aa	open_plot: Nallapadu 200-sqyd plot (Plot No.150)	2026-07-24T09:59:17.720545
9b98ffd3-7672-4b7d-bb25-52d9563c140e	sankara.telukutla	upload_document	a3a98919-dbd5-44ee-98b9-9ad4b109faf0	Uploaded a document	2026-07-24T09:59:17.734335
ba3fc79b-eef3-48cd-9840-ace811ddce1f	sankara.telukutla	create_property	c19df8dd-8e3d-475d-96d4-6fc90f3f1bb0	open_plot: Ankireddipalem 210-sqyd plot, Plot No.60	2026-07-24T09:59:17.748920
424a50de-98b5-4489-9a29-9c434fc563b0	sankara.telukutla	upload_document	7d6b92f5-0a41-4307-859f-a611b7a06396	Uploaded a document	2026-07-24T09:59:17.765966
0d76a630-67e6-4005-a30e-379733124e05	sankara.telukutla	update_parcel	34b16a54-4f60-4f2c-b64d-95b05499905e	dossier updated	2026-07-24T10:11:24.093146
82921b7d-8611-4ead-8a9e-4435f7fb0af7	sankara.telukutla	update_parcel	fc28d570-727d-448a-bf20-418ed6dafd26	dossier updated	2026-07-24T10:11:51.009536
e16e5ab6-2501-4dd1-8b2b-b8b44e2fccb6	sankara.telukutla	delete_passbook	6ffbb764-d1dc-4635-a62e-66701b94cab2		2026-07-24T10:15:53.612852
4d384fc5-0c30-4a7e-b0f9-5a7310fdcff1	sankara.telukutla	delete_passbook	6d1dce38-ea47-48e8-8d65-89acf3826edc		2026-07-24T10:16:00.522930
63a868f7-17f9-4074-a3af-860fde5e4656	sankara.telukutla	upload_document	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	Uploaded a document	2026-07-24T14:48:19.923461
2c727162-f774-4c95-bb90-010653cc9a8a	sankara.telukutla	reclassify_document	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	→ photo	2026-07-24T14:48:25.392422
59af9183-3c44-4e25-95c1-d9ce0555ee9d	sankara.telukutla	upload_document	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	Uploaded a document	2026-07-24T14:55:30.552520
0883b501-688b-4e00-86d7-beb18f22efb5	sankara.telukutla	upload_document	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	Uploaded a document	2026-07-24T14:55:35.145611
b9ea45d3-774c-4fc3-97d6-8c039ac7ff73	sankara.telukutla	upload_document	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	Uploaded a document	2026-07-24T15:00:26.801257
39d1bffd-8c16-46a9-85bc-99908c516a28	sankara.telukutla	reclassify_document	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	→ sale_deed	2026-07-24T15:00:50.581439
b13fe00e-9306-4d87-b9fc-8092e1f2b75a	sankara.telukutla	upload_document	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	Uploaded a document	2026-07-24T15:02:22.665644
48d6c71c-8513-464d-8685-a1d770700d20	sankara.telukutla	upload_document	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	Uploaded a document	2026-07-24T15:02:22.813628
b4f83121-bb7e-4ea5-a595-4391a0348919	sankara.telukutla	upload_document	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	Uploaded a document	2026-07-24T15:02:23.005668
c5e151b7-fc0e-4fc5-bb07-bf193f36e322	sankara.telukutla	reclassify_document	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	→ photo	2026-07-24T15:02:25.814377
dc64080d-2b9a-40b2-a950-632bf9d23c85	sankara.telukutla	reclassify_document	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	→ photo	2026-07-24T15:02:25.986393
139f9973-5184-4b9d-9388-9a7ba098b1f0	sankara.telukutla	delete_property	c19df8dd-8e3d-475d-96d4-6fc90f3f1bb0	Deleted property	2026-07-25T07:47:25.260943
4496ae36-daeb-48af-a895-81682f2a825a	sankara.telukutla	delete_property	9a29ba98-87fc-4b31-a91e-9c8e833d1f7b	Deleted property	2026-07-25T07:47:25.261892
6d19ff2a-78a2-4cb5-8f64-277194209268	sankara.telukutla	delete_property	b451ac30-d122-4e24-a1fb-fd4eb27282aa	Deleted property	2026-07-25T07:47:25.261757
9e0eed94-7641-4694-a66b-8593fdb82293	sankara.telukutla	delete_passbook	c257edb4-650f-4fe6-a187-65f9bf09056e		2026-07-25T07:47:31.272230
0b7242cb-5407-4334-808e-6a0204b89973	sankara.telukutla	delete_passbook	d5282dbb-08ae-448e-8d42-cc89d17e61a4		2026-07-25T07:47:31.272024
7cc33e5f-a759-4743-a10c-68acf3ff8831	sankara.telukutla	delete_passbook	4e78ed3d-b270-42da-8cb9-4315b2033ddb		2026-07-25T07:47:31.272507
29316a81-e876-48dd-a149-d5d983a8de25	sankara.telukutla	delete_passbook	8f2efb1d-2c48-4828-9964-881350f9ab7d		2026-07-25T07:47:31.273329
d04437ad-db39-4744-89fe-ef882d8502cd	sankara.telukutla	create_passbook	87349bb6-f75e-4155-abba-02e6c99585d8	Pattadar 593	2026-07-25T08:02:26.873436
93a34a28-eb5a-4548-8ecd-ed5ea58f5018	sankara.telukutla	create_parcel	a4788696-396f-4281-97b4-a02bc0803aba	Survey 119	2026-07-25T08:02:26.895506
7ba8b61f-1241-44aa-b37d-c4ec5bb6cc5f	sankara.telukutla	create_parcel	57f8c7e0-52f0-4d31-9398-446d127ba873	Survey 123	2026-07-25T08:02:26.912752
644a35f5-bbdd-483a-b524-d356ffff37e0	sankara.telukutla	create_parcel	e021fc5b-d5ce-4233-89f6-7abcf71b1291	Survey 125	2026-07-25T08:02:26.925521
09bb4186-abc4-41ea-a993-0086ec2fa88e	sankara.telukutla	create_parcel	b0a9e7c4-2884-4cdb-add5-e05c6a212310	Survey 127	2026-07-25T08:02:26.938492
96e4f7af-b613-4613-bf38-530d95a207e2	sankara.telukutla	create_parcel	aaa94b30-a9a2-4982-a7f2-9ae6e51563a1	Survey 442	2026-07-25T08:02:26.951599
0ffad754-8af7-4ca8-911a-48b0d2e81e22	sankara.telukutla	create_parcel	d77beece-bffb-459a-8cfa-56838d92c78b	Survey 455	2026-07-25T08:02:26.963994
aeddea1f-3fa9-4420-9dab-d2d31b1a68d6	sankara.telukutla	create_parcel	278f9bfa-f541-4b4b-bd02-7fcf0b201735	Survey 455	2026-07-25T08:02:26.980445
6678775b-437b-4571-bfc7-99bcb92254ba	sankara.telukutla	create_parcel	fb760159-1cbe-4616-9cb2-94aef2d8fe27	Survey 458	2026-07-25T08:02:26.992136
135785fe-64d9-41fb-97de-34708ac42ec9	sankara.telukutla	create_parcel	d4083dfe-0faa-46dd-af6c-2b9e7e4c3408	Survey 456	2026-07-25T08:02:27.018916
5fcb4b1b-2720-4d93-91a2-57cf34f21c21	sankara.telukutla	create_passbook	aef05e76-646c-438c-b997-62c2165223f3	Pattadar 573	2026-07-25T08:02:27.042435
fd0484ce-02a1-4080-a1aa-ea7bd258eb32	sankara.telukutla	create_parcel	ae11182c-ce0e-46b5-b99f-2f8f8ee604ec	Survey 128	2026-07-25T08:02:27.070019
de831470-5cf2-46a8-83c5-54a31d8c6486	sankara.telukutla	create_parcel	89525c8d-8e1d-4877-b965-4c308cb4f86d	Survey 70	2026-07-25T08:02:27.100574
07de2d4e-ca1b-4404-a922-c2ed62aa6495	sankara.telukutla	create_parcel	2a049b1d-769b-4a8f-b2f1-f1752a82a340	Survey 128	2026-07-25T08:02:27.127119
4625f397-8ade-4343-98c8-c9246e181e68	sankara.telukutla	create_parcel	d5f4b166-9ca2-4734-997f-ff73ecf88aa2	Survey 124	2026-07-25T08:02:27.153959
cb538b51-70e2-4a82-b5b3-90c4a60b5636	sankara.telukutla	create_parcel	57a6e641-9fb0-4444-92ab-5b230d9048de	Survey 125	2026-07-25T08:02:27.179563
19186a93-0f64-4126-aa88-fb4ae3d6967c	sankara.telukutla	create_parcel	6bfbe082-a1e6-493d-9b5b-59f41f554b51	Survey 126	2026-07-25T08:02:27.205224
39598e51-f8e5-485d-a5c8-93bbdaea334c	sankara.telukutla	create_parcel	24fa9320-c133-48dd-b46b-af529bb098c5	Survey 81	2026-07-25T08:02:27.005174
1978caba-458c-4b2d-97c6-c38f55ff2f78	sankara.telukutla	upload_document	87349bb6-f75e-4155-abba-02e6c99585d8	Uploaded a document	2026-07-25T08:02:27.031131
bea6f347-c37b-464f-951a-e7a3b07d20c2	sankara.telukutla	create_parcel	90354fe8-00d7-4912-8817-f0b3228e9771	Survey 119	2026-07-25T08:02:27.055920
a919a836-f217-4393-9bff-dcfc4d82c06f	sankara.telukutla	create_parcel	0adb38bd-88be-4443-b0a3-d32b811b9010	Survey 128	2026-07-25T08:02:27.084690
de6f9edc-812c-41af-8e6f-8957058b3337	sankara.telukutla	create_parcel	1d93782f-4a98-4bd3-bb66-bf0dd0359d51	Survey 71	2026-07-25T08:02:27.114245
c1c7713b-8a45-4379-9a57-df2733eb5efd	sankara.telukutla	create_parcel	9772370a-e531-4df8-88c4-5ad6bb5e0ae5	Survey 126	2026-07-25T08:02:27.141355
feaee115-3d2e-426e-b9cf-b8b42a1d8691	sankara.telukutla	create_parcel	abcb4af6-7316-4257-a447-05c6794cf284	Survey 125	2026-07-25T08:02:27.167856
427e08fc-c942-4f00-b769-f6b080e4ad97	sankara.telukutla	create_parcel	5d02aa0f-99da-4687-a8b1-7aeb509aa520	Survey 124	2026-07-25T08:02:27.192596
90bc6cda-0ca0-46d1-ab19-6bb7a021e4b5	sankara.telukutla	upload_document	aef05e76-646c-438c-b997-62c2165223f3	Uploaded a document	2026-07-25T08:02:27.217740
b130f5b1-b778-4e37-b1dc-203d38546d82	sankara.telukutla	delete_document	87349bb6-f75e-4155-abba-02e6c99585d8	Deleted 593	2026-07-25T08:31:34.810278
e64b37a8-22c2-4f21-a619-9357b6cb0336	sankara.telukutla	delete_document	aef05e76-646c-438c-b997-62c2165223f3	Deleted 573	2026-07-25T08:31:34.810564
5b41b985-32a4-4337-aa1a-68acb9585d09	sankara.telukutla	delete_passbook	87349bb6-f75e-4155-abba-02e6c99585d8		2026-07-25T08:31:34.830579
b6cf8a2e-a7bd-45ec-be37-9b8a40883e68	sankara.telukutla	delete_passbook	aef05e76-646c-438c-b997-62c2165223f3		2026-07-25T08:31:34.833475
4041c7f3-283f-453e-9998-66000ce6850a	sankara.telukutla	create_passbook	f8e3e90e-f909-48fc-a5d9-2f0ca1ba8c16	Pattadar 5001	2026-07-25T08:40:01.643479
b8e070b6-de62-4028-bb96-61b57c629d7d	sankara.telukutla	create_parcel	9e941cc6-1cec-4f4f-8aa5-1cf2685f41c1	Survey 1	2026-07-25T08:40:01.672765
1a2db9da-e039-49ee-9742-0270ce989358	sankara.telukutla	create_parcel	bef40f2a-2857-4a9d-b31f-bcb1054f926c	Survey 1	2026-07-25T08:40:01.699985
c3a973b4-3cd7-4b83-b88d-03c57639542a	sankara.telukutla	upload_document	f8e3e90e-f909-48fc-a5d9-2f0ca1ba8c16	Uploaded a document	2026-07-25T08:40:01.719623
39841ae6-9fec-460e-b592-a162acf69db4	sankara.telukutla	create_property	acb44db9-4c9b-4960-81c8-0676061e723c	open_plot: Nallapadu Plot No.150 - 200 Sq.yd	2026-07-25T08:58:33.267921
cefb7b2b-ff8e-4137-b1fd-8b701f5ee483	sankara.telukutla	upload_document	48553cae-4f59-4d32-9aab-ebc67b1011a4	Uploaded a document	2026-07-25T08:58:33.297335
6e8f8147-6d73-4290-a64b-d10d881b8306	sankara.telukutla	create_property	41fbd988-bbfa-496e-926b-285e2ca1b51a	open_plot: Ankireddipalem 210 Sq.yd Plot No.60	2026-07-25T08:58:33.315788
3726f1ee-d630-40e2-b585-e177c8348320	sankara.telukutla	upload_document	c8f306f4-a8ad-40f1-871d-da0e1df0f349	Uploaded a document	2026-07-25T08:58:33.334900
e6018fa4-bcb6-41b6-b27f-29bbd9d465bf	sankara.telukutla	create_property	c68aad95-e52a-4d82-8a11-9805ca16fd26	open_plot: Nallapadu 418.5-sqyd site plot	2026-07-25T13:25:07.804635
8396d5a8-0115-4e45-9807-225a23d99163	sankara.telukutla	upload_document	d94ec9b4-8a72-4587-8eb9-43b66ccdd047	Uploaded a document	2026-07-25T13:25:07.828835
4d7f7c1b-8da0-46a6-bee3-813ed30884e6	sankara.telukutla	create_property	4d5581ca-0e6e-44b2-99b3-b5436f6b65f3	open_plot: Nallapadu 200 Sq.yd Plot No.150	2026-07-25T13:25:07.847184
bd492f4d-ac84-4bab-8731-67d7d8769dd4	sankara.telukutla	upload_document	eecaf77d-7b0e-4d74-9ca7-4f15bea9f780	Uploaded a document	2026-07-25T13:25:07.873828
7accaccd-96de-4b47-bfbf-57b8cfeda267	sankara.telukutla	update_parcel	bef40f2a-2857-4a9d-b31f-bcb1054f926c	dossier updated	2026-07-25T13:25:29.588699
552f4a25-6474-4263-b5ef-2ba27e103bdd	sankara.telukutla	assign_land_to_group	f8e3e90e-f909-48fc-a5d9-2f0ca1ba8c16	Made personal	2026-07-25T13:29:00.132877
9b652a42-ccdc-4370-951f-de4b255ca246	sankara.telukutla	assign_land_to_group	f8e3e90e-f909-48fc-a5d9-2f0ca1ba8c16	Made personal	2026-07-25T13:57:22.689649
6ceaf226-855d-433e-be0c-e29c3d444b06	sankara.telukutla	assign_land_to_group	f8e3e90e-f909-48fc-a5d9-2f0ca1ba8c16	Assigned to a group	2026-07-25T14:05:15.869100
83a95838-8df7-4bba-82d5-52947c3bbcec	sankara.telukutla	assign_land_to_group	f8e3e90e-f909-48fc-a5d9-2f0ca1ba8c16	Assigned to a group	2026-07-25T14:05:35.591320
2ab99793-36a1-4312-9d26-3a2166a264b5	sankara.telukutla	assign_property_to_group	4d5581ca-0e6e-44b2-99b3-b5436f6b65f3	Assigned to a group	2026-07-25T14:06:03.931321
bfa7015b-7532-42f6-a546-5885e1fa6722	sankara.telukutla	assign_land_to_group	f8e3e90e-f909-48fc-a5d9-2f0ca1ba8c16	Assigned to a group	2026-07-25T14:15:35.534419
74495452-e7de-4c4e-9593-e87bb53eb3f2	sankara.telukutla	assign_property_to_group	c68aad95-e52a-4d82-8a11-9805ca16fd26	Assigned to a group	2026-07-25T14:15:57.916253
6220a532-347f-4107-8de2-b3d9504200ff	sankara.telukutla	assign_property_to_group	41fbd988-bbfa-496e-926b-285e2ca1b51a	Assigned to a group	2026-07-25T14:16:04.915214
21a845ec-35f5-4435-9311-24da97e748a2	sankara.telukutla	assign_property_to_group	acb44db9-4c9b-4960-81c8-0676061e723c	Assigned to a group	2026-07-25T14:16:09.681627
24db8b0a-c27b-4647-87a4-6fc1622428e6	sankara.telukutla	upload_document	bef40f2a-2857-4a9d-b31f-bcb1054f926c	Uploaded a document	2026-07-25T14:18:46.961219
078c378e-e5a4-4bf5-83b9-66a532f31bd3	sankara.telukutla	upload_document	9e941cc6-1cec-4f4f-8aa5-1cf2685f41c1	Uploaded a document	2026-07-25T14:19:04.423737
4495680c-f45f-4bd3-b9ab-a1f20eca6600	sankara.telukutla	reclassify_document	9e941cc6-1cec-4f4f-8aa5-1cf2685f41c1	→ photo	2026-07-25T14:19:07.864019
25eefb98-483a-4cb7-85fd-d24d26e8a35c	sankara.telukutla	upload_document	bef40f2a-2857-4a9d-b31f-bcb1054f926c	Uploaded a document	2026-07-25T14:21:44.921230
3212ed80-5215-4fc7-94a6-4b59e9082adf	sankara.telukutla	upload_document	40daf1a0-8814-408a-ac34-96f553475fb3	Uploaded a document	2026-07-25T14:25:33.862525
36a151e9-af8e-4f01-afeb-a2a3b299152b	sankara.telukutla	upload_document	bef40f2a-2857-4a9d-b31f-bcb1054f926c	Uploaded a document	2026-07-25T14:33:46.128463
ba0ba7ab-6104-4028-bea3-f72f432abb89	sankara.telukutla	reclassify_document	bef40f2a-2857-4a9d-b31f-bcb1054f926c	→ photo	2026-07-25T14:33:50.096228
771ca095-bb28-4ff0-99d4-921e14a16c8d	sankara.telukutla	upload_document	b66b9edb-3124-4784-aa04-14322e3102e1	Uploaded a document	2026-07-25T14:34:18.889770
eb43128e-91ce-4664-9e26-156c94e45181	sankara.telukutla	reclassify_document	b66b9edb-3124-4784-aa04-14322e3102e1	→ photo	2026-07-25T14:34:24.135552
b8975f8a-1fb8-45a7-ba13-92e6f1fe71aa	sankara.telukutla	upload_document	3df9b0bf-1d51-451e-88c5-af571990c04d	Uploaded a document	2026-07-25T14:37:16.926429
32de635d-89e9-498c-bcba-36404fa932a6	sankara.telukutla	reclassify_document	3df9b0bf-1d51-451e-88c5-af571990c04d	→ photo	2026-07-25T14:37:20.098300
778d74e0-bf11-4814-b2ff-a04d80b4f00b	sankara.telukutla	upload_document	dfdbdc08-3d36-4274-9ac3-b33fb8128d8e	Uploaded a document	2026-07-25T14:37:35.711437
cd83cc1c-9846-49a5-bf72-221cbd670986	sankara.telukutla	upload_document	ebdb1f6b-454d-4af4-8a1d-7a8affaa089a	Uploaded a document	2026-07-25T14:45:01.088643
438c88f7-34c9-473f-8549-5e37c5f11b06	sankara.telukutla	upload_document	6666dcb7-ec29-45ec-83c3-bc151ddc085b	Uploaded a document	2026-07-25T14:45:05.398427
77057b51-c254-4f29-8416-d95a65363b21	sankara.telukutla	create_passbook	9c50def4-aa17-479e-86b7-769e5b93b5b6	Pattadar 5001	2026-07-25T15:02:55.643177
6b2d9fc4-c3e5-477e-ae48-1803ee82d474	sankara.telukutla	create_parcel	49ab481b-bf11-447a-ae08-fb5ee99a6e30	Survey 1	2026-07-25T15:02:55.670007
6751a324-cc3f-48cb-8528-0d7ed05cd710	sankara.telukutla	create_parcel	3d4f28be-5d60-45d4-9a77-b2799918d04b	Survey 1	2026-07-25T15:02:55.689369
d0f42772-bd5f-4631-ba60-b7f477ac7206	sankara.telukutla	upload_document	9c50def4-aa17-479e-86b7-769e5b93b5b6	Uploaded a document	2026-07-25T15:02:55.702931
d3e20f61-1d19-4ebd-a930-237ebe8ccb6a	sankara.telukutla	create_passbook	7dfb4bd8-6320-4cee-a14a-4bf72dc63cc2	Pattadar 60602	2026-07-25T15:03:12.646083
ce6f1c7b-aba3-490e-b095-15dea4106a64	sankara.telukutla	create_parcel	ebca899b-6489-4c1b-914e-8c651bfed891	Survey 37	2026-07-25T15:03:12.669074
97424a20-26b0-4ea9-8ccc-8274d7cba688	sankara.telukutla	upload_document	7dfb4bd8-6320-4cee-a14a-4bf72dc63cc2	Uploaded a document	2026-07-25T15:03:12.687482
2c6e76ef-12ab-4362-ba82-407644d0495c	sankara.telukutla	upload_document	3d4f28be-5d60-45d4-9a77-b2799918d04b	Uploaded a document	2026-07-25T15:03:40.603777
f7b6e340-f350-4c35-85e2-fb6e329e975a	sankara.telukutla	upload_document	49ab481b-bf11-447a-ae08-fb5ee99a6e30	Uploaded a document	2026-07-25T15:03:44.126839
d4da762f-2ff6-4b84-a9f9-86548c4497a1	sankara.telukutla	upload_document	ebca899b-6489-4c1b-914e-8c651bfed891	Uploaded a document	2026-07-25T15:03:56.270203
53ac05b6-1a1e-4df8-850a-6a64c0862991	sankara.telukutla	upload_document	eb37c728-a045-4a35-a0f4-0f5be69e71ba	Uploaded a document	2026-07-25T15:07:14.923983
c8b7d677-05e1-4d8e-9b93-fe5ac9443d63	sankara.telukutla	delete_document	ebca899b-6489-4c1b-914e-8c651bfed891	Deleted a document	2026-07-25T15:35:51.973418
b2df0c7e-2a64-4e52-87c7-1ba5c6c2181d	sankara.telukutla	delete_document	7dfb4bd8-6320-4cee-a14a-4bf72dc63cc2	Deleted 60602	2026-07-25T15:35:51.987769
d8f26450-b668-43b7-a568-20722a964f8e	sankara.telukutla	delete_passbook	7dfb4bd8-6320-4cee-a14a-4bf72dc63cc2		2026-07-25T15:35:52.004432
3569f454-3990-4d5d-ba5d-0e27827958a2	sankara.telukutla	delete_document	49ab481b-bf11-447a-ae08-fb5ee99a6e30	Deleted a document	2026-07-25T15:35:54.938573
a34e3abf-3ff7-4dcc-80e8-d1bb6026b72d	sankara.telukutla	delete_document	3d4f28be-5d60-45d4-9a77-b2799918d04b	Deleted a document	2026-07-25T15:35:54.939818
621b6198-4d93-4931-941e-973fa420b80d	sankara.telukutla	delete_document	9c50def4-aa17-479e-86b7-769e5b93b5b6	Deleted 5001	2026-07-25T15:35:54.947408
14f92040-5148-41b4-b0de-a479ae70460a	sankara.telukutla	delete_passbook	9c50def4-aa17-479e-86b7-769e5b93b5b6		2026-07-25T15:35:54.967674
20733f35-f3a9-44c8-ae73-31a034b38c1f	sankara.telukutla	delete_document	9e941cc6-1cec-4f4f-8aa5-1cf2685f41c1	Deleted a document	2026-07-25T15:35:58.067601
8399753c-69f9-4611-9c76-1b752e0e7439	sankara.telukutla	delete_document	f8e3e90e-f909-48fc-a5d9-2f0ca1ba8c16	Deleted 5001	2026-07-25T15:35:58.070832
7ec8d964-e64d-46fa-b346-9bbcc7e0db29	sankara.telukutla	delete_document	bef40f2a-2857-4a9d-b31f-bcb1054f926c	Deleted a document	2026-07-25T15:35:58.073989
9a28ae7c-9790-4a71-a36a-e02e704164e7	sankara.telukutla	delete_document	bef40f2a-2857-4a9d-b31f-bcb1054f926c	Deleted a document	2026-07-25T15:35:58.075720
c10de3a5-4507-47f5-81c6-0d05b56ee9e2	sankara.telukutla	delete_document	bef40f2a-2857-4a9d-b31f-bcb1054f926c	Deleted a document	2026-07-25T15:35:58.075843
3013d804-8c1d-4fc0-88eb-58f14f5ec8ca	sankara.telukutla	delete_passbook	f8e3e90e-f909-48fc-a5d9-2f0ca1ba8c16		2026-07-25T15:35:58.107730
4b758e87-88f3-475c-a462-c49cd87c031c	sankara.telukutla	create_passbook	0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	Pattadar 1422	2026-07-25T15:58:16.640447
96f570d3-6e9d-44a7-baf4-716f893db791	sankara.telukutla	create_parcel	cd6df532-a9ae-49c8-9bdd-75739ae87235	Survey 183	2026-07-25T15:58:16.665047
af4a65f1-872f-4ce9-b11a-d2478ce4ce89	sankara.telukutla	create_parcel	a53e7a48-21c0-4b70-b45a-039804c2c6e9	Survey 183	2026-07-25T15:58:16.687362
925f7725-0acb-4015-9056-66f8af6c1049	sankara.telukutla	create_parcel	7ff59380-12c8-4ebb-91af-7a6e4fc5ff22	Survey 183	2026-07-25T15:58:16.705442
c9b59743-7374-4d57-912b-e6febb123a93	sankara.telukutla	create_parcel	51140d00-55f0-4688-b0ed-fad4c3383c56	Survey 120	2026-07-25T15:58:16.720355
3fbe95fa-6799-4509-9c9f-fbeab93b1303	sankara.telukutla	create_parcel	09d5d17c-c2ff-4d42-a5ae-76a308ff8c54	Survey 741	2026-07-25T15:58:16.738261
bd72fc4f-aca4-4293-a4af-25423e8db8ca	sankara.telukutla	create_parcel	505439b0-dcff-4ccb-8a94-de115bb0a4a6	Survey 740	2026-07-25T15:58:16.753802
3d02e098-dbdc-40f1-a3b5-291b377dbf82	sankara.telukutla	create_parcel	9b6d23b6-d199-4114-865d-13bc7f0f2ace	Survey 398	2026-07-25T15:58:16.769818
62213dc0-e33a-48b2-a48f-0b7b150237d6	sankara.telukutla	upload_document	0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	Uploaded a document	2026-07-25T15:58:16.785713
637300af-3fdb-45a8-8246-6b92bc80dc08	sankara.telukutla	upload_document	51140d00-55f0-4688-b0ed-fad4c3383c56	Uploaded a document	2026-07-25T15:59:10.766685
92de1479-6cad-4760-9960-8bc9aa708d9f	sankara.telukutla	upload_document	51140d00-55f0-4688-b0ed-fad4c3383c56	Uploaded a document	2026-07-25T15:59:10.984340
941e0ca0-2a86-4423-9724-2ea440ea2554	sankara.telukutla	reclassify_document	51140d00-55f0-4688-b0ed-fad4c3383c56	→ photo	2026-07-25T15:59:14.182403
7d646752-1eaa-44e2-8483-9dec416f9a7d	sankara.telukutla	update_parcel_geo	51140d00-55f0-4688-b0ed-fad4c3383c56	location set	2026-07-25T15:59:47.661051
cbf7260b-957e-4c89-be3b-30bc3c939134	sankara.telukutla	upload_document	7ff59380-12c8-4ebb-91af-7a6e4fc5ff22	Uploaded a document	2026-07-25T16:09:12.473219
62f53ee3-5277-43b1-8898-6bddfd436444	sankara.telukutla	upload_document	9b6d23b6-d199-4114-865d-13bc7f0f2ace	Uploaded a document	2026-07-25T16:09:18.785495
b5bf6fd9-9c99-4add-9d03-6e5d467f01ec	sankara.telukutla	create_passbook	4636d51d-34fa-428f-95ad-78dc0a565700	Pattadar 573	2026-07-25T18:19:44.709452
c6130530-62ae-4495-a545-41fce861133a	sankara.telukutla	create_parcel	bcc2a620-3648-4170-8100-e36f3f60b903	Survey 119	2026-07-25T18:19:44.736338
f5068cbb-3b32-4eed-acbe-8933635b96ef	sankara.telukutla	create_parcel	1e60a1b2-8789-4244-ae6c-5b31d5a8787b	Survey 128	2026-07-25T18:19:44.758007
ee5f81b2-7e99-49a2-9972-dcace6202ff3	sankara.telukutla	create_parcel	1c3320f6-1b18-4db5-875a-0d2aa11b28d3	Survey 128	2026-07-25T18:19:44.775469
4d1f7b63-b975-45a4-917e-563ed11a4735	sankara.telukutla	create_parcel	23b65a4a-d8ff-4c02-a2c6-62f918aa611b	Survey 70	2026-07-25T18:19:44.791187
09f18297-decf-4a94-9aac-9519b44c29d6	sankara.telukutla	create_parcel	c343eaf3-0f84-46f9-9c57-d88bc75c89a0	Survey 71	2026-07-25T18:19:44.807030
4c8f8360-fc50-4d67-8655-d437d84645dc	sankara.telukutla	create_parcel	a7d01041-d2df-4b1b-9e82-5906bc1a1fe3	Survey 128	2026-07-25T18:19:44.826675
4964ed3c-7b3f-4387-b8cd-a6d892f81e08	sankara.telukutla	create_parcel	8002c479-0e50-424f-806c-b8fa88f8f608	Survey 126	2026-07-25T18:19:44.843827
1e4252a2-7b44-4149-a4dd-07675f1108ed	sankara.telukutla	create_parcel	08def8a0-e0e0-4a58-bc35-c835dc36e197	Survey 124	2026-07-25T18:19:44.868933
fbf57c6b-3db8-49ae-a8c7-ad088e9abffd	sankara.telukutla	create_parcel	a5ae06c1-0691-4fd7-8673-f9b85607490e	Survey 125	2026-07-25T18:19:44.886637
658bc101-2697-4995-966b-aed18bd3376c	sankara.telukutla	create_parcel	e3daa6f3-0965-4bef-9070-9453c0efb5b5	Survey 125	2026-07-25T18:19:44.902813
004f04e1-ffc0-4e67-a946-4d80d32b9452	sankara.telukutla	create_parcel	349695a6-0803-4b1a-9730-28af8b895ddc	Survey 124	2026-07-25T18:19:44.922002
640f877b-a50f-428a-9863-f4e9aaf8895a	sankara.telukutla	create_parcel	bf7c6ad8-f3f3-4306-87f1-6bb1f2235ae7	Survey 126	2026-07-25T18:19:44.938775
9e453878-4d9c-4398-9d0d-cadaad8a9a0b	sankara.telukutla	upload_document	4636d51d-34fa-428f-95ad-78dc0a565700	Uploaded a document	2026-07-25T18:19:44.951232
a341d136-9957-4f22-b5de-99d93b5e08b3	sankara.telukutla	create_passbook	11020755-9293-4e72-b4a4-f1f1668ecfa4	Pattadar 593	2026-07-25T18:20:26.963603
2f9ae2a9-6fdb-4d41-a2df-7ab83917310b	sankara.telukutla	create_parcel	d89a0249-c709-4576-bbeb-bfdaa8f0f222	Survey 456	2026-07-25T18:20:27.130319
01807809-971a-40ab-895f-65736e020b9e	sankara.telukutla	create_parcel	836d46b2-e44f-40da-afa2-bf24e832fc28	Survey 119	2026-07-25T18:20:26.979973
400ea147-f319-4489-8a84-401d53328545	sankara.telukutla	upload_document	11020755-9293-4e72-b4a4-f1f1668ecfa4	Uploaded a document	2026-07-25T18:20:27.143105
7df157b9-aac5-4f73-9cd7-97fa4cd5d527	sankara.telukutla	create_parcel	9ffbfb36-9981-41ac-a873-8e91c41bb223	Survey 123	2026-07-25T18:20:26.994817
97693c36-abc2-4feb-8b17-c52ce6d625f4	sankara.telukutla	create_parcel	c00a2254-3c4d-47bc-9a33-2fb8bbce1994	Survey 1	2026-07-25T18:21:20.908186
b220dd12-899b-4d0b-9a3f-e9068ddedcdb	sankara.telukutla	create_passbook	93e0c0cc-aa2d-4182-91d3-88ee07308832	Pattadar 567	2026-07-25T18:21:43.431470
d22db961-99dd-4793-9bd0-5c6b9601c5e8	sankara.telukutla	create_parcel	404acaf7-2443-411d-a383-d51f83071d7c	Survey 125	2026-07-25T18:20:27.024976
ae265a9a-edca-43a5-a0e9-53b0100527b5	sankara.telukutla	create_parcel	ae5707a8-a1d5-4cf1-9f12-bf8e58b927dd	Survey 127	2026-07-25T18:20:27.039439
ad8b8672-db0d-4ae3-bb87-29def172476d	sankara.telukutla	upload_document	93e0c0cc-aa2d-4182-91d3-88ee07308832	Uploaded a document	2026-07-25T18:21:43.473709
3dab66ea-186e-402e-a13f-13c4f7298cbf	sankara.telukutla	create_parcel	95f01d67-6663-401e-a2c9-9e3dd6e7d168	Survey 442	2026-07-25T18:20:27.054136
f0d3cedd-b551-4e63-b9af-50384e737b81	sankara.telukutla	create_parcel	5d7424a7-aaa7-46d8-972f-73720f49061d	Survey 455	2026-07-25T18:20:27.067900
25baadf9-4d1c-4cc9-8751-0f58a501863b	sankara.telukutla	create_parcel	407aa0db-01d5-402a-b051-c887bbbb6efa	Survey 455	2026-07-25T18:20:27.082479
c13114a8-5b15-4d89-8d9b-1f25ac807be4	sankara.telukutla	create_parcel	51d80114-a7b6-4047-8e16-d780ddfb143d	Survey 1	2026-07-25T18:21:20.891066
43c7a5ec-3697-45a3-a769-54a1a6e8388c	sankara.telukutla	create_parcel	d7351394-56ef-4d8a-9dc9-ac3fabd3030c	Survey 458	2026-07-25T18:20:27.097774
5838ef8a-b568-49ed-83eb-e1da35381092	sankara.telukutla	upload_document	e5ed3781-8b71-4dfe-bf3d-d449db24d85c	Uploaded a document	2026-07-25T18:21:20.920750
3235283c-d480-407c-a6d4-565977623dbe	sankara.telukutla	create_parcel	14f2d54e-5d86-4a5a-837a-0885e4d0cc54	Survey 1	2026-07-25T18:21:43.457138
97f0ac21-af15-4ab1-83c9-d5d4288ee44c	sankara.telukutla	create_parcel	45c4456b-ea27-41c7-bdbc-6fcdd149a6fa	Survey 81	2026-07-25T18:20:27.113733
a9549057-01e6-482a-b926-6d03f0b6c72f	sankara.telukutla	create_passbook	e5ed3781-8b71-4dfe-bf3d-d449db24d85c	Pattadar 5001	2026-07-25T18:21:20.873214
fdfe4f99-d92a-49a8-a99f-c7f5773c4074	sankara.telukutla	set_stake	14f2d54e-5d86-4a5a-837a-0885e4d0cc54	Stake set to owned	2026-07-25T21:59:22.679525
5b755ec6-1c2b-4c85-86a5-efafc8cdb64f	sankara.telukutla	set_stake	c00a2254-3c4d-47bc-9a33-2fb8bbce1994	Stake set to watch	2026-07-25T21:59:56.685614
9e8bd40e-1801-40eb-b859-b0c46d896ef1	sankara.telukutla	set_stake	51d80114-a7b6-4047-8e16-d780ddfb143d	Stake set to managed	2026-07-25T22:00:07.031209
\.


--
-- Data for Name: beneficiaries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.beneficiaries (id, parcel_id, person_name, person_contact, relationship, share_pct, kind, status, owner_user_id, present_address, dob, marital_status, spouse_name, spouse_contact, spouse_status, guardian_name, guardian_contact, invite_token, is_minor, aadhaar_masked, gender, photo, phone, email) FROM stdin;
b01	pc01	Sita Devi	9876543211	spouse	50	coowner	accepted											f					
b02	pc01	Ravi Kumar	9876543220	son	25	nominee	pending											f					
b03	pc01	Priya Kumar	9876543221	daughter	25	nominee	pending											f					
b04	pc03	Lakshmi Naidu	9876543213	spouse	50	coowner	accepted											f					
b05	pc04	Venkat Rao	9876543212	brother	30	coowner	accepted											f					
b06	pc06	Padma Devi	9876543230	mother	100	nominee	pending											f					
b07	pc07	Kavitha Reddy	9876543231	spouse	50	coowner	accepted											f					
f9f107ff-94b3-4b77-8557-2466ae666b68	86c78df1-1100-4dfd-9274-0b1236dd4ccf	Praneel Reddy Telukutla	praneel.telukutla@gmail.com	son	50	nominee	accepted											f					
\.


--
-- Data for Name: deed_types; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.deed_types (id, reg_type_en, reg_type_te, nature_en, nature_te) FROM stdin;
dt000	Sale	విక్రయం	Sale Deed	విక్రయ దస్తావేజు
dt001	Sale	విక్రయం	Sale Agreement With Possession	విక్రయ స్వాధీన ఒప్పందము
dt002	Sale	విక్రయం	Sale Agreement Without Possession	విక్రయ ఆస్వాధీన ఒప్పందము
dt003	Sale	విక్రయం	Sale Deed Executed By A.P.Housing Board	ఎ.పి హౌసింగ్ బోర్డు క్రయ దస్తావేజు
dt004	Sale	విక్రయం	Sale Deed Executed By Or Infavour Of Constituted By Govt.	ప్రభుత్వముచే / ప్రభుత్వము పేరిట కాబడిన విక్రయ దస్తావేజు
dt005	Sale	విక్రయం	Sale Deed Executed By Society In f/o Member	సొసైటిలు వారి సభ్యులకు చేసే క్రయ దస్తావేజు
dt006	Sale	విక్రయం	Instruments Between Co-Ops,Govt. & Other Financial Institute	కోఆపరేటివ్ సొసైటిలు/ప్రభుత్వము వారికి ఆర్ధిక సంస్థలకు మధ్య జరిగే లావాదేవీలు
dt007	Sale	విక్రయం	Sale Deed In Favour Of State Or Central Govt.	కేంద్ర, రాష్ట్ర ప్రభుత్వములకు క్రయం
dt008	Sale	విక్రయం	Development Agreement Or Construction Agreement	అభివృద్ధి /లేదా నిర్మాణ ఒప్పందము దస్తావేజు
dt009	Sale	విక్రయం	Development Agreement Cum GPA	జనరల్ పవర్ తో కూడిన అభివృద్ది ఒప్పంద దస్తావేజు
dt010	Sale	విక్రయం	Agreement Of Sale Cum GPA	జనరల్ పవర్ తో కూడిన క్రయ ఒప్పందం
dt011	Sale	విక్రయం	Conveyance Deed(Without Consideration)	కన్వేయన్స్ పత్రం(విలువ లేదు)
dt012	Sale	విక్రయం	Conveyance For Consideration	ప్రతిఫలముతో కూడిన కన్వేయన్స్ దస్తావేజు
dt013	Sale	విక్రయం	Sale Deed in Favour of Mortgagee	తనఖా గ్రహీత కు చేసే విక్రయ దస్తావేజు
dt014	Sale	విక్రయం	Sale with Indemnity	పూచీతో కూడిన క్రయ దస్తావేజు
dt015	Sale	విక్రయం	Sale Deeds in f/o agrl Labrs (SC/ST) Funded by SC Fin. Corpn	SC/ST ఫైనాన్స్ కార్పొరేషన్ వారు దాఖలు చేసే క్రయ పత్రాలు
dt016	Sale	విక్రయం	Sale of life interest	జీవిత కాలపు హక్కులు కలిగిన క్రయ దస్తావేజు
dt017	Sale	విక్రయం	Sale of Terrace Rights	టెర్రస్ హక్కుల క్రయ దస్తావేజు
dt018	Sale	విక్రయం	Sale Deeds executed by Courts	కోర్టుల ద్వారా అమలు కాబడిన క్రయ దస్తావేజు
dt019	Sale	విక్రయం	Court Sale Certificate	కోర్టు క్రయ దృవీకరణ దస్తావేజు
dt020	Sale	విక్రయం	Court Decree	కోర్టు డిక్రీ
dt021	Sale	విక్రయం	Sale(others)	క్రయము(ఇతరులు)
dt022	Sale	విక్రయం	GPA	జనరల్ పవర్ ఆఫ్ అటార్నీ
dt023	Sale	విక్రయం	SadaBainama (Sale)	సాదా బైనామా దస్తావేజు
dt024	Sale	విక్రయం	Development Agreement/GPA/Supplemental Deed By CRDA	
dt025	Sale	విక్రయం	Conveyance (Merger, Demerger, Amalgamation of Companies)	
dt026	Mortgage	అస్వాదీన తనఖా	Mortgage with Possession	స్వాధీన తనఖా
dt027	Mortgage	అస్వాదీన తనఖా	Mortgage without Possession	అస్వాధీన తనఖా
dt028	Mortgage	అస్వాదీన తనఖా	Mort. Deed in f/o Governer/President of India by Gt.Servants	ప్రభుత్వ ఉద్యోగులు గవర్నరు/రాష్ట్రపతి కి చేసే తనఖా దస్తావేజు
dt029	Mortgage	అస్వాదీన తనఖా	Assignment Deed	అసైన్ మెంట్ దస్తావేజు
dt030	Mortgage	అస్వాదీన తనఖా	Mortgage Deed By Co-Operative Society in f/o Govt.	సహకార సంస్థలు ప్రభుత్వముకు చేసే తనఖా దస్తావేజు
dt031	Mortgage	అస్వాదీన తనఖా	Mortgage Deed by Small Farmer for Agrl.Loans in f/o PAC/Bank	సన్నకారు రైతులు పి.ఎ.సి.ఎస్. బ్యాంకు నందు పెట్టె అస్వాధీన తనఖా
dt032	Mortgage	అస్వాదీన తనఖా	Mortgagee Deed Between Socity to Socity Or Banks	సొసైటి నుండి సొసైటి మరియు బ్యాంకులకు మధ్య జరిగే తనఖా
dt033	Mortgage	అస్వాదీన తనఖా	Deposit of Title Deeds	టైటిల్ డీడ్స్ డిపాజిట్ చేయుట ద్వారా తనఖా
dt034	Mortgage	అస్వాదీన తనఖా	Security Bond	భద్రతా దస్తావేజు
dt035	Mortgage	అస్వాదీన తనఖా	Mortgages in f/o Grameena or Scheduled Bank for Agricultural Credit	గ్రామీణ బ్యాంకు లకు చేసే అస్వాధీన తనఖా
dt036	Mortgage	అస్వాదీన తనఖా	Mortgages in f/o Coop Credit Societies of Weaker Section of Non-Agricultural Class Loan <=10000	కోఆపరేటివ్ క్రెడిట్ సొసైటి లకు పదివేల సంభందిత ఆస్వాధీన తనఖా
dt037	Mortgage	అస్వాదీన తనఖా	Instruments Between Co-Op and Other Co-Op,Banks,Financial Inst or Govt.	కోఆపరేటివ్ ఇతర కోఆపరేటివ్ బ్యాంకుల మధ్య ఆరువేల లోపు చేసే దస్తావేజు
dt038	Mortgage	అస్వాదీన తనఖా	Instruments in f/o House Bldg Co-Op Societies for Loan Upto Rs.30000 Under L.I.G.H Scheme	L.I.G.H స్కీమ్ కింద రూ.30000 వరకు రుణం కోసం f/o హౌస్ Bldg కో-ఆప్ సొసైటీలలోని సాధనాలు
dt039	Mortgage	అస్వాదీన తనఖా	Mortgages Executed by Members of Co-Op Urban and Town Banks in f/o Such Banks for Loan Upto Rs.15000	కో-ఆప్ అర్బన్ మరియు టౌన్ బ్యాంకుల సభ్యులు రూ.15000 వరకు రుణం కోసం అటువంటి బ్యాంకులలో తనఖా అమలు చేస్తారు.
dt040	Mortgage	అస్వాదీన తనఖా	Instruments In f/o SBI And Nationalised Banks For Loan Upto Rs.6500 Under Diff Rates of Int. Adv. /	
dt041	Mortgage	అస్వాదీన తనఖా	Further Charge - When the Original Mortgage is With Possession	స్వాధీన తనఖా దస్తావేజు పై తదుపరి చార్జ్
dt042	Mortgage	అస్వాదీన తనఖా	Further Charge-Orig. Mortg is Without Possession And Possession Is Agreed to Be Given At Execution	ఆస్వాధీనతో కూడిన తనఖా దస్తావేజు పై మరింత రుణము పొందు దస్తావేజు
dt043	Mortgage	అస్వాదీన తనఖా	Further Charge - Without Possession on a Simple Mortgage	తనఖా దస్తావేజు పై మీరు చేసే దస్తావేజు
dt044	Mortgage	అస్వాదీన తనఖా	Mortgage by Conditional Sale	విక్రయ షరతుతో కూడిన అస్వాధీన తనఖా
dt045	Mortgage	అస్వాదీన తనఖా	Agreement Varying the Terms Of Previously Registered Mortgage Deed	పూర్వపు అస్వాధీన తనఖాలు ఏమైనా ఒప్పోంద మార్పులు ఉంటే చేసే దస్తావేజు
dt046	Mortgage	అస్వాదీన తనఖా	Additional Security	అదనపు భద్రతతో చేసే దస్తావేజు
dt047	Mortgage	అస్వాదీన తనఖా	Substituted Security	ప్రత్యాన్మయ భద్రతా దస్తావేజు
dt048	Mortgage	అస్వాదీన తనఖా	Mortgage(Others)	తనఖా (ఇతరులు)
dt049	Gift	దాన పత్రము	Gift [దాన పత్రము].	
dt050	Gift	దాన పత్రము	Gift Settlement In f/o Family Member	కుటుంబ సభ్యులకు దఖలు
dt051	Gift	దాన పత్రము	Gift Settlement In f/o Others	ఇతరులకు దఖలు
dt052	Gift	దాన పత్రము	Gift Settlement For Charitable/Religious Purposes	మతధార్మిక సంస్థకు దఖలు
dt053	Gift	దాన పత్రము	Gift Settlement In f/o Local Bodies	స్థానిక సంస్థలకు దఖలు
dt054	Gift	దాన పత్రము	Gift In f/o Local Bodies (G.O 137)	స్థానిక సంస్థలకు దఖలు
dt055	Gift	దాన పత్రము	Gift For Charitable Religious Purposes/God	మత, ధార్మిక సంస్థలకు దఖలు
dt056	Gift	దాన పత్రము	Gift In Favour Of Government	ప్రభుత్వమునకు దాన పత్రము
dt057	Gift	దాన పత్రము	Gift Settlement Deeds In Favour Of Government	ప్రభుత్వమునకు దఖలు దస్తావేజు
dt058	Gift	దాన పత్రము	Gift Of Terrace Rights	టెర్రేస్ హక్కుల దానపత్రము
dt059	Gift	దాన పత్రము	Gift Settlement Of Terrace Rights	టెర్రేస్ హక్కుల దఖలు దస్తావేజు
dt060	Gift	దాన పత్రము	Gift Reserving Life Interest	జీవితకాలపు హక్కు ఉంచుకొని చేసే దాన దస్తావేజు
dt061	Gift	దాన పత్రము	Gift Settlement Reserving Life Interest	జీవితకాలపు హక్కు ఉంచుకొని చేసే దఖలు
dt062	Partition	భాగపంపిణి	Partition	భాగపంపిణి
dt063	Partition	భాగపంపిణి	Partition Among Family Members	కుటుంబ సభ్యుల మధ్య జరుగు భాగ పంపిణీ దస్తావేజు
dt064	Partition	భాగపంపిణి	Partition executed by Court	
dt065	Release	హక్కు విడుదల	Release (Co-Parceners)	హక్కు విడుదల
dt066	Release	హక్కు విడుదల	Release (Others)	హక్కు విడుదల(ఇతరులకు)
dt067	Release	హక్కు విడుదల	Reconveyance Deed Executed By Govt In Fovour Of Employees	ఉద్యోగుల పేరిట ప్రభుత్వము చేయు రికన్వేయన్స్ దస్తావేజు
dt068	Release	హక్కు విడుదల	Reconveyance Deed(Others)	రికన్వేయన్స్ పత్రం(ఇతరులు)
dt069	Release	హక్కు విడుదల	Receipt (R.T.D.M)	చెల్లు రశీదు
dt070	Release	హక్కు విడుదల	Release (Federation OR Society To Society)	ఫెడరేషన్ లేదా సొసైటి వారికి మధ్య జరిగే హక్కు విడుదల
dt071	Release	హక్కు విడుదల	Release Of Life Interest	జీవిత కాలపు హక్కు విడుదల దస్తావేజు
dt072	Release	హక్కు విడుదల	Release Of Disputed Right	వివాదాస్పద హక్కు విడుదల దస్తావేజు
dt073	Release	హక్కు విడుదల	Release Of Mortgage Right	
dt074	Release	హక్కు విడుదల	Release Of Maintenance Right By Way Of Relinquishing Right For Immovable Property	మనోవర్తి హక్కు విడుదల దస్తావేజు
dt075	Release	హక్కు విడుదల	Release(Others)	హక్కు విడుదల (ఇతరములు)
dt076	Release	హక్కు విడుదల	Release Among Family Members	కుటుంబ సభ్యుల మధ్య జరుగు హక్కు విడుదల దస్తావేజు
dt077	Exchange	పరటా, మార్పిడి దస్తావేజు	Exchange	పరటా, మార్పిడి దస్తావేజు
dt078	Exchange	పరటా, మార్పిడి దస్తావేజు	Exchange by CRDA	
dt079	Lease	కౌలు	Lease Deed	కౌలు దస్తావేజు, అద్దె ఒప్పొంద దస్తావేజు
dt080	Lease	కౌలు	Lease In Favour Of State/Central Govt.	కేంద్ర, రాష్ట్ర ప్రభుత్వములకు కౌలు
dt081	Lease	కౌలు	Mining Lease	గనుల అద్దె
dt082	Lease	కౌలు	Salt Leases With Ground Rent	భూమి అద్దె తో కూడిన ఉప్పు ఒప్పొందము
dt083	Lease	కౌలు	Transfer Of Lease	అద్దె ఒప్పంద బదిలీ దస్తావేజు
dt084	Lease	కౌలు	Surrender Of Lease	అద్దె ఒప్పంద రద్దు దస్తావేజు
dt085	Lease	కౌలు	Lease(Others)	అద్దె ఖరారు (ఇతరములు)
dt086	Rectification/Ratification/Cancellation Deed	సవరణ/ఒప్పుదల/రద్దు పత్రము	Rectification Deed	సవరణ పత్రము
dt087	Rectification/Ratification/Cancellation Deed	సవరణ/ఒప్పుదల/రద్దు పత్రము	Supplemental Deed, Ratification Deed U/S 4 Of I.S.Act	అనుబంధ ఒప్పుదల దస్తావేజు
dt088	Rectification/Ratification/Cancellation Deed	సవరణ/ఒప్పుదల/రద్దు పత్రము	Cancellation Deed	రద్దు పత్రము
dt089	Rectification/Ratification/Cancellation Deed	సవరణ/ఒప్పుదల/రద్దు పత్రము	Revocation Of Gift Settlement	దాఖలు పత్రము ఉప సంహరణ
dt090	Power Of Attorney [పవర్ ఆఫ్ అటార్నీ].		Power To Sell Immovable Property (No Value Mentioned)	పవర్ ఆఫ్ అటార్నీ
dt091	Power Of Attorney [పవర్ ఆఫ్ అటార్నీ].		GPA In Favour Of Family Members	పవర్ ఆఫ్ అటార్నీ
dt092	Will	వీలునామా	Will	వీలునామా
dt093	Will	వీలునామా	Cancellation Of Will	వీలునామా రద్దు
dt094	Will	వీలునామా	Codicil	వీలునామా అనుబంధ దస్తావేజు
dt095	Will	వీలునామా	Will in Sealed Cover	
dt096	Adoption Deed	దత్త స్వీకరణ	Adoption Deed	దత్త స్వీకరణ
dt097	Affidavit	ప్రమాణ పత్రము	Affidavit	ప్రమాణ పత్రము
dt098	Agreement (Others)	ఒప్పందం(ఇతరులు)	Agreement (Others)	ఒప్పందం (ఇతరులు)
dt099	Award (Not Directing Partition)	భాగపంపిణి చేసుకోవద్దని చెప్పే తీర్పు పత్రము	Award (Not Directing Partition)	భాగపంపిణి చేసుకోవద్దని చెప్పే తీర్పు పత్రము
dt100	Bond	పూచీ పత్రము	Bond	పూచీ పత్రము
dt101	Cancellation GPA	జనరల్ పవర్ ఆఫ్ అటార్నీ రద్దు పత్రం	Cancellation GPA	జనరల్ పవర్ ఆఫ్ అటార్నీ రద్దు పత్రం
dt102	Cancellation (Others)	రద్దు పత్రము(ఇతరులు)	Cancellation (Others)	రద్దు పత్రము(ఇతరులు)
dt103	Divorce	విడాకుల పత్రము	Divorce	విడాకుల పత్రము
dt104	Indemnity Bond	నష్ట పరిహార పూచీ పత్రం	Indemnity Bond	నష్ట పరిహార పూచీ పత్రం
dt105	Partnership	భాగస్వామ్యము	Partnership	భాగస్వామ్యము
dt106	Dissolution Of Partnership	భాగస్వామ్య రద్దు	Dissolution Of Partnership	భాగస్వామ్య రద్దు
dt107	Power Of Attorney	పవర్ ఆఫ్ అటార్నీ	Special Power	
dt108	Power Of Attorney	పవర్ ఆఫ్ అటార్నీ	General Power	
dt109	Power Of Attorney	పవర్ ఆఫ్ అటార్నీ	Power for Consideration	
dt110	Security Bond	భద్రతా పూచీ పత్రం	Security Bond	భద్రతా పూచీ పత్రం
dt111	Trust	ట్రస్టు	Declaration	ప్రకటన
dt112	Trust	ట్రస్టు	Others (Settlement)	సెటిల్మెంట్(ఇతరములు)
dt113	Trust	ట్రస్టు	Revocation	ఉపసంహరణ/రద్దు పత్రము
dt114	Book 4 (Others)	బుక్ 4 దస్తావేజు (ఇతరములు)	Book 4 (Others)	బుక్ 4 దస్తావేజు (ఇతరములు)
\.


--
-- Data for Name: districts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.districts (id, name, code, state_id) FROM stdin;
15	ALLURI SITHARAMA RAJU	03_3	AP
16	ANAKAPALLI	03_1	AP
12	ANANTAPUR	12_1	AP
24	ANNAMAYYA	11_2	AP
21	BAPATLA	07_3	AP
10	CHITTOOR	10_1	AP
04	EAST GODAVARI	04_2	AP
19	ELURU	05_2	AP
07	GUNTUR	07_1	AP
17	KAKINADA	04_1	AP
18	KONASEEMA	04_3	AP
06	KRISHNA	06_1	AP
13	KURNOOL	13_1	AP
28	MARKAPURAM	08_1	AP
26	NANDYAL	13_2	AP
20	NTR	06_2	AP
22	PALNADU	07_2	AP
14	PARVATIPURAM MANYAM	02_2	AP
27	POLAVARAM	05_3	AP
08	PRAKASAM	08_2	AP
09	SPSR NELLORE	09_2	AP
25	SRI SATHYA SAI	12_2	AP
01	SRIKAKULAM	01_1	AP
23	TIRUPATI	10_2	AP
03	VISAKHAPATNAM	03_2	AP
02	VIZIANAGARAM	02_1	AP
05	WEST GODAVARI	05_1	AP
11	YSR KADAPA	11_1	AP
\.


--
-- Data for Name: document_parties; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.document_parties (id, document_id, role, name, parentage, age, address, is_gpa, created_at) FROM stdin;
451bf3b8-6d9b-4293-8656-3b0d78299ef2	1f79045f-51ed-4db2-acab-27d6ec4d4f2a	seller	Bhavanam Vijayalakshmi	W/o Bhavanam Jagannadhareddy	27	D.No. 5-77, Kothareddipalem Village, Chebrole Mandal, Guntur District	f	2026-07-16T15:50:15.166086
f334b3b7-640f-41ac-8f2c-5a4c433919ca	1f79045f-51ed-4db2-acab-27d6ec4d4f2a	buyer	Chintalapudi Swetha	D/o Chintalapudi Ranga Subbareddy	27	House No. Y.H.J-164, A.P.H.B Colony, Guntur City	f	2026-07-16T15:50:15.166086
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.documents (id, parcel_id, doc_type, file_ref, doc_no, sro_code, reg_year, version, source, tags, created_at, owner_user_id, passbook_id, property_id) FROM stdin;
doc01	pc01	passbook	passbook_45_1.pdf	PB-001	ATP-01	2020	1	upload	land,passbook	2024-01-16	system		
doc02	pc03	sale_deed	sale_deed_123A.pdf	SD-2024-456	KRN-01	2024	1	upload	sale,vijayawada	2024-02-21	system		
doc03	pc04	gift_deed	gift_deed_78.pdf	GD-2023-789	CTR-01	2023	1	upload	gift,tirupati	2024-03-11	system		
doc04	pc01	ec	ec_45_1_2024.pdf	EC-2024-001	ATP-01	2024	1	upload	encumbrance	2024-06-15	system		
doc05	pc05	sale_deed	sale_156_3.pdf	SD-2024-101	GNT-01	2024	1	upload	guntur,sale	2024-04-06	system		
doc06	pc06	passbook	passbook_210.pdf	PB-005	EGD-01	2022	1	upload	passbook	2024-05-13	system		
doc07	pc03	tax_receipt	tax_123A_2024.pdf	TR-2024-55	KRN-01	2024	1	upload	tax,property	2024-07-01	system		
doc08	pc07	sale_deed	sale_89B.pdf	SD-2024-202	VSP-01	2024	1	upload	visakhapatnam	2024-06-02	system		
33f874a6-ecc	8898e7e5-46c	sale_deed	c78e1df7-d173-4cae-ba45-de50bdb96b9f	6513	Nallapadu	2010	1	upload		2026-07-11T08:15:02.076427	system		
0d62803d-876	4c742b5d-ee1	gift_deed	d8619f43-1c7b-45ef-a018-20e899e4a6b9				1	upload		2026-07-12T01:53:30.279319	system		
9f1d1039-a748-42b1-a7d4-ed8247e5a8cd	52401805-65c6-42fc-9520-55cdde3e6cb0	gift_deed	d8619f43-1c7b-45ef-a018-20e899e4a6b9	12	22	2029	1	upload		2026-07-12T10:28:49.718738	system		
fee2c10a-2812-48b1-8eb8-46da31cb3565	5a16ab84-9e2e-4ae5-83b2-25a3dac4b337	other	909e12e9-173c-4159-88a5-a69b2993728a				1	upload		2026-07-13T08:32:27.339782	system		
ac98ee16-29ad-40cf-90f3-ad822bb3fe05	17779483-e257-418f-bb83-88b9411f58c6	photo	8f1a327d-bfcf-47df-a945-525387964cb6				1	upload	photo	2026-07-14T04:14:24.900037	system		
a292351d-42b3-436b-9e29-cf3c6c332573	5d1c39c2-8e30-4dbc-861b-fdf7a115e5fd	photo	9aed1df7-2f0f-4038-ae1d-45c39a91466d				1	upload	photo	2026-07-14T04:54:46.185880	system		
30d19d51-5085-4405-a7c1-9aad03a7c141	86c78df1-1100-4dfd-9274-0b1236dd4ccf	photo	b90d9cb7-52f4-486d-b43d-5632573225ff				1	upload	photo	2026-07-14T13:16:40.064979	system		
df179188-6038-48c1-aba9-366a2a55c025	35a76448-519d-46c4-ac65-ee1ba504a45e	photo	aa84b24e-2aad-45e3-acd3-8474d529c1b0				1	upload	photo	2026-07-15T08:34:09.499754	system		
cd4c6bae-3fda-4ed7-a4d9-4c2aff45642f	35a76448-519d-46c4-ac65-ee1ba504a45e	other	79d55109-7138-47af-a366-2f4697ed123c				1	upload		2026-07-15T08:35:04.718522	system		
67b4b123-7d2d-41b8-b8aa-4b3e463e2e3d	fc28d570-727d-448a-bf20-418ed6dafd26	sale_deed	c78e1df7-d173-4cae-ba45-de50bdb96b9f	9221	Nallapadu	2010	1	upload		2026-07-22T13:39:10.079677	sankara.telukutla		
c6959132-c393-470e-ba9a-07a0fa07520a	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	photo	13d01ca9-648c-4065-9fa6-6fdb9690b82a				1	upload		2026-07-24T14:48:19.920709	sankara.telukutla		
f93527e9-9db6-4868-87b8-ba77dc08a81e	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	video	6bf7cca0-9880-4464-9426-c064efc81fcf				1	upload	video	2026-07-24T14:55:30.550938	sankara.telukutla		
6cd8860b-2ff6-4348-a87c-cc83905b9f68	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	video	48bf8bcb-267b-4834-a4db-6997826f087c				1	upload	video	2026-07-24T14:55:35.143456	sankara.telukutla		
e0b03c7d-b1d7-4083-9971-8bc1684e2dec	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	sale_deed	2b1c5526-5ec5-4948-90d4-731b235bd904				1	upload		2026-07-24T15:00:26.799198	sankara.telukutla		
6b79a510-3f2c-4e8a-a9e1-62f402f99c55	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	other	b679e7f5-69e2-4567-bca0-d104f91d39e1				1	upload		2026-07-24T15:02:23.004478	sankara.telukutla		
45eee959-63ac-47a9-9d7f-31c7ce6c5cca	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	photo	bbddd4ad-f099-4d80-8914-387928d1642f				1	upload		2026-07-24T15:02:22.664513	sankara.telukutla		
dcd6dd28-e66c-4d30-b3a6-6a42ef287984	ab7b1569-c8c9-43c0-8048-4ca14d2bcfb0	photo	1ed48580-0bdb-467e-b531-0b6485fd44d8				1	upload		2026-07-24T15:02:22.812444	sankara.telukutla		
48553cae-4f59-4d32-9aab-ebc67b1011a4		gpa	00a6349e-dcdf-43cf-9255-e6f250fb23a7				1	upload		2026-07-25T08:58:33.295931	sankara.telukutla		acb44db9-4c9b-4960-81c8-0676061e723c
c8f306f4-a8ad-40f1-871d-da0e1df0f349		sale_deed	f4aa41eb-80cf-4744-bd8a-68860d7144ec				1	upload		2026-07-25T08:58:33.334137	sankara.telukutla		41fbd988-bbfa-496e-926b-285e2ca1b51a
d94ec9b4-8a72-4587-8eb9-43b66ccdd047		sale_deed	d8619f43-1c7b-45ef-a018-20e899e4a6b9				1	upload		2026-07-25T13:25:07.825891	sankara.telukutla		c68aad95-e52a-4d82-8a11-9805ca16fd26
eecaf77d-7b0e-4d74-9ca7-4f15bea9f780		gpa	00a6349e-dcdf-43cf-9255-e6f250fb23a7				1	upload		2026-07-25T13:25:07.872543	sankara.telukutla		4d5581ca-0e6e-44b2-99b3-b5436f6b65f3
40daf1a0-8814-408a-ac34-96f553475fb3		other	12c5253f-7250-4a20-8521-8a02104bc5b2				1	upload		2026-07-25T14:25:33.861339	sankara.telukutla		4d5581ca-0e6e-44b2-99b3-b5436f6b65f3
b66b9edb-3124-4784-aa04-14322e3102e1		photo	b679e7f5-69e2-4567-bca0-d104f91d39e1				1	upload		2026-07-25T14:34:18.887960	sankara.telukutla		4d5581ca-0e6e-44b2-99b3-b5436f6b65f3
3df9b0bf-1d51-451e-88c5-af571990c04d		photo	12c5253f-7250-4a20-8521-8a02104bc5b2				1	upload		2026-07-25T14:37:16.923205	sankara.telukutla		c68aad95-e52a-4d82-8a11-9805ca16fd26
dfdbdc08-3d36-4274-9ac3-b33fb8128d8e		other	b679e7f5-69e2-4567-bca0-d104f91d39e1				1	upload		2026-07-25T14:37:35.709681	sankara.telukutla		acb44db9-4c9b-4960-81c8-0676061e723c
ebdb1f6b-454d-4af4-8a1d-7a8affaa089a		photo	12c5253f-7250-4a20-8521-8a02104bc5b2				1	upload	photo	2026-07-25T14:45:01.086540	sankara.telukutla		41fbd988-bbfa-496e-926b-285e2ca1b51a
6666dcb7-ec29-45ec-83c3-bc151ddc085b		photo	b679e7f5-69e2-4567-bca0-d104f91d39e1				1	upload	photo	2026-07-25T14:45:05.397316	sankara.telukutla		acb44db9-4c9b-4960-81c8-0676061e723c
eb37c728-a045-4a35-a0f4-0f5be69e71ba		video	21744d10-d99b-46b0-aac1-adec6c6f6912				1	upload	video	2026-07-25T15:07:14.922212	sankara.telukutla		acb44db9-4c9b-4960-81c8-0676061e723c
bc4a32db-cff7-4cb8-b501-f9de0870222e		passbook	aa789b7e-9d36-4e7c-839b-66b6bf5e6d9e	1422			1	upload		2026-07-25T15:58:16.782352	sankara.telukutla	0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	
df240e1b-94cb-4e60-afcc-1ef3b77c80df	51140d00-55f0-4688-b0ed-fad4c3383c56	video	1e6f8e07-9b22-443a-9ea8-c661a07de572				1	upload	video	2026-07-25T15:59:10.764784	sankara.telukutla		
e3f46cd7-c303-4735-8f84-8925bf3ef496	51140d00-55f0-4688-b0ed-fad4c3383c56	photo	ee0e629c-2c3e-4d1f-82fc-cee8cf36c791				1	upload		2026-07-25T15:59:10.983390	sankara.telukutla		
ff112b87-1221-47e6-83ca-43ce8bd54d7a	7ff59380-12c8-4ebb-91af-7a6e4fc5ff22	photo	b679e7f5-69e2-4567-bca0-d104f91d39e1				1	upload	photo	2026-07-25T16:09:12.471204	sankara.telukutla		
49234b7d-7994-4889-8dad-c299cd82efad	9b6d23b6-d199-4114-865d-13bc7f0f2ace	photo	5d361b33-ad2a-471d-b919-70c1dc421271				1	upload	photo	2026-07-25T16:09:18.783551	sankara.telukutla		
70229fd6-320b-4b0c-814c-69327f148b7d		passbook	166415a9-b1c5-4f97-8d5d-e9ba0c2ad617	573			1	upload		2026-07-25T18:19:44.949796	sankara.telukutla	4636d51d-34fa-428f-95ad-78dc0a565700	
5048a296-37a6-48c9-baca-819a092bc9a8		passbook	02672173-ab2c-4954-8499-6e6f75ef86b8	593			1	upload		2026-07-25T18:20:27.142212	sankara.telukutla	11020755-9293-4e72-b4a4-f1f1668ecfa4	
70fca6c9-a047-478d-9ebe-214f08a1cb32		passbook	32209a62-04ad-4ae1-8297-6d191866fc34	5001			1	upload		2026-07-25T18:21:20.919200	sankara.telukutla	e5ed3781-8b71-4dfe-bf3d-d449db24d85c	
8db894c2-dc50-47ec-a572-165fae7120c1		passbook	673ac97d-504b-4e12-b69a-f6ac3972db0f	567			1	upload		2026-07-25T18:21:43.470974	sankara.telukutla	93e0c0cc-aa2d-4182-91d3-88ee07308832	
\.


--
-- Data for Name: family_members; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.family_members (id, owner_user_id, name, relation, gender, dob, contact, bio, is_beneficiary, share_pct, invite_status, photo, created_at, phone, email, is_self, father_id, mother_id, spouse_id, present_address, aadhaar_masked, guardian_name, guardian_contact, marital_status, spouse_name, spouse_contact, spouse_status, kind, status, invite_token, parcel_id, legacy_beneficiary_id, is_minor, group_id, role, phone_verified, email_verified, invite_channel) FROM stdin;
b01		Sita Devi	spouse					t	50			2026-07-23T07:41:17.680706	9876543211		f												coowner	accepted		pc01	b01	f			f	f	
b02		Ravi Kumar	son					t	25			2026-07-23T07:41:17.680706	9876543220		f												nominee	pending		pc01	b02	f			f	f	
b03		Priya Kumar	daughter					t	25			2026-07-23T07:41:17.680706	9876543221		f												nominee	pending		pc01	b03	f			f	f	
b04		Lakshmi Naidu	spouse					t	50			2026-07-23T07:41:17.680706	9876543213		f												coowner	accepted		pc03	b04	f			f	f	
b05		Venkat Rao	brother					t	30			2026-07-23T07:41:17.680706	9876543212		f												coowner	accepted		pc04	b05	f			f	f	
b06		Padma Devi	mother					t	100			2026-07-23T07:41:17.680706	9876543230		f												nominee	pending		pc06	b06	f			f	f	
b07		Kavitha Reddy	spouse					t	50			2026-07-23T07:41:17.680706	9876543231		f												coowner	accepted		pc07	b07	f			f	f	
f9f107ff-94b3-4b77-8557-2466ae666b68		Praneel Reddy Telukutla	son					t	50			2026-07-23T07:41:17.680706	praneel.telukutla@gmail.com		f												nominee	accepted		86c78df1-1100-4dfd-9274-0b1236dd4ccf	f9f107ff-94b3-4b77-8557-2466ae666b68	f			f	f	
79414665-3e77-4aa3-9e85-10bbfedf382a	sankara.telukutla	Praneel Reddy	son	male	2012-09-16			t	0			2026-07-16T06:59:18.357437			f																	f	75fc1d4d-1c31-40e2-9b0a-e42378b312b6		f	f	
31fc04a4-76fb-4422-bee8-b663a8ed1945	sankara.telukutla	Sloka Reddy	daughter	female	2016-07-05			t	0			2026-07-16T07:00:02.789212			f																	f	75fc1d4d-1c31-40e2-9b0a-e42378b312b6		f	f	
81f95a84-f83e-4f6a-ade9-349d1eacf613	task3devuser	You	self					f	0			2026-07-23T07:55:59.635321			t																	f	faa9369b-ceee-41f0-aaea-96ef58193c50		f	f	
0fa208cc-2feb-45d4-b771-7421b253a986	sankara.telukutla	sankara.telukutla	self					f	0			2026-07-23T09:59:19.669068			t																	f	75fc1d4d-1c31-40e2-9b0a-e42378b312b6	Head	f	f	
9e705a30-debb-488d-8462-2026b50c597b	sankara.telukutla	sankara.telukutla	self					f	0			2026-07-23T10:00:59.042461			t																	f	8bd71ece-f339-42eb-8063-a56809c64bc0	Managing Partner	f	f	
05761134-25a8-4a78-a71a-c5248841190d	sankara.telukutla	Swetha Telukutla	spouse	female	1983-09-06	swetha.telukutla@gmail.com		t	25		data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAEAAQADASIAAhEBAxEB/8QAHAAAAgIDAQEAAAAAAAAAAAAABAUDBgECBwgA/8QAQhAAAgEDAwEGAwYFAgQFBQEAAQIDAAQRBRIhMQYTIkFRYRRxgQcjMpGhsRVCUsHRYvAIJDNyFjRDc+ElU2OCwvH/xAAaAQACAwEBAAAAAAAAAAAAAAADBAECBQAG/8QAJREAAwACAgICAgMBAQAAAAAAAAECAxEhMQQSE0EiUQUUYSNC/9oADAMBAAIRAxEAPwDxsXJABJ46VJbMTcxZP86/vUWKktR/zUX/AHj96lnHpvSNV1GzuUtrabZCzAkMAVHqfauqWh3wIxZGyMkr0Ncs0DTrq/vHVLeQpkBtpAO3PJGetdShCW9use3CqMDj0FDhvQzlSbAYBDJrNzCFKpGoJXGAWPnU2rCOGweQlgiEEjNQ6MYpJ5Zw/BJzzWe0aCa3jt0O4SuBgCrbBhNm0awl4/wkDBotHUjKyg4oHYAFgUAKMDjyrR4VIJwQSaq6O0M4pS27lWxQly/dXBVlI3crX1soIdMspUjn1ofRGlnvLyW4beEk2wbvJfOq9kEt2Z4YUkVztY87fL2oozvGokGXOAMbcZqDXJBb6eZFA3lgqfMnFE2yqDGpydgzk+ZqKl/RKZHNHaXGsW11PAY7yOLgdQo+frSvstaWGpdtLjVbv4dLS0lLW/dwos0rjqcjBIz5tmmGxbJpruSR53kPd26k7VDtzyfQdT7ChewXZfUINZk7y7S671QivyNozk8eQ+VL65Db4L3YdtLbtBfz6Jd6Yz2EKd1IynAVuMbSDgn5jiqTf9i7nS+0dzqF7fP/AArf3kMgCM8bdRwedwzzx51Zf4Lp+hzMmg99c3rsxkll4XJ9PT8qAh1I6UlzHqF1HJLJl0SNgSPUHOAOeOtdLKNPfAtbsZo1/Imp6dbTywx53nvO7LEnO7Izk5PTNGRyaj2emitGtJYIZYyyLI3fM2DyRjqfYVXE+0RdBubxZbCXadjxQJKSg48R64GBj581SO3Hbq7kuo41F0rBzKVlxgbuVIYUSdpk632dy0fXr+MfHWmo3F1CQVZAANuOoKY8hikPba9tZtQxHq7JKyKwdn8AZum4Y4GSAcDGa4NP2u1S3uF1ezu5o5mZnj2vuOd3O724P5ik192pv9R3SXV05dd+3A6AtvJHocgD60VbKvGdR07tdb3E0kL38EFwp8aTFV9uCSOfarpZXyT2vfJcd6MDmPxfnj/5ry7bTPd3mJJjvfLMzN+I4JqbTNf1TT7gS2d5KjcAZbIoqrRR4z0trSz3UaQxKZLc+LdGQSx9MZqay+Ije3763kVtuxVYYwPWuRdlftVaN1g12DaDwbq3Hi//AGXzFdU0DtZp2oQhre8SeI/hlXlT7EdVPzok89Aqlz2PcguWaPp0Nau0LHa5IzW8eoW7+FiF9/I/WvriKK4QgcEjAZTzV/yA8HwWPHhcfKozG4lDK56cgmlb6HdRv/ymqyomPwyJu/XNH2drNGiia4Dso5I8zXKn+iGicmVVyear+oWMsupySCVlaTnkZxwAMflVglEqLuVgQKUXNy5v2MilUhXkjoc81O19lOQaKUtrcsEUjgINzAHGTiiPi72Jd0kZxgnp8/Og9DJXVbmeTaO9yY+eSM06LKRuBBHtVp00Q9nhBkAYAE4PmRU9rHsu4WzlRIP05ofe2Mf2re1J+JiyeN4/elmOHtfs3rlnqlqvcwIs0aDcg6qKZNdwjgxyD6VSPs4ERa7uYwRIpCcPwVP+n6Ve1J2gFaCnQ1aW9GiTWZbKyr7gjFbS29tO8btsZozlCGxitdsLSFSq9OeKzJa27D8GPPg4q3swfqTfDqRnJB6ZFR/CyjCiUED1FRfDOp+7uJVHoeRW6i8j4WdGz/UOtd7I7TJUVo0Zgu5j1APWh9I3IjSXEEkLE4KsKlE94h8dujjz2msfGx9JoJUHnUcHaZFq3dSzwR7wCSWUZ6mjPECp7zoOTUcV1ZSkEFcjoHHIrZxHLG5DqEAJLZ4GPOoZBV9abVe0WpHRLJY0Fu42O5+7QkjLNxycYGPU1d7Hs9PpGjltT1qHRdHSPc4LF7m4Y9R08IJ4wOlOOwOlWdtCbxo4xBDEWaeUBQrkZLsT1b09PSuVfbt9qSapZGw0Q2k9oxPeTTczORwPDgbQM+/9qUdNvSDSadsvttTR5LjT+x9jGsSYRb24i3SEjrjPH6Vx3U+23aHVtQuLq91W5lluFZWy+Bg9cAdKV9xLe75JLmOJFbL78gDPnil7FMbY0bOfxk9R8vKjzCQRIsc2pG0Js1uUuIZSjSsjHk9GGfcA/Q011i5TU7KPu4Vite/RN7vh3GBhVz7c+QH1qkJwQckkVM88kpAZ8getWOchmrbDfywwbVii3ICDjgE+nX+9Jpzx4TxRkgGMKCOPzoORCpx1qUdoHDujZDEEehr4SYxXzrzmtSDViuidZMiidOv7nT7gXFnM8TjrtPX50ADgV9uNSnoo1s7P2B7fx3MkWn6sSzu21Jg23nyB/wA102OdR1Z0PkduQR9K8nwztE2VNdz+ybtMdb042U90gvbYZ8fWRPI/MU9gzJ8UZ+fC1zJ0NL7yW4U/WiFu32+TUN8FPLH3gjif/UDnNRLbCPO63ZfkCKbUxXQm3SGAulx4lP0Nah4WJJ6t1ytLxGq8JdSoR5MQw/Xmtws4U4kilI6eErn9TVXgRHysM7i2LhxHHuHQjit2jjKgBSpHmOaXLNMD95bMvllWDCtxcAEncy465UiqPASsp4hKL6D8qmsEX4634H/VX9xWFRm5Ck/St7NCdQt+cferx9RWeuzSPbNvFDA5eGGJGPUhAM0Qsxz+FagyazzW/WCH2hZZH+yZWAYtt5PXmt5GSTHBAofOPOtgfWhV4WJ/Rb5qJy4AAyWr4upXOOlRbuKxmgvwIZdZ2iZHLOAcCtJmbvFXBxzWnHnWwoVfxq+mSvIf6NWSAgtJGG9sYzR9jocmt6jbw26R21pEymbu8heP5R5k+pNSaZpk9065IjRuQW8/kPOrbo1rBahooM91CwZwWPiIAJZz0x14rK8rGsL0mMY69lsQfbdcx2Gj22mqq22lwZ2pyvfSEdTz5E+5rylrk8T3Tx25aQkkbmHX3rp323doLzVrh7qZJ9srO0Xesc7AeGUeQ6fPJrmFrau2mzs9vma5C93Kc/dx55I9z0+VL4lrkamRLIcho1QMT5n960VJAjKONww2POrPFoMkJWJge8xl+M49qPj0RVj3sgIBAPzonsFUbKhbadNKCVjYhRljjyrL2rIcMMe1XiK2McbonhVxhh6gHP8Aahbi0jPDKCMVDYSca+yoLbOay1mWGferE9hGOV8NaGzVR1JFcqZNYkVebTyBkGhXt2XgirebUHIAANDz2CsMFQKt7AnjKe6lSc1GAc9ad3+nlVJAzik0qNExFXmhe5aNGOOtF6Lqc2l6lDewkkxMCRnG4eYoQkOOetDkENzREAo9C9ne1mn6hbLPby3FqHGSqTEFW9MdKfW+vXO77nVi4x+GeIN+oxXnPQdTkspcA+BuGGf1q/dk531G/igVTIN2XYnhV/qNUr2l7TKaT7OsjtBOQBLDYz8/ySbT+RzWf45YiT7+yniJ/oII/Q0KdL0Z4xayQWzI52KHwSx+fWhE0E6dZtbQmN4QWcd4CxUH3qZ8nMumDeHHX0OxrGlPgjUDCT5Srj+1FxzpIP8Al7mCceRV655o+h9pxcJJNfJLpzEnDr4yvljjIo2bRWVhtOM+YHNHXn2u0Bfiw+jzFmQLjLAVvZLi+t88fer+4rT431j4+dS2lysl9boFwTKv71RdjB7VFfc5rbFanivTJoS0zIHNZzWM1rnnrU62ds3BGKzuGOlR1kV3qR7G26mmjaY946SSt3UDHCMwPjI6gfLzpYAAMscCmFtfXMzfC6aE7+WLa0pIQRJjkA/yjzLdetKeVkcRwFxzt8jYCFb0Wi6nDcjkymOTKL5Ihx/McdAeAOaYavrGkQaVfQXt5HDZWqB7mVCGXd/TnnngCub9oe2NroliLfRZmuNQaQpPcRRBVUYGFUHkk8tnryM8nA5hrvaN9ZSSB2uFtlKgxCXgsvU+5JJ+re1eWyt5K2zTx4xh2qig1vWLS4mme6t7i4ZlZEwkUAPCIvkTycEZ6HzpzoWiWd1q8LR825k+7Rl8Wc5CnHUDj8q17I6XPdW6X88dxtV+7XYcqePwgZzyAF6eQqx6Bcxxdo5r67HdKjHwjIGcY4P+80Gr1wPY8YF2q0u3tUie2tJIixYtI+T3pHVjnj8qqUy7yWIHPoMCrL2q1OTUNRlLqEVTtiCngKOnSkwhyCRUTfA3OLgXNFx0oaW2Lcim7RY61G8ePLire5PxoSG2JJyMVG8HBUCnncg+VRSW65HH6V3sd6CQW+D0qOSIeYp1JEgHHFBzovTrmp9yrhCC+hBGCvFVzVbQHJUDNW68UcilM0AKNnmrzQrlxbKVLGysaiPoaYahEUmI6c5FByDem4dR1FNS9mdc6ZrFy2KvH2Xavcaf2ltUUM6TnuZEH8wPrVF5Ubh5U40a+a3uIriNdzowbHQ1d9ATvPaHVYDerZxSxRPG2zJxuJ4IANO9K1iG52QXJPxPoqEj51wrtd2olu2gSxQRklXMvmT6fnXT/s41abUl2yW5U7AWdsckelCnftydSSReZJ7Xd3bXESsf5WYKT9DUZtwSMc/KlnaXSprtICioxDdNwzUXZ7T3tNTYSKRhMjafCc0b0betAfZJbPHz7VOBn1GRUlkW+PtzwPvF/etY1MmTgHHB5r6FSt7EMdJF/eoCnpyHWdYh4F4zHyyM0fB2g1hF3M6TD0K8ik7Y8qKtIYJ0IEjBlPiwaJN1+xupn9B//jG8ibbLaRkH3wakTtzEH2y2Min2IoCazHCyFZUPQkcig59NixzlSPU5FEWbPPVA/jxvtFli7baU/Eiyxn3U0wte0elXDYS5XOM8nGBXO5rSMNsZgSxwAKMs9PSNOCXQHDAL+Nj0X5Crf3PIRH9fEzplpc2txFJIHYqFyrLgrjOCTzwPekvb7XV0ns8tlBIA95JlF7shnUY8XIxjOMf7wg1J/wCBW6wXKqzuveRRF/8Apk4w8mOp9F6VTe02p3WpX0l5fXZeZRtiHOMeQGenr0pXP5d5FphcXjynsD7S6teXWy2WXu40ziOI4QZxngefHWgdNMkk0MWTsQ4Az51r3ckiyyLGzLGB3jj8Kj51YPs60mTVtftreKPdvcDp1zSbekNqVs9Fdhez6t2MsJfGsTsiKjISOuTj9eaq32gW9u3aOa2tWDpEFj8A448jXc4tPtdL7LWsV0+NPtFB2/zSYHz8zXK55LGPU5dXuLWZo8ndsjGELcKBxzj1pRp72ExZOWUXX7WytLC3ggy1zgtO4XAyfIeZ4pKjbRg5q29tb3Tb9ozaxMh5JLgA5J9qrRt8rkGrpDk1wDE5PNZ27jW0kfdrubjFQG8OwpbqpZhjcR096h6QRS66MOpBxxmopThT6is20MzMS0pYDrxREtudgbHBqU9kVPrwKpj6ChJRt5603eDAJxQktvk8pgVZIC3oSzAZ5FByIMlSBTe6tiTgfSl8kLA5POKvoDVIqXaS2Ee2QD2NVosysRV71m2NxbvH6+1Ua7jKyMrDDA4IpnFvWjP8ify2jMTjd14oy1KxSBlyPMUqVirUfaygjB5AowoxlbxPdX0cW1SSQQTxiuq9irqKyfuoBuVehc/i9T7CubaEpkuQAASQc+eBV/0m2ZcshK4Awap6vZFPg6bDLHPtnZzkgEYJxW+mzW8l/OI3dpEUIwI4+lLtOcppCuVCrszwxz+tFdndvcGbBy7ZyRzT0LbEaPGoWIIXDEivrYn4qInpvHT50KOODU9ttNxEAv8AOPP3pMePRb30QuI4kw8jMBgHpRE2l3sUzT2sxw3LBTg0Bo2mhNZiBcMUBdgPLHT96uBUqgOM0SfyGq4Kw15cW2e9M2eh3DNRLqULHMpuXHp0FWeaFXXLKD8xQk1rABllUfpVtUuiu5+wGxmgvJ0g0/T7iSVjhQq5YmrBe6lbdnLA21tbJf6yfCZAd8NkM5KqOjuehPQeVDWEgsh9yWj3fjdThiPT2FQdpXt7u1WWBzDqczd3IQfDJ6yexAzn1+dDyK32WmknwVeR7zW7zLkyEsOnVmPHPmaU9oUlguu4lRllThuQd3y9fnVrTS4tNtkun1BQhILJFnvQMY48v186qGuPaSXjrYLKIEGQ82O8b54OPypW1pjEbFVxcTSqkAbESniNeFB/ua9Hf8LnZiOO3ftFexkQpkRE+Z9a8/8AZvTJtV1mzsIELSXMqxqAPU4r19qV5ZdmNIsez9jECLWFVHkCwGck+frS2bIpWg0Q30WfthPp1np66hr+uGwAyEtYFUlVPl5+L38q89doe19s+oSrDczPAGIVjwWHTkDinHaq5/jdw3xbO0YbwZOGx74qoX/ZWwuJQyTzRkn1BFCWWWFx+LUom/i9nePvaRdxqaO6ts7VkTnpzVduuyTwnMV6jjPRgRxUNppF1BcAvIjKvvVnc/sPMWuGi4yW0VzFtYBgetCy6WgVlhAjJBAOK20sGJQCSVz0zxTVmXrwBSzyaY0petCuC0FvFj8XqcdT51iWWHuSxGADjpTCRlC54xSe8liVmw3DeVXWQHUsBvtUs4AzSbgPQDrSK87UWgJWONh5AkUXfadBezNmRlBPOKmtOzejADfamXH9bZzTCyyhW8eR9FYk1zvWJRlOT0zyPpW0WqkShLqMKrdGAq7R6bp1um2Gzt48DyQUBqVpZ3ERWSNFPkQAKss6/QP+vX7K/PbpMglj8Q9qp3a3TdpF1GpGeH+dXV9MubV++s33qOTGehqLUbaK9smYKQG6qeqmmYpNbQrlhp6ZyV+OvWpIX2sADzRms2ZtrgoR7UEF3LkcEUdPZn1LT0W3scyyXDofxBfDXS9Dizb4YcmuV9inK6qrEcbfEK7F2fjZu4DAYyD+tFidgMj0We9TutG7jI5UL0+VHaREYrGFT/T50u1Z891GBkM1NFwsYAGMCnonkSp7R4gblsjzomyiJuIiTjxj96FxzRdnMPiYRg/jX96zHs0lo9Kdl0JurmdhjogOPLr/AIqwllxjIpSp7yLulmaKQcqwOM0DNNqkHmsyjzxTUOYXIek6ZYXYEYB4oJ1E05yfAuM+5pFLq9yiYe2IPqrVmLXIo0Cssy/kRRfkh/ZX46LCInmlSJOrsFHzJxSy7srodoHs5Fw8LmL1Axy7fl+1QNr8SwsUlDSY4UqRUmj6lHGrXNxKJ5WypBk5OSCTz6n9qDk1T0mWmWuTPaEIFcvuMap4tvXn/YqjTiNBIBlucAn08qv13LHc288kqYBTBwMZJ8h+v5VVL+zia+fYGSEyBVRjljn+3vSOePV7G8D2tFt/4fdLW9+0Sxn8Zhs42nY4x0GBn6mux9qpRdXcl2CJGjkYYzxxjNUD7BoJbKz12/hQ99IVtIfDzn8Rx+lXG+trzT7GRLuJu8Yl85z1rE8mnVmpglJclF1zUUS5cRIZGJyETyH+KrV/rt7FnwQxY/qOTTbW0f4CMh1geedhI4HiUZ6n0AyPzqj9s9GjtL6Jhfl7eZQRIX3DI65xTGDFLXJ2XM56Gba7qMudssDfJc/3qP8AjNwjZuIlxnBKiqzYLa2+qwMXaSFHDSMBkFf8061O5inuN2m2sqJ6P0NMXglAoz0ywWOqASI2fCae9+ZoRtfnHUeVc+t4pgELkp4uE681b7RnitBnjPJpZ4FsZWfglkuLiKEpLIGbPBx5VWNav3WQBWwM80ff3L5YHOaq+oyb5yHPWrzi0wWTLwFz6vJAgCEFzQba/qG7x33dgcADApZeQXjOxikTafM/iNBaugl+GAtTH3YKyAHJbPnTMYpErz0uizQ9oLw523Ql/wC7BqVtdlYhZ4sj+pTVPFpHLewWlt3ilnH3shCqq+efenWvC10ycG0v1uUwPBu3EH/FWvDP0Rj8in2Wiwvg6Bw29T+lTyQoxYgcMMkCqto10kkhkTKq38p8qsUM5KgdfegynNBq1clN+0DT9kCXKrwGANUtjtibIwfKurdqoBcaBcrt3Mq7x7Y5zVB03T/irtFI8PPNOp6WzMyRu9EXZSRob8PMGjXaQCRXZuzetWYSF3J2qANyeIdPaqVax20bm2MKuka5yRzmjv4SkqibSrn4aXGWQNwT8qd8Wlc7EvLxej0dEutRs7u7thBdRNjORuwc1Y7ciSMOcjPTmuIn+N27Hv7cXAHmBTDTdd1aBgkBuox0CA7gKdXqIuWef6ltP/Nw/wDuL+9aEEHBBzUlrkXURx0cfvWWaB6qtgHjVwkb+nPSiu7t5l58Leh4pFBLZXJLmIjpuwcMPf3o9bZUj76C5l2YyATuFO6TXQblMHu7PdcNsUEJx65NQPYIwB7sBx5HypzaRyxxBXCk8nK+9SSrHIcbfEaA8OugiyFRuNNzMVC4Pma1m0lnjGEdQvng+v8AnFWiK2jdmO5doONx9TW7whbNVSYEu25l88Dp+5oaxMu8iKmbS9gso41l3KZGc4brwAAflz+db6JatqOqWsUw8BmAJLdBnrVgvLF7rTHMHDwMzOOPwkdfzX9a+7BaXc3Gr2gMW6NGEj4H4FAzkn+1A8idS9hsFbpaO2/8P+jx2mnXE00XilunK4AI67c/pXW73szpl9D/AM9bo4HOP81z/wCz6SOx0ezncYjYk4HHma6LqUkk+jGaC5eBgu4YcLxj/fWsvx3Fy3XYTzVcZF6vSOPfaroGj6RYzS6bEsUrZjkaIkbl8wcVwe70PTHYkrIOegPFdh7fa1JJvt7jZM4zksPH+Y6iuYXTDcdqn6VEy97Q9j4hKhJLp2nwoRFCM+ppfcKVPAP0p+ttJOTlCF9TUkOmRk5PLZ86Otrs56+hXo9nLNIskvl0GKst7bpHboMZOOantbRYgNijjrihdXlYDB+gFXSBN6Ed9bjDGqlq0LBztHIPFWi7lfJBzSm4hVs85z61HTOa2hPAhljweopjYQxMcTRgjoMjNRC3KynaaLgOCMg5FW3sGp0yDUNKsiXYxnk8Y4xxS1NKiWYFYzkdCelWuJkdQHHNfS2mQdmMnpVdsv6r9FeS0CsMYXFMIS0a85Pt50Q1u24Ii5Pm2OlTx2qI64BY9STUzoik0iG7jY6bMZB+OMjB9MHiqb2b7o2/OO8B49hV41Nh3BQdSMmuf6XG0Ehkz+NuPkKLT3OhaV+eyyLHm8uSvmnBx61v3k9uylkR18iOP1rNsQZm4J8C5waLMsLKYZY2UHo23OKe8GWo2Z38hX/RL/Au1uTJCJEjLeoBzipu+BDEqOmeOKUWNy9jctHJhoSeo/emkssElu0kZDADyrQTM3XJ5zLKcNkgj1PJqW3l3XEQ2/zjzqExmpbJD8ZD/wC4v71mDx6Iit4yAwkeFx6jFFW0s0Undq4YNywXocU/e0jbjAPpxQz6WgTcxXc3O0eQpqX69DPDIYtRDMEbG7zFGd6HdIYkLzyNgAdR7f3oVNNijcMI/vCeOcn8qYGyXSrfvlldr2VcjcATHnrU1l3xor6pBMtki5tIVYtAgaUhTknj/NLbq3JHh6+/pR2irdWdrcXj3kvxsoMhcud5XPIzn8THOD5YpZqFzqMqLAiRnD75ZQPE7Hy+QHA+tcqRRkd1KYLGSNdxUBi4D/8AVOCFGPTn3pn9m3xM2olpY3igs7WVk2cLu245z1PNVzULqSSZF+G2o0gwB1wOfrXV/sQsbi8l1aaOwW4nFniJJuAqs2OB05wfypPzVPxUxnxq1klsuXZ6RZOz1ioO4JMQSPPCg/3rGqdpb2CKZYpcEk+WQBUun6bJo+kw2UyhbpZGkkUHI5JGR7YxSi8hh8ZkwQASSR515VNpnompoo+omS5maWUlmY5NL2tBksy/Knl6EMpKjAHGKFdQfLinZy6OePYreICP8GPSo7W3nnu0gt4HmlkOFRFJJ/KmdzGoSrZ9k+qWuhz3msS2y3ExHcRZ/lHBJ/YVdZNvlg8kOZfqtsg0XsdqKWlzd6ovwEEMQcGVDliegH61zjtACbmRk6biBjpXWu1/aqfWY3V5lG4f9NRhR8hXOrvT2cszkbTVp8hdIpHj01u+ykXTENz1oKdlK5TrVl1XTYydoXccZ4pUdKdAWKso+VFWSWUvFS6FFu4km2Hg+VOIrIkA7Rj1pdfWht7iGRRg7x+9XCyiUwqSOo64qatLoiYb7E0dqFPPQdaLSAOuSuE6deTTA2SOxJBA8gKiuxtTaOPpQavfQRY9Ac5RPCFGB0oR+EZv0qSVi5Oc1Cw8DZPmTXQyt9CvVnK2M8g/EVOPrVQtx3k0cUase7bDVZu0Em20CZ5dwMULpscaWr7FAlfNNJ8CL7JbFQ9zPzyCq8fKjtjpnap3j8Joe2SGBhJAJcPjwP1DY5HvzRa3LxgZG49eR0ra8KNY0Ynn1vKbNNbSgLc2hRgOSy+Go57CAW7NZ7jlSSFbIqJ9aKkowhbnGHBFQXPaSbTYDdstpKEORGhxmn/Za5EVL3wcPxW9qQL2AefeL+9bKIgvi3E+1bWgzewYH/qLx9axDSPWm8JGwVm71vIDovmc+taITu6AAHBx+1NP4XNa24kuEIlkPhjzyB6n/FHWtvBpxjluT9+p3AAgiMY/Vs0b2DoVRobJXkljHxXXG3Hcj/VnzPkKCR4mkM067sHKo3O8+pojU7uW9uGCh9pYsc8s7f1H1NSW2mxIhuZr+3EqJvWFcuxPQA44Bz5ZzVlwirYPNcyrLPAHMjOPvm29ScEgfLGPzqO1EkscttBHuaUZOP6VBY/pW4Se3ieK0ljO7wTOGw5HTz5C+v60E5MEjxq2OqMVPBHn9KsmUNbTT0vtVigLBVVHdmPkB/8AANdF+wzWFsO0t9Zs+VuYPDk4zsPT8qpWiabqlyLvUrGzkeG2jEcsgBwQeDyeP5hxnNbt8ToOqrf9ELAKFk5ORk49cY69KV8he8OUGxV60mzsGoXfx3aeaSWWMGWHZFCG5VeSCfypDrbDuz4sZ6e9a6LqFvd63p15AsgM9uiy7yDg84PHQdeKj7YRvZ3kltwYyxPXIHvXlqlquT0mJppaK0XyTk8g1q7DB6VFI4AzQksx5okjPRpqN3s8IPNDaZrL2YmhdiI5PFn3r6WIyHcetDXFplenFNTMtaYCraYPd6xcG8EjTMYgfCkcec/MnmmsGoi5hAUnBHNIpIljI3Y496It7iONCIhjHnUPGl0TORvs3uS29mNwYsHggAn9aih1WJC0N3cxyg8BtmD9ccVrqbK0I5APnSSW1yxdTnPlUqStXo31GaG4u0MQyinrjqaeaVcq0YVmGR0FJYbYx4JGM9KJQFMOuRV31oH97LA8gCZPFL72QE4HNCNf5Hdt1PWtHlyMg5oei2yOVs54qAlSCCc461mVvF54oeZwiMc+VElC+SuBFrzK80aY6sKmtbfBEwYYbgAHyFarEZrgyuu8LwFx1oy6ifulgjjESxIE2hQDnzzjrznrWlj8Wra10ZF+ZOPe0C3ssvxEawPs2DOcZyaxDNqAyTLFJn1Wp0tyuCVOelTKgyBitnEvjSSMbLfyU6YNJcXWMSWkD56kUn17T0vrCUJbG3nGCgU5D+3tVkMWeeMeVYWJSMHpmjU/ZaBp+r2jh3cRno9b2sO2/tirZPfJj8xS3JXnJBorSpGOrWYLZHfJ+4rGNA94S6Xed21zcwtLKgxgc49AB61XZrW9lnzJayInqyHCiuk3Wo21qWEsneP/AER8ge1KrntBcM21IY418gVyaz8Xn0//ACbFeF/pRJZTFGYre3aPdw8h/G3t7Cs28NothKZ3kgdmAQmMny+dXWPWSRvu7SKSPJHhiG4nH++a1a/srgZm0SPB9OSfenF5m10L14dL7KDDZRy3EiYWaNULtKCQFGOuPX2qs6tqdtpdrKkihp8hY1J4x6/l+9dXuoez1wjCSwaLceNo6f5rln2nW2k2vajRbdopvhiQ8zAcldw6Zqf7KrpAvhcvkaWPaLtFe9mzp7fCWlpcMsqIqneNvn186S3UmqQg2lzcZgmwBMikbWB8IY+nJ+efaumW2m9k4LlEvL9o3eKONQ44V2XIJPyVjSPt8NI0TS2tra4W9vb4Z3gEKqE8DaR1BGevmKHeaIX+hsPj5M16kl0PV7ixTSIJZZHWKRIZQnCRnnHzzk/lVz7aneglwGJHmcHFck7JXVzdXBs7i5VCniUyMFww9/rXVdVdp9FhaTaXCDODkfpWT5UrikbMY6xX60UadyOPPzoYNzzRNyAHIA5zQF23doW5PHQUGUMNmfjbYOVMqL5cnrUklzakbTJ19BVF1CwN9cypMWBfJTDY2mtdNtLqBxby3c6snAO7OfzpuMf6YB5VvlFsuWhP4Yg496iENqybkfumPJBPB+VIu61ON2xduwzgELn9KzJ/GUUBJY2bHnFyP1onxsJLT6Drj4UPmV5Gx5A1GrWZkCCZlz/UKVyPqo/6iw5H/wCM8/rS7UJL5iWMwiOOAEFSo2Dt6LLcSRoq7ZlYAetb29xDJCybhux61z26a8mkWNbmZnPHHA/SmGkWL2Mxfvnd2HiJY1zx6XYFZOeiwXBHfnB6VvDMNpUnnyoaE96rSEkYODWN+xsZ60PRZ0SzSMGHU81Dc5eL0A5x5mpl5wWI+VaXGQpfHCjdj19qJjndaFM1ali2S6toJ/hpyVCoHY84ySAAcdDkjrinaQlSS3Xz5zVHtFOofxHUWKhSwChm67WB4OOcny966GcEklDj1Brc8SnW9mJ52JY1OiKKPIycY8s193ALHaoIqVMEgdBU2QuNrYNPGaDpbesf5Vn4NPNaMG8jIbPtX29h+Nc1ZNEHlwhiRgk5FTafmPU7Zm42zIf1FaISHGYzwPMVJZtu1GByAMSqcfWsZGke69S1lLorLBFG+8434xkge3n9KAl1i/jkWNRaSblIVJFDEAefrSjVu0YmuI4Yx3TlyqxxjAbPQe1AXWod3epm7h7+OQC4ZsYTjnOPID09aTnFKH35GSvsvNzrXd6LNd20VpFdQoqtFkuhOOCATnn9Peqhc9r9dieVptPWEqM4tpsbfDnIB6+uKqVjrixW+s289zIySw7IZUQnDbwRx5cZ5pTozSmC674Szvkd0SpJPJ3eIdOKIpSI3X2zoPZ7tDe6xOzXLo8luuSIyCrErkNgYOAOvTpXOO3OpjUNVS47+4kaIYAkA2gdfD5/nTDs32hh0S5eQIpkjCtEzKTyE2lTgjg5POarOpX8t3bxxyxW67CSXSPDSE9Sx+nSoaJS+y4/Z3b3Wqa8l/qbmazt4zdvuTvlcoNqqwyMckD2z71MvaDTv/Ew1LWrVrq25VYomKBcDhgDngcce9DdgCtn2E1+4j7mWWZ4YjuiYmNTnOGzjn0x1APlTH7MuzWk9oteM2s6jbwW1oM/DySbWmbPHJ/lGMn6UjdpZG30jb8aGvGbntkOnJFqt3YQ3EzW9vdvKhmdCSVaQneR59f0rtFt2Zs9G7JQQaabl7dCcPctl5AerY6Kuegrn3bHW9K1n7UtKi02FZLCxWK1AiGFk2uxOMeXOPpXT9a1Q3F3b2UEgYPIFkw3GTxgew6VneRkttDVr8Y/xHNtTULdP4QgDYwBxSq5yQcc1Zu1tqIbpmQeHcQSD6Gq6ydQRRIZRsWG3BfJUZreaximUEghwOGokjx9KkfIUEUwqf0C0vsWJFNF4HAYdcgVJuQoWwvpjzrN3O6giFMnzJpXKbpur4HXAFEl0+wnskia7lIBURhuKR3tnPcPuO1BimUMkyNhzvz51tOyv0XDDrRNtA7aYlitIoM8AserV80aqOD70TcZxQ6DOevtU72LPRsG2JjJqMMBzX0nA5oeR1TxE1GirrgIkuVRCxI2qOc1tqUxTsdcagCVaRW7vj8v1qvXk73MohjJCZ5PrXUPtN0C20/7HdLuIEYSlYhMygEcjPOegz6UbHU4+WK2nkpL/TnWi2wXs5YxI2JLmdFOGI6uB0xg9PM10IWyKMYJpH9i3ZOfXbuJLl5Y7eBzdOwJwCBiNcdOTk/T3rrs/YGU8w3wx/qSnvE8rFCfsxH+RwXVJI5xJAqtgDpzWndxtyTg1e7nsJqygmMwyYHTdilVz2U1aLO6z3f9pzT68rE+qMt4LX0Vgw4PgcH0rKQzA/iOPTNNbjRb2LJksp19Tt4oR4WTglkPlkYok3L6YNy12jyok7qMHmpLEn4uElf/AFF5z7ioHGGqWz3NdQ4PO9cfnWXo0D1Z8FPDDNqsqffSNss41PiZzjBAHkB+rLX1xL8JY/wyDaJeXvJtisVxztJI6Zzn3qGS2isNKS8vLh2ulf7pC/4nHJ+g4yfkKXXF/careSOLELNeOoRYi3ibgE9eeefnS/2NroDafvIJAkKqIvA0m4nvCWyCV9QPSl0T3ss8ccG9mnHdpEvIfPHSrD2msbOwMem20jfDwQiSViAGdznn6k4+WKHQ3FgsOtXk8a3RRmiAjB2soCKpXGBtGOPap2WRX9Ts3tbeN7hUUMzKFGA5xj/NL0hPcksuSwyB6VvPI88qxRtJLj7uPJJJJPl9TV27a6BDFq2m2VvBHHDPbKDJbxMTvCseV/qO3n6mpOb0F/Zhojanoep6TbG3N1dbMbocsAoL5D5wDnggg8Zx0qm6jBc2V7LbTJIkobBQA88+XrTns9cX2g69AEmeBiGUMjFST0IPuPT3q2DUl2qvLDpWf5FOMnCNr+PyaxtNle+z+1vrPWF1KdJbfuV3RB1wWPrz0rp3ZC+urm7tnMbypJcld2zhUjXk58vEcfSuf3F0UN1cAld7cemAMD+9VPQ+1eoaL24tJTdTvbROyPFvJUo3LDHz5oM4nlbbC+RnU6R2DttfxW16krktFIzCUDrnPUe9JpHXarIweNxlWHQik3bLU0vdQEtvIssDruUg+tA6deywIYyS8J5Kk9D6iqrFpFVZbbPTprxHlhAOz8QPWobmF422MuD51D2e134S45bMci7XB9Ka391HcSDYwcDoR51G2i6W2KDAC3TnHJrSW3RUwcAZx0pntyCailUONp5qVYT1FD2S78qp6frQF1CQSAuCKsZQAeWBSrUigBwRnHSiqtgqkrt1H4sUKTsHP7UXfTJGCScmkd1M8zeEeHyNFQpfDNru4xnA5NAurz5JOBRKRDOT4j6mtgmOg61ZMHSBEhVCScCuz6Rf2Gr6ItpHfw31o0SjuhIH4xxlc9a4xqUghs5pf6I2b9Komhai9o0bb+FYD8WD+YpiMCyrl6Fa8j4a62ewNLvW0uEW1jb28KL+JUjAyf78cflTaDtPcqAJYEb5cf78681Rdse0lldiyGoTwkMAyykSFT82zXX9N0PtrdaXBeW2o29yhQlhJCMDjyxiuyeC4+zl52K+5OiQdprdk3SROoyBkc5/2KmXXdNk/FJtJ/qX/frXDJe3dzp2onTtVtI2aJir9zwQc88GrVp+r2OpW4uLO47wHAI/mU+48uSfypfJ414+WGxVgzcSdQtr7T7lgkUsbMegz1qS4sLWcENbRt5coDXO9NkE2r2qRuAWcHKnkZJx+gFOO1D3cV2lxHJKhcD8LdD/AP6P1pV3c1pB14UUeCWOQPWjNMIS7gbjIkU/rQWaltD/AM3DnpvX963Wjz6Z6h1Eza28k6JHEpYRRhiq97J1JPooB/bzNB2MMenxHU3u2MscrRWiW5y8rrwW9lzgD159KHlv4kjuFRsvL93E/QLk+JvoOPrS+51EJcboTlIV7u244UdC3uaX9RvQ2s7dnuLm5upWmkt2DTMDnfOR4Yx6hfM+3ypBdS77pIQ5lAbfKSpGX6kc84HT6Uba6gyQyT/CEWcKlIwW4EjDAY88njPHoKVWrxLIxcsD3bbcHknacE/WuS5LEukXsOm6/aXQj3rbtuKnzO056e/T6VYdG1y8n7R2RuHafuj4d39TeEZPoNxqpaNatd3m48ooyaZWuItZcSMqt3ZKgnqRgj61LI1tjPtNqBs74agbeOa3vU73u5Du2t/Ng+TA8j2PvTDT9YSXT/8Aow4ZfxlcsPbNLe1tzaS9l1to4IxLEIpHfJzlt4P/APH51VND1JrcG1lY7SeD6H1oeTF7ztBMGX460y6Xk/8A9Pfk4wSK57rTPD2iYtwBLkVcbqdH0x9pAO2qj23heHVUnZcCRVYEeeBih4V6sPnva2WnTmdo05yMYwabQggZz86rmh3G6KNvPHU1Y7Zgw9sUPItMZw1tbJUGeVODRVteXMB6ll9DUcQUqT51IBxgjOPOlaQ3LGUOsDZ95GynzPWtv4tbgclvyNLkUeVfPED5Ch60GTJL/W40XEKMx9SMVXru8upnLM+AfICmc8aAE4GaAuYxjOKLDBZEK3V5GJOSa+WMDjFErGSTjgVlowg6UXYu0CsuBzUUjj6VNMfWg5jgGiSgNsV9p5caTchepjIqh2rBXyUVx5qehq7a0e8tXTrkVSpl7qbOMKwp7D0ZXkcssfabXrfWri3vrWz+Flitwl14gAzBuGHrwRXZ/sA+05ZRD2V1i6CMo22jngP/AKCfX09a83HCsRTbstEZ+0OnwtKsStOm6RmChADkkny4o9czpi64ey8/bUkVh9rGoR5YQNKkjBeoVlBOP1qy9utJbsHPoms6NdztbahHlkZuuMHBI6gg/pXLu3etHXu1+o6pv3JLMRHz0QcL+grrf2p95P8AYZ2MvbiRTMgjUZPOCp/PoKj9IhNp7R0Hspc6LqUVvqOnTxXUxiEncJcKZUOMY2Z3ZHpimU97a6zbsLS4V2jfxDcdyMDkhlPIPHnXl3TJZo5FuEdoGU7lkU4YH1GKa6t2k1K+ujdT3L9+YxE8q+F5AOPER14oV+BNPaYzHnZJezkWK3tuLiM/6x+9ZZAGUYOD781LBGvxEZByN44orFTt08rMcHp1+tDHxMAB1o2+tZIZVR1wxAbGeQD0zWlukK75ZuYoxlhuxu/0j3NBH+ge4lVYU8T7QSVjbp/3UuaUg5BqW7maeUyNwT5DoB5CpNHs/i70K48CeJv8Vz4K72P+zsBttHM7J95LJuAP9I4pVdRN/GF4GUYsxJx4VBJq4LCAqqfwIu0Cq/cxuRetHAJX+Fm3bjjYOMuPcAdPehTW2XqeA/tFpwMEkURPcTW0e2RgBvOQfpyP3rnVykkFy6S8MjYODXQoLo3VpbKzLyg5Pn71VO0dh99I6cumS2P5hmpx1p6K3HGzFpfCSzMLtztxUnbNe/0yCfgmI4yPQ0htZth2cc+fpTu6fvtKkgnyGCgo3kalzp7Imm50yDs9cHu1VugFXHT3zGvIIFc90mQxybffmrfo9yAApPGaDmkawX9FliYHHOPTipxvB6Aj1oSBtwzxiilJHIOfalGjQmiRWwc4rYsmMdD71qXQAAgg18Nr0NoPNEMwBB4+VBSoDwTR7JggZOKgkVVzxXLgrT2A7AowBQtxx70bcE7Tilly5HU0WQNsHnOSaBumwCc5HpUssmTxmhLhiw5NMShPIxfcNvJzVf1Kz3Ql15KuQfrzVhlUYOKDePday5/+4MY+VMp6EbWyoSqUkwRWdxA4PWjdWg2ncRzQOBjFMS9izWmbxhnYKoyx6CukdrO141Xs/ouhwW7xW2mQqMuwJeTbgkDyA5/Pyqi6dGI4jKR4m6fKpSxJzRJko2FNcMz5LGshyw/FQmTWQ+B50Urop4ZgCATg1Jaf+ai5x4xz6c1JHNxg1mFg1xHk58Q/eldl9HdtRkQyskMjSrnxSsPE5/xS+9ZWVY0AAUc+59aKk6ZpfOQGJJoaQ02DSHHGCSeKuXZ/TfhbSGJ1++lO+Qeg64pD2UsfjtZj3jMUX3jfTp+tdBsId080hAO0bQfSg5q1wFwzvkGvwBDtVearnaCF4I43RigkYo+D1BBBHywauEsYIGB0/eles6eLizSSSVY445QORyx64HvQIrTDXPBWtKLDSkUphg+0A+x4qOSMvM77csDiprLbCl4pBB+J8GD5YyT+woqyhOwueuKu2Vk5/rdmbS7JX8DncuPL2oywm+Osnt3Y96g8B8z7U37Q2RupWjRMsF3KBVXthNbXIYKQM4O7gUxL95FrXpRrHlZ38sNTzTLnGFY496WzxwRT75LhZWIB2Rjp8yeP3qSGRWcMiBFHRRzUUuC0PTLvps3GC2abRNkZqp6bctFgnLJ5+1WG1uEZAdwpK50aWK9oY4V1ANbxqBz1oeKQE43CiUxt5NBaGpowwDA1BIo2c9aIbG2h55AsZ+VRolsX3zAKQBikV3KC2AaY6hPknHSlEi5bPrRokVyUQSZqBwSeaLdCKhZTR0L1yBzphSwGTQTKBb7geTIfpxTC44UkUO6DuLdMnOwu2fUnNFT2L0kJtVgEkRzgHHFV4o3ed2BznFdATs5qd7CHEQhQ8q0vh3fIdaXXnZOfT0kvZrqFtn8gBzzx/etDH4mZz7+r0I5MkJ62JgoWNUB6DFaEGpZFKmsqvFSuChFitcVK6+Go/bzq2zj/2Q==	2026-07-16T06:58:11.155387	+91 8639809252		f												legalheir	pending	00c223e6-8fb6-44ca-a96b-031d674b01ef			f	75fc1d4d-1c31-40e2-9b0a-e42378b312b6	spouse	f	f	phone
\.


--
-- Data for Name: family_notifiers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.family_notifiers (id, owner_user_id, group_id, member_id, priority, created_at) FROM stdin;
97b830c0-3aea-47c2-83e1-c8b4bc0d5269	sankara.telukutla	75fc1d4d-1c31-40e2-9b0a-e42378b312b6	05761134-25a8-4a78-a71a-c5248841190d	1	2026-07-23T16:34:58.854088
efa01dd8-e787-402d-b5c7-27d465b1643a	sankara.telukutla	75fc1d4d-1c31-40e2-9b0a-e42378b312b6	79414665-3e77-4aa3-9e85-10bbfedf382a	2	2026-07-23T16:34:58.854088
5bf0e4a0-da9f-4deb-845e-a2a80831d6a3	sankara.telukutla	75fc1d4d-1c31-40e2-9b0a-e42378b312b6	31fc04a4-76fb-4422-bee8-b663a8ed1945	3	2026-07-23T16:34:58.854088
\.


--
-- Data for Name: fee_schedule; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.fee_schedule (id, tmaj_code, tmin_code, reg_type_en, nature_en, sample_consideration, stamp_duty, transfer_duty, registration_fee, user_charges, stamp_rate, transfer_rate, reg_rate, user_rate) FROM stdin;
fs000	01	01	Sale	Sale Deed	1e+06	50000	15000	10000	500	0.05	0.015	0.01	0.0005
fs001	01	02	Sale	Sale Agreement With Possession	1e+06	40000	0	5000	500	0.04	0	0.005	0.0005
fs002	01	03	Sale	Sale Agreement Without Possession	1e+06	5000	0	5000	500	0.005	0	0.005	0.0005
fs003	01	04	Sale	Sale Deed Executed By A.P.Housing Board	1e+06	50000	15000	10000	500	0.05	0.015	0.01	0.0005
fs004	01	05	Sale	Sale Deed Executed By Or Infavour Of Constituted By Govt.	1e+06	50000	15000	10000	500	0.05	0.015	0.01	0.0005
fs005	01	06	Sale	Sale Deed Executed By Society In f/o Member	1e+06	0	0	10000	500	0	0	0.01	0.0005
fs006	01	07	Sale	Instruments Between Co-Ops,Govt. & Other Financial Institute	1e+06	0	0	10000	500	0	0	0.01	0.0005
fs007	01	08	Sale	Sale Deed In Favour Of State Or Central Govt.	1e+06	0	0	10000	500	0	0	0.01	0.0005
fs008	01	09	Sale	Development Agreement Or Construction Agreement	1e+06	5000	0	5000	500	0.005	0	0.005	0.0005
fs009	01	10	Sale	Development Agreement Cum GPA	1e+06	10000	0	5000	500	0.01	0	0.005	0.0005
fs010	01	11	Sale	Agreement Of Sale Cum GPA	1e+06	50000	0	2000	500	0.05	0	0.002	0.0005
fs011	01	12	Sale	Conveyance Deed(Without Consideration)	1e+06	40000	0	5000	500	0.04	0	0.005	0.0005
fs012	01	13	Sale	Conveyance For Consideration	1e+06	40000	0	5000	500	0.04	0	0.005	0.0005
fs013	01	14	Sale	Sale Deed in Favour of Mortgagee	1e+06	50000	15000	10000	500	0.05	0.015	0.01	0.0005
fs014	01	15	Sale	Sale with Indemnity	1e+06	50000	15000	10000	500	0.05	0.015	0.01	0.0005
fs015	01	16	Sale	Sale Deeds in f/o agrl Labrs (SC/ST) Funded by SC Fin. Corpn	1e+06	0	0	10000	500	0	0	0.01	0.0005
fs016	01	17	Sale	Sale of life interest	1e+06	50000	0	10000	500	0.05	0	0.01	0.0005
fs017	01	18	Sale	Sale of Terrace Rights	1e+06	50000	15000	10000	500	0.05	0.015	0.01	0.0005
fs018	01	19	Sale	Sale Deeds executed by Courts	1e+06	50000	15000	10000	500	0.05	0.015	0.01	0.0005
fs019	01	20	Sale	Court Sale Certificate	1e+06	40000	0	5000	500	0.04	0	0.005	0.0005
fs020	01	21	Sale	Court Decree	1e+06	40000	0	5000	500	0.04	0	0.005	0.0005
fs021	01	22	Sale	Sale(others)	1e+06	50000	15000	10000	500	0.05	0.015	0.01	0.0005
fs022	01	23	Sale	GPA	1e+06	0	0	0	500	0	0	0	0.0005
fs023	01	24	Sale	SadaBainama (Sale)	1e+06	0	0	0	500	0	0	0	0.0005
fs024	01	25	Sale	Development Agreement/GPA/Supplemental Deed By CRDA	1e+06	5000	0	5000	500	0.005	0	0.005	0.0005
fs025	01	26	Sale	Conveyance (Merger, Demerger, Amalgamation of Companies)	1e+06	20000	15000	5000	500	0.02	0.015	0.005	0.0005
fs026	02	01	Mortgage	Mortgage with Possession	1e+06	20000	15000	1000	500	0.02	0.015	0.001	0.0005
fs027	02	02	Mortgage	Mortgage without Possession	1e+06	5000	0	1000	500	0.005	0	0.001	0.0005
fs028	02	03	Mortgage	Mort. Deed in f/o Governer/President of India by Gt.Servants	1e+06	0	0	1000	500	0	0	0.001	0.0005
fs029	02	04	Mortgage	Assignment Deed	1e+06	0	0	5000	500	0	0	0.005	0.0005
fs030	02	05	Mortgage	Mortgage Deed By Co-Operative Society in f/o Govt.	1e+06	0	0	1000	500	0	0	0.001	0.0005
fs031	02	06	Mortgage	Mortgage Deed by Small Farmer for Agrl.Loans in f/o PAC/Bank	1e+06	0	0	1000	500	0	0	0.001	0.0005
fs032	02	07	Mortgage	Mortgagee Deed Between Socity to Socity Or Banks	1e+06	0	0	1000	500	0	0	0.001	0.0005
fs033	02	08	Mortgage	Deposit of Title Deeds	1e+06	5000	0	1000	500	0.005	0	0.001	0.0005
fs034	02	09	Mortgage	Security Bond	1e+06	30000	0	500	500	0.03	0	0.0005	0.0005
fs035	02	10	Mortgage	Mortgages in f/o Grameena or Scheduled Bank for Agricultural Credit	1e+06	30000	0	500	500	0.03	0	0.0005	0.0005
fs036	02	11	Mortgage	Mortgages in f/o Coop Credit Societies of Weaker Section of Non-Agricultural Class Loan <=10000	1e+06	0	0	1000	500	0	0	0.001	0.0005
fs037	02	12	Mortgage	Instruments Between Co-Op and Other Co-Op,Banks,Financial Inst or Govt.	1e+06	0	0	1000	500	0	0	0.001	0.0005
fs038	02	13	Mortgage	Instruments in f/o House Bldg Co-Op Societies for Loan Upto Rs.30000 Under L.I.G.H Scheme	1e+06	0	0	1000	500	0	0	0.001	0.0005
fs039	02	14	Mortgage	Mortgages Executed by Members of Co-Op Urban and Town Banks in f/o Such Banks for Loan Upto Rs.15000	1e+06	0	0	1000	500	0	0	0.001	0.0005
fs040	02	15	Mortgage	Instruments In f/o SBI And Nationalised Banks For Loan Upto Rs.6500 Under Diff Rates of Int. Adv. /	1e+06	0	0	1000	500	0	0	0.001	0.0005
fs041	02	16	Mortgage	Further Charge - When the Original Mortgage is With Possession	1e+06	20000	15000	5000	500	0.02	0.015	0.005	0.0005
fs042	02	17	Mortgage	Further Charge-Orig. Mortg is Without Possession And Possession Is Agreed to Be Given At Execution	1e+06	20000	15000	5000	500	0.02	0.015	0.005	0.0005
fs043	02	18	Mortgage	Further Charge - Without Possession on a Simple Mortgage	1e+06	5000	0	5000	500	0.005	0	0.005	0.0005
fs044	02	19	Mortgage	Mortgage by Conditional Sale	1e+06	50000	15000	10000	500	0.05	0.015	0.01	0.0005
fs045	02	20	Mortgage	Agreement Varying the Terms Of Previously Registered Mortgage Deed	1e+06	5000	0	1000	500	0.005	0	0.001	0.0005
fs046	02	21	Mortgage	Additional Security	1e+06	5000	0	1000	500	0.005	0	0.001	0.0005
fs047	02	22	Mortgage	Substituted Security	1e+06	5000	0	1000	500	0.005	0	0.001	0.0005
fs048	02	23	Mortgage	Mortgage(Others)	1e+06	5000	0	1000	500	0.005	0	0.001	0.0005
fs049	03	01	Gift	Gift [దాన పత్రము].	1e+06	50000	15000	5000	500	0.05	0.015	0.005	0.0005
fs050	03	02	Gift	Gift Settlement In f/o Family Member	1e+06	20000	0	5000	500	0.02	0	0.005	0.0005
fs051	03	03	Gift	Gift Settlement In f/o Others	1e+06	30000	0	5000	500	0.03	0	0.005	0.0005
fs052	03	04	Gift	Gift Settlement For Charitable/Religious Purposes	1e+06	30000	0	5000	500	0.03	0	0.005	0.0005
fs053	03	05	Gift	Gift Settlement In f/o Local Bodies	1e+06	20000	0	5000	500	0.02	0	0.005	0.0005
fs054	03	06	Gift	Gift In f/o Local Bodies (G.O 137)	1e+06	20000	0	5000	500	0.02	0	0.005	0.0005
fs055	03	07	Gift	Gift For Charitable Religious Purposes/God	1e+06	50000	15000	5000	500	0.05	0.015	0.005	0.0005
fs056	03	08	Gift	Gift In Favour Of Government	1e+06	20000	0	5000	500	0.02	0	0.005	0.0005
fs057	03	09	Gift	Gift Settlement Deeds In Favour Of Government	1e+06	20000	0	5000	500	0.02	0	0.005	0.0005
fs058	03	10	Gift	Gift Of Terrace Rights	1e+06	0	0	0	500	0	0	0	0.0005
fs059	03	11	Gift	Gift Settlement Of Terrace Rights	1e+06	0	0	0	500	0	0	0	0.0005
fs060	03	12	Gift	Gift Reserving Life Interest	1e+06	20000	0	5000	500	0.02	0	0.005	0.0005
fs061	03	13	Gift	Gift Settlement Reserving Life Interest	1e+06	0	0	0	500	0	0	0	0.0005
fs062	04	01	Partition	Partition	1e+06	20000	0	1000	500	0.02	0	0.001	0.0005
fs063	04	02	Partition	Partition Among Family Members	1e+06	10000	0	1000	500	0.01	0	0.001	0.0005
fs064	04	03	Partition	Partition executed by Court	1e+06	20000	0	1000	500	0.02	0	0.001	0.0005
fs065	05	01	Release	Release (Co-Parceners)	1e+06	30000	0	5000	500	0.03	0	0.005	0.0005
fs066	05	02	Release	Release (Others)	1e+06	30000	0	5000	500	0.03	0	0.005	0.0005
fs067	05	03	Release	Reconveyance Deed Executed By Govt In Fovour Of Employees	1e+06	0	0	500	500	0	0	0.0005	0.0005
fs068	05	04	Release	Reconveyance Deed(Others)	1e+06	50	0	1000	500	5e-05	0	0.001	0.0005
fs069	05	05	Release	Receipt (R.T.D.M)	1e+06	1	0	1000	500	1e-06	0	0.001	0.0005
fs070	05	06	Release	Release (Federation OR Society To Society)	1e+06	0	0	5000	500	0	0	0.005	0.0005
fs071	05	07	Release	Release Of Life Interest	1e+06	30000	0	5000	500	0.03	0	0.005	0.0005
fs072	05	08	Release	Release Of Disputed Right	1e+06	30000	0	5000	500	0.03	0	0.005	0.0005
fs073	05	09	Release	Release Of Mortgage Right	1e+06	30000	0	5000	500	0.03	0	0.005	0.0005
fs074	05	10	Release	Release Of Maintenance Right By Way Of Relinquishing Right For Immovable Property	1e+06	30000	0	5000	500	0.03	0	0.005	0.0005
fs075	05	11	Release	Release(Others)	1e+06	0	0	0	500	0	0	0	0.0005
fs076	05	12	Release	Release Among Family Members	1e+06	30000	0	5000	500	0.03	0	0.005	0.0005
fs077	06	01	Exchange	Exchange	1e+06	40000	15000	5000	500	0.04	0.015	0.005	0.0005
fs078	06	02	Exchange	Exchange by CRDA	1e+06	40000	15000	5000	500	0.04	0.015	0.005	0.0005
fs079	07	01	Lease	Lease Deed	1e+06	0	0	0	500	0	0	0	0.0005
fs080	07	02	Lease	Lease In Favour Of State/Central Govt.	1e+06	0	0	0	500	0	0	0	0.0005
fs081	07	03	Lease	Mining Lease	1e+06	0	0	0	500	0	0	0	0.0005
fs082	07	04	Lease	Salt Leases With Ground Rent	1e+06	0	0	0	500	0	0	0	0.0005
fs083	07	05	Lease	Transfer Of Lease	1e+06	0	0	0	500	0	0	0	0.0005
fs084	07	06	Lease	Surrender Of Lease	1e+06	30	0	1000	500	3e-05	0	0.001	0.0005
fs085	07	07	Lease	Lease(Others)	1e+06	0	0	0	500	0	0	0	0.0005
fs086	08	01	Rectification/Ratification/Cancellation Deed	Rectification Deed	1e+06	0	0	1000	500	0	0	0.001	0.0005
fs087	08	02	Rectification/Ratification/Cancellation Deed	Supplemental Deed, Ratification Deed U/S 4 Of I.S.Act	1e+06	5	0	1000	500	5e-06	0	0.001	0.0005
fs088	08	03	Rectification/Ratification/Cancellation Deed	Cancellation Deed	1e+06	30	0	1000	500	3e-05	0	0.001	0.0005
fs089	08	04	Rectification/Ratification/Cancellation Deed	Revocation Of Gift Settlement	1e+06	90	0	1000	500	9e-05	0	0.001	0.0005
fs090	09	04	Power Of Attorney [పవర్ ఆఫ్ అటార్నీ].	Power To Sell Immovable Property (No Value Mentioned)	1e+06	10000	0	5000	500	0.01	0	0.005	0.0005
fs091	09	05	Power Of Attorney [పవర్ ఆఫ్ అటార్నీ].	GPA In Favour Of Family Members	1e+06	1000	0	5000	500	0.001	0	0.005	0.0005
fs092	20	01	Will	Will	1e+06	0	0	1000	500	0	0	0.001	0.0005
fs093	20	02	Will	Cancellation Of Will	1e+06	0	0	1000	500	0	0	0.001	0.0005
fs094	20	03	Will	Codicil	1e+06	0	0	1000	500	0	0	0.001	0.0005
fs095	20	04	Will	Will in Sealed Cover	1e+06	0	0	1000	500	0	0	0.001	0.0005
fs096	30	01	Adoption Deed	Adoption Deed	1e+06	35	0	1000	500	3.5e-05	0	0.001	0.0005
fs097	31	01	Affidavit	Affidavit	1e+06	10	0	1000	500	1e-05	0	0.001	0.0005
fs098	32	01	Agreement (Others)	Agreement (Others)	1e+06	0	0	0	500	0	0	0	0.0005
fs099	33	01	Award (Not Directing Partition)	Award (Not Directing Partition)	1e+06	200	0	5000	500	0.0002	0	0.005	0.0005
fs100	34	01	Bond	Bond	1e+06	100	0	500	500	0.0001	0	0.0005	0.0005
fs101	35	01	Cancellation GPA	Cancellation GPA	1e+06	30	0	1000	500	3e-05	0	0.001	0.0005
fs102	36	01	Cancellation (Others)	Cancellation (Others)	1e+06	30	0	1000	500	3e-05	0	0.001	0.0005
fs103	37	01	Divorce	Divorce	1e+06	50000	0	1000	500	0.05	0	0.001	0.0005
fs104	38	01	Indemnity Bond	Indemnity Bond	1e+06	100	0	500	500	0.0001	0	0.0005	0.0005
fs105	39	01	Partnership	Partnership	1e+06	0	0	0	500	0	0	0	0.0005
fs106	40	01	Dissolution Of Partnership	Dissolution Of Partnership	1e+06	0	0	0	500	0	0	0	0.0005
fs107	41	01	Power Of Attorney	Special Power	1e+06	20	0	1000	500	2e-05	0	0.001	0.0005
fs108	41	02	Power Of Attorney	General Power	1e+06	50	0	1000	500	5e-05	0	0.001	0.0005
fs109	41	03	Power Of Attorney	Power for Consideration	1e+06	50000	0	5000	500	0.05	0	0.005	0.0005
fs110	42	01	Security Bond	Security Bond	1e+06	0	0	0	500	0	0	0	0.0005
fs111	43	01	Trust	Declaration	1e+06	200	0	500	500	0.0002	0	0.0005	0.0005
fs112	43	02	Trust	Others (Settlement)	1e+06	0	0	0	500	0	0	0	0.0005
fs113	43	03	Trust	Revocation	1e+06	100	0	1000	500	0.0001	0	0.001	0.0005
fs114	44	01	Book 4 (Others)	Book 4 (Others)	1e+06	0	0	0	500	0	0	0	0.0005
\.


--
-- Data for Name: groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.groups (id, owner_user_id, type, name, description, created_at, updated_at) FROM stdin;
b17f61e9-b71c-4580-a31c-8f276cb8ee10	u06	family	Suresh Reddy Family		2026-07-23T07:48:17.274350	2026-07-23T07:48:17.274350
4eb5516e-37b6-4c40-9171-7cbeea271515	u03	family	Venkat Rao Family		2026-07-23T07:48:17.274350	2026-07-23T07:48:17.274350
ffcc7f0e-ae36-4fed-8be0-a37f1b709969	u04	family	Lakshmi Naidu Family		2026-07-23T07:48:17.274350	2026-07-23T07:48:17.274350
e88a18f2-f6fa-4229-8b34-47ca6c92ed0d	u02	family	Sita Devi Family		2026-07-23T07:48:17.274350	2026-07-23T07:48:17.274350
1b23e0f3-17e0-488d-87d8-b374ceabcdc8	u01	family	Ramesh Kumar Family		2026-07-23T07:48:17.274350	2026-07-23T07:48:17.274350
faa9369b-ceee-41f0-aaea-96ef58193c50	task3devuser	family	My Family		2026-07-23T08:03:28.520982	2026-07-23T08:03:28.520982
8bd71ece-f339-42eb-8063-a56809c64bc0	sankara.telukutla	partnership	Reddy Brothers		2026-07-23T10:00:59.038159	2026-07-23T10:00:59.038159
75fc1d4d-1c31-40e2-9b0a-e42378b312b6	sankara.telukutla	family	Telukutla Sankara Reddy Family		2026-07-23T07:48:17.274350	2026-07-23T10:01:34.600413
\.


--
-- Data for Name: inactivity_escalations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inactivity_escalations (id, owner_user_id, group_id, stage, current_priority, last_notified_at, acknowledged, ack_token, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: invitations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invitations (id, scope_type, scope_id, role, invitee_contact, token, expiry, status, created_at) FROM stdin;
inv01	parcel	pc01	view	9876543220	tok-abc-001	2025-12-31	pending	2024-07-01
inv02	parcel	pc01	claim	9876543221	tok-abc-002	2025-12-31	pending	2024-07-01
inv03	document	doc02	view	agent@example.com	tok-abc-003	2025-06-30	accepted	2024-03-15
inv04	parcel	pc06	manage	9876543230	tok-abc-004	2025-12-31	pending	2024-05-20
inv05	passbook	pb06	view	buyer@example.com	tok-abc-005	2025-03-31	revoked	2024-06-10
8133e69f-7daa-4918-a155-4332820e1811	beneficiary	b00d7ee7-d28d-44c7-8ab4-1f78aacc4669	coowner	9990001111	a972c9ed-baf4-4c43-b1d4-80dbca80c3b7		pending	2026-07-23T08:18:45.033922
d749ee43-0acb-43a3-83db-0f910a982974	beneficiary	05761134-25a8-4a78-a71a-c5248841190d	legalheir	+91 8639809252	00c223e6-8fb6-44ca-a96b-031d674b01ef		pending	2026-07-23T16:35:53.234401
\.


--
-- Data for Name: mandals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mandals (id, name, district_id) FROM stdin;
15-06	ANANTHAGIRI	15
15-01	ARAKU VALLEY	15
15-09	CHINTAPALLE	15
15-03	DUMBRIGUDA	15
15-08	GANGARAJU MADUGULA	15
15-10	GUDEM KOTHAVEEDHI	15
15-05	HUKUMPETA	15
15-11	KOYYURU	15
15-04	MUNCHINGIPUTTU	15
15-07	PADERU	15
15-02	PEDABAYALU	15
15-22	VARARAMACHANDRAPURAM	15
16-03	ANAKAPALLI	16
16-08	ATCHUTAPURAM	16
16-09	BUTCHAYYAPETA	16
16-24	CHEEDIKADA	16
16-10	CHODAVARAM	16
16-01	DEVARAPALLE	16
16-14	GOLUGONDA	16
16-02	K KOTAPADU	16
16-04	KASIMKOTA	16
16-19	KOTAURATLA	16
16-23	MADUGULA	16
16-15	MAKAVARAPALEM	16
16-07	MUNAGAPAKA	16
16-17	NAKKAPALLI	16
16-13	NARSIPATNAM	16
16-16	NATHAVARAM	16
16-11	PARAVADA	16
16-18	PAYAKARAOPETA	16
16-06	RAMBILLI	16
16-21	RAVIKAMATHAM	16
16-22	ROLUGUNTA	16
16-20	S RAYAVARAM	16
16-12	SABBAVARAM	16
16-05	YELAMANCHILI	16
21-15	ADDANKI	21
21-05	AMRUTHALUR	21
21-18	BALLIKURUVA	21
21-10	BAPATLA	21
21-04	BHATTIPROLU	21
21-09	CHERUKUPALLE	21
21-24	CHINAGANJAM	21
21-13	CHIRALA	21
21-23	INKOLLU	21
21-16	JANAKAVARAMPANGULURU	21
21-22	KARAMCHEDU	21
21-12	KARLAPALEM	21
21-02	KOLLUR	21
21-19	KORISAPADU	21
21-25	MARTUR	21
21-08	NAGARAM	21
21-07	NIZAMPATNAM	21
21-20	PARCHUR	21
21-11	PITTALAVANIPALEM	21
21-06	REPALLE	21
21-17	SANTHAMAGULURU	21
21-03	TSUNDUR	21
21-01	VEMURU	21
21-14	VETAPALEM	21
21-21	YEDDANAPUDI	21
12-25	ANANTAPUR	12
12-67	ANANTAPUR (U)	12
12-24	ATMAKUR	12
12-16	BELUGUPPA	12
12-02	BOMMANAHAL	12
12-20	BRAHMASAMUDRAM	12
12-26	BUKKARAYASAMUDRAM	12
12-01	D.HIRCHAL	12
12-13	GARLADINNE	12
12-06	GOOTY	12
12-19	GUMMAGATTA	12
12-05	GUNTAKAL	12
12-23	KALYANDURG	12
12-34	KAMBADUR	12
12-17	KANEKAL	12
12-14	KUDAIR	12
12-22	KUNDURPI	12
12-27	NARPALA	12
12-12	PAMIDI	12
12-10	PEDDAPAPPUR	12
12-07	PEDDAVADUGUR	12
12-28	PUTLUR	12
12-32	RAPTADU	12
12-18	RAYADURG	12
12-21	SETTUR	12
12-11	SINGANAMALA	12
12-09	TADPATRI	12
12-15	URAVAKONDA	12
12-04	VAJRAKARUR	12
12-03	VIDAPANAKAL	12
12-08	YADIKI	12
12-29	YELLANUR	12
08-29	CHIMAKURTHI	08
08-13	DARSI	08
08-05	DONAKONDA	08
08-42	KONDAPI	08
08-47	KOTHAPATNAM	08
08-04	KURICHEDU	08
08-28	MADDIPADU	08
08-30	MARRIPUDI	08
08-14	MUNDLAMURU	08
08-45	NAGULUPPALAPADU	08
08-44	ONGOLE	08
08-57	ONGOLE (Rural)	08
08-41	PONNALURU	08
08-43	SANTHANUTHLAPADU	08
08-56	SINGARAYAKONDA	08
08-48	TANGUTUR	08
08-15	THALLUR	08
08-49	ZARUGUMILLI	08
19-24	AGIRIPALLE	19
19-06	BHIMADOLE	19
19-15	BUTTAYAGUDEM	19
19-25	CHATRAI	19
19-27	CHINTALAPUDI	19
19-02	DENDULURU	19
19-22	DWARAKA TIRUMALA	19
19-01	ELURU	19
19-29	ELURU (URBAN)	19
19-08	GANAPAVARAM	19
19-13	JANGAREDDIGUDEM	19
19-16	JEELUGUMILLI	19
19-09	KAIKALUR	19
19-11	KALIDINDI	19
19-20	KAMAVARAPUKOTA	19
19-17	KOYYALAGUDEM	19
19-18	KUKUNOOR	19
19-28	LINGAPALEM	19
19-10	MANDAVALLI	19
19-12	MUDINEPALLI	19
19-26	MUSUNURU	19
19-07	NIDAMARRU	19
19-23	NUZVID	19
19-04	PEDAPADU	19
19-03	PEDAVEGI	19
19-14	POLAVARAM	19
19-21	T NARASAPURAM	19
19-05	UNGUTURU	19
19-19	VELAIRPADU	19
10-61	BAIREDDI PALLE	10
10-57	BANGARUPALEM	10
10-54	CHITTOOR	10
10-67	CHITTOOR URBAN	10
10-38	CHOWDEPALLE	10
10-49	GANGADHARA NELLORE	10
10-65	GUDI PALLE	10
10-55	GUDIPALA	10
10-52	IRALA	10
10-46	KARVETINAGAR	10
10-66	KUPPAM	10
10-45	NAGARI	10
10-22	NINDRA	10
10-58	PALAMANER	10
10-48	PALASAMUDRAM	10
10-60	PEDDA PANJANI	10
10-50	PENUMURU	10
10-41	PULICHERLA	10
10-37	PUNGANUR	10
10-51	PUTHALAPATTU	10
10-63	RAMA KUPPAM	10
10-30	ROMPICHERLA	10
10-64	SANTHI PURAM	10
10-40	SODAM	10
10-39	SOMALA	10
10-47	SRIRANGARAJAPURAM	10
10-53	THAVANAMPALLE	10
10-43	VEDURU KUPPAM	10
10-62	VENKATAGIRI KOTA	10
10-21	VIJAYA PURAM	10
10-56	YADAMARI	10
27-04	ADDATEEGALA	27
27-09	CHINTUR	27
27-02	DEVIPATNAM	27
27-05	GANGAVARAM	27
27-10	KUNAVARAM	27
27-06	MAREDUMILLI	27
27-07	RAJAVOMMANGI	27
27-01	RAMPACHODAVARAM	27
27-11	VARARAMACHANDRAPURAM	27
27-03	Y RAMAVARAM	27
27-08	Yetapaka	27
18-13	AINAVILLI	18
18-22	ALAMURU	18
18-06	ALLAVARAM	18
18-04	AMALAPURAM	18
18-12	AMBAJIPETA	18
18-19	ATREYAPURAM	18
18-02	I POLAVARAM	18
18-15	K.GANGAVARAM	18
18-18	KAPILESWARAPURAM	18
18-03	KATRENIKONA	18
18-21	KOTHAPETA	18
18-08	MALIKIPURAM	18
18-10	MAMIDIKUDURU	18
18-16	MANDAPETA	18
18-01	MUMMIDIVARAM	18
18-11	P GANNAVARAM	18
18-14	RAMACHANDRAPURAM	18
18-20	RAVULAPALEM	18
18-17	RAYAVARAM	18
18-07	RAZOLE	18
18-09	SAKHINETIPALLE	18
18-05	UPPALAGUPTAM	18
20-12	A KONDURU	20
20-03	CHANDARLAPADU	20
20-19	G KONDURU	20
20-11	GAMPALAGUDEM	20
20-13	IBRAHIMPATNAM	20
20-05	JAGGAYYAPETA	20
20-02	KANCHIKA CHERLA	20
20-20	MYLAVARAM	20
20-01	NANDIGAMA	20
20-07	PENUGANCHIPROLU	20
20-08	REDDIGUDEM	20
20-09	TIRUVURU	20
20-06	VATSAVAI	20
20-04	VEERULLAPADU	20
20-16	VIJAYAWADA CENTRAL	20
20-18	VIJAYAWADA EAST	20
20-17	VIJAYAWADA NORTH	20
20-14	VIJAYAWADA RURAL	20
20-15	VIJAYAWADA WEST	20
20-10	VISSANNAPET	20
04-33	ANAPARTHI	04
04-34	BICCAVOLU	04
04-02	CHAGALLU	04
04-07	DEVARAPALLE	04
04-17	GOKAVARAM	04
04-08	GOPALAPURAM	04
04-31	KADIAM	04
04-16	KORUKONDA	04
04-01	KOVVUR	04
04-09	NALLAJERLA	04
04-04	NIDADAVOLE	04
04-06	PERAVALI	04
04-29	RAJAMAHENDRAVARAM RURAL	04
04-30	RAJAMAHENDRAVARAM URBAN	04
04-28	RAJANAGARAM	04
04-26	RANGAMPETA	04
04-15	SEETHANAGARAM	04
04-03	THALLAPUDI	04
04-05	UNDRAJAVARAM	04
28-06	ARDHAVEEDU	28
28-02	BESTAVARIPETA	28
28-20	CHADRASEKARAPURAM	28
28-05	CUMBUM	28
28-12	DORNALA	28
28-01	GIDDALURU	28
28-16	HANUMANTHUNIPADU	28
28-18	KANIGIRI	28
28-04	KOMAROLU	28
28-15	KONAKANAMITLA	28
28-07	MARKAPUR	28
28-21	PAMUR	28
28-13	PEDAARAVEEDU	28
28-19	PEDACHERLOPALLE	28
28-14	PODILI	28
28-10	PULLALACHERUVU	28
28-03	RACHERLA	28
28-08	TARLAPADU	28
28-11	TRIPURANTHAKAM	28
28-17	VELIGANDLA	28
28-09	YERRAGONDAPALEM	28
25-26	AGALI	25
25-14	AMADAGUR	25
25-25	AMARAPURAM	25
25-02	BATHALAPALLE	25
25-27	BUKKAPATNAM	25
25-07	CHENNE KOTHAPALLE	25
25-19	CHILAMATHUR	25
25-01	DHARMAVARAM	25
25-11	GANDLAPENTA	25
25-32	GORANTLA	25
25-23	GUDIBANDA	25
25-18	HINDUPUR	25
25-08	KADIRI	25
25-06	KANAGANAPALLE	25
25-28	KOTHACHERUVU	25
25-22	LEPAKSHI	25
25-20	MADAKASIRA	25
25-04	MUDIGUBBA	25
25-12	NALLACHERUVU	25
25-30	NALLAMADA	25
25-10	NAMBULIPULIKUNTA	25
25-31	OBULADEVARACHERUVU	25
25-21	PARIGI	25
25-15	PENUKONDA	25
25-29	PUTTAPARTHI	25
25-05	RAMAGIRI	25
25-17	RODDAM	25
25-24	ROLLA	25
25-16	SOMANDEPALLE	25
25-03	TADIMARRI	25
25-09	TALUPULA	25
25-13	TANAKAL	25
22-23	ACHAMPETA	22
22-25	AMARAVATHI	22
22-27	BELLAMKONDA	22
22-10	BOLLAPALLE	22
22-11	CHILAKALURIPET	22
22-02	DACHEPALLE	22
22-07	DURGI	22
22-13	EDLAPADU	22
22-01	GURAZALA	22
22-19	IPURU	22
22-09	KAREMPUDI	22
22-24	KROSURU	22
22-04	MACHAVARAM	22
22-05	MACHERLA	22
22-22	MUPPALLA	22
22-12	NADENDLA	22
22-28	NAKARIKALLU	22
22-14	NARASARAOPETA	22
22-17	NUZENDLA	22
22-26	PEDAKURAPADU	22
22-03	PIDUGURALLA	22
22-21	RAJUPALEM	22
22-08	RENTACHINTALA	22
22-15	ROMPICHERLA	22
22-20	SATTENAPALLE	22
22-18	SAVALYAPURAM	22
22-06	VELDURTHI	22
22-16	VINUKONDA	22
07-34	CHEBROLE	07
07-28	DUGGIRALA	07
07-59	Guntur East	07
07-58	Guntur West	07
07-47	KAKUMANU	07
07-29	KOLLIPARA	07
07-12	MANGALAGIRI	07
07-25	MEDIKONDURU	07
07-27	PEDAKAKANI	07
07-46	PEDANANDIPADU	07
07-24	PHIRANGIPURAM	07
07-48	PONNUR	07
07-36	PRATHIPADU	07
07-13	TADIKONDA	07
07-32	TENALI	07
07-11	THADEPALLE	07
07-10	THULLUR	07
07-35	VATTICHERUKURU	07
17-13	GANDEPALLE	17
17-03	GOLLAPROLU	17
17-12	JAGGAMPETA	17
17-10	KAJULURU	17
17-06	KAKINADA (RURAL)	17
17-07	KAKINADA (URBAN)	17
17-05	KARAPA	17
17-14	KIRLAMPUDI	17
17-16	KOTANANDURU	17
17-04	KOTHAPALLI	17
17-08	PEDAPUDI	17
17-11	PEDDAPURAM	17
17-02	PITHAPURAM	17
17-17	PRATHIPADU	17
17-20	Rowthulapudi	17
17-01	SAMALKOTA	17
17-18	SANKHAVARAM	17
17-09	THALLAREVU	17
17-21	THONDANGI	17
17-15	TUNI	17
17-19	YELESWARAM	17
06-34	AVANIGADDA	06
06-45	BANTUMILLI	06
06-26	BAPULAPADU	06
06-32	CHALLAPALLI	06
06-21	GANNAVARAM	06
06-31	GHANTASALA	06
06-42	GUDIVADA	06
06-43	GUDLAVALLERU	06
06-38	GUDUR	06
06-20	KANKIPADU	06
06-36	KODURU	06
06-50	KRUTHIVENNU	06
06-37	MACHILIPATNAM	06
06-55	MACHILIPATNAM (SOUTH)	06
06-33	MOPIDEVI	06
06-30	MOVVA	06
06-35	NAGAYALANKA	06
06-41	NANDIVADA	06
06-39	PAMARRU	06
06-29	PAMIDIMUKKALA	06
06-44	PEDANA	06
06-40	PEDAPARUPUDI	06
06-18	PENAMALURU	06
06-19	THOTLAVALLURU	06
06-27	UNGUTURU	06
06-28	VUYYURU	06
13-23	ADONI	13
13-25	ALUR	13
13-26	ASPARI	13
13-05	C.BELAGAL	13
13-53	CHIPPAGIRI	13
13-27	DEVANAKONDA	13
13-20	GONEGANDLA	13
13-06	GUDUR	13
13-38	GUDUR	13
13-54	HALAHARVI	13
13-24	HOLAGUNDA	13
13-18	KALLUR	13
13-19	KODUMUR	13
13-02	KOSIGI	13
13-01	KOWTHALAM	13
13-28	KRISHNAGIRI	13
13-07	KURNOOL Rural	13
13-55	KURNOOL Urban	13
13-52	MADDIKERA EAST	13
13-03	MANTRALAYAM	13
13-04	NANDAVARAM	13
13-17	ORVAKAL	13
13-51	PATTIKANDA	13
13-22	PEDDA KADUBUR	13
13-50	TUGGALI	13
13-29	VELDURTHI	13
13-21	YEMMIGANUR	13
02-14	BADANGI	02
02-26	BHOGHAPURAM	02
02-10	BOBBILI	02
02-20	BONDAPALLE	02
02-23	CHEEPURUPALLE	02
02-17	DATTIRAJERU	02
02-27	DENKADA	02
02-19	GAJAPATHINAGARAM	02
02-29	GANTYADA	02
02-22	GARIVIDI	02
02-21	GURLA	02
02-33	JAMI	02
02-34	KOTHAVALASA	02
02-32	LAKKAVARAPUKOTA	02
02-18	MENTADA	02
02-16	MERAKAMUDIDAM	02
02-24	NELLIMARLA	02
02-25	PUSAPATIREGA	02
02-04	RAJAM	02
02-13	RAMABHADRAPURAM	02
02-02	REGIDIAMADALAVALASA	02
02-03	SANTHAKAVITI	02
02-30	SRUNGAVARAPUKOTA	02
02-15	THERLAM	02
02-01	VANGARA	02
02-31	VEPADA	02
02-28	VIZIANAGARAM	02
03-25	ANANDAPURAM	03
03-27	BHEEMUNIPATNAM	03
03-30	GAJUWAKA	03
03-46	Gopalapatnam	03
03-45	Maharanipeta	03
03-47	Mulagada	03
03-26	PADMANABHAM	03
03-31	PEDAGANTYADA	03
03-24	PENDURTHI	03
03-44	Seethammadhara	03
03-28	VISAKHAPATNAM	03
14-10	BALAJIPETA	14
14-06	BHAMINI	14
14-15	GARUGUBILLI	14
14-02	GUMMALAKSHMIPURAM	14
14-01	JIYYAMMA VALASA	14
14-14	KOMARADA	14
14-03	KURUPAM	14
14-13	MAKKUVA	14
14-12	PACHIPENTA	14
14-04	PALAKONDA	14
14-08	PARVATHIPURAM	14
14-11	SALUR	14
14-05	SEETHAMPETA	14
14-09	SEETHANAGARAM	14
14-07	VEERAGHATTAM	14
09-15	ALLUR	09
09-21	ANANTHASAGARAM	09
09-13	ANUMASAMUDRAMPETA	09
09-12	ATMAKUR	09
09-06	BOGOLE	09
09-18	BUTCHIREDDIPALEM	09
09-20	CHEJERLA	09
09-14	DAGADARTHI	09
09-09	DUTTALUR	09
09-34	GUDLURU	09
09-27	INDUKURPET	09
09-04	JALADANKI	09
09-07	KALIGIRI	09
09-22	KALUVOYA	09
09-02	KANDUKUR	09
09-05	KAVALI	09
09-17	KODAVALUR	09
09-37	KONDAPURAM	09
09-26	KOVUR	09
09-03	LINGASAMUDRAM	09
09-31	MANUBOLU	09
09-11	MARRIPADU	09
09-29	MUTHUKUR	09
09-25	NELLORE	09
09-47	NELLORE (Urban)	09
09-24	PODLAKUR	09
09-23	RAPUR	09
09-19	SANGAM	09
09-01	SEETHARAMAPURAM	09
09-33	SYDAPURAM	09
09-28	THOTAPALLIGUDUR	09
09-10	UDAYAGIRI	09
09-35	ULAVAPADU	09
09-38	VARIKUNTAPADU	09
09-30	VENKATACHALAM	09
09-16	VIDAVALUR	09
09-08	VINJAMUR	09
09-36	VOLETIVARIPALEM	09
24-09	B KOTHAKOTA	24
24-23	CHINNAMANDEM	24
24-14	CHITVEL	24
24-24	GALIVEEDU	24
24-28	GURRAMKONDA	24
24-29	KALAKADA	24
24-10	KALIKIRI	24
24-30	KAMBHAMVARIPALLE	24
24-12	KODUR	24
24-07	KURABALAKOTA	24
24-25	LAKKIREDDIPALLE	24
24-01	MADANAPALLE	24
24-05	MULAKALACHERUVU	24
24-18	NANDALUR	24
24-02	NIMMANAPALLE	24
24-16	OBULAVARIPALLE	24
24-06	PEDDAMANDYAM	24
24-08	PEDDATHIPPASAMUDRAM	24
24-13	PENAGALURU	24
24-27	PILERU	24
24-15	PULLAMPETA	24
24-17	RAJAMPET	24
24-26	RAMAPURAM	24
24-03	RAMASAMUDRAM	24
24-21	RAYACHOTI	24
24-22	SAMBEPALLE	24
24-20	T SUNDUPALLE	24
24-04	THAMBALLAPALLE	24
24-11	VAYALPAD(Valmikipuram)	24
24-19	VEERABALLE	24
05-41	ACHANTA	05
05-34	AKIVEEDU	05
05-32	ATTILI	05
05-36	BHEEMAVARAM	05
05-49	GANAPAVARAM	05
05-31	IRAGAVARAM	05
05-35	KALLA	05
05-46	MOGALTHUR	05
05-45	NARASAPURAM	05
05-43	PALACOLE	05
05-37	PALAKODERU	05
05-27	PENTAPADU	05
05-40	PENUGONDA	05
05-39	PENUMANTRA	05
05-42	PODURU	05
05-18	TADEPALLIGUDEM	05
05-28	TANUKU	05
05-33	UNDI	05
05-38	VEERAVASARAM	05
05-44	YELAMANCHILI	05
26-24	ALLAGADDA	26
26-01	ATMAKUR	26
26-10	BANAGANAPALLE	26
26-09	BANDI ATMAKUR	26
26-14	BETHAMCHERLA	26
26-21	CHAGALAMARRI	26
26-13	DHONE	26
26-19	DORNIPADU	26
26-26	GADIVEMULA	26
26-17	GOSPADU	26
26-05	JUPADU BUNGALOW	26
26-12	KOILKUNTLA	26
26-28	KOLIMIGUNDLA	26
26-06	KOTHAPALLE	26
26-23	MAHANANDI	26
26-08	MIDTHUR	26
26-03	NANDI KOTKUR	26
26-16	NANDYAL	26
26-29	NANDYAL (URBAN)	26
26-11	OWK	26
26-04	PAGIDYALA	26
26-07	PAMULAPADU	26
26-25	PANYAM	26
26-15	PEAPALLY	26
26-22	RUDRAVARAM	26
26-27	SANJAMALA	26
26-18	SIRVEL	26
26-20	UYYALAWADA	26
26-02	VELGODU	26
23-06	BALAYAPALLE	23
23-23	BUCHINAIDU KHANDRIGA	23
23-28	CHANDRAGIRI	23
23-02	CHILLAKUR	23
23-34	CHINNAGOTTIGALLU	23
23-05	CHITTAMUR	23
23-08	DAKKILI	23
23-20	DORAVARISATRAM	23
23-01	GUDUR	23
23-13	K V P PURAM	23
23-03	KOTA	23
23-14	NAGALAPURAM	23
23-18	NAIDUPETA	23
23-16	NARAYANAVANAM	23
23-17	OJILI	23
23-29	PAKALA	23
23-19	PELLAKUR	23
23-15	PICHATUR	23
23-32	PUTTUR	23
23-30	RAMACHANDRAPURAM	23
23-11	RENIGUNTA	23
23-25	SATYAVEDU	23
23-09	SRIKALAHASTI	23
23-21	SULLURPETA	23
23-22	TADA	23
23-10	THOTTAMBEDU	23
23-27	TIRUPATI RURAL	23
23-26	Tirupati Urban	23
23-31	VADAMALAPETA	23
23-04	VAKADU	23
23-24	VARADAIAHPALEM	23
23-07	VENKATAGIRI	23
23-12	YERPEDU	23
23-33	YERRAVARIPALEM	23
11-28	ATLUR	11
11-08	B KODUR	11
11-11	BADVEL	11
11-07	BRAHMAMGARIMATTAM	11
11-35	CHAKRAYAPET	11
11-14	CHAPAD	11
11-27	CHENNUR	11
11-32	CHINTHA KOMMADINNE	11
11-31	CUDDAPAH	11
11-05	DUVVUR	11
11-12	GOPAVARAM	11
11-16	JAMMALAMADUGU	11
11-09	KALASAPADU	11
11-25	KAMALAPURAM	11
11-13	KHAJIPET	11
11-01	KONDAPURAM	11
11-19	LINGALA	11
11-17	MUDDANUR	11
11-02	MYLAVARAM	11
11-03	PEDDAMUDIUM	11
11-33	PENDLIMARRI	11
11-10	PORUMAMILLA	11
11-15	PRODDUTUR	11
11-20	PULIVENDLA	11
11-04	RAJU PALEM	11
11-06	S MYDUKUR	11
11-30	SIDHOUT	11
11-18	SIMHADRIPURAM	11
11-51	Sri Avadhutha Kasinayana	11
11-22	THANDUR	11
11-26	VALLUR	11
11-23	VEERAPUNAYUNIPALLE	11
11-34	VEMPALLE	11
11-21	VEMULA	11
11-29	VONTIMITTA	11
11-24	YERRAGUNTLA	11
01-18	AMADALAVALASA	01
01-11	BURJA	01
01-08	ETCHERLA	01
01-05	GANGUVARI SINGADAM	01
01-20	GARA	01
01-16	HIRAMANDALAM	01
01-37	ICHCHAPURAM	01
01-23	JALUMURU	01
01-35	KANCHILI	01
01-36	KAVITI	01
01-28	KOTABOMMILI	01
01-15	KOTHURU	01
01-06	LAVERU	01
01-38	LNPETA	01
01-33	MANDASA	01
01-26	MEILAPUTTI	01
01-30	NANDIGAM	01
01-22	NARASANNAPETA	01
01-32	PALASA	01
01-25	PATHAPATNAM	01
01-21	POLAKI	01
01-09	PONDURU	01
01-07	RANASTALAM	01
01-29	SANTHABOMMALI	01
01-24	SARAVAKOTA	01
01-17	SARUBUJJILI	01
01-34	SOMPETA	01
01-19	SRIKAKULAM	01
01-27	TEKKALI	01
01-31	VAJRAPUKOTHURU	01
\.


--
-- Data for Name: market_values; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.market_values (id, district, mandal, village, classification, rate_per_unit, unit, effective_from) FROM stdin;
mv01	Anantapur	Anantapur Urban	Bukkarayasamudram	agri	250000	Acres-Guntas	2024-01-01
mv02	Anantapur	Anantapur Urban	Bukkarayasamudram	non-agri	5000	Sq.yd	2024-01-01
mv03	Krishna	Vijayawada Urban	Gannavaram	non-agri	15000	Sq.yd	2024-01-01
mv04	Krishna	Vijayawada Urban	Gannavaram	agri	800000	Acres-Guntas	2024-01-01
mv05	Chittoor	Tirupati Urban	Tiruchanur	agri	500000	Acres-Guntas	2024-01-01
mv06	Guntur	Guntur Urban	Mangalagiri	non-agri	8000	Sq.ft	2024-01-01
mv07	East Godavari	Kakinada Urban	Samalkot	agri	350000	Acres-Guntas	2024-01-01
mv08	Visakhapatnam	Visakhapatnam Urban	Pendurthi	non-agri	12000	Sq.yd	2024-01-01
mv09	Kurnool	Kurnool Urban	Orvakal	agri	200000	Acres-Guntas	2024-01-01
mv10	YSR Kadapa	Kadapa Urban	Rajampet	agri	180000	Acres-Guntas	2024-01-01
\.


--
-- Data for Name: notes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notes (id, owner_user_id, entity_type, entity_id, body, created_at) FROM stdin;
9387749e-ef0d-4944-8037-8cd072899bc3	sankara.telukutla	passbook	test-pb-1	First site visit done; boundary stones intact.	2026-07-12T11:03:50.226542
c4c0f3f6-3de0-45cc-a73a-55341b71ac65	sankara.telukutla	passbook	test-pb-1	Tax paid for 2025-26.	2026-07-12T11:03:50.248957
5b2c15f8-62d4-41d3-9bc4-22ce8841fb5a	sankara.telukutla	passbook	21025732-9cc2-40ac-8556-9d7e87976155	howa reyou	2026-07-12T18:13:30.516184
22477b80-f182-4a6d-a597-be7dccc8be6e	sankara.telukutla	parcel	86c78df1-1100-4dfd-9274-0b1236dd4ccf	how are you?	2026-07-15T08:45:56.301287
40fa5436-1e9d-4dbe-b5db-840720e29f66	sankara.telukutla	parcel	86c78df1-1100-4dfd-9274-0b1236dd4ccf	this is test	2026-07-16T02:29:59.795930
\.


--
-- Data for Name: notification_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notification_log (id, owner_user_id, channel, recipient, subject, body, provider, status, error, created_at) FROM stdin;
\.


--
-- Data for Name: parcel_owners; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.parcel_owners (id, parcel_id, owner_name, acquisition_source, extent, mutation_type, mutation_date, is_current, created_at) FROM stdin;
cd8c0948-78a	af0af913-934	Telukutla Shankar Reddy	sale	2.12	acquisition	2026-07-11	f	2026-07-11T04:22:01.506812
d81d9453-d1a	af0af913-934	Ramaiah Naidu	gift	2.12	gift	2026-07-11	t	2026-07-11T04:22:01.519580
5792de26-878	425d6c0f-464	Telukutla Shankara Reddy --- Nasarreddy	sale	2.12	acquisition	2026-07-11	t	2026-07-11T04:48:17.196361
d7f3d0dd-a2d	ab5842af-dd7	Telukutla Shankara Reddy --- Nasarreddy	sale	5.42	acquisition	2026-07-11	t	2026-07-11T04:48:17.217284
f562bded-315	f6c30cd5-6ad	Telukutla Shankara Reddy --- Nasarreddy	sale	3.11	acquisition	2026-07-11	t	2026-07-11T04:48:17.233647
dee77b01-9b6	fbf3304f-da2	Telukutla Shankara Reddy --- Nasarreddy	sale	2.8	acquisition	2026-07-11	t	2026-07-11T04:48:17.246692
6746dc13-87a	124ddce0-111	Telukutla Shankara Reddy --- Nasarreddy	sale	0.42	acquisition	2026-07-11	t	2026-07-11T04:48:17.258100
96367d23-df3	b06bbf75-f91	Telukutla Shankara Reddy --- Nasarreddy	sale	0.35	acquisition	2026-07-11	t	2026-07-11T04:48:17.273430
9522e6f9-521	763ac144-51e	Telukutla Shankara Reddy --- Nasarreddy	sale	0.94	acquisition	2026-07-11	t	2026-07-11T04:48:17.286093
d922ea3e-c32	fc4c483a-0a3	Telukutla Shankarareddy Narsareddy	sale	2.12	acquisition	2026-07-11	t	2026-07-11T04:54:35.566605
363d6153-929	e25951cb-5f4	Telukutla Shankarareddy Narsareddy	sale	5.42	acquisition	2026-07-11	t	2026-07-11T04:54:35.587426
733b3e89-e18	d7774d23-c51	Telukutla Shankarareddy Narsareddy	sale	3.11	acquisition	2026-07-11	t	2026-07-11T04:54:35.605161
24129374-69c	27d9b749-b1f	Telukutla Shankarareddy Narsareddy	sale	2.8	acquisition	2026-07-11	t	2026-07-11T04:54:35.622018
d1378b3b-dea	5c753fca-a64	Telukutla Shankarareddy Narsareddy	sale	0.42	acquisition	2026-07-11	t	2026-07-11T04:54:35.641768
623533ed-6b2	c17af883-fad	Telukutla Shankarareddy Narsareddy	sale	0.35	acquisition	2026-07-11	t	2026-07-11T04:54:35.657512
551dd427-4c0	30aae226-472	Telukutla Shankarareddy Narsareddy	sale	0.94	acquisition	2026-07-11	t	2026-07-11T04:54:35.672177
16c2045b-87c	00ef51a4-d14	Chintalapudi Sweta	sale	200	acquisition	2026-07-11	t	2026-07-11T05:20:29.440274
06062f7d-ca0	a28c1ac0-e2a	Telukutla Shankarredi	sale	2.12	acquisition	2026-07-11	t	2026-07-11T05:51:34.735373
e15e2751-6c7	1e613205-1a3	Telukutla Shankarredi	sale	5.42	acquisition	2026-07-11	t	2026-07-11T05:51:34.751122
8e5e035f-a91	35b21fe2-32d	Telukutla Shankarredi	sale	3.11	acquisition	2026-07-11	t	2026-07-11T05:51:34.767080
6a02e671-de9	caf598fe-fab	Telukutla Shankarredi	sale	2.8	acquisition	2026-07-11	t	2026-07-11T05:51:34.784624
6733c954-2de	b103f7b0-606	Telukutla Shankarredi	sale	0.42	acquisition	2026-07-11	t	2026-07-11T05:51:34.797521
fab7170a-e0a	1c3a9685-038	Telukutla Shankarredi	sale	0.35	acquisition	2026-07-11	t	2026-07-11T05:51:34.809283
2d9bf6c5-5f9	1a6eb58a-548	Telukutla Shankarredi	sale	0.94	acquisition	2026-07-11	t	2026-07-11T05:51:34.821734
b8395ec6-cf7	220ac5c7-c2b		sale	1	acquisition	2026-07-11	t	2026-07-11T06:06:22.374428
4eac56b1-d21	38452269-025	Telukutla Shankar Reddy	sale	2.12	acquisition	2026-07-11	t	2026-07-11T07:56:31.133471
589adccc-203	f45770e5-58a	Telukutla Shankar Reddy	sale	5.42	acquisition	2026-07-11	t	2026-07-11T07:56:31.149136
de8fb92e-c12	f2495781-f60	Telukutla Shankar Reddy	sale	3.11	acquisition	2026-07-11	t	2026-07-11T07:56:31.162160
2d6fba04-a8e	e8cdbf5d-715	Telukutla Shankar Reddy	sale	2.8	acquisition	2026-07-11	t	2026-07-11T07:56:31.177944
f9c263ba-dcf	905282f1-16c	Telukutla Shankar Reddy	sale	0.42	acquisition	2026-07-11	t	2026-07-11T07:56:31.191783
7fd12d01-56c	16eaafbe-973	Telukutla Shankar Reddy	sale	0.35	acquisition	2026-07-11	t	2026-07-11T07:56:31.204804
e2cc68a8-50a	5339e6c8-56c	Telukutla Shankar Reddy	sale	0.94	acquisition	2026-07-11	t	2026-07-11T07:56:31.216739
7395897a-1cd	dd81b408-9bc	Telukutla Shankararreddy	sale	2.12	acquisition	2026-07-11	t	2026-07-11T08:21:51.874484
e722407b-402	4a63e4ab-193	Telukutla Shankararreddy	sale	5.42	acquisition	2026-07-11	t	2026-07-11T08:21:51.890567
d8e55c30-722	d9fa88e8-51d	Telukutla Shankararreddy	sale	3.11	acquisition	2026-07-11	t	2026-07-11T08:21:51.905908
2aa469d9-a54	987fe2d9-9e8	Telukutla Shankararreddy	sale	2.8	acquisition	2026-07-11	t	2026-07-11T08:21:51.926053
030161ae-85e	9d2a7d00-d2f	Telukutla Shankararreddy	sale	0.42	acquisition	2026-07-11	t	2026-07-11T08:21:51.939554
b9f3c061-fd4	a32f8fd8-1e1	Telukutla Shankararreddy	sale	0.35	acquisition	2026-07-11	t	2026-07-11T08:21:51.952286
f064d6a4-d83	b467efe4-c4b	Telukutla Shankararreddy	sale	0.94	acquisition	2026-07-11	t	2026-07-11T08:21:51.964820
61ab79d8-1b79-4107-a101-a489846a109e	51140d00-55f0-4688-b0ed-fad4c3383c56	Telukutla Shankar Reddy	sale	2.8	acquisition	2026-07-25	t	2026-07-25T15:58:16.715623
40e59fc5-7699-46bf-b689-4e15332c1da6	8002c479-0e50-424f-806c-b8fa88f8f608	Telukutla Saraswathi	inheritance	0.16	acquisition	2026-07-25	t	2026-07-25T18:19:44.838451
843c1d4e-87a1-4090-99a0-9d0ddf7f0f61	45c4456b-ea27-41c7-bdbc-6fcdd149a6fa	Telukutla Nasarureddy	grant	4.6	acquisition	2026-07-25	t	2026-07-25T18:20:27.109306
da870939-caa4-43c5-bae2-cee254503080	09d5d17c-c2ff-4d42-a5ae-76a308ff8c54	Telukutla Shankar Reddy	sale	0.42	acquisition	2026-07-25	t	2026-07-25T15:58:16.731045
f56845fa-2fce-4dc2-89cf-572f1a4c64a0	08def8a0-e0e0-4a58-bc35-c835dc36e197	Telukutla Saraswathi	inheritance	0.28	acquisition	2026-07-25	t	2026-07-25T18:19:44.864044
1ee07164-0889-4f5e-a9a3-3fec847ab090	5d7424a7-aaa7-46d8-972f-73720f49061d	Telukutla Nasarureddy	inheritance	0.71	acquisition	2026-07-25	t	2026-07-25T18:20:27.064841
79326c49-a6aa-4ad7-9c1e-1ef7ff18b75b	505439b0-dcff-4ccb-8a94-de115bb0a4a6	Telukutla Shankar Reddy	sale	0.35	acquisition	2026-07-25	t	2026-07-25T15:58:16.749730
79529af5-fa60-44d2-8f38-59774c846690	a5ae06c1-0691-4fd7-8673-f9b85607490e	Telukutla Saraswathi	inheritance	0.46	acquisition	2026-07-25	t	2026-07-25T18:19:44.881827
c9e0d4d9-f6f5-4078-9311-f83a8684b5c9	404acaf7-2443-411d-a383-d51f83071d7c	Telukutla Nasarureddy	inheritance	1.09	acquisition	2026-07-25	t	2026-07-25T18:20:27.020327
1f793772-3bc8-4b14-b0c9-cbf06ae59dfc	9b6d23b6-d199-4114-865d-13bc7f0f2ace	Telukutla Shankar Reddy	sale	0.94	acquisition	2026-07-25	t	2026-07-25T15:58:16.765127
0d00e02f-57bc-4c6e-afe7-2a0f7d47aed4	e3daa6f3-0965-4bef-9070-9453c0efb5b5	Telukutla Saraswathi	inheritance	0.56	acquisition	2026-07-25	t	2026-07-25T18:19:44.898844
4d70b332-44f8-4e33-af41-9dfd86feba15	d89a0249-c709-4576-bbeb-bfdaa8f0f222	Telukutla Nasarureddy	inheritance	0.59	acquisition	2026-07-25	t	2026-07-25T18:20:27.127112
712e2860-816a-4029-becc-87cfd91df359	bcc2a620-3648-4170-8100-e36f3f60b903	Telukutla Saraswathi	inheritance	1.39	acquisition	2026-07-25	t	2026-07-25T18:19:44.730573
a360c715-3816-41cc-b0d5-6a32fed635e3	349695a6-0803-4b1a-9730-28af8b895ddc	Telukutla Saraswathi	inheritance	0.64	acquisition	2026-07-25	t	2026-07-25T18:19:44.913097
5fbbfd57-0788-4877-8599-8d0ad7667006	d7351394-56ef-4d8a-9dc9-ac3fabd3030c	Telukutla Nasarureddy	inheritance	0.33	acquisition	2026-07-25	t	2026-07-25T18:20:27.094216
d56f04ee-8f90-44bd-8865-d50fdffef712	1e60a1b2-8789-4244-ae6c-5b31d5a8787b	Telukutla Saraswathi	inheritance	0.27	acquisition	2026-07-25	t	2026-07-25T18:19:44.753190
b9537973-5e46-4beb-9875-098f3fc000b2	bf7c6ad8-f3f3-4306-87f1-6bb1f2235ae7	Telukutla Saraswathi	inheritance	1.54	acquisition	2026-07-25	t	2026-07-25T18:19:44.936250
c4646712-5d2f-4473-a4ac-69abad9f5597	9ffbfb36-9981-41ac-a873-8e91c41bb223	Telukutla Nasarureddy	inheritance	0.76	acquisition	2026-07-25	t	2026-07-25T18:20:26.991195
fe6e12ce-f660-4a8c-ac7e-413ec506d037	51d80114-a7b6-4047-8e16-d780ddfb143d	Sankara Reddy Telukutla	sale	5	acquisition	2026-07-25	t	2026-07-25T18:21:20.885566
84b98df1-146c-4950-90f1-978f5f61b1d2	1c3320f6-1b18-4db5-875a-0d2aa11b28d3	Telukutla Saraswathi	inheritance	0.53	acquisition	2026-07-25	t	2026-07-25T18:19:44.770514
15e12ed6-d296-437d-931f-1e14fc0e8a4f	836d46b2-e44f-40da-afa2-bf24e832fc28	Telukutla Nasarureddy	inheritance	5.43	acquisition	2026-07-25	t	2026-07-25T18:20:26.976772
c3063001-95b0-4e17-97d5-978a6a155f90	c00a2254-3c4d-47bc-9a33-2fb8bbce1994	Sankara Reddy Telukutla	sale	25	acquisition	2026-07-25	t	2026-07-25T18:21:20.903887
071a4e24-c680-4f31-ac53-6cc2599c8922	cd6df532-a9ae-49c8-9bdd-75739ae87235	Telukutla Shankar Reddy	sale	2.12	acquisition	2026-07-25	t	2026-07-25T15:58:16.656829
b980f280-5fe4-4533-a065-53af5872564d	23b65a4a-d8ff-4c02-a2c6-62f918aa611b	Telukutla Saraswathi	inheritance	3.2	acquisition	2026-07-25	t	2026-07-25T18:19:44.786958
5966cc0a-df67-4bdf-893a-90134cf11665	95f01d67-6663-401e-a2c9-9e3dd6e7d168	Telukutla Nasarureddy	inheritance	0.07	acquisition	2026-07-25	t	2026-07-25T18:20:27.050789
219684bc-6777-4bc7-9933-02f3027a23cb	14f2d54e-5d86-4a5a-837a-0885e4d0cc54	Telukutla Shweta	sale	30	acquisition	2026-07-25	t	2026-07-25T18:21:43.451128
2ec67881-4d3a-42af-a999-c9a157680456	a53e7a48-21c0-4b70-b45a-039804c2c6e9	Telukutla Shankar Reddy	sale	5.42	acquisition	2026-07-25	t	2026-07-25T15:58:16.681185
0c324353-d7f2-4aa5-b296-412f068f122f	c343eaf3-0f84-46f9-9c57-d88bc75c89a0	Telukutla Saraswathi	inheritance	3.2	acquisition	2026-07-25	t	2026-07-25T18:19:44.803285
d8c66f54-999f-420f-ada1-70e3326a26f1	ae5707a8-a1d5-4cf1-9f12-bf8e58b927dd	Telukutla Nasarureddy	inheritance	0.91	acquisition	2026-07-25	t	2026-07-25T18:20:27.036725
e0d3ccb3-86d4-405e-9992-053db2d97a29	7ff59380-12c8-4ebb-91af-7a6e4fc5ff22	Telukutla Shankar Reddy	sale	3.11	acquisition	2026-07-25	t	2026-07-25T15:58:16.700011
4aeae4a4-5ac4-4e16-b086-c8344ae3fbe9	a7d01041-d2df-4b1b-9e82-5906bc1a1fe3	Telukutla Saraswathi	inheritance	0.16	acquisition	2026-07-25	t	2026-07-25T18:19:44.818598
cc6affce-08f5-425b-8755-8a981ae3b063	407aa0db-01d5-402a-b051-c887bbbb6efa	Telukutla Nasarureddy	inheritance	0.77	acquisition	2026-07-25	t	2026-07-25T18:20:27.078912
\.


--
-- Data for Name: parcels; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.parcels (id, passbook_id, survey_no, subdivision, extent, unit, classification, acquisition_source, geo_point, created_at, parent_parcel_id, source, status, label, address, boundary_north, boundary_south, boundary_east, boundary_west, purchase_price, purchase_date, guideline_value, market_value, stamp_duty, loan_amount, encumbrance_status, reg_doc_no, sro, reg_date, ec_status, ec_date, mutation_status, tax_paid_upto, rera_no, litigation, litigation_note, stake) FROM stdin;
pc02	pb01	45	2	1.5	Acres-Guntas	agri	inheritance		2024-01-15		manual	owned							0		0	0	0	0										f		owned
pc04	pb03	78		2	Acres-Guntas	agri	gift		2024-03-10		manual	owned							0		0	0	0	0										f		owned
pc06	pb05	210		5	Acres-Guntas	agri	partition		2024-05-12		manual	owned							0		0	0	0	0										f		owned
211ad1b0-3f2	2c38be48-994	183	1	2.12	Acres-Guntas	agri	sale		2026-07-11T04:09:33.688950		manual	owned							0		0	0	0	0										f		owned
c286c11f-ed9	2c38be48-994	183	2	5.42	Acres-Guntas	agri	sale		2026-07-11T04:09:33.697386		manual	owned							0		0	0	0	0										f		owned
07e09457-d94	2c38be48-994	120	2	2.8	Acres-Guntas	agri	sale		2026-07-11T04:09:33.704602		manual	owned							0		0	0	0	0										f		owned
66a8c476-010	b57c940f-240	183	1	2.12	Acres-Guntas	agri	sale		2026-07-11T04:10:52.960859		manual	owned							0		0	0	0	0										f		owned
e1a9e4f2-33d	b57c940f-240	183	2	5.42	Acres-Guntas	agri	sale		2026-07-11T04:10:52.972942		manual	owned							0		0	0	0	0										f		owned
9c0e85c7-cf6	b57c940f-240	183	3	3.11	Acres-Guntas	agri	sale		2026-07-11T04:10:52.984282		manual	owned							0		0	0	0	0										f		owned
050d98b4-4ab	b57c940f-240	120	2	2.8	Acres-Guntas	agri	sale		2026-07-11T04:10:52.995678		manual	owned							0		0	0	0	0										f		owned
b2948326-ffd	b57c940f-240	741	1A	0.42	Acres-Guntas	agri	sale		2026-07-11T04:10:53.006958		manual	owned							0		0	0	0	0										f		owned
55dae4a7-037	b57c940f-240	740	2D	0.35	Acres-Guntas	agri	sale		2026-07-11T04:10:53.018040		manual	owned							0		0	0	0	0										f		owned
3840568c-e47	b57c940f-240	398	1	0.94	Acres-Guntas	agri	sale		2026-07-11T04:10:53.030173		manual	owned							0		0	0	0	0										f		owned
af0af913-934	dd454c9b-e7b	183	1	2.12	Acres-Guntas	agri	sale		2026-07-11T04:22:01.506812		manual	owned							0		0	0	0	0										f		owned
425d6c0f-464	8229066a-703	183	1	2.12	Acres-Guntas	agri	sale		2026-07-11T04:48:17.196361		manual	owned							0		0	0	0	0										f		owned
ab5842af-dd7	8229066a-703	183	2	5.42	Acres-Guntas	agri	sale		2026-07-11T04:48:17.217284		manual	owned							0		0	0	0	0										f		owned
f6c30cd5-6ad	8229066a-703	183	3	3.11	Acres-Guntas	agri	sale		2026-07-11T04:48:17.233647		manual	owned							0		0	0	0	0										f		owned
fbf3304f-da2	8229066a-703	120	2	2.8	Acres-Guntas	agri	sale		2026-07-11T04:48:17.246692		manual	owned							0		0	0	0	0										f		owned
124ddce0-111	8229066a-703	741	1A	0.42	Acres-Guntas	agri	sale		2026-07-11T04:48:17.258100		manual	owned							0		0	0	0	0										f		owned
b06bbf75-f91	8229066a-703	740	2D	0.35	Acres-Guntas	agri	sale		2026-07-11T04:48:17.273430		manual	owned							0		0	0	0	0										f		owned
763ac144-51e	8229066a-703	398	1	0.94	Acres-Guntas	agri	sale		2026-07-11T04:48:17.286093		manual	owned							0		0	0	0	0										f		owned
fc4c483a-0a3	ed003ec0-f20	183	1	2.12	Acres-Guntas	agri	sale		2026-07-11T04:54:35.566605		manual	owned							0		0	0	0	0										f		owned
e25951cb-5f4	ed003ec0-f20	183	2	5.42	Acres-Guntas	agri	sale		2026-07-11T04:54:35.587426		manual	owned							0		0	0	0	0										f		owned
d7774d23-c51	ed003ec0-f20	183	3	3.11	Acres-Guntas	agri	sale		2026-07-11T04:54:35.605161		manual	owned							0		0	0	0	0										f		owned
27d9b749-b1f	ed003ec0-f20	120	2	2.8	Acres-Guntas	agri	sale		2026-07-11T04:54:35.622018		manual	owned							0		0	0	0	0										f		owned
5c753fca-a64	ed003ec0-f20	741	1A	0.42	Acres-Guntas	agri	sale		2026-07-11T04:54:35.641768		manual	owned							0		0	0	0	0										f		owned
c17af883-fad	ed003ec0-f20	740	2D	0.35	Acres-Guntas	agri	sale		2026-07-11T04:54:35.657512		manual	owned							0		0	0	0	0										f		owned
30aae226-472	ed003ec0-f20	398	1	0.94	Acres-Guntas	agri	sale		2026-07-11T04:54:35.672177		manual	owned							0		0	0	0	0										f		owned
a28c1ac0-e2a	f915435e-8d9	183	1	2.12	Acres-Guntas	agri	sale		2026-07-11T05:51:34.735373		passbook:f915435e-8d9	owned							0		0	0	0	0										f		owned
1e613205-1a3	f915435e-8d9	183	2	5.42	Acres-Guntas	agri	sale		2026-07-11T05:51:34.751122		passbook:f915435e-8d9	owned							0		0	0	0	0										f		owned
35b21fe2-32d	f915435e-8d9	183	3	3.11	Acres-Guntas	agri	sale		2026-07-11T05:51:34.767080		passbook:f915435e-8d9	owned							0		0	0	0	0										f		owned
caf598fe-fab	f915435e-8d9	120	2	2.8	Acres-Guntas	agri	sale		2026-07-11T05:51:34.784624		passbook:f915435e-8d9	owned							0		0	0	0	0										f		owned
b103f7b0-606	f915435e-8d9	741	1A	0.42	Acres-Guntas	agri	sale		2026-07-11T05:51:34.797521		passbook:f915435e-8d9	owned							0		0	0	0	0										f		owned
1c3a9685-038	f915435e-8d9	740	2D	0.35	Acres-Guntas	agri	sale		2026-07-11T05:51:34.809283		passbook:f915435e-8d9	owned							0		0	0	0	0										f		owned
1a6eb58a-548	f915435e-8d9	398	1	0.94	Acres-Guntas	agri	sale		2026-07-11T05:51:34.821734		passbook:f915435e-8d9	owned							0		0	0	0	0										f		owned
38452269-025	359d05c0-4ce	183	1	2.12	Acres-Guntas	agri	sale		2026-07-11T07:56:31.133471		passbook:359d05c0-4ce	owned							0		0	0	0	0										f		owned
f45770e5-58a	359d05c0-4ce	183	2	5.42	Acres-Guntas	agri	sale		2026-07-11T07:56:31.149136		passbook:359d05c0-4ce	owned							0		0	0	0	0										f		owned
f2495781-f60	359d05c0-4ce	183	3	3.11	Acres-Guntas	agri	sale		2026-07-11T07:56:31.162160		passbook:359d05c0-4ce	owned							0		0	0	0	0										f		owned
e8cdbf5d-715	359d05c0-4ce	120	2	2.8	Acres-Guntas	agri	sale		2026-07-11T07:56:31.177944		passbook:359d05c0-4ce	owned							0		0	0	0	0										f		owned
905282f1-16c	359d05c0-4ce	741	1A	0.42	Acres-Guntas	agri	sale		2026-07-11T07:56:31.191783		passbook:359d05c0-4ce	owned							0		0	0	0	0										f		owned
16eaafbe-973	359d05c0-4ce	740	2D	0.35	Acres-Guntas	agri	sale		2026-07-11T07:56:31.204804		passbook:359d05c0-4ce	owned							0		0	0	0	0										f		owned
5339e6c8-56c	359d05c0-4ce	398	1	0.94	Acres-Guntas	agri	sale	{"type":"Point","coordinates":[78.33114624023439,16.557227187102736]}	2026-07-11T07:56:31.216739		passbook:359d05c0-4ce	owned							0		0	0	0	0										f		owned
pc03	pb02	123	A	0.049587	sqyd	non-agri	sale		2024-02-20		manual	owned							0		0	0	0	0										f		owned
pc05	pb04	156	3	0.027548	sqft	non-agri	sale		2024-04-05		manual	owned							0		0	0	0	0										f		owned
pc07	pb06	89	B	0.103306	sqyd	non-agri	sale		2024-06-01		manual	owned							0		0	0	0	0										f		owned
pc08	pb02	124		2.471054	hectare	agri	will		2024-02-25		manual	owned							0		0	0	0	0										f		owned
00ef51a4-d14	2b367d8e-f56	191	92	0.041322	sqyd	non-agri	sale		2026-07-11T05:20:29.440274		document:063f596c-048	owned							0		0	0	0	0										f		owned
dd81b408-9bc	9dba6df8-f23	183	1	2.12	Acres-Guntas	agri	sale		2026-07-11T08:21:51.874484		passbook:9dba6df8-f23	owned							0		0	0	0	0										f		owned
4a63e4ab-193	9dba6df8-f23	183	2	5.42	Acres-Guntas	agri	sale		2026-07-11T08:21:51.890567		passbook:9dba6df8-f23	owned							0		0	0	0	0										f		owned
d9fa88e8-51d	9dba6df8-f23	183	3	3.11	Acres-Guntas	agri	sale		2026-07-11T08:21:51.905908		passbook:9dba6df8-f23	owned							0		0	0	0	0										f		owned
987fe2d9-9e8	9dba6df8-f23	120	2	2.8	Acres-Guntas	agri	sale		2026-07-11T08:21:51.926053		passbook:9dba6df8-f23	owned							0		0	0	0	0										f		owned
9d2a7d00-d2f	9dba6df8-f23	741	1A	0.42	Acres-Guntas	agri	sale		2026-07-11T08:21:51.939554		passbook:9dba6df8-f23	owned							0		0	0	0	0										f		owned
a32f8fd8-1e1	9dba6df8-f23	740	2D	0.35	Acres-Guntas	agri	sale		2026-07-11T08:21:51.952286		passbook:9dba6df8-f23	owned							0		0	0	0	0										f		owned
220ac5c7-c2b	8617ff45-3be	191		0.000207	sqyd	agri	sale	{"type": "Point", "coordinates": [80.6, 16.5]}	2026-07-11T06:06:22.374428		manual	owned							0		0	0	0	0										f		owned
b467efe4-c4b	9dba6df8-f23	398	1	0.94	Acres-Guntas	agri	sale		2026-07-11T08:21:51.964820		passbook:9dba6df8-f23	owned							0		0	0	0	0										f		owned
505439b0-dcff-4ccb-8a94-de115bb0a4a6	0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	740	2D	0.35	Acres-Guntas	agri	sale		2026-07-25T15:58:16.749730		passbook:0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	owned							0		0	0	0	0										f		owned
c343eaf3-0f84-46f9-9c57-d88bc75c89a0	4636d51d-34fa-428f-95ad-78dc0a565700	71	2	3.2	Acres-Guntas	agri	inheritance		2026-07-25T18:19:44.803285		passbook:4636d51d-34fa-428f-95ad-78dc0a565700	owned							0		0	0	0	0										f		owned
349695a6-0803-4b1a-9730-28af8b895ddc	4636d51d-34fa-428f-95ad-78dc0a565700	124	7	0.64	Acres-Guntas	agri	inheritance		2026-07-25T18:19:44.913097		passbook:4636d51d-34fa-428f-95ad-78dc0a565700	owned							0		0	0	0	0										f		owned
ae5707a8-a1d5-4cf1-9f12-bf8e58b927dd	11020755-9293-4e72-b4a4-f1f1668ecfa4	127	2	0.91	Acres-Guntas	agri	inheritance		2026-07-25T18:20:27.036725		passbook:11020755-9293-4e72-b4a4-f1f1668ecfa4	owned							0		0	0	0	0										f		owned
d7351394-56ef-4d8a-9dc9-ac3fabd3030c	11020755-9293-4e72-b4a4-f1f1668ecfa4	458	5	0.33	Acres-Guntas	agri	inheritance		2026-07-25T18:20:27.094216		passbook:11020755-9293-4e72-b4a4-f1f1668ecfa4	owned							0		0	0	0	0										f		owned
pc01	pb01	45	1	3.2	Acres-Guntas	agri	inheritance		2024-01-15		manual	for-sale			Road				0		5000000	6500000	0	0		1234/2024	Markapuram		clear		completed	2025-2026		f		owned
cd6df532-a9ae-49c8-9bdd-75739ae87235	0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	183	1	2.12	Acres-Guntas	agri	sale		2026-07-25T15:58:16.656829		passbook:0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	owned							0		0	0	0	0										f		owned
9b6d23b6-d199-4114-865d-13bc7f0f2ace	0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	398	1	0.94	Acres-Guntas	agri	sale		2026-07-25T15:58:16.765127		passbook:0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	owned							0		0	0	0	0										f		owned
a7d01041-d2df-4b1b-9e82-5906bc1a1fe3	4636d51d-34fa-428f-95ad-78dc0a565700	128	6	0.16	Acres-Guntas	agri	inheritance		2026-07-25T18:19:44.818598		passbook:4636d51d-34fa-428f-95ad-78dc0a565700	owned							0		0	0	0	0										f		owned
407aa0db-01d5-402a-b051-c887bbbb6efa	11020755-9293-4e72-b4a4-f1f1668ecfa4	455	8	0.77	Acres-Guntas	agri	inheritance		2026-07-25T18:20:27.078912		passbook:11020755-9293-4e72-b4a4-f1f1668ecfa4	owned							0		0	0	0	0										f		owned
51d80114-a7b6-4047-8e16-d780ddfb143d	e5ed3781-8b71-4dfe-bf3d-d449db24d85c	1	C1B	5	Acres-Guntas	agri	sale		2026-07-25T18:21:20.885566		passbook:e5ed3781-8b71-4dfe-bf3d-d449db24d85c	owned							0		0	0	0	0										f		managed
a53e7a48-21c0-4b70-b45a-039804c2c6e9	0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	183	2	5.42	Acres-Guntas	agri	sale		2026-07-25T15:58:16.681185		passbook:0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	owned							0		0	0	0	0										f		owned
bcc2a620-3648-4170-8100-e36f3f60b903	4636d51d-34fa-428f-95ad-78dc0a565700	119	2	1.39	Acres-Guntas	agri	inheritance		2026-07-25T18:19:44.730573		passbook:4636d51d-34fa-428f-95ad-78dc0a565700	owned							0		0	0	0	0										f		owned
8002c479-0e50-424f-806c-b8fa88f8f608	4636d51d-34fa-428f-95ad-78dc0a565700	126	6	0.16	Acres-Guntas	agri	inheritance		2026-07-25T18:19:44.838451		passbook:4636d51d-34fa-428f-95ad-78dc0a565700	owned							0		0	0	0	0										f		owned
45c4456b-ea27-41c7-bdbc-6fcdd149a6fa	11020755-9293-4e72-b4a4-f1f1668ecfa4	81	4	4.6	Acres-Guntas	agri	grant		2026-07-25T18:20:27.109306		passbook:11020755-9293-4e72-b4a4-f1f1668ecfa4	owned							0		0	0	0	0										f		owned
c00a2254-3c4d-47bc-9a33-2fb8bbce1994	e5ed3781-8b71-4dfe-bf3d-d449db24d85c	1	D	25	Acres-Guntas	agri	sale		2026-07-25T18:21:20.903887		passbook:e5ed3781-8b71-4dfe-bf3d-d449db24d85c	owned							0		0	0	0	0										f		watch
7ff59380-12c8-4ebb-91af-7a6e4fc5ff22	0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	183	3	3.11	Acres-Guntas	agri	sale		2026-07-25T15:58:16.700011		passbook:0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	owned							0		0	0	0	0										f		owned
1e60a1b2-8789-4244-ae6c-5b31d5a8787b	4636d51d-34fa-428f-95ad-78dc0a565700	128	3	0.27	Acres-Guntas	agri	inheritance		2026-07-25T18:19:44.753190		passbook:4636d51d-34fa-428f-95ad-78dc0a565700	owned							0		0	0	0	0										f		owned
08def8a0-e0e0-4a58-bc35-c835dc36e197	4636d51d-34fa-428f-95ad-78dc0a565700	124	10	0.28	Acres-Guntas	agri	inheritance		2026-07-25T18:19:44.864044		passbook:4636d51d-34fa-428f-95ad-78dc0a565700	owned							0		0	0	0	0										f		owned
bf7c6ad8-f3f3-4306-87f1-6bb1f2235ae7	4636d51d-34fa-428f-95ad-78dc0a565700	126	2	1.54	Acres-Guntas	agri	inheritance		2026-07-25T18:19:44.936250		passbook:4636d51d-34fa-428f-95ad-78dc0a565700	owned							0		0	0	0	0										f		owned
9ffbfb36-9981-41ac-a873-8e91c41bb223	11020755-9293-4e72-b4a4-f1f1668ecfa4	123	1	0.76	Acres-Guntas	agri	inheritance		2026-07-25T18:20:26.991195		passbook:11020755-9293-4e72-b4a4-f1f1668ecfa4	owned							0		0	0	0	0										f		owned
5d7424a7-aaa7-46d8-972f-73720f49061d	11020755-9293-4e72-b4a4-f1f1668ecfa4	455	7	0.71	Acres-Guntas	agri	inheritance		2026-07-25T18:20:27.064841		passbook:11020755-9293-4e72-b4a4-f1f1668ecfa4	owned							0		0	0	0	0										f		owned
14f2d54e-5d86-4a5a-837a-0885e4d0cc54	93e0c0cc-aa2d-4182-91d3-88ee07308832	1		30	Acres-Guntas	agri	sale		2026-07-25T18:21:43.451128		passbook:93e0c0cc-aa2d-4182-91d3-88ee07308832	owned							0		0	0	0	0										f		owned
51140d00-55f0-4688-b0ed-fad4c3383c56	0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	120	2	2.8	Acres-Guntas	agri	sale	{"type":"Polygon","coordinates":[[[79.4544553756714,15.594548281083979],[79.45381164550783,15.59239882117767],[79.45664405822755,15.591902788772725],[79.45698738098146,15.593246207097131],[79.4544553756714,15.594548281083979]]]}	2026-07-25T15:58:16.715623		passbook:0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	owned							0		0	0	0	0										f		owned
1c3320f6-1b18-4db5-875a-0d2aa11b28d3	4636d51d-34fa-428f-95ad-78dc0a565700	128	5	0.53	Acres-Guntas	agri	inheritance		2026-07-25T18:19:44.770514		passbook:4636d51d-34fa-428f-95ad-78dc0a565700	owned							0		0	0	0	0										f		owned
a5ae06c1-0691-4fd7-8673-f9b85607490e	4636d51d-34fa-428f-95ad-78dc0a565700	125	1	0.46	Acres-Guntas	agri	inheritance		2026-07-25T18:19:44.881827		passbook:4636d51d-34fa-428f-95ad-78dc0a565700	owned							0		0	0	0	0										f		owned
836d46b2-e44f-40da-afa2-bf24e832fc28	11020755-9293-4e72-b4a4-f1f1668ecfa4	119	5	5.43	Acres-Guntas	agri	inheritance		2026-07-25T18:20:26.976772		passbook:11020755-9293-4e72-b4a4-f1f1668ecfa4	owned							0		0	0	0	0										f		owned
404acaf7-2443-411d-a383-d51f83071d7c	11020755-9293-4e72-b4a4-f1f1668ecfa4	125	3	1.09	Acres-Guntas	agri	inheritance		2026-07-25T18:20:27.020327		passbook:11020755-9293-4e72-b4a4-f1f1668ecfa4	owned							0		0	0	0	0										f		owned
09d5d17c-c2ff-4d42-a5ae-76a308ff8c54	0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	741	1A	0.42	Acres-Guntas	agri	sale		2026-07-25T15:58:16.731045		passbook:0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	owned							0		0	0	0	0										f		owned
23b65a4a-d8ff-4c02-a2c6-62f918aa611b	4636d51d-34fa-428f-95ad-78dc0a565700	70	3	3.2	Acres-Guntas	agri	inheritance		2026-07-25T18:19:44.786958		passbook:4636d51d-34fa-428f-95ad-78dc0a565700	owned							0		0	0	0	0										f		owned
e3daa6f3-0965-4bef-9070-9453c0efb5b5	4636d51d-34fa-428f-95ad-78dc0a565700	125	2	0.56	Acres-Guntas	agri	inheritance		2026-07-25T18:19:44.898844		passbook:4636d51d-34fa-428f-95ad-78dc0a565700	owned							0		0	0	0	0										f		owned
95f01d67-6663-401e-a2c9-9e3dd6e7d168	11020755-9293-4e72-b4a4-f1f1668ecfa4	442	2	0.07	Acres-Guntas	agri	inheritance		2026-07-25T18:20:27.050789		passbook:11020755-9293-4e72-b4a4-f1f1668ecfa4	owned							0		0	0	0	0										f		owned
d89a0249-c709-4576-bbeb-bfdaa8f0f222	11020755-9293-4e72-b4a4-f1f1668ecfa4	456	3	0.59	Acres-Guntas	agri	inheritance		2026-07-25T18:20:27.127112		passbook:11020755-9293-4e72-b4a4-f1f1668ecfa4	owned							0		0	0	0	0										f		owned
\.


--
-- Data for Name: passbooks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.passbooks (id, owner_user_id, pattadar_no, district, mandal, village, created_at, state, owner_name, father_husband_name, photo, group_id) FROM stdin;
pb01	u01	PB-ATP-2024-001	Anantapur	Anantapur Urban	Bukkarayasamudram	2024-01-15					1b23e0f3-17e0-488d-87d8-b374ceabcdc8
pb02	u01	PB-KRN-2024-002	Krishna	Vijayawada Urban	Gannavaram	2024-02-20					1b23e0f3-17e0-488d-87d8-b374ceabcdc8
pb03	u02	PB-CTR-2024-003	Chittoor	Tirupati Urban	Tiruchanur	2024-03-10					e88a18f2-f6fa-4229-8b34-47ca6c92ed0d
pb04	u03	PB-GNT-2024-004	Guntur	Guntur Urban	Mangalagiri	2024-04-05					4eb5516e-37b6-4c40-9171-7cbeea271515
pb05	u04	PB-EGD-2024-005	East Godavari	Kakinada Urban	Samalkot	2024-05-12					ffcc7f0e-ae36-4fed-8be0-a37f1b709969
pb06	u06	PB-VSP-2024-006	Visakhapatnam	Visakhapatnam Urban	Pendurthi	2024-06-01					b17f61e9-b71c-4580-a31c-8f276cb8ee10
11020755-9293-4e72-b4a4-f1f1668ecfa4	sankara.telukutla	593	Markapuram	Konakanamitla	Katragunta	2026-07-25T18:20:26.962741	Andhra Pradesh	Telukutla Nasarureddy	Mallareddy		75fc1d4d-1c31-40e2-9b0a-e42378b312b6
e5ed3781-8b71-4dfe-bf3d-d449db24d85c	sankara.telukutla	5001	Markapuram	Tarlapadu	Mangala Kunta	2026-07-25T18:21:20.870041	Andhra Pradesh	Sankara Reddy Telukutla	Nasara Reddy Telukutla		75fc1d4d-1c31-40e2-9b0a-e42378b312b6
93e0c0cc-aa2d-4182-91d3-88ee07308832	sankara.telukutla	567	Markapuram	Tarlapadu	Mangala Kunta	2026-07-25T18:21:43.429679	Andhra Pradesh	Telukutla Shweta	Shankar Reddy		75fc1d4d-1c31-40e2-9b0a-e42378b312b6
0c8d96cb-f82b-442f-a527-fb7bcb9e31d1	sankara.telukutla	1422	Markapuram	Konakanamitla	Katragunta	2026-07-25T15:58:16.638184	Andhra Pradesh	Telukutla Shankar Reddy	Nasar Reddy		75fc1d4d-1c31-40e2-9b0a-e42378b312b6
4636d51d-34fa-428f-95ad-78dc0a565700	sankara.telukutla	573	Markapuram	Konakanamitla	Katragunta	2026-07-25T18:19:44.707801	Andhra Pradesh	Telukutla Saraswathi	Nasara Reddy		75fc1d4d-1c31-40e2-9b0a-e42378b312b6
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.projects (id, owner_user_id, name, builder_name, project_type, rera_no, address, city, geo_point, created_at) FROM stdin;
\.


--
-- Data for Name: properties; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.properties (id, owner_user_id, group_id, project_id, type, label, address, locality, city, district, geo_point, land_area, land_unit, builtup_area, builtup_unit, acquisition_mode, holding_status, purchase_price, purchase_date, guideline_value, market_value, current_value, reg_doc_no, sro, reg_date, ghmc_assessment_no, khata_no, rera_no, ec_status, ec_date, mutation_status, tax_paid_upto, litigation, litigation_note, attributes, notes, created_at, stake) FROM stdin;
4d5581ca-0e6e-44b2-99b3-b5436f6b65f3	sankara.telukutla	75fc1d4d-1c31-40e2-9b0a-e42378b312b6		open_plot	Nallapadu 200 Sq.yd Plot No.150			Guntur	Guntur		200	Sq.yd	0	Sq.ft	purchase	owned	80000	2006-09-13	0	0	0	6950/2006/2006	Nallapadu	2006-09-13								f		{"plot_no":"150","dimensions":"55' x 33'","corner":"no","road_width":40,"layout":"Nallapadu Layout","boundaries":{"north":"Plot No.151 site - 55 ft","south":"Plot No.149 site - 55 ft","east":"40-ft-wide road - 33 ft","west":"Plot No.141 site - 33 ft"},"stamp_duty":730,"registration_fee":2000,"deed_type":"GPA"}		2026-07-25T13:25:07.841616	owned
c68aad95-e52a-4d82-8a11-9805ca16fd26	sankara.telukutla	8bd71ece-f339-42eb-8063-a56809c64bc0		open_plot	Nallapadu 418.5-sqyd site plot			Guntur	Guntur		418.5	Sq.yd	0	Sq.ft	purchase	owned	84000	2003-01-04	0	0	0		S.R.O. Nallapadu	2003-01-04								f		{"plot_no":"D.No.563/5 (Plots 53,70A,70B)","dimensions":"55'0\\" x 66'0\\"","corner":"yes","road_width":30,"layout":"Mathrusri Anasuyamba Nagar","boundaries":{"north":"30-ft-wide road — 71 ft","south":"Kanakavalli Harinadh & Kanigalla Adinarayana's plot — 68 ft","east":"Land sold to Yarjuna Challa Sridevi — 66 ft","west":"20-ft-wide road — 46 ft"},"deed_type":"Sale Deed"}		2026-07-25T13:25:07.795431	owned
41fbd988-bbfa-496e-926b-285e2ca1b51a	sankara.telukutla	75fc1d4d-1c31-40e2-9b0a-e42378b312b6		open_plot	Ankireddipalem 210 Sq.yd Plot No.60			Guntur	Guntur		210	Sq.yd	0	Sq.ft	purchase	owned	210000	2010-12-21	0	0	0	9221/2010	Nallapadu	2010-12-21								f		{"plot_no":"60","dimensions":"55'6\\" x 34'","corner":"no","road_width":30,"boundaries":{"north":"Plot No.61 site — 34 ft","south":"Plot No.59 site — 34 ft","east":"Puyyuru Damodarreddy land — 55 ft 6 in","west":"30-ft-wide road — 55 ft 6 in"},"stamp_duty":16800,"registration_fee":1050,"deed_type":"Sale Deed"}		2026-07-25T08:58:33.313274	owned
acb44db9-4c9b-4960-81c8-0676061e723c	sankara.telukutla	75fc1d4d-1c31-40e2-9b0a-e42378b312b6		open_plot	Nallapadu Plot No.150 - 200 Sq.yd			Guntur	Guntur		200	Sq.yd	0	Sq.ft	purchase	owned	80000	2006-09-13	0	0	0	6950/2006/2006	Nallapadu	2006-09-13								f		{"plot_no":"150","dimensions":"55' x 33'","corner":"no","road_width":40,"boundaries":{"north":"Plot No.151 site — 55 ft","south":"Plot No.149 site — 55 ft","east":"40-ft-wide road — 33 ft","west":"Plot No.141 site — 33 ft"},"stamp_duty":730,"registration_fee":2000,"deed_type":"GPA"}		2026-07-25T08:58:33.252331	owned
\.


--
-- Data for Name: property_owners; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.property_owners (id, property_id, owner_name, user_id, group_id, share_pct, role, is_current, created_at) FROM stdin;
b55ed558-0182-4099-8e62-1c4c884933ee	acb44db9-4c9b-4960-81c8-0676061e723c	Chintalapudi Swetha	sankara.telukutla		100	owner	t	2026-07-25T08:58:33.252331
7f6eef00-37a0-4d03-a7fb-692ca42a9f5a	acb44db9-4c9b-4960-81c8-0676061e723c	Chaluvadi Ramesh			0	seller	f	2026-07-25T08:58:33.252331
00279398-336a-477c-ab0f-bf94b6774c3c	41fbd988-bbfa-496e-926b-285e2ca1b51a	Chintalapoodi Swetha	sankara.telukutla		100	owner	t	2026-07-25T08:58:33.313274
0d48efd6-b7f7-4dc9-aa54-d384ff923444	41fbd988-bbfa-496e-926b-285e2ca1b51a	Bhavanam Vijayalakshmi			0	seller	f	2026-07-25T08:58:33.313274
49b4d40d-c94f-4c41-ba46-256838620383	c68aad95-e52a-4d82-8a11-9805ca16fd26	Chintalapudi Swetha	sankara.telukutla		100	owner	t	2026-07-25T13:25:07.795431
93bd22a0-f920-48ff-9d3a-0f184f16d6ab	c68aad95-e52a-4d82-8a11-9805ca16fd26	Kanigalla Dasaratharamayya			0	seller	f	2026-07-25T13:25:07.795431
fda2f76d-2741-4e73-9530-5ba7ed495e4d	4d5581ca-0e6e-44b2-99b3-b5436f6b65f3	Chintalapudi Swetha	sankara.telukutla		100	owner	t	2026-07-25T13:25:07.841616
1fe87949-4eed-4810-946e-08122af8d846	4d5581ca-0e6e-44b2-99b3-b5436f6b65f3	Chaluvadi Ramesh			0	seller	f	2026-07-25T13:25:07.841616
\.


--
-- Data for Name: registered_documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.registered_documents (id, owner_user_id, doc_type, document_no, reg_year, book_no, sro, registration_date, execution_date, consideration, stamp_duty, transfer_duty, registration_fee, user_charges, total_fee, village, mandal, district, survey_no, plot_no, extent, classification, boundary_north, boundary_south, boundary_east, boundary_west, prior_document, gpa_document, scanning_id, file_ref, passbook_id, parcel_id, created_at) FROM stdin;
1f79045f-51ed-4db2-acab-27d6ec4d4f2a	sankara.telukutla	Sale Deed	9221	2010	1	Nallapadu	2010-12-21	2010-12-21	210000	16800	0	1050	110	17960	Ankireddipalem	Chebrole	Guntur	29	60	210 sq yards (175-58 sq mts)	house-site	Plot No.61 site boundary	Plot No.59 site boundary	Vuyyuru Damodarreddy's land boundary	30 feet wide road boundary	2807/2009, 9216/2010						2026-07-16T15:50:15.166086
\.


--
-- Data for Name: service_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.service_requests (id, req_type, parcel_id, sro_code, status, details, created_at) FROM stdin;
sr01	site_photos	pc01		pending	Drone images of the field — Survey 45/1, Anantapur	2026-07-20
sr02	repair			in_progress	Bathroom leakage fix — Flat, Hyderabad	2026-07-18
sr03	survey	pc03		completed	Boundary re-measurement report — Kurnool parcel	2026-07-15
\.


--
-- Data for Name: sro_offices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sro_offices (id, code, name, dr_zone, district, mandal) FROM stdin;
513	513	ACHANTA			
801	801	ADDANKI			
1301	1301	ADONI			
514	514	AKIVIDU			
401	401	ALAMURU			
1302	1302	ALLAGADDA			
416	416	ALLAVARAM			
901	901	ALLUR			
1303	1303	ALUR			
101	101	AMADALAVALASA			
414	414	AMALAPURAM			
719	719	AMARAVATHI			
415	415	AMBAJIPET			
802	802	AMMANABROLU			
707	707	AMRUTHALURU			
301	301	ANAKAPALLI			
319	319	ANANDAPURAM			
1221	1221	ANANTAPUR RURAL			
501	501	ANANTHAPALLI			
1220	1220	ANANTHAPUR (R.O)			
733	733	ANANTHAVARAM			
417	417	ANAPARTHI			
1304	1304	ASPARI			
1305	1305	ATMAKUR			
902	902	ATMAKUR			
418	418	ATREYAPURAM			
512	512	ATTILI			
601	601	AVANIGADDA			
1024	1024	B.KOTHAKOTA			
1101	1101	BADVEL			
1306	1306	BANAGANAPALLI			
1323	1323	BANDI ATMAKUR			
1001	1001	BANGARUPALEM			
613	613	BANTUMILLY			
720	720	BAPATLA			
701	701	BATTIPROLU			
1324	1324	BETAMCHERLA			
302	302	BHEEMUNIPATNAM			
502	502	BHIMADOLE			
515	515	BHIMAVARAM			
202	202	BHOGAPURAM			
402	402	BICCAVOLU			
201	201	BOBBILI			
903	903	BUCHIREDDYPALEM			
919	919	BUJABUJA NELLORE			
1201	1201	BUKKAPATNAM			
1002	1002	C.G.GALLU			
1203	1203	C.K.PALLI			
602	602	CHALLAPALLI			
1012	1012	CHANDRAGIRI			
702	702	CHEBROLU			
703	703	CHERUKUPALLI			
721	721	CHILAKALURIPET			
1202	1202	CHILAMATHUR			
805	805	CHIMAKURTHY			
503	503	CHINTALAPUDI			
203	203	CHIPURUPALLI			
803	803	CHIRALA			
1023	1023	CHITTOOR RURAL			
1011	1011	CHITTOOR(R.O)			
1102	1102	CHITVEL			
303	303	CHODAVARAM			
1117	1117	CUDDAPAH (R.O)			
804	804	CUMBUM			
806	806	DARSI			
1204	1204	DHARMAVARAM			
1307	1307	DHONE			
403	403	DRAKSHARAMA			
704	704	DUGGIRALA			
1115	1115	DUVVUR			
314	314	DWARAKANAGAR			
511	511	ELURU (R.O)			
204	204	GAJAPATHINAGARAM			
312	312	GAJUWAKA			
516	516	GANAPAVARAM			
614	614	GANNAVARAM			
807	807	GIDDALUR			
1205	1205	GOOTY			
313	313	GOPALAPATNAM			
603	603	GUDIVADA			
1308	1308	GUDUR-Kurnool			
904	904	GUDUR-Nellor			
615	615	GUNADALA			
526	526	GUNIPUDI			
1206	1206	GUNTAKAL			
722	722	GURAJALA			
715	715	Guntur (R.O.)			
1207	1207	HINDUPUR			
102	102	HIRAMANDALAM			
419	419	I.POLAVARAM			
616	616	IBRAHIMPATNAM			
103	103	ICHAPURAM			
905	905	INDUKURPET			
808	808	INKOLLU			
504	504	J.R.GUDEM			
624	624	JAGGAIAHPET			
404	404	JAGGAMPETA			
1103	1103	JAMMALAMADUGU			
304	304	K.KOTAPADU			
1013	1013	K.NAGARAM			
1118	1118	KADAPA RURAL			
1208	1208	KADIRI			
420	420	KADIYAM			
604	604	KAIKALUR			
413	413	KAKINADA(R.O)			
724	724	KAKUMANU			
1003	1003	KALIKIRI			
1322	1322	KALLUR			
1209	1209	KALYANDURG			
1104	1104	KAMALAPURAM			
506	506	KAMAVARAPUKOTA			
618	618	KANCHIKACHERLA			
809	809	KANDUKUR			
1210	1210	KANEKAL			
810	810	KANIGIRI			
617	617	KANKIPADU			
605	605	KANUMOLE			
104	104	KASIBUGGA			
906	906	KAVALI			
606	606	KAVUTHARAM			
1309	1309	KODUMUR			
1310	1310	KOILAKUNTLA			
705	705	KOLLURU			
706	706	KOLLIPARA			
732	732	KORETIPADU			
422	422	KORUKONDA			
1311	1311	KOSIGI			
907	907	KOTA			
105	105	KOTABOMMALI			
305	305	KOTAURATLA			
421	421	KOTHAPETA			
205	205	KOTHAVALASA			
908	908	KOVUR			
505	505	KOVVUR			
723	723	KROSUR			
1004	1004	KUPPAM			
1321	1321	KURNOOL(R.O)			
206	206	KURUPAM			
1105	1105	LAKKIREDDIPALLY			
316	316	LANKELAPALEM			
709	709	M.V.PALEM			
725	725	MACHERLA			
612	612	MACHILIPATNAM(R.O)			
1211	1211	MADAKASIRA			
1005	1005	MADANAPALLE			
306	306	MADUGULA			
315	315	MADURAWADA			
424	424	MALIKIPURAM			
423	423	MAMIDIKUDURU			
734	734	MANDADAM			
405	405	MANDAPETA			
106	106	MANDASA			
607	607	MANDAVALLI			
708	708	MANGALAGIRI			
811	811	MARKAPURAM			
812	812	MARTOOR			
517	517	MOGALTHURU			
608	608	MOVVA			
1108	1108	MUDDANUR			
609	609	MUDINEPALLI			
425	425	MUMMUDIVARAM			
909	909	MUTHUKUR			
1107	1107	MYDUKUR			
625	625	MYLAVARAM			
1014	1014	NAGARI			
910	910	NAIDUPET			
308	308	NAKKAPALLI			
716	716	NALLAPADU			
619	619	NANDIGAMA			
1312	1312	NANDIKOTKUR			
1313	1313	NANDYAL			
731	731	NARASARAOPET (R.O)			
107	107	NARSANNAPET			
518	518	NARSAPUR			
307	307	NARSIPATNAM			
207	207	NELLIMARLA			
917	917	NELLORE (R.O)			
507	507	NIDADAVOLE			
628	628	NUNNA			
620	620	NUZVIDU			
818	818	ONGOLE (R.O)			
1319	1319	ORVAKAL			
1314	1314	OWK			
320	320	PADERU			
1015	1015	PAKALA			
519	519	PALAKOL			
108	108	PALAKONDA			
1006	1006	PALAMANER			
610	610	PAMARRU			
1213	1213	PAMIDI			
1315	1315	PANYAM			
815	815	PARCHUR			
208	208	PARVATHIPURAM			
621	621	PATAMATA			
109	109	PATHAPATNAM			
1316	1316	PATHIKONDA			
1317	1317	PEAPALLY			
317	317	PEDAGANTYADA			
717	717	PEDAKAKANI			
728	728	PEDAKURAPADU			
611	611	PEDANA			
407	407	PEDDAPURAM			
318	318	PENDURTHI			
521	521	PENTAPADU			
520	520	PENUGONDA			
1212	1212	PENUKONDA			
726	726	PHIRANGIPURAM			
1016	1016	PICHATUR			
432	432	PIDIMGOYYA			
727	727	PIDUGURALLA			
1007	1007	PILER			
406	406	PITHAPURAM			
911	911	PODALAKUR			
813	813	PODILI			
508	508	POLAVARAM			
110	110	PONDURU			
710	710	PONNURU			
711	711	PRATHIPADU			
408	408	PRATHIPADU			
1106	1106	PRODDATUR			
1109	1109	PULIVENDULA			
1110	1110	PULLAMPET			
1008	1008	PUNGANUR			
1017	1017	PUTTUR			
428	428	RAJAHMUNDRY (R.O)			
111	111	RAJAM			
1112	1112	RAJAMPET			
427	427	RAJANAGARAM			
409	409	RAMACHANDRAPURAM			
433	433	RAMPACHODAVARAM			
112	112	RANASTHALAM			
912	912	RAPUR			
429	429	RAVULAPALEM			
1111	1111	RAYACHOTI			
1214	1214	RAYADURG			
426	426	RAZOLE			
1018	1018	RENIGUNTA			
712	712	REPALLI			
210	210	S.KOTA			
309	309	SABBAVARAM			
527	527	SAJJAPURAM			
209	209	SALURU			
410	410	SAMALKOTA			
814	814	SANTANUTHALAPADU			
431	431	SARPAVARAM			
1019	1019	SATHYAVEDU			
729	729	SATTENAPALLI			
430	430	SEETHANAGARAM			
1113	1113	SIDDOUT			
1215	1215	SINGANAMALA			
816	816	SINGARAYAKONDA			
1318	1318	SIRVELLA			
113	113	SOMPETA			
115	115	SRIKAKULAM (O.B)			
1020	1020	SRIKALAHASTI			
918	918	STONE HOUSEPET			
913	913	SULLURPET			
1116	1116	T.SUNDUPALLI			
509	509	TADEPALLIGUDEM			
714	714	TADIKONDA			
412	412	TALLAREVU			
1217	1217	TANAKAL			
522	522	TANUKU			
114	114	TEKKALI			
713	713	TENALI			
718	718	TENALI(WEST)			
1216	1216	THADIPATRI			
1009	1009	THAMBALLAPALLE			
211	211	THERLAM			
1021	1021	THOTTAMBEDU			
735	735	THULLURU			
1026	1026	TIRUCHANURU			
1022	1022	TIRUPATHI (R.0)			
1025	1025	TIRUPATHI RURAL			
622	622	TIRUVURU			
411	411	TUNI			
914	914	UDAYAGIRI			
523	523	UNDI			
1218	1218	URAVAKONDA			
525	525	VATLUR			
1010	1010	VAYALPADU			
524	524	VEERASAVARAM			
510	510	VEGESWARAPURAM			
1114	1114	VEMPALLY			
915	915	VENKATAGIRI			
213	213	VIJAYANAGARAM (WEST)			
627	627	VIJAYAWADA			
916	916	VINJAMUR			
730	730	VINUKONDA			
311	311	VISAKHAPATNAM(R.O)			
626	626	VISSANNAPET			
212	212	VIZIANAGARAM (R.O)			
623	623	VUYYURU			
1219	1219	YADIKI			
310	310	YELAMANCHILI			
1320	1320	YEMMIGANUR			
817	817	YERRAGONDAPALEM			
\.


--
-- Data for Name: states; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.states (id, name, code) FROM stdin;
AP	Andhra Pradesh	AP
AR	Arunachal Pradesh	AR
AS	Assam	AS
BR	Bihar	BR
CG	Chhattisgarh	CG
GA	Goa	GA
GJ	Gujarat	GJ
HR	Haryana	HR
HP	Himachal Pradesh	HP
JH	Jharkhand	JH
KA	Karnataka	KA
KL	Kerala	KL
MP	Madhya Pradesh	MP
MH	Maharashtra	MH
MN	Manipur	MN
ML	Meghalaya	ML
MZ	Mizoram	MZ
NL	Nagaland	NL
OD	Odisha	OD
PB	Punjab	PB
RJ	Rajasthan	RJ
SK	Sikkim	SK
TN	Tamil Nadu	TN
TS	Telangana	TS
TR	Tripura	TR
UP	Uttar Pradesh	UP
UK	Uttarakhand	UK
WB	West Bengal	WB
AN	Andaman and Nicobar Islands	AN
CH	Chandigarh	CH
DH	Dadra and Nagar Haveli and Daman and Diu	DH
DL	Delhi	DL
JK	Jammu and Kashmir	JK
LA	Ladakh	LA
LD	Lakshadweep	LD
PY	Puducherry	PY
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, mobile, email, name, language, kyc_ref_masked, roles, notification_prefs, districts_of_interest, mfa_enabled, address, last_active_at) FROM stdin;
u01	9876543210	ramesh.kumar@example.com	Ramesh Kumar	en	XXXX-XXXX-1234	owner	email,sms		f		2026-07-23T14:01:16.009450
u02	9876543211	sita.devi@example.com	Sita Devi	te	XXXX-XXXX-5678	owner	sms		f		2026-07-23T14:01:16.009450
u03	9876543212	venkat.rao@example.com	Venkat Rao	en	XXXX-XXXX-9012	owner,agent	email		f		2026-07-23T14:01:16.009450
u04	9876543213	lakshmi.naidu@example.com	Lakshmi Naidu	te		owner	email,sms		f		2026-07-23T14:01:16.009450
u05	9876543214	admin@pattadar.in	System Admin	en		system_admin	email		f		2026-07-23T14:01:16.009450
u06	9876543215	suresh.reddy@example.com	Suresh Reddy	en	XXXX-XXXX-3456	owner	sms		f		2026-07-23T14:01:16.009450
sankara.telukutla			sankara.telukutla	en		owner	email,sms		f		2026-07-25T22:32:55.892903
\.


--
-- Data for Name: villages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.villages (id, name, mandal_id) FROM stdin;
v01	Bukkarayasamudram	m01
v02	Raptadu	m02
v03	Tiruchanur	m03
v04	Chandragiri Fort	m04
v05	Samalkot	m05
v06	Kadiyam	m06
v07	Mangalagiri	m07
v08	Duggirala	m08
v09	Gannavaram	m09
v10	Pedana	m10
v11	Orvakal	m11
v12	Banaganapalle	m12
v13	Mypadu	m13
v14	Kodavaluru	m14
v15	Chimakurthy	m15
v16	Pendurthi	m16
v17	Rajampet	m17
\.


--
-- Data for Name: division; Type: TABLE DATA; Schema: ref; Owner: -
--

COPY ref.division (row_id, country_code, division_code, division_name, division_type, is_active, localized_names, created_at, updated_at, created_by, updated_by) FROM stdin;
1	AD	AD-07	Andorra la Vella	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2	AD	AD-02	Canillo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3	AD	AD-03	Encamp	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
4	AD	AD-08	Escaldes-Engordany	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
5	AD	AD-04	La Massana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
6	AD	AD-05	Ordino	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
7	AD	AD-06	Sant Julia de Loria	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
8	AE	AE-AJ	'Ajman	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
9	AE	AE-AZ	Abu Zaby	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
10	AE	AE-FU	Al Fujayrah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
11	AE	AE-SH	Ash Shariqah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
12	AE	AE-DU	Dubayy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
13	AE	AE-RK	Ra's al Khaymah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
14	AE	AE-UQ	Umm al Qaywayn	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
15	AF	AF-BDS	Badakhshan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
16	AF	AF-BDG	Badghis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
17	AF	AF-BGL	Baghlan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
18	AF	AF-BAL	Balkh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
19	AF	AF-BAM	Bamyan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
20	AF	AF-DAY	Daykundi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
21	AF	AF-FRA	Farah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
22	AF	AF-FYB	Faryab	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
23	AF	AF-GHA	Ghazni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
24	AF	AF-GHO	Ghor	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
25	AF	AF-HEL	Helmand	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
26	AF	AF-HER	Herat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
27	AF	AF-JOW	Jowzjan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
28	AF	AF-KAB	Kabul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
29	AF	AF-KAN	Kandahar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
30	AF	AF-KAP	Kapisa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
31	AF	AF-KHO	Khost	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
32	AF	AF-KNR	Kunar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
33	AF	AF-KDZ	Kunduz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
34	AF	AF-LAG	Laghman	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
35	AF	AF-LOG	Logar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
36	AF	AF-NAN	Nangarhar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
37	AF	AF-NIM	Nimroz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
38	AF	AF-PKA	Paktika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
39	AF	AF-PIA	Paktiya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
40	AF	AF-PAR	Parwan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
41	AF	AF-SAR	Sar-e Pul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
42	AF	AF-TAK	Takhar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
43	AF	AF-URU	Uruzgan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
44	AG	AG-10	Barbuda	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
45	AG	AG-03	Saint George	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
46	AG	AG-04	Saint John	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
47	AG	AG-05	Saint Mary	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
48	AG	AG-06	Saint Paul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
49	AG	AG-07	Saint Peter	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
50	AG	AG-08	Saint Philip	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
51	AI	-	Anguilla	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
52	AL	AL-01	Berat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
53	AL	AL-09	Diber	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
54	AL	AL-02	Durres	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
55	AL	AL-03	Elbasan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
56	AL	AL-04	Fier	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
57	AL	AL-05	Gjirokaster	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
58	AL	AL-06	Korce	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
59	AL	AL-07	Kukes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
60	AL	AL-08	Lezhe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
61	AL	AL-10	Shkoder	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
62	AL	AL-11	Tirane	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
63	AL	AL-12	Vlore	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
64	AM	AM-AG	Aragacotn	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
65	AM	AM-AR	Ararat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
66	AM	AM-AV	Armavir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
67	AM	AM-ER	Erevan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
68	AM	AM-GR	Gegark'unik'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
69	AM	AM-KT	Kotayk'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
70	AM	AM-LO	Lori	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
71	AM	AM-SH	Sirak	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
72	AM	AM-SU	Syunik'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
73	AM	AM-TV	Tavus	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
74	AM	AM-VD	Vayoc Jor	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
75	AO	AO-BGO	Bengo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
76	AO	AO-BGU	Benguela	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
77	AO	AO-BIE	Bie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
78	AO	AO-CAB	Cabinda	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
79	AO	AO-CCU	Cuando Cubango	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
80	AO	AO-CNO	Cuanza-Norte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
81	AO	AO-CUS	Cuanza-Sul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
82	AO	AO-CNN	Cunene	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
83	AO	AO-HUA	Huambo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
84	AO	AO-HUI	Huila	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
85	AO	AO-LUA	Luanda	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
86	AO	AO-LNO	Lunda-Norte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
87	AO	AO-LSU	Lunda-Sul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
88	AO	AO-MAL	Malange	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
89	AO	AO-MOX	Moxico	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
90	AO	AO-NAM	Namibe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
91	AO	AO-UIG	Uige	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
92	AO	AO-ZAI	Zaire	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
93	AQ	-	Antarctica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
94	AR	AR-B	Buenos Aires	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
95	AR	AR-K	Catamarca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
96	AR	AR-H	Chaco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
97	AR	AR-U	Chubut	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
98	AR	AR-C	Ciudad Autonoma de Buenos Aires	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
99	AR	AR-X	Cordoba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
100	AR	AR-W	Corrientes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
101	AR	AR-E	Entre Rios	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
102	AR	AR-P	Formosa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
103	AR	AR-Y	Jujuy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
104	AR	AR-L	La Pampa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
105	AR	AR-F	La Rioja	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
106	AR	AR-M	Mendoza	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
107	AR	AR-N	Misiones	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
108	AR	AR-Q	Neuquen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
109	AR	AR-R	Rio Negro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
110	AR	AR-A	Salta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
111	AR	AR-J	San Juan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
112	AR	AR-D	San Luis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
113	AR	AR-Z	Santa Cruz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
114	AR	AR-S	Santa Fe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
115	AR	AR-G	Santiago del Estero	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
116	AR	AR-V	Tierra del Fuego	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
117	AR	AR-T	Tucuman	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
118	AS	-	Eastern District	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
119	AS	-	Western District	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
120	AT	AT-1	Burgenland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
121	AT	AT-2	Karnten	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
122	AT	AT-3	Niederosterreich	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
123	AT	AT-4	Oberosterreich	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
124	AT	AT-5	Salzburg	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
125	AT	AT-6	Steiermark	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
126	AT	AT-7	Tirol	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
127	AT	AT-8	Vorarlberg	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
128	AT	AT-9	Wien	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
129	AU	AU-ACT	Australian Capital Territory	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
130	AU	AU-NSW	New South Wales	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
131	AU	AU-NT	Northern Territory	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
132	AU	AU-QLD	Queensland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
133	AU	AU-SA	South Australia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
134	AU	AU-TAS	Tasmania	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
135	AU	AU-VIC	Victoria	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
136	AU	AU-WA	Western Australia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
137	AW	-	Aruba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
138	AX	-	Eckeroe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
139	AX	-	Finstroem	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
140	AX	-	Hammarland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
141	AX	-	Jomala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
142	AX	-	Lemland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
143	AX	-	Mariehamn	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
144	AX	-	Saltvik	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
145	AZ	AZ-ABS	Abseron	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
146	AZ	AZ-AGC	Agcabadi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
147	AZ	AZ-AGS	Agdas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
148	AZ	AZ-AGA	Agstafa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
149	AZ	AZ-AGU	Agsu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
150	AZ	AZ-AST	Astara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
151	AZ	AZ-BA	Baki	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
152	AZ	AZ-BAL	Balakan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
153	AZ	AZ-BAR	Barda	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
154	AZ	AZ-BEY	Beylaqan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
155	AZ	AZ-BIL	Bilasuvar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
156	AZ	AZ-CAL	Calilabad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
157	AZ	AZ-FUZ	Fuzuli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
158	AZ	AZ-GAD	Gadabay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
159	AZ	AZ-GA	Ganca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
160	AZ	AZ-GOR	Goranboy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
161	AZ	AZ-GOY	Goycay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
162	AZ	AZ-GYG	Goygol	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
163	AZ	AZ-HAC	Haciqabul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
164	AZ	AZ-IMI	Imisli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
165	AZ	AZ-ISM	Ismayilli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
166	AZ	AZ-KAL	Kalbacar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
167	AZ	AZ-KUR	Kurdamir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
168	AZ	AZ-LA	Lankaran	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
169	AZ	AZ-MAS	Masalli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
170	AZ	AZ-MI	Mingacevir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
171	AZ	AZ-NA	Naftalan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
172	AZ	AZ-NX	Naxcivan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
173	AZ	AZ-NEF	Neftcala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
174	AZ	AZ-OGU	Oguz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
175	AZ	AZ-QAB	Qabala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
176	AZ	AZ-QAZ	Qazax	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
177	AZ	AZ-QBA	Quba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
178	AZ	AZ-QUS	Qusar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
179	AZ	AZ-SAT	Saatli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
180	AZ	AZ-SAB	Sabirabad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
181	AZ	AZ-SAK	Saki	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
182	AZ	AZ-SAL	Salyan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
183	AZ	AZ-SMI	Samaxi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
184	AZ	AZ-SKR	Samkir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
185	AZ	AZ-SMX	Samux	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
186	AZ	AZ-SR	Sirvan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
187	AZ	AZ-SIY	Siyazan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
188	AZ	AZ-SM	Sumqayit	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
189	AZ	AZ-TAR	Tartar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
190	AZ	AZ-TOV	Tovuz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
191	AZ	AZ-UCA	Ucar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
192	AZ	AZ-XAC	Xacmaz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
193	AZ	AZ-XIZ	Xizi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
194	AZ	AZ-XVD	Xocavand	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
195	AZ	AZ-YAR	Yardimli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
196	AZ	AZ-YEV	Yevlax	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
197	AZ	AZ-ZAQ	Zaqatala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
198	AZ	AZ-ZAR	Zardab	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
199	BA	BA-BRC	Brcko distrikt	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
200	BA	BA-BIH	Federacija Bosne i Hercegovine	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
201	BA	BA-SRP	Republika Srpska	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
202	BB	BB-01	Christ Church	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
203	BB	BB-02	Saint Andrew	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
204	BB	BB-03	Saint George	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
205	BB	BB-04	Saint James	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
206	BB	BB-05	Saint John	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
207	BB	BB-06	Saint Joseph	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
208	BB	BB-07	Saint Lucy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
209	BB	BB-08	Saint Michael	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
210	BB	BB-09	Saint Peter	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
211	BB	BB-10	Saint Philip	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
212	BB	BB-11	Saint Thomas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
213	BD	BD-A	Barishal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
214	BD	BD-B	Chattogram	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
215	BD	BD-C	Dhaka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
216	BD	BD-D	Khulna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
217	BD	BD-E	Rajshahi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
218	BD	BD-F	Rangpur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
219	BD	BD-G	Sylhet	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
220	BE	BE-VAN	Antwerpen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
221	BE	BE-WBR	Brabant wallon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
222	BE	BE-BRU	Brussels Hoofdstedelijk Gewest	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
223	BE	BE-WHT	Hainaut	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
224	BE	BE-WLG	Liege	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
225	BE	BE-VLI	Limburg	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
226	BE	BE-WLX	Luxembourg	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
227	BE	BE-WNA	Namur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
228	BE	BE-VOV	Oost-Vlaanderen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
229	BE	BE-VBR	Vlaams-Brabant	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
230	BE	BE-VWV	West-Vlaanderen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
231	BF	BF-BAL	Bale	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
232	BF	BF-BAM	Bam	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
233	BF	BF-BAN	Banwa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
234	BF	BF-BAZ	Bazega	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
235	BF	BF-BLG	Boulgou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
236	BF	BF-BLK	Boulkiemde	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
237	BF	BF-COM	Comoe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
238	BF	BF-GAN	Ganzourgou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
239	BF	BF-GNA	Gnagna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
240	BF	BF-GOU	Gourma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
241	BF	BF-HOU	Houet	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
242	BF	BF-KAD	Kadiogo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
243	BF	BF-KEN	Kenedougou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
244	BF	BF-KMP	Kompienga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
245	BF	BF-KOS	Kossi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
246	BF	BF-KOT	Kouritenga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
247	BF	BF-KOW	Kourweogo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
248	BF	BF-LER	Leraba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
249	BF	BF-LOR	Loroum	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
250	BF	BF-MOU	Mouhoun	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
251	BF	BF-NAO	Nahouri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
252	BF	BF-NAM	Namentenga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
253	BF	BF-NAY	Nayala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
254	BF	BF-OUB	Oubritenga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
255	BF	BF-OUD	Oudalan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
256	BF	BF-PAS	Passore	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
257	BF	BF-SMT	Sanmatenga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
258	BF	BF-SEN	Seno	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
259	BF	BF-SIS	Sissili	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
260	BF	BF-SOM	Soum	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
261	BF	BF-TAP	Tapoa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
262	BF	BF-TUI	Tuy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
263	BF	BF-YAT	Yatenga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
264	BF	BF-ZIR	Ziro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
265	BF	BF-ZON	Zondoma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
266	BF	BF-ZOU	Zoundweogo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
267	BG	BG-01	Blagoevgrad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
268	BG	BG-02	Burgas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
269	BG	BG-08	Dobrich	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
270	BG	BG-07	Gabrovo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
271	BG	BG-26	Haskovo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
272	BG	BG-09	Kardzhali	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
273	BG	BG-10	Kyustendil	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
274	BG	BG-11	Lovech	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
275	BG	BG-12	Montana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
276	BG	BG-13	Pazardzhik	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
277	BG	BG-14	Pernik	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
278	BG	BG-15	Pleven	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
279	BG	BG-16	Plovdiv	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
280	BG	BG-17	Razgrad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
281	BG	BG-18	Ruse	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
282	BG	BG-27	Shumen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
283	BG	BG-19	Silistra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
284	BG	BG-20	Sliven	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
285	BG	BG-21	Smolyan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
286	BG	BG-23	Sofia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
287	BG	BG-22	Sofia (stolitsa)	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
288	BG	BG-24	Stara Zagora	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
289	BG	BG-25	Targovishte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
290	BG	BG-03	Varna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
291	BG	BG-04	Veliko Tarnovo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
292	BG	BG-05	Vidin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
293	BG	BG-06	Vratsa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
294	BG	BG-28	Yambol	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
295	BH	BH-13	Al 'Asimah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
296	BH	BH-14	Al Janubiyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
297	BH	BH-15	Al Muharraq	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
298	BH	BH-17	Ash Shamaliyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
299	BI	BI-BM	Bujumbura Mairie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
300	BI	BI-BR	Bururi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
301	BI	BI-CI	Cibitoke	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
302	BI	BI-GI	Gitega	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
303	BI	BI-KI	Kirundo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
304	BI	BI-MW	Mwaro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
305	BI	BI-NG	Ngozi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
306	BI	BI-RM	Rumonge	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
307	BI	BI-RT	Rutana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
308	BI	BI-RY	Ruyigi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
309	BJ	BJ-AL	Alibori	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
310	BJ	BJ-AK	Atacora	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
311	BJ	BJ-AQ	Atlantique	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
312	BJ	BJ-BO	Borgou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
313	BJ	BJ-CO	Collines	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
314	BJ	BJ-DO	Donga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
315	BJ	BJ-LI	Littoral	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
316	BJ	BJ-OU	Oueme	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
317	BJ	BJ-PL	Plateau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
318	BJ	BJ-ZO	Zou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
319	BL	-	Saint Barthelemy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
320	BM	-	Hamilton	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
321	BM	-	Saint George	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
322	BN	BN-BE	Belait	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
323	BN	BN-BM	Brunei-Muara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
324	BN	BN-TE	Temburong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
325	BN	BN-TU	Tutong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
326	BO	BO-H	Chuquisaca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
327	BO	BO-C	Cochabamba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
328	BO	BO-B	El Beni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
329	BO	BO-L	La Paz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
330	BO	BO-O	Oruro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
331	BO	BO-N	Pando	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
332	BO	BO-P	Potosi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
333	BO	BO-S	Santa Cruz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
334	BO	BO-T	Tarija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
335	BQ	BQ-BO	Bonaire	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
336	BQ	BQ-SA	Saba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
337	BQ	BQ-SE	Sint Eustatius	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
338	BR	BR-AC	Acre	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
339	BR	BR-AL	Alagoas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
340	BR	BR-AP	Amapa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
341	BR	BR-AM	Amazonas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
342	BR	BR-BA	Bahia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
343	BR	BR-CE	Ceara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
344	BR	BR-DF	Distrito Federal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
345	BR	BR-ES	Espirito Santo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
346	BR	BR-GO	Goias	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
347	BR	BR-MA	Maranhao	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
348	BR	BR-MT	Mato Grosso	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
349	BR	BR-MS	Mato Grosso do Sul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
350	BR	BR-MG	Minas Gerais	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
351	BR	BR-PA	Para	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
352	BR	BR-PB	Paraiba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
353	BR	BR-PR	Parana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
354	BR	BR-PE	Pernambuco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
355	BR	BR-PI	Piaui	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
356	BR	BR-RN	Rio Grande do Norte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
357	BR	BR-RS	Rio Grande do Sul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
358	BR	BR-RJ	Rio de Janeiro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
359	BR	BR-RO	Rondonia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
360	BR	BR-RR	Roraima	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
361	BR	BR-SC	Santa Catarina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
362	BR	BR-SP	Sao Paulo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
363	BR	BR-SE	Sergipe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
364	BR	BR-TO	Tocantins	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
365	BS	BS-BP	Black Point	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
366	BS	BS-CO	Central Abaco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
367	BS	BS-FP	City of Freeport	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
368	BS	BS-EG	East Grand Bahama	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
369	BS	BS-HI	Harbour Island	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
370	BS	BS-LI	Long Island	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
371	BS	BS-MI	Moore's Island	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
372	BS	BS-NP	New Providence	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
373	BS	BS-NS	North Andros	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
374	BS	BS-NE	North Eleuthera	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
375	BS	BS-SS	San Salvador	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
376	BS	BS-SE	South Eleuthera	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
377	BS	BS-WG	West Grand Bahama	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
378	BT	BT-33	Bumthang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
379	BT	BT-12	Chhukha	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
380	BT	BT-22	Dagana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
381	BT	BT-GA	Gasa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
382	BT	BT-44	Lhuentse	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
383	BT	BT-42	Monggar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
384	BT	BT-11	Paro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
385	BT	BT-43	Pema Gatshel	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
386	BT	BT-23	Punakha	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
387	BT	BT-45	Samdrup Jongkhar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
388	BT	BT-14	Samtse	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
389	BT	BT-31	Sarpang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
390	BT	BT-15	Thimphu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
391	BT	BT-41	Trashigang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
392	BT	BT-32	Trongsa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
393	BT	BT-21	Tsirang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
394	BT	BT-24	Wangdue Phodrang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
395	BV	-	Bouvet Island	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
396	BW	BW-CE	Central	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
397	BW	BW-CH	Chobe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
398	BW	BW-GH	Ghanzi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
399	BW	BW-KL	Kgatleng	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
400	BW	BW-KW	Kweneng	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
401	BW	BW-NE	North East	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
402	BW	BW-NW	North West	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
403	BW	BW-SE	South East	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
404	BW	BW-SO	Southern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
405	BY	BY-BR	Brestskaya voblasts'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
406	BY	BY-HO	Homyel'skaya voblasts'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
407	BY	BY-HM	Horad Minsk	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
408	BY	BY-HR	Hrodzyenskaya voblasts'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
409	BY	BY-MA	Mahilyowskaya voblasts'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
410	BY	BY-MI	Minskaya voblasts'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
411	BY	BY-VI	Vitsyebskaya voblasts'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
412	BZ	BZ-BZ	Belize	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
413	BZ	BZ-CY	Cayo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
414	BZ	BZ-CZL	Corozal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
415	BZ	BZ-OW	Orange Walk	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
416	BZ	BZ-SC	Stann Creek	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
417	BZ	BZ-TOL	Toledo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
418	CA	CA-AB	Alberta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
419	CA	CA-BC	British Columbia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
420	CA	CA-MB	Manitoba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
421	CA	CA-NB	New Brunswick	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
422	CA	CA-NL	Newfoundland and Labrador	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
423	CA	CA-NT	Northwest Territories	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
424	CA	CA-NS	Nova Scotia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
425	CA	CA-NU	Nunavut	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
426	CA	CA-ON	Ontario	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
427	CA	CA-PE	Prince Edward Island	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
428	CA	CA-QC	Quebec	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
429	CA	CA-SK	Saskatchewan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
430	CA	CA-YT	Yukon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
431	CC	-	Cocos (Keeling) Islands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
432	CD	CD-EQ	Equateur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
433	CD	CD-HK	Haut-Katanga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
434	CD	CD-HL	Haut-Lomami	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
435	CD	CD-IT	Ituri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
436	CD	CD-KS	Kasai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
437	CD	CD-KC	Kasai Central	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
438	CD	CD-KE	Kasai Oriental	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
439	CD	CD-KN	Kinshasa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
440	CD	CD-BC	Kongo Central	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
441	CD	CD-KL	Kwilu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
442	CD	CD-LU	Lualaba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
443	CD	CD-MA	Maniema	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
444	CD	CD-NK	Nord-Kivu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
445	CD	CD-SA	Sankuru	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
446	CD	CD-SK	Sud-Kivu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
447	CD	CD-TA	Tanganyika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
448	CD	CD-TO	Tshopo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
449	CF	CF-BB	Bamingui-Bangoran	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
450	CF	CF-BGF	Bangui	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
451	CF	CF-KB	Gribingui	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
452	CF	CF-HM	Haut-Mbomou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
453	CF	CF-HK	Haute-Kotto	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
454	CF	CF-KG	Kemo-Gribingui	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
455	CF	CF-LB	Lobaye	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
456	CF	CF-HS	Mambere-Kadei	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
457	CF	CF-NM	Nana-Mambere	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
458	CF	CF-UK	Ouaka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
459	CF	CF-AC	Ouham	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
460	CF	CF-OP	Ouham-Pende	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
461	CF	CF-VK	Vakaga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
462	CG	CG-11	Bouenza	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
463	CG	CG-BZV	Brazzaville	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
464	CG	CG-8	Cuvette	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
465	CG	CG-7	Likouala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
466	CG	CG-9	Niari	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
467	CG	CG-16	Pointe-Noire	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
468	CG	CG-13	Sangha	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
469	CH	CH-AG	Aargau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
470	CH	CH-AR	Appenzell Ausserrhoden	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
471	CH	CH-AI	Appenzell Innerrhoden	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
472	CH	CH-BL	Basel-Landschaft	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
473	CH	CH-BS	Basel-Stadt	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
474	CH	CH-BE	Bern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
475	CH	CH-FR	Fribourg	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
476	CH	CH-GE	Geneve	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
477	CH	CH-GL	Glarus	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
478	CH	CH-GR	Graubunden	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
479	CH	CH-JU	Jura	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
480	CH	CH-LU	Luzern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
481	CH	CH-NE	Neuchatel	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
482	CH	CH-NW	Nidwalden	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
483	CH	CH-OW	Obwalden	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
484	CH	CH-SG	Sankt Gallen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
485	CH	CH-SH	Schaffhausen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
486	CH	CH-SZ	Schwyz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
487	CH	CH-SO	Solothurn	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
488	CH	CH-TG	Thurgau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
489	CH	CH-TI	Ticino	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
490	CH	CH-UR	Uri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
491	CH	CH-VS	Valais	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
492	CH	CH-VD	Vaud	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
493	CH	CH-ZG	Zug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
494	CH	CH-ZH	Zurich	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
495	CI	CI-AB	Abidjan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
496	CI	CI-BS	Bas-Sassandra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
497	CI	CI-CM	Comoe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
498	CI	CI-DN	Denguele	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
499	CI	CI-GD	Goh-Djiboua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
500	CI	CI-LC	Lacs	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
501	CI	CI-LG	Lagunes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
502	CI	CI-MG	Montagnes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
503	CI	CI-SM	Sassandra-Marahoue	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
504	CI	CI-SV	Savanes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
505	CI	CI-VB	Vallee du Bandama	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
506	CI	CI-WR	Woroba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
507	CI	CI-YM	Yamoussoukro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
508	CI	CI-ZZ	Zanzan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
509	CK	-	Cook Islands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
510	CL	CL-AI	Aisen del General Carlos Ibanez del Campo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
511	CL	CL-AN	Antofagasta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
512	CL	CL-AP	Arica y Parinacota	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
513	CL	CL-AT	Atacama	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
514	CL	CL-BI	Biobio	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
515	CL	CL-CO	Coquimbo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
516	CL	CL-AR	La Araucania	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
517	CL	CL-LI	Libertador General Bernardo O'Higgins	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
518	CL	CL-LL	Los Lagos	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
519	CL	CL-LR	Los Rios	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
520	CL	CL-MA	Magallanes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
521	CL	CL-ML	Maule	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
522	CL	CL-NB	Nuble	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
523	CL	CL-RM	Region Metropolitana de Santiago	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
524	CL	CL-TA	Tarapaca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
525	CL	CL-VS	Valparaiso	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
526	CM	CM-AD	Adamaoua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
527	CM	CM-CE	Centre	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
528	CM	CM-ES	Est	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
529	CM	CM-EN	Extreme-Nord	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
530	CM	CM-LT	Littoral	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
531	CM	CM-NO	Nord	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
532	CM	CM-NW	Nord-Ouest	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
533	CM	CM-OU	Ouest	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
534	CM	CM-SU	Sud	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
535	CM	CM-SW	Sud-Ouest	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
536	CN	CN-AH	Anhui	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
537	CN	CN-BJ	Beijing	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
538	CN	CN-CQ	Chongqing	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
539	CN	CN-FJ	Fujian	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
540	CN	CN-GS	Gansu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
541	CN	CN-GD	Guangdong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
542	CN	CN-GX	Guangxi Zhuangzu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
543	CN	CN-GZ	Guizhou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
544	CN	CN-HI	Hainan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
545	CN	CN-HE	Hebei	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
546	CN	CN-HL	Heilongjiang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
547	CN	CN-HA	Henan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
548	CN	CN-HB	Hubei	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
549	CN	CN-HN	Hunan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
550	CN	CN-JS	Jiangsu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
551	CN	CN-JX	Jiangxi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
552	CN	CN-JL	Jilin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
553	CN	CN-LN	Liaoning	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
554	CN	CN-NM	Nei Mongol	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
555	CN	CN-NX	Ningxia Huizu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
556	CN	CN-QH	Qinghai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
557	CN	CN-SN	Shaanxi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
558	CN	CN-SD	Shandong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
559	CN	CN-SH	Shanghai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
560	CN	CN-SX	Shanxi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
561	CN	CN-SC	Sichuan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
562	CN	CN-TJ	Tianjin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
563	CN	CN-XJ	Xinjiang Uygur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
564	CN	CN-XZ	Xizang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
565	CN	CN-YN	Yunnan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
566	CN	CN-ZJ	Zhejiang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
567	CO	CO-AMA	Amazonas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
568	CO	CO-ANT	Antioquia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
569	CO	CO-ARA	Arauca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
570	CO	CO-ATL	Atlantico	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
571	CO	CO-BOL	Bolivar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
572	CO	CO-BOY	Boyaca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
573	CO	CO-CAL	Caldas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
574	CO	CO-CAQ	Caqueta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
575	CO	CO-CAS	Casanare	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
576	CO	CO-CAU	Cauca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
577	CO	CO-CES	Cesar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
578	CO	CO-CHO	Choco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
579	CO	CO-COR	Cordoba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
580	CO	CO-CUN	Cundinamarca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
581	CO	CO-DC	Distrito Capital de Bogota	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
582	CO	CO-GUA	Guainia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
583	CO	CO-GUV	Guaviare	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
584	CO	CO-HUI	Huila	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
585	CO	CO-LAG	La Guajira	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
586	CO	CO-MAG	Magdalena	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
587	CO	CO-MET	Meta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
588	CO	CO-NAR	Narino	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
589	CO	CO-NSA	Norte de Santander	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
590	CO	CO-PUT	Putumayo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
591	CO	CO-QUI	Quindio	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
592	CO	CO-RIS	Risaralda	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
593	CO	CO-SAP	San Andres, Providencia y Santa Catalina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
594	CO	CO-SAN	Santander	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
595	CO	CO-SUC	Sucre	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
596	CO	CO-TOL	Tolima	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
597	CO	CO-VAC	Valle del Cauca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
598	CO	CO-VID	Vichada	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
599	CR	CR-A	Alajuela	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
600	CR	CR-C	Cartago	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
601	CR	CR-G	Guanacaste	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
602	CR	CR-H	Heredia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
603	CR	CR-L	Limon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
604	CR	CR-P	Puntarenas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
605	CR	CR-SJ	San Jose	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
606	CU	CU-15	Artemisa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
607	CU	CU-09	Camaguey	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
608	CU	CU-08	Ciego de Avila	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
609	CU	CU-06	Cienfuegos	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
610	CU	CU-12	Granma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
611	CU	CU-14	Guantanamo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
612	CU	CU-11	Holguin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
613	CU	CU-99	Isla de la Juventud	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
614	CU	CU-03	La Habana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
615	CU	CU-10	Las Tunas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
616	CU	CU-04	Matanzas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
617	CU	CU-16	Mayabeque	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
618	CU	CU-01	Pinar del Rio	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
619	CU	CU-07	Sancti Spiritus	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
620	CU	CU-13	Santiago de Cuba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
621	CU	CU-05	Villa Clara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
622	CV	CV-BV	Boa Vista	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
623	CV	CV-PN	Porto Novo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
624	CV	CV-PR	Praia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
625	CV	CV-RG	Ribeira Grande	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
626	CV	CV-RS	Ribeira Grande de Santiago	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
627	CV	CV-SL	Sal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
628	CV	CV-CR	Santa Cruz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
629	CV	CV-SF	Sao Filipe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
630	CV	CV-SO	Sao Lourenco dos Orgaos	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
631	CV	CV-SV	Sao Vicente	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
632	CV	CV-TA	Tarrafal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
633	CW	-	Curacao	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
634	CX	-	Christmas Island	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
635	CY	CY-04	Ammochostos	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
636	CY	CY-06	Keryneia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
637	CY	CY-03	Larnaka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
638	CY	CY-01	Lefkosia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
639	CY	CY-02	Lemesos	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
640	CY	CY-05	Pafos	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
641	CZ	CZ-31	Jihocesky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
642	CZ	CZ-64	Jihomoravsky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
643	CZ	CZ-41	Karlovarsky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
644	CZ	CZ-63	Kraj Vysocina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
645	CZ	CZ-52	Kralovehradecky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
646	CZ	CZ-51	Liberecky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
647	CZ	CZ-80	Moravskoslezsky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
648	CZ	CZ-71	Olomoucky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
649	CZ	CZ-53	Pardubicky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
650	CZ	CZ-32	Plzensky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
651	CZ	CZ-10	Praha, Hlavni mesto	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
652	CZ	CZ-20	Stredocesky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
653	CZ	CZ-42	Ustecky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
654	CZ	CZ-72	Zlinsky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
655	DE	DE-BW	Baden-Wurttemberg	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
656	DE	DE-BY	Bayern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
657	DE	DE-BE	Berlin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
658	DE	DE-BB	Brandenburg	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
659	DE	DE-HB	Bremen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
660	DE	DE-HH	Hamburg	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
661	DE	DE-HE	Hessen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
662	DE	DE-MV	Mecklenburg-Vorpommern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
663	DE	DE-NI	Niedersachsen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
664	DE	DE-NW	Nordrhein-Westfalen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
665	DE	DE-RP	Rheinland-Pfalz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
666	DE	DE-SL	Saarland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
667	DE	DE-SN	Sachsen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
668	DE	DE-ST	Sachsen-Anhalt	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
669	DE	DE-SH	Schleswig-Holstein	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
670	DE	DE-TH	Thuringen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
671	DJ	DJ-AR	Arta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
672	DJ	DJ-DI	Dikhil	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
673	DJ	DJ-DJ	Djibouti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
674	DK	DK-84	Hovedstaden	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
675	DK	DK-82	Midtjylland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
676	DK	DK-81	Nordjylland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
677	DK	DK-85	Sjaelland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
678	DK	DK-83	Syddanmark	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
679	DM	DM-02	Saint Andrew	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
680	DM	DM-04	Saint George	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
681	DM	DM-05	Saint John	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
682	DM	DM-06	Saint Joseph	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
683	DM	DM-07	Saint Luke	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
684	DM	DM-09	Saint Patrick	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
685	DM	DM-10	Saint Paul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
686	DO	DO-02	Azua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
687	DO	DO-03	Baoruco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
688	DO	DO-04	Barahona	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
689	DO	DO-05	Dajabon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
690	DO	DO-01	Distrito Nacional (Santo Domingo)	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
691	DO	DO-06	Duarte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
692	DO	DO-08	El Seibo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
693	DO	DO-07	Elias Pina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
694	DO	DO-09	Espaillat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
695	DO	DO-30	Hato Mayor	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
696	DO	DO-19	Hermanas Mirabal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
697	DO	DO-10	Independencia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
698	DO	DO-11	La Altagracia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
699	DO	DO-12	La Romana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
700	DO	DO-13	La Vega	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
701	DO	DO-14	Maria Trinidad Sanchez	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
702	DO	DO-28	Monsenor Nouel	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
703	DO	DO-15	Monte Cristi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
704	DO	DO-29	Monte Plata	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
705	DO	DO-16	Pedernales	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
706	DO	DO-17	Peravia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
707	DO	DO-18	Puerto Plata	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
708	DO	DO-20	Samana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
709	DO	DO-21	San Cristobal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
710	DO	DO-31	San Jose de Ocoa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
711	DO	DO-22	San Juan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
712	DO	DO-23	San Pedro de Macoris	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
713	DO	DO-24	Sanchez Ramirez	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
714	DO	DO-25	Santiago	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
715	DO	DO-26	Santiago Rodriguez	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
716	DO	DO-27	Valverde	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
717	DZ	DZ-01	Adrar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
718	DZ	DZ-44	Ain Defla	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
719	DZ	DZ-46	Ain Temouchent	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
720	DZ	DZ-16	Alger	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
721	DZ	DZ-23	Annaba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
722	DZ	DZ-05	Batna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
723	DZ	DZ-08	Bechar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
724	DZ	DZ-06	Bejaia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
725	DZ	DZ-07	Biskra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
726	DZ	DZ-09	Blida	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
727	DZ	DZ-34	Bordj Bou Arreridj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
728	DZ	DZ-10	Bouira	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
729	DZ	DZ-35	Boumerdes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
730	DZ	DZ-02	Chlef	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
731	DZ	DZ-25	Constantine	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
732	DZ	DZ-56	Djanet	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
733	DZ	DZ-17	Djelfa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
734	DZ	DZ-32	El Bayadh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
735	DZ	DZ-57	El Meghaier	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
736	DZ	DZ-39	El Oued	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
737	DZ	DZ-36	El Tarf	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
738	DZ	DZ-47	Ghardaia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
739	DZ	DZ-24	Guelma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
740	DZ	DZ-33	Illizi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
741	DZ	DZ-53	In Salah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
742	DZ	DZ-18	Jijel	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
743	DZ	DZ-40	Khenchela	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
744	DZ	DZ-03	Laghouat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
745	DZ	DZ-28	M'sila	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
746	DZ	DZ-29	Mascara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
747	DZ	DZ-26	Medea	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
748	DZ	DZ-43	Mila	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
749	DZ	DZ-27	Mostaganem	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
750	DZ	DZ-45	Naama	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
751	DZ	DZ-31	Oran	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
752	DZ	DZ-30	Ouargla	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
753	DZ	DZ-51	Ouled Djellal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
754	DZ	DZ-04	Oum el Bouaghi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
755	DZ	DZ-48	Relizane	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
756	DZ	DZ-20	Saida	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
757	DZ	DZ-19	Setif	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
758	DZ	DZ-22	Sidi Bel Abbes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
759	DZ	DZ-21	Skikda	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
760	DZ	DZ-41	Souk Ahras	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
761	DZ	DZ-11	Tamanrasset	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
762	DZ	DZ-12	Tebessa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
763	DZ	DZ-14	Tiaret	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
764	DZ	DZ-49	Timimoun	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
765	DZ	DZ-37	Tindouf	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
766	DZ	DZ-42	Tipaza	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
767	DZ	DZ-38	Tissemsilt	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
768	DZ	DZ-15	Tizi Ouzou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
769	DZ	DZ-13	Tlemcen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
770	DZ	DZ-55	Touggourt	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
771	EC	EC-A	Azuay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
772	EC	EC-B	Bolivar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
773	EC	EC-F	Canar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
774	EC	EC-C	Carchi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
775	EC	EC-H	Chimborazo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
776	EC	EC-X	Cotopaxi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
777	EC	EC-O	El Oro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
778	EC	EC-E	Esmeraldas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
779	EC	EC-W	Galapagos	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
780	EC	EC-G	Guayas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
781	EC	EC-I	Imbabura	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
782	EC	EC-L	Loja	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
783	EC	EC-R	Los Rios	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
784	EC	EC-M	Manabi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
785	EC	EC-S	Morona Santiago	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
786	EC	EC-N	Napo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
787	EC	EC-D	Orellana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
788	EC	EC-Y	Pastaza	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
789	EC	EC-P	Pichincha	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
790	EC	EC-SE	Santa Elena	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
791	EC	EC-SD	Santo Domingo de los Tsachilas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
792	EC	EC-U	Sucumbios	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
793	EC	EC-T	Tungurahua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
794	EC	EC-Z	Zamora Chinchipe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
795	EE	EE-37	Harjumaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
796	EE	EE-39	Hiiumaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
797	EE	EE-45	Ida-Virumaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
798	EE	EE-52	Jarvamaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
799	EE	EE-50	Jogevamaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
800	EE	EE-60	Laane-Virumaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
801	EE	EE-56	Laanemaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
802	EE	EE-68	Parnumaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
803	EE	EE-64	Polvamaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
804	EE	EE-71	Raplamaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
805	EE	EE-74	Saaremaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
806	EE	EE-79	Tartumaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
807	EE	EE-81	Valgamaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
808	EE	EE-84	Viljandimaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
809	EE	EE-87	Vorumaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
810	EG	EG-DK	Ad Daqahliyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
811	EG	EG-BA	Al Bahr al Ahmar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
812	EG	EG-BH	Al Buhayrah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
813	EG	EG-FYM	Al Fayyum	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
814	EG	EG-GH	Al Gharbiyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
815	EG	EG-ALX	Al Iskandariyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
816	EG	EG-IS	Al Isma'iliyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
817	EG	EG-GZ	Al Jizah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
818	EG	EG-MNF	Al Minufiyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
819	EG	EG-MN	Al Minya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
820	EG	EG-C	Al Qahirah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
821	EG	EG-KB	Al Qalyubiyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
822	EG	EG-LX	Al Uqsur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
823	EG	EG-WAD	Al Wadi al Jadid	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
824	EG	EG-SUZ	As Suways	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
825	EG	EG-SHR	Ash Sharqiyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
826	EG	EG-ASN	Aswan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
827	EG	EG-AST	Asyut	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
828	EG	EG-BNS	Bani Suwayf	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
829	EG	EG-PTS	Bur Sa'id	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
830	EG	EG-DT	Dumyat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
831	EG	EG-JS	Janub Sina'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
832	EG	EG-KFS	Kafr ash Shaykh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
833	EG	EG-MT	Matruh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
834	EG	EG-KN	Qina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
835	EG	EG-SIN	Shamal Sina'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
836	EG	EG-SHG	Suhaj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
837	EH	-	Western Sahara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
838	ER	ER-MA	Al Awsat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
839	ER	ER-GB	Qash-Barkah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
840	ES	ES-AN	Andalucia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
841	ES	ES-AR	Aragon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
842	ES	ES-AS	Asturias, Principado de	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
843	ES	ES-CN	Canarias	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
844	ES	ES-CB	Cantabria	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
845	ES	ES-CL	Castilla y Leon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
846	ES	ES-CM	Castilla-La Mancha	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
847	ES	ES-CT	Catalunya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
848	ES	ES-CE	Ceuta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
849	ES	ES-EX	Extremadura	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
850	ES	ES-GA	Galicia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
851	ES	ES-IB	Illes Balears	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
852	ES	ES-RI	La Rioja	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
853	ES	ES-MD	Madrid, Comunidad de	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
854	ES	ES-ML	Melilla	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
855	ES	ES-MC	Murcia, Region de	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
856	ES	ES-NC	Navarra, Comunidad Foral de	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
857	ES	ES-PV	Pais Vasco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
858	ES	ES-VC	Valenciana, Comunidad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
859	ET	ET-AA	Addis Ababa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
860	ET	ET-AF	Afar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
861	ET	ET-AM	Amara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
862	ET	ET-BE	Benshangul-Gumaz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
863	ET	ET-DD	Dire Dawa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
864	ET	ET-GA	Gambela Peoples	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
865	ET	ET-HA	Harari People	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
866	ET	ET-OR	Oromia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
867	ET	ET-SO	Somali	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
868	ET	ET-SN	Southern Nations, Nationalities and Peoples	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
869	ET	ET-TI	Tigrai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
870	FI	FI-02	Etela-Karjala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
871	FI	FI-03	Etela-Pohjanmaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
872	FI	FI-04	Etela-Savo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
873	FI	FI-05	Kainuu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
874	FI	FI-06	Kanta-Hame	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
875	FI	FI-07	Keski-Pohjanmaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
876	FI	FI-08	Keski-Suomi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
877	FI	FI-09	Kymenlaakso	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
878	FI	FI-10	Lappi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
879	FI	FI-16	Paijat-Hame	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
880	FI	FI-11	Pirkanmaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
881	FI	FI-12	Pohjanmaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
882	FI	FI-13	Pohjois-Karjala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
883	FI	FI-14	Pohjois-Pohjanmaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
884	FI	FI-15	Pohjois-Savo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
885	FI	FI-17	Satakunta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
886	FI	FI-18	Uusimaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
887	FI	FI-19	Varsinais-Suomi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
888	FJ	FJ-C	Central	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
889	FJ	FJ-E	Eastern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
890	FJ	FJ-N	Northern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
891	FJ	FJ-R	Rotuma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
892	FJ	FJ-W	Western	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
893	FK	-	Falkland Islands (Malvinas)	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
894	FM	FM-TRK	Chuuk	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
895	FM	FM-KSA	Kosrae	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
896	FM	FM-PNI	Pohnpei	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
897	FM	FM-YAP	Yap	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
898	FO	-	Eysturoy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
899	FO	-	Nordoyar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
900	FO	-	Streymoy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
901	FO	-	Suduroy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
902	FO	-	Vagar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
903	FR	FR-ARA	Auvergne-Rhone-Alpes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
904	FR	FR-BFC	Bourgogne-Franche-Comte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
905	FR	FR-BRE	Bretagne	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
906	FR	FR-CVL	Centre-Val de Loire	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
907	FR	FR-20R	Corse	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
908	FR	FR-GES	Grand-Est	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
909	FR	FR-HDF	Hauts-de-France	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
910	FR	FR-IDF	Ile-de-France	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
911	FR	FR-NOR	Normandie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
912	FR	FR-NAQ	Nouvelle-Aquitaine	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
913	FR	FR-OCC	Occitanie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
914	FR	FR-PDL	Pays-de-la-Loire	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
915	FR	FR-PAC	Provence-Alpes-Cote-d'Azur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
916	GA	GA-1	Estuaire	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
917	GA	GA-2	Haut-Ogooue	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
918	GA	GA-3	Moyen-Ogooue	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
919	GA	GA-4	Ngounie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
920	GA	GA-5	Nyanga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
921	GA	GA-6	Ogooue-Ivindo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
922	GA	GA-7	Ogooue-Lolo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
923	GA	GA-8	Ogooue-Maritime	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
924	GA	GA-9	Woleu-Ntem	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
925	GB	GB-ENG	England	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
926	GB	GB-NIR	Northern Ireland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
927	GB	GB-SCT	Scotland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
928	GB	GB-WLS	Wales	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
929	GD	GD-01	Saint Andrew	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
930	GD	GD-02	Saint David	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
931	GD	GD-03	Saint George	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
932	GD	GD-04	Saint John	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
933	GD	GD-05	Saint Mark	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
934	GD	GD-06	Saint Patrick	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
935	GD	GD-10	Southern Grenadine Islands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
936	GE	GE-AB	Abkhazia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
937	GE	GE-AJ	Ajaria	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
938	GE	GE-GU	Guria	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
939	GE	GE-IM	Imereti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
940	GE	GE-KA	K'akheti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
941	GE	GE-KK	Kvemo Kartli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
942	GE	GE-MM	Mtskheta-Mtianeti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
943	GE	GE-RL	Rach'a-Lechkhumi-Kvemo Svaneti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
944	GE	GE-SZ	Samegrelo-Zemo Svaneti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
945	GE	GE-SJ	Samtskhe-Javakheti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
946	GE	GE-SK	Shida Kartli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
947	GE	GE-TB	Tbilisi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
948	GF	-	Guyane	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
949	GG	-	Guernsey	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
950	GH	GH-AF	Ahafo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
951	GH	GH-AH	Ashanti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
952	GH	GH-BO	Bono	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
953	GH	GH-BE	Bono East	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
954	GH	GH-CP	Central	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
955	GH	GH-EP	Eastern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
956	GH	GH-AA	Greater Accra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
957	GH	GH-NP	Northern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
958	GH	GH-UE	Upper East	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
959	GH	GH-UW	Upper West	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
960	GH	GH-TV	Volta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
961	GH	GH-WP	Western	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
962	GI	-	Gibraltar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
963	GL	GL-AV	Avannaata Kommunia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
964	GL	GL-KU	Kommune Kujalleq	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
965	GL	GL-QT	Kommune Qeqertalik	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
966	GL	GL-SM	Kommuneqarfik Sermersooq	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
967	GL	GL-QE	Qeqqata Kommunia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
968	GM	GM-B	Banjul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
969	GM	GM-M	Central River	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
970	GM	GM-L	Lower River	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
971	GM	GM-N	North Bank	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
972	GM	GM-W	Western	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
973	GN	GN-BE	Beyla	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
974	GN	GN-BK	Boke	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
975	GN	GN-C	Conakry	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
976	GN	GN-CO	Coyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
977	GN	GN-DB	Dabola	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
978	GN	GN-DI	Dinguiraye	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
979	GN	GN-DU	Dubreka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
980	GN	GN-FR	Fria	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
981	GN	GN-KA	Kankan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
982	GN	GN-KO	Kouroussa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
983	GN	GN-LA	Labe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
984	GN	GN-MM	Mamou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
985	GN	GN-SI	Siguiri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
986	GP	-	Guadeloupe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
987	GQ	GQ-BN	Bioko Norte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
988	GQ	GQ-BS	Bioko Sur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
989	GQ	GQ-CS	Centro Sur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
990	GQ	GQ-KN	Kie-Ntem	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
991	GQ	GQ-LI	Litoral	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
992	GQ	GQ-WN	Wele-Nzas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
993	GR	GR-A	Anatoliki Makedonia kai Thraki	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
994	GR	GR-I	Attiki	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
995	GR	GR-G	Dytiki Ellada	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
996	GR	GR-C	Dytiki Makedonia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
997	GR	GR-F	Ionia Nisia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
998	GR	GR-D	Ipeiros	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
999	GR	GR-B	Kentriki Makedonia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1000	GR	GR-M	Kriti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1001	GR	GR-L	Notio Aigaio	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1002	GR	GR-J	Peloponnisos	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1003	GR	GR-H	Sterea Ellada	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1004	GR	GR-E	Thessalia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1005	GR	GR-K	Voreio Aigaio	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1006	GS	-	South Georgia and the South Sandwich Islands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1007	GT	GT-16	Alta Verapaz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1008	GT	GT-15	Baja Verapaz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1009	GT	GT-04	Chimaltenango	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1010	GT	GT-20	Chiquimula	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1011	GT	GT-02	El Progreso	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1012	GT	GT-05	Escuintla	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1013	GT	GT-01	Guatemala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1014	GT	GT-13	Huehuetenango	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1015	GT	GT-18	Izabal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1016	GT	GT-21	Jalapa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1017	GT	GT-22	Jutiapa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1018	GT	GT-17	Peten	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1019	GT	GT-09	Quetzaltenango	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1020	GT	GT-14	Quiche	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1021	GT	GT-11	Retalhuleu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1022	GT	GT-03	Sacatepequez	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1023	GT	GT-12	San Marcos	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1024	GT	GT-06	Santa Rosa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1025	GT	GT-07	Solola	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1026	GT	GT-10	Suchitepequez	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1027	GT	GT-08	Totonicapan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1028	GT	GT-19	Zacapa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1029	GU	-	Agana Heights	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1030	GU	-	Agat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1031	GU	-	Barrigada	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1032	GU	-	Chalan Pago-Ordot	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1033	GU	-	Dededo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1034	GU	-	Hagatna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1035	GU	-	Inarajan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1036	GU	-	Mangilao	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1037	GU	-	Mongmong-Toto-Maite	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1038	GU	-	Piti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1039	GU	-	Santa Rita	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1040	GU	-	Sinajana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1041	GU	-	Talofofo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1042	GU	-	Tamuning-Tumon-Harmon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1043	GU	-	Yigo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1044	GU	-	Yona	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1045	GW	GW-BA	Bafata	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1046	GW	GW-BS	Bissau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1047	GW	GW-CA	Cacheu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1048	GW	GW-GA	Gabu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1049	GW	GW-OI	Oio	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1050	GW	GW-QU	Quinara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1051	GY	GY-BA	Barima-Waini	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1052	GY	GY-CU	Cuyuni-Mazaruni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1053	GY	GY-DE	Demerara-Mahaica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1054	GY	GY-EB	East Berbice-Corentyne	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1055	GY	GY-ES	Essequibo Islands-West Demerara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1056	GY	GY-MA	Mahaica-Berbice	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1057	GY	GY-PM	Pomeroon-Supenaam	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1058	GY	GY-PT	Potaro-Siparuni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1059	GY	GY-UD	Upper Demerara-Berbice	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1060	GY	GY-UT	Upper Takutu-Upper Essequibo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1061	HK	-	Hong Kong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1062	HM	-	Heard Island and McDonald Islands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1063	HN	HN-AT	Atlantida	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1064	HN	HN-CH	Choluteca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1065	HN	HN-CL	Colon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1066	HN	HN-CM	Comayagua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1067	HN	HN-CP	Copan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1068	HN	HN-CR	Cortes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1069	HN	HN-EP	El Paraiso	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1070	HN	HN-FM	Francisco Morazan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1071	HN	HN-IN	Intibuca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1072	HN	HN-IB	Islas de la Bahia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1073	HN	HN-LP	La Paz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1074	HN	HN-LE	Lempira	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1075	HN	HN-OC	Ocotepeque	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1076	HN	HN-OL	Olancho	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1077	HN	HN-SB	Santa Barbara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1078	HN	HN-VA	Valle	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1079	HN	HN-YO	Yoro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1080	HR	HR-07	Bjelovarsko-bilogorska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1081	HR	HR-12	Brodsko-posavska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1082	HR	HR-19	Dubrovacko-neretvanska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1083	HR	HR-21	Grad Zagreb	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1084	HR	HR-18	Istarska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1085	HR	HR-04	Karlovacka zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1086	HR	HR-06	Koprivnicko-krizevacka zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1087	HR	HR-02	Krapinsko-zagorska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1088	HR	HR-09	Licko-senjska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1089	HR	HR-20	Medimurska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1090	HR	HR-14	Osjecko-baranjska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1091	HR	HR-11	Pozesko-slavonska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1092	HR	HR-08	Primorsko-goranska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1093	HR	HR-15	Sibensko-kninska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1094	HR	HR-03	Sisacko-moslavacka zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1095	HR	HR-17	Splitsko-dalmatinska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1096	HR	HR-05	Varazdinska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1097	HR	HR-10	Viroviticko-podravska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1098	HR	HR-16	Vukovarsko-srijemska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1099	HR	HR-13	Zadarska zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1100	HR	HR-01	Zagrebacka zupanija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1101	HT	HT-AR	Artibonite	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1102	HT	HT-CE	Centre	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1103	HT	HT-GA	Grande'Anse	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1104	HT	HT-NI	Nippes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1105	HT	HT-ND	Nord	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1106	HT	HT-NO	Nord-Ouest	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1107	HT	HT-OU	Ouest	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1108	HT	HT-SD	Sud	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1109	HT	HT-SE	Sud-Est	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1110	HU	HU-BK	Bacs-Kiskun	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1111	HU	HU-BA	Baranya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1112	HU	HU-BE	Bekes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1113	HU	HU-BZ	Borsod-Abauj-Zemplen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1114	HU	HU-BU	Budapest	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1115	HU	HU-CS	Csongrad-Csanad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1116	HU	HU-FE	Fejer	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1117	HU	HU-GS	Gyor-Moson-Sopron	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1118	HU	HU-HB	Hajdu-Bihar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1119	HU	HU-HE	Heves	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1120	HU	HU-JN	Jasz-Nagykun-Szolnok	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1121	HU	HU-KE	Komarom-Esztergom	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1122	HU	HU-NO	Nograd	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1123	HU	HU-PE	Pest	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1124	HU	HU-SO	Somogy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1125	HU	HU-SZ	Szabolcs-Szatmar-Bereg	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1126	HU	HU-TO	Tolna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1127	HU	HU-VA	Vas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1128	HU	HU-VE	Veszprem	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1129	HU	HU-ZA	Zala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1130	ID	ID-AC	Aceh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1131	ID	ID-BA	Bali	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1132	ID	ID-BT	Banten	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1133	ID	ID-BE	Bengkulu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1134	ID	ID-GO	Gorontalo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1135	ID	ID-JK	Jakarta Raya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1136	ID	ID-JA	Jambi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1137	ID	ID-JB	Jawa Barat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1138	ID	ID-JT	Jawa Tengah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1139	ID	ID-JI	Jawa Timur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1140	ID	ID-KB	Kalimantan Barat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1141	ID	ID-KS	Kalimantan Selatan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1142	ID	ID-KT	Kalimantan Tengah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1143	ID	ID-KI	Kalimantan Timur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1144	ID	ID-KU	Kalimantan Utara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1145	ID	ID-BB	Kepulauan Bangka Belitung	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1146	ID	ID-KR	Kepulauan Riau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1147	ID	ID-LA	Lampung	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1148	ID	ID-ML	Maluku	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1149	ID	ID-MU	Maluku Utara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1150	ID	ID-NB	Nusa Tenggara Barat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1151	ID	ID-NT	Nusa Tenggara Timur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1152	ID	ID-PP	Papua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1153	ID	ID-PB	Papua Barat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1154	ID	ID-PD	Papua Barat Daya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1155	ID	ID-PE	Papua Pengunungan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1156	ID	ID-PS	Papua Selatan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1157	ID	ID-PT	Papua Tengah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1158	ID	ID-RI	Riau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1159	ID	ID-SR	Sulawesi Barat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1160	ID	ID-SN	Sulawesi Selatan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1161	ID	ID-ST	Sulawesi Tengah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1162	ID	ID-SG	Sulawesi Tenggara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1163	ID	ID-SA	Sulawesi Utara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1164	ID	ID-SB	Sumatera Barat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1165	ID	ID-SS	Sumatera Selatan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1166	ID	ID-SU	Sumatera Utara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1167	ID	ID-YO	Yogyakarta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1168	IE	IE-CW	Carlow	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1169	IE	IE-CN	Cavan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1170	IE	IE-CE	Clare	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1171	IE	IE-CO	Cork	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1172	IE	IE-DL	Donegal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1173	IE	IE-D	Dublin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1174	IE	IE-G	Galway	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1175	IE	IE-KY	Kerry	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1176	IE	IE-KE	Kildare	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1177	IE	IE-KK	Kilkenny	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1178	IE	IE-LS	Laois	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1179	IE	IE-LM	Leitrim	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1180	IE	IE-LK	Limerick	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1181	IE	IE-LD	Longford	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1182	IE	IE-LH	Louth	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1183	IE	IE-MO	Mayo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1184	IE	IE-MH	Meath	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1185	IE	IE-MN	Monaghan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1186	IE	IE-OY	Offaly	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1187	IE	IE-RN	Roscommon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1188	IE	IE-SO	Sligo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1189	IE	IE-TA	Tipperary	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1190	IE	IE-WD	Waterford	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1191	IE	IE-WH	Westmeath	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1192	IE	IE-WX	Wexford	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1193	IE	IE-WW	Wicklow	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1194	IL	IL-D	HaDarom	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1195	IL	IL-M	HaMerkaz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1196	IL	IL-Z	HaTsafon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1197	IL	IL-HA	Hefa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1198	IL	IL-TA	Tel Aviv	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1199	IL	IL-JM	Yerushalayim	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1200	IM	-	Isle of Man	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1201	IN	IN-AN	Andaman and Nicobar Islands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1202	IN	IN-AP	Andhra Pradesh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1203	IN	IN-AR	Arunachal Pradesh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1204	IN	IN-AS	Assam	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1205	IN	IN-BR	Bihar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1206	IN	IN-CH	Chandigarh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1207	IN	IN-CG	Chhattisgarh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1208	IN	IN-DH	Dadra and Nagar Haveli and Daman and Diu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1209	IN	IN-DL	Delhi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1210	IN	IN-GA	Goa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1211	IN	IN-GJ	Gujarat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1212	IN	IN-HR	Haryana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1213	IN	IN-HP	Himachal Pradesh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1214	IN	IN-JK	Jammu and Kashmir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1215	IN	IN-JH	Jharkhand	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1216	IN	IN-KA	Karnataka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1217	IN	IN-KL	Kerala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1218	IN	IN-LD	Lakshadweep	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1219	IN	IN-MP	Madhya Pradesh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1220	IN	IN-MH	Maharashtra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1221	IN	IN-MN	Manipur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1222	IN	IN-ML	Meghalaya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1223	IN	IN-MZ	Mizoram	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1224	IN	IN-NL	Nagaland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1225	IN	IN-OD	Odisha	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1226	IN	IN-PY	Puducherry	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1227	IN	IN-PB	Punjab	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1228	IN	IN-RJ	Rajasthan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1229	IN	IN-SK	Sikkim	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1230	IN	IN-TN	Tamil Nadu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1231	IN	IN-TS	Telangana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1232	IN	IN-TR	Tripura	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1233	IN	IN-UP	Uttar Pradesh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1234	IN	IN-UK	Uttarakhand	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1235	IN	IN-WB	West Bengal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1236	IO	-	British Indian Ocean Territory	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1237	IQ	IQ-AN	Al Anbar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1238	IQ	IQ-BA	Al Basrah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1239	IQ	IQ-MU	Al Muthanna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1240	IQ	IQ-QA	Al Qadisiyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1241	IQ	IQ-NA	An Najaf	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1242	IQ	IQ-AR	Arbil	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1243	IQ	IQ-SU	As Sulaymaniyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1244	IQ	IQ-BB	Babil	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1245	IQ	IQ-BG	Baghdad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1246	IQ	IQ-DA	Dahuk	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1247	IQ	IQ-DQ	Dhi Qar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1248	IQ	IQ-DI	Diyala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1249	IQ	IQ-KA	Karbala'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1250	IQ	IQ-KI	Kirkuk	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1251	IQ	IQ-MA	Maysan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1252	IQ	IQ-NI	Ninawa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1253	IQ	IQ-SD	Salah ad Din	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1254	IQ	IQ-WA	Wasit	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1255	IR	IR-30	Alborz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1256	IR	IR-24	Ardabil	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1257	IR	IR-04	Azarbayjan-e Gharbi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1258	IR	IR-03	Azarbayjan-e Sharqi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1259	IR	IR-18	Bushehr	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1260	IR	IR-14	Chahar Mahal va Bakhtiari	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1261	IR	IR-10	Esfahan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1262	IR	IR-07	Fars	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1263	IR	IR-01	Gilan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1264	IR	IR-27	Golestan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1265	IR	IR-13	Hamadan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1266	IR	IR-22	Hormozgan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1267	IR	IR-16	Ilam	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1268	IR	IR-08	Kerman	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1269	IR	IR-05	Kermanshah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1270	IR	IR-29	Khorasan-e Jonubi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1271	IR	IR-09	Khorasan-e Razavi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1272	IR	IR-28	Khorasan-e Shomali	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1273	IR	IR-06	Khuzestan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1274	IR	IR-17	Kohgiluyeh va Bowyer Ahmad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1275	IR	IR-12	Kordestan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1276	IR	IR-15	Lorestan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1277	IR	IR-00	Markazi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1278	IR	IR-02	Mazandaran	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1279	IR	IR-26	Qazvin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1280	IR	IR-25	Qom	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1281	IR	IR-20	Semnan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1282	IR	IR-11	Sistan va Baluchestan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1283	IR	IR-23	Tehran	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1284	IR	IR-21	Yazd	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1285	IR	IR-19	Zanjan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1286	IS	IS-7	Austurland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1287	IS	IS-1	Hofudborgarsvaedi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1288	IS	IS-6	Nordurland eystra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1289	IS	IS-5	Nordurland vestra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1290	IS	IS-8	Sudurland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1291	IS	IS-2	Sudurnes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1292	IS	IS-4	Vestfirdir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1293	IS	IS-3	Vesturland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1294	IT	IT-65	Abruzzo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1295	IT	IT-77	Basilicata	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1296	IT	IT-78	Calabria	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1297	IT	IT-72	Campania	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1298	IT	IT-45	Emilia-Romagna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1299	IT	IT-36	Friuli-Venezia Giulia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1300	IT	IT-62	Lazio	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1301	IT	IT-42	Liguria	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1302	IT	IT-25	Lombardia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1303	IT	IT-57	Marche	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1304	IT	IT-67	Molise	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1305	IT	IT-21	Piemonte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1306	IT	IT-75	Puglia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1307	IT	IT-88	Sardegna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1308	IT	IT-82	Sicilia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1309	IT	IT-52	Toscana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1310	IT	IT-32	Trentino-Alto Adige	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1311	IT	IT-55	Umbria	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1312	IT	IT-23	Valle d'Aosta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1313	IT	IT-34	Veneto	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1314	JE	-	Jersey	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1315	JM	JM-13	Clarendon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1316	JM	JM-09	Hanover	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1317	JM	JM-01	Kingston	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1318	JM	JM-12	Manchester	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1319	JM	JM-04	Portland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1320	JM	JM-02	Saint Andrew	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1321	JM	JM-06	Saint Ann	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1322	JM	JM-14	Saint Catherine	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1323	JM	JM-11	Saint Elizabeth	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1324	JM	JM-08	Saint James	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1325	JM	JM-05	Saint Mary	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1326	JM	JM-03	Saint Thomas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1327	JM	JM-07	Trelawny	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1328	JM	JM-10	Westmoreland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1329	JO	JO-AJ	'Ajlun	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1330	JO	JO-AQ	Al 'Aqabah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1331	JO	JO-AM	Al 'Asimah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1332	JO	JO-BA	Al Balqa'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1333	JO	JO-KA	Al Karak	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1334	JO	JO-MA	Al Mafraq	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1335	JO	JO-AT	At Tafilah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1336	JO	JO-AZ	Az Zarqa'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1337	JO	JO-IR	Irbid	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1338	JO	JO-JA	Jarash	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1339	JO	JO-MN	Ma'an	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1340	JO	JO-MD	Madaba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1341	JP	JP-23	Aichi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1342	JP	JP-05	Akita	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1343	JP	JP-02	Aomori	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1344	JP	JP-12	Chiba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1345	JP	JP-38	Ehime	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1346	JP	JP-18	Fukui	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1347	JP	JP-40	Fukuoka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1348	JP	JP-07	Fukushima	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1349	JP	JP-21	Gifu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1350	JP	JP-10	Gunma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1351	JP	JP-34	Hiroshima	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1352	JP	JP-01	Hokkaido	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1353	JP	JP-28	Hyogo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1354	JP	JP-08	Ibaraki	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1355	JP	JP-17	Ishikawa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1356	JP	JP-03	Iwate	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1357	JP	JP-37	Kagawa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1358	JP	JP-46	Kagoshima	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1359	JP	JP-14	Kanagawa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1360	JP	JP-39	Kochi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1361	JP	JP-43	Kumamoto	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1362	JP	JP-26	Kyoto	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1363	JP	JP-24	Mie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1364	JP	JP-04	Miyagi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1365	JP	JP-45	Miyazaki	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1366	JP	JP-20	Nagano	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1367	JP	JP-42	Nagasaki	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1368	JP	JP-29	Nara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1369	JP	JP-15	Niigata	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1370	JP	JP-44	Oita	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1371	JP	JP-33	Okayama	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1372	JP	JP-47	Okinawa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1373	JP	JP-27	Osaka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1374	JP	JP-41	Saga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1375	JP	JP-11	Saitama	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1376	JP	JP-25	Shiga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1377	JP	JP-32	Shimane	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1378	JP	JP-22	Shizuoka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1379	JP	JP-09	Tochigi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1380	JP	JP-36	Tokushima	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1381	JP	JP-13	Tokyo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1382	JP	JP-31	Tottori	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1383	JP	JP-16	Toyama	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1384	JP	JP-30	Wakayama	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1385	JP	JP-06	Yamagata	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1386	JP	JP-35	Yamaguchi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1387	JP	JP-19	Yamanashi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1388	KE	KE-01	Baringo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1389	KE	KE-02	Bomet	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1390	KE	KE-03	Bungoma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1391	KE	KE-04	Busia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1392	KE	KE-05	Elgeyo/Marakwet	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1393	KE	KE-06	Embu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1394	KE	KE-07	Garissa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1395	KE	KE-08	Homa Bay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1396	KE	KE-09	Isiolo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1397	KE	KE-10	Kajiado	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1398	KE	KE-11	Kakamega	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1399	KE	KE-12	Kericho	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1400	KE	KE-13	Kiambu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1401	KE	KE-14	Kilifi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1402	KE	KE-15	Kirinyaga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1403	KE	KE-16	Kisii	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1404	KE	KE-17	Kisumu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1405	KE	KE-18	Kitui	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1406	KE	KE-19	Kwale	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1407	KE	KE-20	Laikipia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1408	KE	KE-21	Lamu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1409	KE	KE-22	Machakos	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1410	KE	KE-23	Makueni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1411	KE	KE-24	Mandera	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1412	KE	KE-25	Marsabit	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1413	KE	KE-26	Meru	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1414	KE	KE-27	Migori	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1415	KE	KE-28	Mombasa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1416	KE	KE-29	Murang'a	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1417	KE	KE-30	Nairobi City	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1418	KE	KE-31	Nakuru	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1419	KE	KE-32	Nandi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1420	KE	KE-33	Narok	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1421	KE	KE-34	Nyamira	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1422	KE	KE-35	Nyandarua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1423	KE	KE-36	Nyeri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1424	KE	KE-37	Samburu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1425	KE	KE-38	Siaya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1426	KE	KE-39	Taita/Taveta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1427	KE	KE-40	Tana River	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1428	KE	KE-41	Tharaka-Nithi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1429	KE	KE-42	Trans Nzoia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1430	KE	KE-43	Turkana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1431	KE	KE-44	Uasin Gishu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1432	KE	KE-45	Vihiga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1433	KE	KE-46	Wajir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1434	KE	KE-47	West Pokot	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1435	KG	KG-B	Batken	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1436	KG	KG-GB	Bishkek Shaary	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1437	KG	KG-C	Chuy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1438	KG	KG-J	Jalal-Abad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1439	KG	KG-N	Naryn	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1440	KG	KG-GO	Osh Shaary	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1441	KG	KG-T	Talas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1442	KG	KG-Y	Ysyk-Kol	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1443	KH	KH-2	Baat Dambang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1444	KH	KH-1	Banteay Mean Choay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1445	KH	KH-23	Kaeb	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1446	KH	KH-3	Kampong Chaam	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1447	KH	KH-4	Kampong Chhnang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1448	KH	KH-5	Kampong Spueu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1449	KH	KH-6	Kampong Thum	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1450	KH	KH-7	Kampot	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1451	KH	KH-8	Kandaal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1452	KH	KH-9	Kaoh Kong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1453	KH	KH-10	Kracheh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1454	KH	KH-11	Mondol Kiri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1455	KH	KH-22	Otdar Mean Chey	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1456	KH	KH-24	Pailin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1457	KH	KH-12	Phnom Penh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1458	KH	KH-18	Preah Sihanouk	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1459	KH	KH-13	Preah Vihear	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1460	KH	KH-14	Prey Veaeng	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1461	KH	KH-16	Rotanak Kiri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1462	KH	KH-17	Siem Reab	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1463	KH	KH-19	Stueng Traeng	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1464	KH	KH-20	Svaay Rieng	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1465	KH	KH-21	Taakaev	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1466	KI	KI-G	Gilbert Islands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1467	KI	KI-L	Line Islands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1468	KM	KM-G	Grande Comore	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1469	KM	KM-M	Moheli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1470	KN	KN-01	Christ Church Nichola Town	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1471	KN	KN-02	Saint Anne Sandy Point	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1472	KN	KN-03	Saint George Basseterre	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1473	KN	KN-05	Saint James Windward	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1474	KN	KN-06	Saint John Capisterre	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1475	KN	KN-07	Saint John Figtree	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1476	KN	KN-08	Saint Mary Cayon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1477	KN	KN-09	Saint Paul Capisterre	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1478	KN	KN-10	Saint Paul Charlestown	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1479	KN	KN-11	Saint Peter Basseterre	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1480	KN	KN-12	Saint Thomas Lowland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1481	KN	KN-13	Saint Thomas Middle Island	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1482	KN	KN-15	Trinity Palmetto Point	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1483	KP	KP-01	P'yongyang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1484	KR	KR-26	Busan-gwangyeoksi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1485	KR	KR-43	Chungcheongbuk-do	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1486	KR	KR-44	Chungcheongnam-do	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1487	KR	KR-27	Daegu-gwangyeoksi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1488	KR	KR-30	Daejeon-gwangyeoksi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1489	KR	KR-42	Gangwon-teukbyeoljachido	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1490	KR	KR-29	Gwangju-gwangyeoksi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1491	KR	KR-41	Gyeonggi-do	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1492	KR	KR-47	Gyeongsangbuk-do	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1493	KR	KR-48	Gyeongsangnam-do	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1494	KR	KR-28	Incheon-gwangyeoksi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1495	KR	KR-49	Jeju-teukbyeoljachido	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1496	KR	KR-45	Jeollabuk-do	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1497	KR	KR-46	Jeollanam-do	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1498	KR	KR-50	Sejong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1499	KR	KR-11	Seoul-teukbyeolsi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1500	KR	KR-31	Ulsan-gwangyeoksi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1501	KW	KW-KU	Al 'Asimah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1502	KW	KW-AH	Al Ahmadi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1503	KW	KW-FA	Al Farwaniyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1504	KW	KW-JA	Al Jahra'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1505	KW	KW-HA	Hawalli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1506	KW	KW-MU	Mubarak al Kabir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1507	KY	-	Cayman Islands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1508	KZ	KZ-10	Abay oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1509	KZ	KZ-75	Almaty	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1510	KZ	KZ-19	Almaty oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1511	KZ	KZ-11	Aqmola oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1512	KZ	KZ-15	Aqtobe oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1513	KZ	KZ-71	Astana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1514	KZ	KZ-23	Atyrau oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1515	KZ	KZ-27	Batys Qazaqstan oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1516	KZ	KZ-47	Mangghystau oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1517	KZ	KZ-55	Pavlodar oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1518	KZ	KZ-35	Qaraghandy oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1519	KZ	KZ-39	Qostanay oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1520	KZ	KZ-43	Qyzylorda oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1521	KZ	KZ-63	Shyghys Qazaqstan oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1522	KZ	KZ-79	Shymkent	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1523	KZ	KZ-59	Soltustik Qazaqstan oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1524	KZ	KZ-61	Turkistan oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1525	KZ	KZ-62	Ulytau oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1526	KZ	KZ-31	Zhambyl oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1527	KZ	KZ-33	Zhetisu oblysy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1528	LA	LA-AT	Attapu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1529	LA	LA-BK	Bokeo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1530	LA	LA-BL	Bolikhamxai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1531	LA	LA-CH	Champasak	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1532	LA	LA-KH	Khammouan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1533	LA	LA-LM	Louang Namtha	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1534	LA	LA-LP	Louangphabang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1535	LA	LA-OU	Oudomxai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1536	LA	LA-SV	Savannakhet	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1537	LA	LA-VI	Viangchan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1538	LA	LA-XA	Xaignabouli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1539	LA	LA-XE	Xekong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1540	LA	LA-XI	Xiangkhouang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1541	LB	LB-AK	Aakkar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1542	LB	LB-BH	Baalbek-Hermel	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1543	LB	LB-BI	Beqaa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1544	LB	LB-BA	Beyrouth	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1545	LB	LB-AS	Liban-Nord	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1546	LB	LB-JA	Liban-Sud	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1547	LB	LB-JL	Mont-Liban	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1548	LB	LB-NA	Nabatiye	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1549	LC	LC-01	Anse la Raye	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1550	LC	LC-02	Castries	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1551	LC	LC-03	Choiseul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1552	LC	LC-05	Dennery	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1553	LC	LC-06	Gros Islet	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1554	LC	LC-07	Laborie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1555	LC	LC-08	Micoud	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1556	LC	LC-10	Soufriere	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1557	LC	LC-11	Vieux Fort	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1558	LI	LI-01	Balzers	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1559	LI	LI-02	Eschen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1560	LI	LI-03	Gamprin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1561	LI	LI-04	Mauren	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1562	LI	LI-06	Ruggell	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1563	LI	LI-07	Schaan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1564	LI	LI-09	Triesen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1565	LI	LI-10	Triesenberg	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1566	LI	LI-11	Vaduz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1567	LK	LK-2	Central Province	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1568	LK	LK-5	Eastern Province	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1569	LK	LK-7	North Central Province	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1570	LK	LK-6	North Western Province	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1571	LK	LK-4	Northern Province	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1572	LK	LK-9	Sabaragamuwa Province	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1573	LK	LK-3	Southern Province	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1574	LK	LK-8	Uva Province	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1575	LK	LK-1	Western Province	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1576	LR	LR-BM	Bomi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1577	LR	LR-BG	Bong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1578	LR	LR-GB	Grand Bassa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1579	LR	LR-CM	Grand Cape Mount	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1580	LR	LR-GG	Grand Gedeh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1581	LR	LR-MG	Margibi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1582	LR	LR-MO	Montserrado	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1583	LR	LR-RI	River Cess	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1584	LR	LR-RG	River Gee	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1585	LR	LR-SI	Sinoe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1586	LS	LS-D	Berea	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1587	LS	LS-B	Botha-Bothe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1588	LS	LS-C	Leribe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1589	LS	LS-E	Mafeteng	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1590	LS	LS-A	Maseru	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1591	LS	LS-F	Mohale's Hoek	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1592	LS	LS-J	Mokhotlong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1593	LS	LS-H	Qacha's Nek	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1594	LS	LS-G	Quthing	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1595	LS	LS-K	Thaba-Tseka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1596	LT	LT-AL	Alytaus apskritis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1597	LT	LT-KU	Kauno apskritis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1598	LT	LT-KL	Klaipedos apskritis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1599	LT	LT-MR	Marijampoles apskritis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1600	LT	LT-PN	Panevezio apskritis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1601	LT	LT-SA	Siauliu apskritis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1602	LT	LT-TA	Taurages apskritis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1603	LT	LT-TE	Telsiu apskritis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1604	LT	LT-UT	Utenos apskritis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1605	LT	LT-VL	Vilniaus apskritis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1606	LU	LU-CA	Capellen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1607	LU	LU-CL	Clervaux	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1608	LU	LU-DI	Diekirch	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1609	LU	LU-EC	Echternach	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1610	LU	LU-ES	Esch-sur-Alzette	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1611	LU	LU-GR	Grevenmacher	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1612	LU	LU-LU	Luxembourg	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1613	LU	LU-ME	Mersch	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1614	LU	LU-RD	Redange	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1615	LU	LU-RM	Remich	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1616	LU	LU-VD	Vianden	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1617	LU	LU-WI	Wiltz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1618	LV	LV-011	Adazu novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1619	LV	LV-002	Aizkraukles novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1620	LV	LV-007	Aluksnes novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1621	LV	LV-111	Augsdaugavas novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1622	LV	LV-015	Balvu novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1623	LV	LV-016	Bauskas novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1624	LV	LV-022	Cesu novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1625	LV	LV-DGV	Daugavpils	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1626	LV	LV-112	Dienvidkurzemes novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1627	LV	LV-026	Dobeles novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1628	LV	LV-033	Gulbenes novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1629	LV	LV-042	Jekabpils novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1630	LV	LV-JEL	Jelgava	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1631	LV	LV-041	Jelgavas novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1632	LV	LV-JUR	Jurmala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1633	LV	LV-052	Kekavas novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1634	LV	LV-047	Kraslavas novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1635	LV	LV-050	Kuldigas novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1636	LV	LV-LPX	Liepaja	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1637	LV	LV-054	Limbazu novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1638	LV	LV-056	Livanu novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1639	LV	LV-058	Ludzas novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1640	LV	LV-059	Madonas novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1641	LV	LV-062	Marupes novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1642	LV	LV-067	Ogres novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1643	LV	LV-068	Olaines novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1644	LV	LV-073	Preilu novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1645	LV	LV-077	Rezeknes novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1646	LV	LV-RIX	Riga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1647	LV	LV-080	Ropazu novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1648	LV	LV-087	Salaspils novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1649	LV	LV-088	Saldus novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1650	LV	LV-089	Saulkrastu novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1651	LV	LV-091	Siguldas novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1652	LV	LV-094	Smiltenes novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1653	LV	LV-097	Talsu novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1654	LV	LV-099	Tukuma novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1655	LV	LV-101	Valkas novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1656	LV	LV-113	Valmieras novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1657	LV	LV-102	Varaklanu novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1658	LV	LV-106	Ventspils novads	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1659	LY	LY-BU	Al Butnan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1660	LY	LY-JA	Al Jabal al Akhdar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1661	LY	LY-JG	Al Jabal al Gharbi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1662	LY	LY-JI	Al Jafarah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1663	LY	LY-JU	Al Jufrah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1664	LY	LY-KF	Al Kufrah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1665	LY	LY-MJ	Al Marj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1666	LY	LY-MB	Al Marqab	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1667	LY	LY-WA	Al Wahat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1668	LY	LY-NQ	An Nuqat al Khams	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1669	LY	LY-ZA	Az Zawiyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1670	LY	LY-BA	Banghazi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1671	LY	LY-DR	Darnah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1672	LY	LY-MI	Misratah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1673	LY	LY-MQ	Murzuq	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1674	LY	LY-NL	Nalut	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1675	LY	LY-SB	Sabha	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1676	LY	LY-SR	Surt	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1677	LY	LY-TB	Tarabulus	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1678	LY	LY-WD	Wadi al Hayat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1679	LY	LY-WS	Wadi ash Shati'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1680	MA	MA-05	Beni-Mellal-Khenifra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1681	MA	MA-06	Casablanca-Settat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1682	MA	MA-08	Draa-Tafilalet	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1683	MA	MA-03	Fes- Meknes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1684	MA	MA-10	Guelmim-Oued Noun (EH-partial)	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1685	MA	MA-02	L'Oriental	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1686	MA	MA-11	Laayoune-Sakia El Hamra (EH-partial)	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1687	MA	MA-07	Marrakech-Safi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1688	MA	MA-04	Rabat-Sale-Kenitra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1689	MA	MA-09	Souss-Massa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1690	MA	MA-01	Tanger-Tetouan-Al Hoceima	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1691	MC	MC-FO	Fontvieille	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1692	MC	MC-CO	La Condamine	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1693	MC	MC-MO	Monaco-Ville	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1694	MC	MC-MG	Moneghetti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1695	MC	MC-MC	Monte-Carlo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1696	MC	MC-SR	Saint-Roman	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1697	MD	MD-AN	Anenii Noi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1698	MD	MD-BA	Balti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1699	MD	MD-BS	Basarabeasca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1700	MD	MD-BD	Bender	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1701	MD	MD-BR	Briceni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1702	MD	MD-CA	Cahul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1703	MD	MD-CL	Calarasi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1704	MD	MD-CT	Cantemir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1705	MD	MD-CS	Causeni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1706	MD	MD-CU	Chisinau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1707	MD	MD-CM	Cimislia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1708	MD	MD-CR	Criuleni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1709	MD	MD-DO	Donduseni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1710	MD	MD-DR	Drochia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1711	MD	MD-DU	Dubasari	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1712	MD	MD-ED	Edinet	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1713	MD	MD-FA	Falesti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1714	MD	MD-FL	Floresti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1715	MD	MD-GA	Gagauzia, Unitatea teritoriala autonoma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1716	MD	MD-GL	Glodeni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1717	MD	MD-HI	Hincesti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1718	MD	MD-IA	Ialoveni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1719	MD	MD-LE	Leova	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1720	MD	MD-NI	Nisporeni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1721	MD	MD-OC	Ocnita	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1722	MD	MD-OR	Orhei	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1723	MD	MD-RE	Rezina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1724	MD	MD-RI	Riscani	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1725	MD	MD-SI	Singerei	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1726	MD	MD-SD	Soldanesti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1727	MD	MD-SO	Soroca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1728	MD	MD-SV	Stefan Voda	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1729	MD	MD-SN	Stinga Nistrului, unitatea teritoriala din	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1730	MD	MD-ST	Straseni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1731	MD	MD-TA	Taraclia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1732	MD	MD-TE	Telenesti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1733	MD	MD-UN	Ungheni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1734	ME	ME-02	Bar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1735	ME	ME-03	Berane	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1736	ME	ME-04	Bijelo Polje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1737	ME	ME-05	Budva	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1738	ME	ME-06	Cetinje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1739	ME	ME-07	Danilovgrad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1740	ME	ME-22	Gusinje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1741	ME	ME-08	Herceg-Novi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1742	ME	ME-09	Kolasin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1743	ME	ME-10	Kotor	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1744	ME	ME-11	Mojkovac	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1745	ME	ME-12	Niksic	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1746	ME	ME-13	Plav	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1747	ME	ME-14	Pljevlja	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1748	ME	ME-15	Pluzine	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1749	ME	ME-16	Podgorica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1750	ME	ME-17	Rozaje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1751	ME	ME-18	Savnik	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1752	ME	ME-19	Tivat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1753	ME	ME-24	Tuzi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1754	ME	ME-20	Ulcinj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1755	ME	ME-21	Zabljak	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1756	ME	ME-25	Zeta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1757	MF	-	Saint Martin (French Part)	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1758	MG	MG-T	Antananarivo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1759	MG	MG-D	Antsiranana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1760	MG	MG-F	Fianarantsoa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1761	MG	MG-M	Mahajanga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1762	MG	MG-A	Toamasina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1763	MG	MG-U	Toliara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1764	MH	MH-KWA	Kwajalein	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1765	MH	MH-MAJ	Majuro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1766	MK	MK-802	Aracinovo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1767	MK	MK-201	Berovo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1768	MK	MK-501	Bitola	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1769	MK	MK-401	Bogdanci	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1770	MK	MK-601	Bogovinje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1771	MK	MK-402	Bosilovo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1772	MK	MK-602	Brvenica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1773	MK	MK-803	Butel	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1774	MK	MK-109	Caska	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1775	MK	MK-814	Centar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1776	MK	MK-313	Centar Zupa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1777	MK	MK-816	Cucer Sandevo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1778	MK	MK-303	Debar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1779	MK	MK-304	Debarca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1780	MK	MK-203	Delcevo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1781	MK	MK-502	Demir Hisar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1782	MK	MK-103	Demir Kapija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1783	MK	MK-406	Dojran	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1784	MK	MK-503	Dolneni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1785	MK	MK-804	Gazi Baba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1786	MK	MK-405	Gevgelija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1787	MK	MK-604	Gostivar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1788	MK	MK-807	Ilinden	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1789	MK	MK-606	Jegunovce	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1790	MK	MK-205	Karbinci	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1791	MK	MK-104	Kavadarci	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1792	MK	MK-307	Kicevo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1793	MK	MK-809	Kisela Voda	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1794	MK	MK-206	Kocani	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1795	MK	MK-407	Konce	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1796	MK	MK-701	Kratovo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1797	MK	MK-702	Kriva Palanka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1798	MK	MK-504	Krivogastani	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1799	MK	MK-505	Krusevo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1800	MK	MK-703	Kumanovo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1801	MK	MK-704	Lipkovo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1802	MK	MK-105	Lozovo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1803	MK	MK-207	Makedonska Kamenica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1804	MK	MK-308	Makedonski Brod	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1805	MK	MK-607	Mavrovo i Rostusa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1806	MK	MK-506	Mogila	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1807	MK	MK-106	Negotino	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1808	MK	MK-408	Novo Selo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1809	MK	MK-310	Ohrid	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1810	MK	MK-208	Pehcevo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1811	MK	MK-810	Petrovec	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1812	MK	MK-311	Plasnica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1813	MK	MK-508	Prilep	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1814	MK	MK-209	Probistip	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1815	MK	MK-409	Radovis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1816	MK	MK-705	Rankovce	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1817	MK	MK-509	Resen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1818	MK	MK-107	Rosoman	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1819	MK	MK-811	Saraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1820	MK	MK-706	Staro Nagoricane	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1821	MK	MK-211	Stip	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1822	MK	MK-312	Struga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1823	MK	MK-410	Strumica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1824	MK	MK-813	Studenicani	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1825	MK	MK-108	Sveti Nikole	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1826	MK	MK-608	Tearce	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1827	MK	MK-609	Tetovo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1828	MK	MK-403	Valandovo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1829	MK	MK-404	Vasilevo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1830	MK	MK-101	Veles	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1831	MK	MK-301	Vevcani	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1832	MK	MK-202	Vinica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1833	MK	MK-603	Vrapciste	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1834	MK	MK-806	Zelenikovo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1835	MK	MK-605	Zelino	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1836	ML	ML-BKO	Bamako	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1837	ML	ML-7	Gao	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1838	ML	ML-1	Kayes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1839	ML	ML-8	Kidal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1840	ML	ML-2	Koulikoro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1841	ML	ML-5	Mopti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1842	ML	ML-4	Segou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1843	ML	ML-3	Sikasso	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1844	ML	ML-6	Tombouctou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1845	MM	MM-07	Ayeyarwady	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1846	MM	MM-02	Bago	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1847	MM	MM-14	Chin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1848	MM	MM-11	Kachin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1849	MM	MM-12	Kayah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1850	MM	MM-13	Kayin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1851	MM	MM-03	Magway	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1852	MM	MM-04	Mandalay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1853	MM	MM-15	Mon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1854	MM	MM-18	Nay Pyi Taw	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1855	MM	MM-16	Rakhine	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1856	MM	MM-01	Sagaing	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1857	MM	MM-17	Shan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1858	MM	MM-05	Tanintharyi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1859	MM	MM-06	Yangon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1860	MN	MN-071	Bayan-Olgiy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1861	MN	MN-067	Bulgan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1862	MN	MN-037	Darhan uul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1863	MN	MN-061	Dornod	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1864	MN	MN-059	Dundgovi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1865	MN	MN-057	Dzavhan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1866	MN	MN-065	Govi-Altay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1867	MN	MN-043	Hovd	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1868	MN	MN-041	Hovsgol	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1869	MN	MN-053	Omnogovi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1870	MN	MN-035	Orhon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1871	MN	MN-055	Ovorhangay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1872	MN	MN-049	Selenge	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1873	MN	MN-051	Suhbaatar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1874	MN	MN-047	Tov	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1875	MN	MN-1	Ulaanbaatar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1876	MO	-	Macao	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1877	MP	-	Northern Mariana Islands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1878	MQ	-	Martinique	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1879	MR	MR-07	Adrar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1880	MR	MR-03	Assaba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1881	MR	MR-05	Brakna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1882	MR	MR-08	Dakhlet Nouadhibou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1883	MR	MR-04	Gorgol	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1884	MR	MR-10	Guidimaka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1885	MR	MR-02	Hodh el Gharbi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1886	MR	MR-12	Inchiri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1887	MR	MR-13	Nouakchott Ouest	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1888	MR	MR-09	Tagant	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1889	MR	MR-11	Tiris Zemmour	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1890	MR	MR-06	Trarza	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1891	MS	-	Saint Anthony	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1892	MS	-	Saint Peter	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1893	MT	MT-01	Attard	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1894	MT	MT-02	Balzan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1895	MT	MT-03	Birgu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1896	MT	MT-04	Birkirkara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1897	MT	MT-05	Birzebbuga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1898	MT	MT-06	Bormla	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1899	MT	MT-07	Dingli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1900	MT	MT-08	Fgura	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1901	MT	MT-09	Floriana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1902	MT	MT-10	Fontana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1903	MT	MT-14	Gharb	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1904	MT	MT-15	Gharghur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1905	MT	MT-16	Ghasri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1906	MT	MT-17	Ghaxaq	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1907	MT	MT-11	Gudja	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1908	MT	MT-12	Gzira	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1909	MT	MT-18	Hamrun	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1910	MT	MT-19	Iklin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1911	MT	MT-20	Isla	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1912	MT	MT-21	Kalkara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1913	MT	MT-23	Kirkop	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1914	MT	MT-24	Lija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1915	MT	MT-25	Luqa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1916	MT	MT-26	Marsa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1917	MT	MT-27	Marsaskala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1918	MT	MT-28	Marsaxlokk	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1919	MT	MT-29	Mdina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1920	MT	MT-30	Mellieha	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1921	MT	MT-31	Mgarr	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1922	MT	MT-32	Mosta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1923	MT	MT-33	Mqabba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1924	MT	MT-34	Msida	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1925	MT	MT-35	Mtarfa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1926	MT	MT-36	Munxar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1927	MT	MT-37	Nadur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1928	MT	MT-38	Naxxar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1929	MT	MT-39	Paola	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1930	MT	MT-40	Pembroke	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1931	MT	MT-41	Pieta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1932	MT	MT-42	Qala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1933	MT	MT-43	Qormi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1934	MT	MT-44	Qrendi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1935	MT	MT-45	Rabat Gozo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1936	MT	MT-46	Rabat Malta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1937	MT	MT-47	Safi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1938	MT	MT-49	Saint John	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1939	MT	MT-48	Saint Julian's	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1940	MT	MT-53	Saint Lucia's	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1941	MT	MT-51	Saint Paul's Bay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1942	MT	MT-52	Sannat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1943	MT	MT-54	Santa Venera	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1944	MT	MT-55	Siggiewi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1945	MT	MT-56	Sliema	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1946	MT	MT-57	Swieqi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1947	MT	MT-58	Ta' Xbiex	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1948	MT	MT-59	Tarxien	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1949	MT	MT-60	Valletta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1950	MT	MT-61	Xaghra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1951	MT	MT-62	Xewkija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1952	MT	MT-63	Xghajra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1953	MT	MT-64	Zabbar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1954	MT	MT-65	Zebbug Gozo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1955	MT	MT-67	Zejtun	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1956	MT	MT-68	Zurrieq	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1957	MU	MU-BL	Black River	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1958	MU	MU-FL	Flacq	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1959	MU	MU-GP	Grand Port	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1960	MU	MU-MO	Moka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1961	MU	MU-PA	Pamplemousses	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1962	MU	MU-PW	Plaines Wilhems	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1963	MU	MU-PL	Port Louis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1964	MU	MU-RR	Riviere du Rempart	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1965	MU	MU-RO	Rodrigues Islands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1966	MU	MU-SA	Savanne	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1967	MV	MV-01	Addu City	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1968	MV	MV-03	Faadhippolhu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1969	MV	MV-04	Felidhu Atoll	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1970	MV	MV-29	Fuvammulah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1971	MV	MV-05	Hahdhunmathi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1972	MV	MV-08	Kolhumadulu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1973	MV	MV-MLE	Male	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1974	MV	MV-12	Mulaku Atoll	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1975	MV	MV-02	North Ari Atoll	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1976	MV	MV-27	North Huvadhu Atoll	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1977	MV	MV-13	North Maalhosmadulu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1978	MV	MV-24	North Miladhunmadulu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1979	MV	MV-14	North Nilandhe Atoll	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1980	MV	MV-07	North Thiladhunmathi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1981	MV	MV-00	South Ari Atoll	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1982	MV	MV-28	South Huvadhu Atoll	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1983	MV	MV-20	South Maalhosmadulu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1984	MV	MV-25	South Miladhunmadulu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1985	MV	MV-17	South Nilandhe Atoll	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1986	MV	MV-23	South Thiladhunmathi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1987	MW	MW-BA	Balaka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1988	MW	MW-BL	Blantyre	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1989	MW	MW-CK	Chikwawa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1990	MW	MW-CR	Chiradzulu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1991	MW	MW-DE	Dedza	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1992	MW	MW-DO	Dowa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1993	MW	MW-KR	Karonga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1994	MW	MW-LI	Lilongwe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1995	MW	MW-MH	Machinga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1996	MW	MW-MG	Mangochi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1997	MW	MW-MC	Mchinji	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1998	MW	MW-MW	Mwanza	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
1999	MW	MW-MZ	Mzimba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2000	MW	MW-NE	Neno	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2001	MW	MW-NB	Nkhata Bay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2002	MW	MW-NK	Nkhotakota	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2003	MW	MW-NI	Ntchisi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2004	MW	MW-SA	Salima	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2005	MW	MW-TH	Thyolo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2006	MW	MW-ZO	Zomba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2007	MX	MX-AGU	Aguascalientes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2008	MX	MX-BCN	Baja California	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2009	MX	MX-BCS	Baja California Sur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2010	MX	MX-CAM	Campeche	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2011	MX	MX-CHP	Chiapas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2012	MX	MX-CHH	Chihuahua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2013	MX	MX-CMX	Ciudad de Mexico	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2014	MX	MX-COA	Coahuila de Zaragoza	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2015	MX	MX-COL	Colima	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2016	MX	MX-DUR	Durango	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2017	MX	MX-GUA	Guanajuato	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2018	MX	MX-GRO	Guerrero	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2019	MX	MX-HID	Hidalgo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2020	MX	MX-JAL	Jalisco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2021	MX	MX-MEX	Mexico	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2022	MX	MX-MIC	Michoacan de Ocampo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2023	MX	MX-MOR	Morelos	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2024	MX	MX-NAY	Nayarit	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2025	MX	MX-NLE	Nuevo Leon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2026	MX	MX-OAX	Oaxaca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2027	MX	MX-PUE	Puebla	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2028	MX	MX-QUE	Queretaro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2029	MX	MX-ROO	Quintana Roo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2030	MX	MX-SLP	San Luis Potosi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2031	MX	MX-SIN	Sinaloa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2032	MX	MX-SON	Sonora	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2033	MX	MX-TAB	Tabasco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2034	MX	MX-TAM	Tamaulipas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2035	MX	MX-TLA	Tlaxcala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2036	MX	MX-VER	Veracruz de Ignacio de la Llave	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2037	MX	MX-YUC	Yucatan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2038	MX	MX-ZAC	Zacatecas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2039	MY	MY-01	Johor	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2040	MY	MY-02	Kedah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2041	MY	MY-03	Kelantan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2042	MY	MY-04	Melaka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2043	MY	MY-05	Negeri Sembilan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2044	MY	MY-06	Pahang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2045	MY	MY-08	Perak	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2046	MY	MY-09	Perlis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2047	MY	MY-07	Pulau Pinang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2048	MY	MY-12	Sabah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2049	MY	MY-13	Sarawak	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2050	MY	MY-10	Selangor	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2051	MY	MY-11	Terengganu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2052	MY	MY-14	Wilayah Persekutuan Kuala Lumpur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2053	MY	MY-15	Wilayah Persekutuan Labuan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2054	MY	MY-16	Wilayah Persekutuan Putrajaya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2055	MZ	MZ-P	Cabo Delgado	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2056	MZ	MZ-G	Gaza	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2057	MZ	MZ-I	Inhambane	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2058	MZ	MZ-B	Manica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2059	MZ	MZ-L	Maputo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2060	MZ	MZ-N	Nampula	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2061	MZ	MZ-A	Niassa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2062	MZ	MZ-S	Sofala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2063	MZ	MZ-T	Tete	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2064	MZ	MZ-Q	Zambezia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2065	\N	NA-ER	Erongo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2066	\N	NA-HA	Hardap	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2067	\N	NA-KA	Karas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2068	\N	NA-KE	Kavango East	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2069	\N	NA-KW	Kavango West	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2070	\N	NA-KH	Khomas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2071	\N	NA-KU	Kunene	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2072	\N	NA-OW	Ohangwena	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2073	\N	NA-OH	Omaheke	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2074	\N	NA-OS	Omusati	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2075	\N	NA-ON	Oshana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2076	\N	NA-OT	Oshikoto	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2077	\N	NA-OD	Otjozondjupa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2078	\N	NA-CA	Zambezi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2079	NC	-	Province Nord	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2080	NC	-	Province Sud	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2081	NC	-	Province des iles Loyaute	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2082	NE	NE-1	Agadez	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2083	NE	NE-2	Diffa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2084	NE	NE-4	Maradi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2085	NE	NE-8	Niamey	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2086	NE	NE-5	Tahoua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2087	NE	NE-6	Tillaberi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2088	NE	NE-7	Zinder	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2089	NF	-	Norfolk Island	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2090	NG	NG-AB	Abia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2091	NG	NG-FC	Abuja Federal Capital Territory	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2092	NG	NG-AD	Adamawa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2093	NG	NG-AK	Akwa Ibom	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2094	NG	NG-AN	Anambra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2095	NG	NG-BA	Bauchi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2096	NG	NG-BY	Bayelsa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2097	NG	NG-BE	Benue	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2098	NG	NG-BO	Borno	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2099	NG	NG-CR	Cross River	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2100	NG	NG-DE	Delta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2101	NG	NG-EB	Ebonyi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2102	NG	NG-ED	Edo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2103	NG	NG-EK	Ekiti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2104	NG	NG-EN	Enugu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2105	NG	NG-GO	Gombe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2106	NG	NG-IM	Imo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2107	NG	NG-JI	Jigawa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2108	NG	NG-KD	Kaduna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2109	NG	NG-KN	Kano	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2110	NG	NG-KT	Katsina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2111	NG	NG-KE	Kebbi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2112	NG	NG-KO	Kogi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2113	NG	NG-KW	Kwara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2114	NG	NG-LA	Lagos	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2115	NG	NG-NA	Nasarawa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2116	NG	NG-NI	Niger	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2117	NG	NG-OG	Ogun	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2118	NG	NG-ON	Ondo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2119	NG	NG-OS	Osun	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2120	NG	NG-OY	Oyo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2121	NG	NG-PL	Plateau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2122	NG	NG-RI	Rivers	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2123	NG	NG-SO	Sokoto	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2124	NG	NG-TA	Taraba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2125	NG	NG-YO	Yobe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2126	NG	NG-ZA	Zamfara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2127	NI	NI-BO	Boaco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2128	NI	NI-CA	Carazo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2129	NI	NI-CI	Chinandega	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2130	NI	NI-CO	Chontales	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2131	NI	NI-AN	Costa Caribe Norte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2132	NI	NI-AS	Costa Caribe Sur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2133	NI	NI-ES	Esteli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2134	NI	NI-GR	Granada	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2135	NI	NI-JI	Jinotega	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2136	NI	NI-LE	Leon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2137	NI	NI-MD	Madriz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2138	NI	NI-MN	Managua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2139	NI	NI-MS	Masaya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2140	NI	NI-MT	Matagalpa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2141	NI	NI-NS	Nueva Segovia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2142	NI	NI-SJ	Rio San Juan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2143	NI	NI-RI	Rivas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2144	NL	NL-DR	Drenthe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2145	NL	NL-FL	Flevoland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2146	NL	NL-FR	Fryslan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2147	NL	NL-GE	Gelderland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2148	NL	NL-GR	Groningen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2149	NL	NL-LI	Limburg	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2150	NL	NL-NB	Noord-Brabant	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2151	NL	NL-NH	Noord-Holland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2152	NL	NL-OV	Overijssel	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2153	NL	NL-UT	Utrecht	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2154	NL	NL-ZE	Zeeland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2155	NL	NL-ZH	Zuid-Holland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2156	NO	NO-42	Agder	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2157	NO	NO-34	Innlandet	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2158	NO	NO-15	More og Romsdal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2159	NO	NO-18	Nordland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2160	NO	NO-03	Oslo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2161	NO	NO-11	Rogaland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2162	NO	NO-54	Troms og Finnmark	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2163	NO	NO-50	Trondelag	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2164	NO	NO-38	Vestfold og Telemark	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2165	NO	NO-46	Vestland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2166	NO	NO-30	Viken	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2167	NP	NP-P3	Bagmati	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2168	NP	NP-P4	Gandaki	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2169	NP	NP-P6	Karnali	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2170	NP	NP-P1	Koshi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2171	NP	NP-P5	Lumbini	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2172	NP	NP-P2	Madhesh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2173	NP	 NP-P7	Sudurpashchim	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2174	NR	NR-01	Aiwo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2175	NR	NR-03	Anetan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2176	NR	NR-14	Yaren	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2177	NU	-	Niue	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2178	NZ	NZ-AUK	Auckland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2179	NZ	NZ-BOP	Bay of Plenty	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2180	NZ	NZ-CAN	Canterbury	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2181	NZ	NZ-CIT	Chatham Islands Territory	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2182	NZ	NZ-GIS	Gisborne	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2183	NZ	NZ-WGN	Greater Wellington	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2184	NZ	NZ-HKB	Hawke's Bay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2185	NZ	NZ-MWT	Manawatu-Whanganui	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2186	NZ	NZ-MBH	Marlborough	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2187	NZ	NZ-NSN	Nelson	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2188	NZ	NZ-NTL	Northland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2189	NZ	NZ-OTA	Otago	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2190	NZ	NZ-STL	Southland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2191	NZ	NZ-TKI	Taranaki	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2192	NZ	NZ-TAS	Tasman	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2193	NZ	NZ-WKO	Waikato	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2194	NZ	NZ-WTC	West Coast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2195	OM	OM-DA	Ad Dakhiliyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2196	OM	OM-BU	Al Buraymi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2197	OM	OM-WU	Al Wusta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2198	OM	OM-ZA	Az Zahirah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2199	OM	OM-BJ	Janub al Batinah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2200	OM	OM-SJ	Janub ash Sharqiyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2201	OM	OM-MA	Masqat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2202	OM	OM-MU	Musandam	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2203	OM	OM-BS	Shamal al Batinah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2204	OM	OM-SS	Shamal ash Sharqiyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2205	OM	OM-ZU	Zufar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2206	PA	PA-1	Bocas del Toro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2207	PA	PA-4	Chiriqui	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2208	PA	PA-2	Cocle	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2209	PA	PA-3	Colon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2210	PA	PA-5	Darien	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2211	PA	PA-KY	Guna Yala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2212	PA	PA-6	Herrera	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2213	PA	PA-7	Los Santos	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2214	PA	PA-NB	Ngobe-Bugle	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2215	PA	PA-8	Panama	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2216	PA	PA-9	Veraguas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2217	PE	PE-AMA	Amazonas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2218	PE	PE-ANC	Ancash	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2219	PE	PE-APU	Apurimac	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2220	PE	PE-ARE	Arequipa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2221	PE	PE-AYA	Ayacucho	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2222	PE	PE-CAJ	Cajamarca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2223	PE	PE-CUS	Cusco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2224	PE	PE-CAL	El Callao	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2225	PE	PE-HUV	Huancavelica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2226	PE	PE-HUC	Huanuco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2227	PE	PE-ICA	Ica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2228	PE	PE-JUN	Junin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2229	PE	PE-LAL	La Libertad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2230	PE	PE-LAM	Lambayeque	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2231	PE	PE-LIM	Lima	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2232	PE	PE-LOR	Loreto	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2233	PE	PE-MDD	Madre de Dios	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2234	PE	PE-MOQ	Moquegua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2235	PE	PE-PAS	Pasco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2236	PE	PE-PIU	Piura	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2237	PE	PE-PUN	Puno	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2238	PE	PE-SAM	San Martin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2239	PE	PE-TAC	Tacna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2240	PE	PE-TUM	Tumbes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2241	PE	PE-UCA	Ucayali	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2242	PF	-	Iles Australes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2243	PF	-	Iles Marquises	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2244	PF	-	Iles Sous-le-Vent	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2245	PF	-	Iles Tuamotu-Gambier	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2246	PF	-	Iles du Vent	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2247	PG	PG-NSB	Bougainville	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2248	PG	PG-CPM	Central	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2249	PG	PG-EBR	East New Britain	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2250	PG	PG-EHG	Eastern Highlands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2251	PG	PG-EPW	Enga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2252	PG	PG-MPM	Madang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2253	PG	PG-MRL	Manus	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2254	PG	PG-MBA	Milne Bay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2255	PG	PG-MPL	Morobe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2256	PG	PG-NCD	National Capital District (Port Moresby)	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2257	PG	PG-NIK	New Ireland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2258	PG	PG-NPP	Northern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2259	PG	PG-SHM	Southern Highlands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2260	PG	PG-SAN	West Sepik	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2261	PG	PG-WPD	Western	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2262	PG	PG-WHM	Western Highlands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2263	PH	PH-ABR	Abra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2264	PH	PH-AGN	Agusan del Norte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2265	PH	PH-AGS	Agusan del Sur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2266	PH	PH-AKL	Aklan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2267	PH	PH-ALB	Albay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2268	PH	PH-ANT	Antique	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2269	PH	PH-APA	Apayao	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2270	PH	PH-AUR	Aurora	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2271	PH	PH-BAS	Basilan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2272	PH	PH-BAN	Bataan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2273	PH	PH-BTN	Batanes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2274	PH	PH-BTG	Batangas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2275	PH	PH-BEN	Benguet	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2276	PH	PH-BIL	Biliran	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2277	PH	PH-BOH	Bohol	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2278	PH	PH-BUK	Bukidnon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2279	PH	PH-BUL	Bulacan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2280	PH	PH-CAG	Cagayan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2281	PH	PH-CAN	Camarines Norte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2282	PH	PH-CAS	Camarines Sur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2283	PH	PH-CAM	Camiguin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2284	PH	PH-CAP	Capiz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2285	PH	PH-CAT	Catanduanes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2286	PH	PH-CAV	Cavite	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2287	PH	PH-CEB	Cebu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2288	PH	PH-NCO	Cotabato	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2289	PH	PH-DAO	Davao Oriental	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2290	PH	PH-COM	Davao de Oro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2291	PH	PH-DAV	Davao del Norte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2292	PH	PH-DAS	Davao del Sur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2293	PH	PH-DIN	Dinagat Islands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2294	PH	PH-EAS	Eastern Samar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2295	PH	PH-GUI	Guimaras	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2296	PH	PH-IFU	Ifugao	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2297	PH	PH-ILN	Ilocos Norte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2298	PH	PH-ILS	Ilocos Sur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2299	PH	PH-ILI	Iloilo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2300	PH	PH-ISA	Isabela	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2301	PH	PH-KAL	Kalinga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2302	PH	PH-LUN	La Union	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2303	PH	PH-LAG	Laguna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2304	PH	PH-LAN	Lanao del Norte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2305	PH	PH-LAS	Lanao del Sur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2306	PH	PH-LEY	Leyte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2307	PH	PH-MAG	Maguindanao	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2308	PH	PH-MAD	Marinduque	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2309	PH	PH-MAS	Masbate	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2310	PH	PH-MDC	Mindoro Occidental	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2311	PH	PH-MDR	Mindoro Oriental	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2312	PH	PH-MSC	Misamis Occidental	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2313	PH	PH-MSR	Misamis Oriental	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2314	PH	PH-MOU	Mountain Province	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2315	PH	PH-00	National Capital Region	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2316	PH	PH-NEC	Negros Occidental	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2317	PH	PH-NER	Negros Oriental	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2318	PH	PH-NSA	Northern Samar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2319	PH	PH-NUE	Nueva Ecija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2320	PH	PH-NUV	Nueva Vizcaya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2321	PH	PH-PLW	Palawan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2322	PH	PH-PAM	Pampanga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2323	PH	PH-PAN	Pangasinan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2324	PH	PH-QUE	Quezon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2325	PH	PH-QUI	Quirino	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2326	PH	PH-RIZ	Rizal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2327	PH	PH-ROM	Romblon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2328	PH	PH-WSA	Samar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2329	PH	PH-SAR	Sarangani	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2330	PH	PH-SIG	Siquijor	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2331	PH	PH-SOR	Sorsogon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2332	PH	PH-SCO	South Cotabato	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2333	PH	PH-SLE	Southern Leyte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2334	PH	PH-SUK	Sultan Kudarat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2335	PH	PH-SLU	Sulu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2336	PH	PH-SUN	Surigao del Norte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2337	PH	PH-SUR	Surigao del Sur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2338	PH	PH-TAR	Tarlac	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2339	PH	PH-TAW	Tawi-Tawi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2340	PH	PH-ZMB	Zambales	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2341	PH	PH-ZSI	Zamboanga Sibugay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2342	PH	PH-ZAN	Zamboanga del Norte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2343	PH	PH-ZAS	Zamboanga del Sur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2344	PK	PK-JK	Azad Jammu and Kashmir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2345	PK	PK-BA	Balochistan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2346	PK	PK-GB	Gilgit-Baltistan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2347	PK	PK-IS	Islamabad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2348	PK	PK-KP	Khyber Pakhtunkhwa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2349	PK	PK-PB	Punjab	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2350	PK	PK-SD	Sindh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2351	PL	PL-02	Dolnoslaskie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2352	PL	PL-04	Kujawsko-Pomorskie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2353	PL	PL-10	Lodzkie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2354	PL	PL-06	Lubelskie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2355	PL	PL-08	Lubuskie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2356	PL	PL-12	Malopolskie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2357	PL	PL-14	Mazowieckie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2358	PL	PL-16	Opolskie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2359	PL	PL-18	Podkarpackie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2360	PL	PL-20	Podlaskie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2361	PL	PL-22	Pomorskie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2362	PL	PL-24	Slaskie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2363	PL	PL-26	Swietokrzyskie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2364	PL	PL-28	Warminsko-Mazurskie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2365	PL	PL-30	Wielkopolskie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2366	PL	PL-32	Zachodniopomorskie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2367	PM	-	Saint Pierre and Miquelon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2368	PN	-	Pitcairn	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2369	PR	-	Adjuntas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2370	PR	-	Aguada	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2371	PR	-	Aguadilla	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2372	PR	-	Aguas Buenas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2373	PR	-	Aibonito	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2374	PR	-	Anasco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2375	PR	-	Arecibo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2376	PR	-	Arroyo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2377	PR	-	Barceloneta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2378	PR	-	Barranquitas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2379	PR	-	Bayamon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2380	PR	-	Cabo Rojo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2381	PR	-	Caguas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2382	PR	-	Camuy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2383	PR	-	Canovanas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2384	PR	-	Carolina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2385	PR	-	Catano	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2386	PR	-	Cayey	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2387	PR	-	Ceiba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2388	PR	-	Ciales	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2389	PR	-	Cidra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2390	PR	-	Coamo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2391	PR	-	Comerio	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2392	PR	-	Corozal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2393	PR	-	Culebra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2394	PR	-	Dorado	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2395	PR	-	Fajardo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2396	PR	-	Florida	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2397	PR	-	Guanica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2398	PR	-	Guayama	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2399	PR	-	Guayanilla	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2400	PR	-	Guaynabo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2401	PR	-	Gurabo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2402	PR	-	Hatillo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2403	PR	-	Hormigueros	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2404	PR	-	Humacao	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2405	PR	-	Isabela	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2406	PR	-	Juana Diaz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2407	PR	-	Lajas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2408	PR	-	Lares	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2409	PR	-	Las Marias	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2410	PR	-	Las Piedras	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2411	PR	-	Loiza	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2412	PR	-	Luquillo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2413	PR	-	Manati	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2414	PR	-	Maricao	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2415	PR	-	Maunabo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2416	PR	-	Mayaguez	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2417	PR	-	Moca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2418	PR	-	Morovis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2419	PR	-	Municipio de Jayuya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2420	PR	-	Municipio de Juncos	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2421	PR	-	Naguabo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2422	PR	-	Naranjito	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2423	PR	-	Patillas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2424	PR	-	Penuelas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2425	PR	-	Ponce	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2426	PR	-	Quebradillas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2427	PR	-	Rincon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2428	PR	-	Rio Grande	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2429	PR	-	Sabana Grande	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2430	PR	-	Salinas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2431	PR	-	San German	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2432	PR	-	San Juan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2433	PR	-	San Lorenzo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2434	PR	-	San Sebastian	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2435	PR	-	Santa Isabel Municipio	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2436	PR	-	Toa Alta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2437	PR	-	Toa Baja	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2438	PR	-	Trujillo Alto	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2439	PR	-	Utuado	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2440	PR	-	Vega Alta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2441	PR	-	Vega Baja	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2442	PR	-	Vieques	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2443	PR	-	Villalba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2444	PR	-	Yabucoa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2445	PR	-	Yauco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2446	PS	PS-BTH	Bethlehem	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2447	PS	PS-DEB	Deir El Balah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2448	PS	PS-GZA	Gaza	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2449	PS	PS-HBN	Hebron	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2450	PS	PS-JEN	Jenin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2451	PS	PS-JRH	Jericho and Al Aghwar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2452	PS	PS-JEM	Jerusalem	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2453	PS	PS-KYS	Khan Yunis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2454	PS	PS-NBS	Nablus	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2455	PS	PS-QQA	Qalqilya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2456	PS	PS-RFH	Rafah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2457	PS	PS-RBH	Ramallah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2458	PS	PS-SLT	Salfit	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2459	PS	PS-TBS	Tubas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2460	PS	PS-TKM	Tulkarm	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2461	PT	PT-01	Aveiro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2462	PT	PT-02	Beja	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2463	PT	PT-03	Braga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2464	PT	PT-04	Braganca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2465	PT	PT-05	Castelo Branco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2466	PT	PT-06	Coimbra	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2467	PT	PT-07	Evora	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2468	PT	PT-08	Faro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2469	PT	PT-09	Guarda	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2470	PT	PT-10	Leiria	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2471	PT	PT-11	Lisboa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2472	PT	PT-12	Portalegre	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2473	PT	PT-13	Porto	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2474	PT	PT-30	Regiao Autonoma da Madeira	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2475	PT	PT-20	Regiao Autonoma dos Acores	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2476	PT	PT-14	Santarem	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2477	PT	PT-15	Setubal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2478	PT	PT-16	Viana do Castelo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2479	PT	PT-17	Vila Real	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2480	PT	PT-18	Viseu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2481	PW	PW-004	Airai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2482	PW	PW-150	Koror	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2483	PW	PW-212	Melekeok	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2484	PW	PW-214	Ngaraard	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2485	PW	PW-222	Ngardmau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2486	PW	PW-224	Ngatpang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2487	PW	PW-226	Ngchesar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2488	PW	PW-370	Sonsorol	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2489	PY	PY-16	Alto Paraguay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2490	PY	PY-10	Alto Parana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2491	PY	PY-13	Amambay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2492	PY	PY-ASU	Asuncion	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2493	PY	PY-19	Boqueron	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2494	PY	PY-5	Caaguazu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2495	PY	PY-6	Caazapa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2496	PY	PY-14	Canindeyu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2497	PY	PY-11	Central	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2498	PY	PY-1	Concepcion	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2499	PY	PY-3	Cordillera	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2500	PY	PY-4	Guaira	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2501	PY	PY-7	Itapua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2502	PY	PY-8	Misiones	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2503	PY	PY-12	Neembucu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2504	PY	PY-9	Paraguari	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2505	PY	PY-15	Presidente Hayes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2506	PY	PY-2	San Pedro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2507	QA	QA-DA	Ad Dawhah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2508	QA	QA-KH	Al Khawr wa adh Dhakhirah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2509	QA	QA-WA	Al Wakrah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2510	QA	QA-RA	Ar Rayyan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2511	QA	QA-MS	Ash Shamal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2512	QA	QA-ZA	Az Za'ayin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2513	QA	QA-US	Umm Salal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2514	RE	-	Reunion	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2515	RO	RO-AB	Alba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2516	RO	RO-AR	Arad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2517	RO	RO-AG	Arges	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2518	RO	RO-BC	Bacau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2519	RO	RO-BH	Bihor	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2520	RO	RO-BN	Bistrita-Nasaud	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2521	RO	RO-BT	Botosani	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2522	RO	RO-BR	Braila	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2523	RO	RO-BV	Brasov	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2524	RO	RO-B	Bucuresti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2525	RO	RO-BZ	Buzau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2526	RO	RO-CL	Calarasi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2527	RO	RO-CS	Caras-Severin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2528	RO	RO-CJ	Cluj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2529	RO	RO-CT	Constanta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2530	RO	RO-CV	Covasna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2531	RO	RO-DB	Dambovita	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2532	RO	RO-DJ	Dolj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2533	RO	RO-GL	Galati	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2534	RO	RO-GR	Giurgiu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2535	RO	RO-GJ	Gorj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2536	RO	RO-HR	Harghita	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2537	RO	RO-HD	Hunedoara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2538	RO	RO-IL	Ialomita	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2539	RO	RO-IS	Iasi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2540	RO	RO-IF	Ilfov	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2541	RO	RO-MM	Maramures	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2542	RO	RO-MH	Mehedinti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2543	RO	RO-MS	Mures	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2544	RO	RO-NT	Neamt	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2545	RO	RO-OT	Olt	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2546	RO	RO-PH	Prahova	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2547	RO	RO-SJ	Salaj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2548	RO	RO-SM	Satu Mare	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2549	RO	RO-SB	Sibiu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2550	RO	RO-SV	Suceava	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2551	RO	RO-TR	Teleorman	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2552	RO	RO-TM	Timis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2553	RO	RO-TL	Tulcea	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2554	RO	RO-VL	Valcea	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2555	RO	RO-VS	Vaslui	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2556	RO	RO-VN	Vrancea	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2557	RS	RS-00	Beograd	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2558	RS	RS-14	Borski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2559	RS	RS-11	Branicevski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2560	RS	RS-23	Jablanicki okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2561	RS	RS-06	Juznobacki okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2562	RS	RS-04	Juznobanatski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2563	RS	RS-09	Kolubarski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2564	RS	RS-28	Kosovsko-Mitrovacki okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2565	RS	RS-08	Macvanski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2566	RS	RS-17	Moravicki okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2567	RS	RS-20	Nisavski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2568	RS	RS-24	Pcinjski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2569	RS	RS-26	Pecki okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2570	RS	RS-22	Pirotski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2571	RS	RS-10	Podunavski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2572	RS	RS-13	Pomoravski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2573	RS	RS-27	Prizrenski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2574	RS	RS-19	Rasinski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2575	RS	RS-18	Raski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2576	RS	RS-01	Severnobacki okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2577	RS	RS-03	Severnobanatski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2578	RS	RS-02	Srednjebanatski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2579	RS	RS-07	Sremski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2580	RS	RS-12	Sumadijski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2581	RS	RS-21	Toplicki okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2582	RS	RS-15	Zajecarski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2583	RS	RS-05	Zapadnobacki okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2584	RS	RS-16	Zlatiborski okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2585	RU	RU-AD	Adygeya, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2586	RU	RU-AL	Altay, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2587	RU	RU-ALT	Altayskiy kray	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2588	RU	RU-AMU	Amurskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2589	RU	RU-ARK	Arkhangel'skaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2590	RU	RU-AST	Astrakhanskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2591	RU	RU-BA	Bashkortostan, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2592	RU	RU-BEL	Belgorodskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2593	RU	RU-BRY	Bryanskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2594	RU	RU-BU	Buryatiya, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2595	RU	RU-CE	Chechenskaya Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2596	RU	RU-CHE	Chelyabinskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2597	RU	RU-CHU	Chukotskiy avtonomnyy okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2598	RU	RU-CU	Chuvashskaya Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2599	RU	RU-DA	Dagestan, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2600	RU	RU-IN	Ingushetiya, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2601	RU	RU-IRK	Irkutskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2602	RU	RU-IVA	Ivanovskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2603	RU	RU-KB	Kabardino-Balkarskaya Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2604	RU	RU-KGD	Kaliningradskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2605	RU	RU-KL	Kalmykiya, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2606	RU	RU-KLU	Kaluzhskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2607	RU	RU-KAM	Kamchatskiy kray	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2608	RU	RU-KC	Karachayevo-Cherkesskaya Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2609	RU	RU-KR	Kareliya, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2610	RU	RU-KEM	Kemerovskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2611	RU	RU-KHA	Khabarovskiy kray	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2612	RU	RU-KK	Khakasiya, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2613	RU	RU-KHM	Khanty-Mansiyskiy avtonomnyy okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2614	RU	RU-KIR	Kirovskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2615	RU	RU-KO	Komi, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2616	RU	RU-KOS	Kostromskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2617	RU	RU-KDA	Krasnodarskiy kray	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2618	RU	RU-KYA	Krasnoyarskiy kray	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2619	RU	RU-KGN	Kurganskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2620	RU	RU-KRS	Kurskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2621	RU	RU-LEN	Leningradskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2622	RU	RU-LIP	Lipetskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2623	RU	RU-MAG	Magadanskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2624	RU	RU-ME	Mariy El, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2625	RU	RU-MO	Mordoviya, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2626	RU	RU-MOS	Moskovskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2627	RU	RU-MOW	Moskva	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2628	RU	RU-MUR	Murmanskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2629	RU	RU-NEN	Nenetskiy avtonomnyy okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2630	RU	RU-NIZ	Nizhegorodskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2631	RU	RU-NGR	Novgorodskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2632	RU	RU-NVS	Novosibirskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2633	RU	RU-OMS	Omskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2634	RU	RU-ORE	Orenburgskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2635	RU	RU-ORL	Orlovskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2636	RU	RU-PNZ	Penzenskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2637	RU	RU-PER	Permskiy kray	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2638	RU	RU-PRI	Primorskiy kray	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2639	RU	RU-PSK	Pskovskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2640	RU	RU-ROS	Rostovskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2641	RU	RU-RYA	Ryazanskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2642	RU	RU-SA	Saha, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2643	RU	RU-SAK	Sakhalinskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2644	RU	RU-SAM	Samarskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2645	RU	RU-SPE	Sankt-Peterburg	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2646	RU	RU-SAR	Saratovskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2647	RU	RU-SE	Severnaya Osetiya, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2648	RU	RU-SMO	Smolenskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2649	RU	RU-STA	Stavropol'skiy kray	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2650	RU	RU-SVE	Sverdlovskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2651	RU	RU-TAM	Tambovskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2652	RU	RU-TA	Tatarstan, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2653	RU	RU-TOM	Tomskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2654	RU	RU-TUL	Tul'skaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2655	RU	RU-TVE	Tverskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2656	RU	RU-TYU	Tyumenskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2657	RU	RU-TY	Tyva, Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2658	RU	RU-UD	Udmurtskaya Respublika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2659	RU	RU-ULY	Ul'yanovskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2660	RU	RU-VLA	Vladimirskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2661	RU	RU-VGG	Volgogradskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2662	RU	RU-VLG	Vologodskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2663	RU	RU-VOR	Voronezhskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2664	RU	RU-YAN	Yamalo-Nenetskiy avtonomnyy okrug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2665	RU	RU-YAR	Yaroslavskaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2666	RU	RU-YEV	Yevreyskaya avtonomnaya oblast'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2667	RU	RU-ZAB	Zabaykal'skiy kray	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2668	RW	RW-02	Est	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2669	RW	RW-03	Nord	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2670	RW	RW-04	Ouest	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2671	RW	RW-05	Sud	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2672	RW	RW-01	Ville de Kigali	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2673	SA	SA-14	'Asir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2674	SA	SA-11	Al Bahah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2675	SA	SA-08	Al Hudud ash Shamaliyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2676	SA	SA-12	Al Jawf	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2677	SA	SA-03	Al Madinah al Munawwarah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2678	SA	SA-05	Al Qasim	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2679	SA	SA-01	Ar Riyad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2680	SA	SA-04	Ash Sharqiyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2681	SA	SA-06	Ha'il	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2682	SA	SA-09	Jazan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2683	SA	SA-02	Makkah al Mukarramah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2684	SA	SA-10	Najran	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2685	SA	SA-07	Tabuk	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2686	SB	SB-GU	Guadalcanal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2687	SB	SB-MK	Makira-Ulawa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2688	SB	SB-ML	Malaita	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2689	SB	SB-WE	Western	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2690	SC	SC-02	Anse Boileau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2691	SC	SC-05	Anse Royale	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2692	SC	SC-01	Anse aux Pins	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2693	SC	SC-06	Baie Lazare	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2694	SC	SC-07	Baie Sainte Anne	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2695	SC	SC-08	Beau Vallon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2696	SC	SC-10	Bel Ombre	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2697	SC	SC-11	Cascade	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2698	SC	SC-16	English River	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2699	SC	SC-13	Grand Anse Mahe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2700	SC	SC-14	Grand Anse Praslin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2701	SC	SC-15	La Digue	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2702	SC	SC-20	Pointe Larue	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2703	SC	SC-23	Takamaka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2704	SD	SD-NB	Blue Nile	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2705	SD	SD-DC	Central Darfur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2706	SD	SD-GD	Gedaref	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2707	SD	SD-GZ	Gezira	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2708	SD	SD-KA	Kassala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2709	SD	SD-KH	Khartoum	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2710	SD	SD-DN	North Darfur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2711	SD	SD-KN	North Kordofan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2712	SD	SD-NO	Northern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2713	SD	SD-RS	Red Sea	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2714	SD	SD-NR	River Nile	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2715	SD	SD-SI	Sennar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2716	SD	SD-DS	South Darfur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2717	SD	SD-KS	South Kordofan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2718	SD	SD-DW	West Darfur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2719	SD	SD-GK	West Kordofan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2720	SD	SD-NW	White Nile	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2721	SE	SE-K	Blekinge lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2722	SE	SE-W	Dalarnas lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2723	SE	SE-X	Gavleborgs lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2724	SE	SE-I	Gotlands lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2725	SE	SE-N	Hallands lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2726	SE	SE-Z	Jamtlands lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2727	SE	SE-F	Jonkopings lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2728	SE	SE-H	Kalmar lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2729	SE	SE-G	Kronobergs lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2730	SE	SE-BD	Norrbottens lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2731	SE	SE-T	Orebro lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2732	SE	SE-E	Ostergotlands lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2733	SE	SE-M	Skane lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2734	SE	SE-D	Sodermanlands lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2735	SE	SE-AB	Stockholms lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2736	SE	SE-C	Uppsala lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2737	SE	SE-S	Varmlands lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2738	SE	SE-AC	Vasterbottens lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2739	SE	SE-Y	Vasternorrlands lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2740	SE	SE-U	Vastmanlands lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2741	SE	SE-O	Vastra Gotalands lan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2742	SG	-	Singapore	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2743	SH	SH-HL	Saint Helena	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2744	SI	SI-001	Ajdovscina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2745	SI	SI-213	Ankaran	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2746	SI	SI-195	Apace	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2747	SI	SI-002	Beltinci	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2748	SI	SI-148	Benedikt	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2749	SI	SI-149	Bistrica ob Sotli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2750	SI	SI-003	Bled	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2751	SI	SI-150	Bloke	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2752	SI	SI-004	Bohinj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2753	SI	SI-005	Borovnica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2754	SI	SI-006	Bovec	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2755	SI	SI-151	Braslovce	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2756	SI	SI-007	Brda	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2757	SI	SI-009	Brezice	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2758	SI	SI-008	Brezovica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2759	SI	SI-152	Cankova	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2760	SI	SI-011	Celje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2761	SI	SI-012	Cerklje na Gorenjskem	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2762	SI	SI-013	Cerknica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2763	SI	SI-014	Cerkno	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2764	SI	SI-196	Cirkulane	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2765	SI	SI-015	Crensovci	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2766	SI	SI-017	Crnomelj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2767	SI	SI-018	Destrnik	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2768	SI	SI-019	Divaca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2769	SI	SI-154	Dobje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2770	SI	SI-020	Dobrepolje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2771	SI	SI-155	Dobrna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2772	SI	SI-021	Dobrova-Polhov Gradec	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2773	SI	SI-156	Dobrovnik	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2774	SI	SI-023	Domzale	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2775	SI	SI-024	Dornava	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2776	SI	SI-025	Dravograd	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2777	SI	SI-026	Duplek	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2778	SI	SI-207	Gorje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2779	SI	SI-029	Gornja Radgona	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2780	SI	SI-031	Gornji Petrovci	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2781	SI	SI-158	Grad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2782	SI	SI-032	Grosuplje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2783	SI	SI-159	Hajdina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2784	SI	SI-160	Hoce-Slivnica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2785	SI	SI-161	Hodos	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2786	SI	SI-162	Horjul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2787	SI	SI-034	Hrastnik	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2788	SI	SI-035	Hrpelje-Kozina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2789	SI	SI-036	Idrija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2790	SI	SI-037	Ig	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2791	SI	SI-038	Ilirska Bistrica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2792	SI	SI-039	Ivancna Gorica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2793	SI	SI-040	Izola	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2794	SI	SI-041	Jesenice	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2795	SI	SI-042	Jursinci	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2796	SI	SI-043	Kamnik	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2797	SI	SI-044	Kanal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2798	SI	SI-045	Kidricevo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2799	SI	SI-046	Kobarid	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2800	SI	SI-047	Kobilje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2801	SI	SI-048	Kocevje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2802	SI	SI-049	Komen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2803	SI	SI-164	Komenda	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2804	SI	SI-050	Koper	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2805	SI	SI-197	Kosanjevica na Krki	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2806	SI	SI-165	Kostel	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2807	SI	SI-052	Kranj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2808	SI	SI-053	Kranjska Gora	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2809	SI	SI-166	Krizevci	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2810	SI	SI-054	Krsko	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2811	SI	SI-055	Kungota	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2812	SI	SI-056	Kuzma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2813	SI	SI-057	Lasko	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2814	SI	SI-058	Lenart	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2815	SI	SI-059	Lendava	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2816	SI	SI-060	Litija	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2817	SI	SI-061	Ljubljana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2818	SI	SI-063	Ljutomer	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2819	SI	SI-208	Log-Dragomer	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2820	SI	SI-064	Logatec	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2821	SI	SI-065	Loska dolina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2822	SI	SI-066	Loski Potok	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2823	SI	SI-167	Lovrenc na Pohorju	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2824	SI	SI-067	Luce	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2825	SI	SI-068	Lukovica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2826	SI	SI-069	Majsperk	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2827	SI	SI-198	Makole	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2828	SI	SI-070	Maribor	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2829	SI	SI-168	Markovci	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2830	SI	SI-071	Medvode	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2831	SI	SI-072	Menges	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2832	SI	SI-073	Metlika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2833	SI	SI-074	Mezica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2834	SI	SI-169	Miklavz na Dravskem polju	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2835	SI	SI-075	Miren-Kostanjevica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2836	SI	SI-212	Mirna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2837	SI	SI-170	Mirna Pec	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2838	SI	SI-076	Mislinja	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2839	SI	SI-199	Mokronog-Trebelno	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2840	SI	SI-077	Moravce	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2841	SI	SI-079	Mozirje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2842	SI	SI-080	Murska Sobota	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2843	SI	SI-081	Muta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2844	SI	SI-082	Naklo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2845	SI	SI-083	Nazarje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2846	SI	SI-084	Nova Gorica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2847	SI	SI-085	Novo Mesto	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2848	SI	SI-086	Odranci	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2849	SI	SI-171	Oplotnica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2850	SI	SI-087	Ormoz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2851	SI	SI-090	Piran	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2852	SI	SI-091	Pivka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2853	SI	SI-092	Podcetrtek	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2854	SI	SI-172	Podlehnik	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2855	SI	SI-200	Poljcane	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2856	SI	SI-173	Polzela	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2857	SI	SI-094	Postojna	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2858	SI	SI-174	Prebold	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2859	SI	SI-095	Preddvor	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2860	SI	SI-175	Prevalje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2861	SI	SI-096	Ptuj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2862	SI	SI-097	Puconci	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2863	SI	SI-098	Race-Fram	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2864	SI	SI-099	Radece	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2865	SI	SI-100	Radenci	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2866	SI	SI-101	Radlje ob Dravi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2867	SI	SI-102	Radovljica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2868	SI	SI-103	Ravne na Koroskem	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2869	SI	SI-176	Razkrizje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2870	SI	SI-209	Recica ob Savinji	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2871	SI	SI-201	Rence-Vogrsko	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2872	SI	SI-104	Ribnica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2873	SI	SI-106	Rogaska Slatina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2874	SI	SI-105	Rogasovci	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2875	SI	SI-108	Ruse	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2876	SI	SI-033	Salovci	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2877	SI	SI-109	Semic	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2878	SI	SI-183	Sempeter-Vrtojba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2879	SI	SI-117	Sencur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2880	SI	SI-118	Sentilj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2881	SI	SI-119	Sentjernej	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2882	SI	SI-120	Sentjur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2883	SI	SI-211	Sentrupert	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2884	SI	SI-110	Sevnica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2885	SI	SI-111	Sezana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2886	SI	SI-121	Skocjan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2887	SI	SI-122	Skofja Loka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2888	SI	SI-123	Skofljica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2889	SI	SI-112	Slovenj Gradec	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2890	SI	SI-113	Slovenska Bistrica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2891	SI	SI-114	Slovenske Konjice	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2892	SI	SI-124	Smarje pri Jelsah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2893	SI	SI-206	Smarjeske Toplice	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2894	SI	SI-125	Smartno ob Paki	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2895	SI	SI-194	Smartno pri Litiji	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2896	SI	SI-179	Sodrazica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2897	SI	SI-180	Solcava	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2898	SI	SI-126	Sostanj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2899	SI	SI-115	Starse	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2900	SI	SI-127	Store	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2901	SI	SI-203	Straza	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2902	SI	SI-204	Sveta Trojica v Slovenskih goricah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2903	SI	SI-182	Sveti Andraz v Slovenskih Goricah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2904	SI	SI-116	Sveti Jurij ob Scavnici	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2905	SI	SI-210	Sveti Jurij v Slovenskih goricah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2906	SI	SI-205	Sveti Tomaz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2907	SI	SI-184	Tabor	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2908	SI	SI-010	Tisina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2909	SI	SI-128	Tolmin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2910	SI	SI-129	Trbovlje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2911	SI	SI-130	Trebnje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2912	SI	SI-185	Trnovska Vas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2913	SI	SI-131	Trzic	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2914	SI	SI-186	Trzin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2915	SI	SI-132	Turnisce	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2916	SI	SI-133	Velenje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2917	SI	SI-187	Velika Polana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2918	SI	SI-134	Velike Lasce	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2919	SI	SI-188	Verzej	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2920	SI	SI-135	Videm	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2921	SI	SI-136	Vipava	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2922	SI	SI-137	Vitanje	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2923	SI	SI-138	Vodice	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2924	SI	SI-139	Vojnik	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2925	SI	SI-189	Vransko	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2926	SI	SI-140	Vrhnika	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2927	SI	SI-141	Vuzenica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2928	SI	SI-142	Zagorje ob Savi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2929	SI	SI-190	Zalec	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2930	SI	SI-143	Zavrc	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2931	SI	SI-146	Zelezniki	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2932	SI	SI-191	Zetale	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2933	SI	SI-147	Ziri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2934	SI	SI-144	Zrece	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2935	SI	SI-193	Zuzemberk	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2936	SJ	-	Svalbard and Jan Mayen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2937	SK	SK-BC	Banskobystricky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2938	SK	SK-BL	Bratislavsky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2939	SK	SK-KI	Kosicky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2940	SK	SK-NI	Nitriansky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2941	SK	SK-PV	Presovsky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2942	SK	SK-TC	Trenciansky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2943	SK	SK-TA	Trnavsky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2944	SK	SK-ZI	Zilinsky kraj	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2945	SL	SL-E	Eastern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2946	SL	SL-NW	North Western	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2947	SL	SL-N	Northern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2948	SL	SL-S	Southern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2949	SL	SL-W	Western Area	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2950	SM	SM-02	Chiesanuova	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2951	SM	SM-07	Citta di San Marino	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2952	SM	SM-04	Faetano	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2953	SM	SM-09	Serravalle	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2954	SN	SN-DK	Dakar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2955	SN	SN-DB	Diourbel	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2956	SN	SN-FK	Fatick	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2957	SN	SN-KA	Kaffrine	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2958	SN	SN-KL	Kaolack	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2959	SN	SN-KE	Kedougou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2960	SN	SN-KD	Kolda	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2961	SN	SN-LG	Louga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2962	SN	SN-MT	Matam	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2963	SN	SN-SL	Saint-Louis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2964	SN	SN-SE	Sedhiou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2965	SN	SN-TC	Tambacounda	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2966	SN	SN-TH	Thies	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2967	SN	SN-ZG	Ziguinchor	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2968	SO	SO-AW	Awdal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2969	SO	SO-BN	Banaadir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2970	SO	SO-BR	Bari	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2971	SO	SO-BY	Bay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2972	SO	SO-GA	Galguduud	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2973	SO	SO-JH	Jubbada Hoose	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2974	SO	SO-MU	Mudug	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2975	SO	SO-NU	Nugaal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2976	SO	SO-SO	Sool	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2977	SO	SO-TO	Togdheer	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2978	SO	SO-WO	Woqooyi Galbeed	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2979	SR	SR-BR	Brokopondo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2980	SR	SR-CM	Commewijne	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2981	SR	SR-CR	Coronie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2982	SR	SR-NI	Nickerie	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2983	SR	SR-PR	Para	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2984	SR	SR-PM	Paramaribo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2985	SR	SR-SA	Saramacca	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2986	SR	SR-SI	Sipaliwini	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2987	SR	SR-WA	Wanica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2988	SS	SS-EC	Central Equatoria	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2989	SS	SS-EE	Eastern Equatoria	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2990	SS	SS-JG	Jonglei	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2991	SS	SS-LK	Lakes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2992	SS	SS-BN	Northern Bahr el Ghazal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2993	SS	SS-UY	Unity	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2994	SS	SS-NU	Upper Nile	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2995	SS	SS-WR	Warrap	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2996	SS	SS-BW	Western Bahr el Ghazal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2997	SS	SS-EW	Western Equatoria	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2998	ST	ST-01	Agua Grande	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2999	ST	ST-P	Principe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3000	SV	SV-AH	Ahuachapan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3001	SV	SV-CA	Cabanas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3002	SV	SV-CH	Chalatenango	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3003	SV	SV-CU	Cuscatlan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3004	SV	SV-LI	La Libertad	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3005	SV	SV-PA	La Paz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3006	SV	SV-UN	La Union	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3007	SV	SV-MO	Morazan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3008	SV	SV-SM	San Miguel	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3009	SV	SV-SS	San Salvador	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3010	SV	SV-SV	San Vicente	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3011	SV	SV-SA	Santa Ana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3012	SV	SV-SO	Sonsonate	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3013	SV	SV-US	Usulutan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3014	SX	-	Sint Maarten (Dutch Part)	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3015	SY	SY-HA	Al Hasakah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3016	SY	SY-LA	Al Ladhiqiyah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3017	SY	SY-QU	Al Qunaytirah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3018	SY	SY-RA	Ar Raqqah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3019	SY	SY-SU	As Suwayda'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3020	SY	SY-DR	Dar'a	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3021	SY	SY-DY	Dayr az Zawr	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3022	SY	SY-DI	Dimashq	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3023	SY	SY-HL	Halab	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3024	SY	SY-HM	Hamah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3025	SY	SY-HI	Hims	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3026	SY	SY-ID	Idlib	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3027	SY	SY-RD	Rif Dimashq	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3028	SY	SY-TA	Tartus	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3029	SZ	SZ-HH	Hhohho	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3030	SZ	SZ-LU	Lubombo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3031	SZ	SZ-MA	Manzini	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3032	TC	-	Turks and Caicos Islands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3033	TD	TD-BG	Bahr el Ghazal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3034	TD	TD-BO	Borkou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3035	TD	TD-CB	Chari-Baguirmi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3036	TD	TD-GR	Guera	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3037	TD	TD-LC	Lac	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3038	TD	TD-OD	Ouaddai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3039	TD	TD-SI	Sila	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3040	TD	TD-ND	Ville de Ndjamena	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3041	TD	TD-WF	Wadi Fira	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3042	TF	-	French Southern Territories	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3043	TG	TG-C	Centrale	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3044	TG	TG-K	Kara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3045	TG	TG-M	Maritime	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3046	TG	TG-P	Plateaux	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3047	TG	TG-S	Savanes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3048	TH	TH-37	Amnat Charoen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3049	TH	TH-15	Ang Thong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3050	TH	TH-38	Bueng Kan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3051	TH	TH-31	Buri Ram	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3052	TH	TH-24	Chachoengsao	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3053	TH	TH-18	Chai Nat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3054	TH	TH-36	Chaiyaphum	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3055	TH	TH-22	Chanthaburi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3056	TH	TH-50	Chiang Mai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3057	TH	TH-57	Chiang Rai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3058	TH	TH-20	Chon Buri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3059	TH	TH-86	Chumphon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3060	TH	TH-46	Kalasin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3061	TH	TH-62	Kamphaeng Phet	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3062	TH	TH-71	Kanchanaburi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3063	TH	TH-40	Khon Kaen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3064	TH	TH-81	Krabi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3065	TH	TH-10	Krung Thep Maha Nakhon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3066	TH	TH-52	Lampang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3067	TH	TH-51	Lamphun	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3068	TH	TH-42	Loei	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3069	TH	TH-16	Lop Buri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3070	TH	TH-58	Mae Hong Son	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3071	TH	TH-44	Maha Sarakham	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3072	TH	TH-49	Mukdahan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3073	TH	TH-26	Nakhon Nayok	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3074	TH	TH-73	Nakhon Pathom	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3075	TH	TH-48	Nakhon Phanom	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3076	TH	TH-30	Nakhon Ratchasima	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3077	TH	TH-60	Nakhon Sawan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3078	TH	TH-80	Nakhon Si Thammarat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3079	TH	TH-55	Nan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3080	TH	TH-96	Narathiwat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3081	TH	TH-39	Nong Bua Lam Phu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3082	TH	TH-43	Nong Khai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3083	TH	TH-12	Nonthaburi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3084	TH	TH-13	Pathum Thani	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3085	TH	TH-94	Pattani	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3086	TH	TH-82	Phangnga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3087	TH	TH-93	Phatthalung	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3088	TH	TH-56	Phayao	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3089	TH	TH-67	Phetchabun	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3090	TH	TH-76	Phetchaburi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3091	TH	TH-66	Phichit	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3092	TH	TH-65	Phitsanulok	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3093	TH	TH-14	Phra Nakhon Si Ayutthaya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3094	TH	TH-54	Phrae	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3095	TH	TH-83	Phuket	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3096	TH	TH-25	Prachin Buri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3097	TH	TH-77	Prachuap Khiri Khan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3098	TH	TH-85	Ranong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3099	TH	TH-70	Ratchaburi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3100	TH	TH-21	Rayong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3101	TH	TH-45	Roi Et	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3102	TH	TH-27	Sa Kaeo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3103	TH	TH-47	Sakon Nakhon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3104	TH	TH-11	Samut Prakan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3105	TH	TH-74	Samut Sakhon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3106	TH	TH-75	Samut Songkhram	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3107	TH	TH-19	Saraburi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3108	TH	TH-91	Satun	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3109	TH	TH-33	Si Sa Ket	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3110	TH	TH-17	Sing Buri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3111	TH	TH-90	Songkhla	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3112	TH	TH-64	Sukhothai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3113	TH	TH-72	Suphan Buri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3114	TH	TH-84	Surat Thani	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3115	TH	TH-32	Surin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3116	TH	TH-63	Tak	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3117	TH	TH-92	Trang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3118	TH	TH-23	Trat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3119	TH	TH-34	Ubon Ratchathani	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3120	TH	TH-41	Udon Thani	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3121	TH	TH-61	Uthai Thani	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3122	TH	TH-53	Uttaradit	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3123	TH	TH-95	Yala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3124	TH	TH-35	Yasothon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3125	TJ	TJ-DU	Dushanbe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3126	TJ	TJ-KT	Khatlon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3127	TJ	TJ-GB	Kuhistoni Badakhshon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3128	TJ	TJ-RA	Nohiyahoi Tobei Jumhuri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3129	TJ	TJ-SU	Sughd	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3130	TK	-	Tokelau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3131	TL	TL-AL	Aileu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3132	TL	TL-AN	Ainaro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3133	TL	TL-BA	Baucau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3134	TL	TL-BO	Bobonaro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3135	TL	TL-CO	Cova Lima	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3136	TL	TL-DI	Dili	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3137	TL	TL-ER	Ermera	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3138	TL	TL-LI	Liquica	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3139	TL	TL-MT	Manatuto	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3140	TL	TL-OE	Oecussi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3141	TM	TM-A	Ahal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3142	TM	TM-B	Balkan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3143	TM	TM-D	Dasoguz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3144	TM	TM-L	Lebap	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3145	TM	TM-M	Mary	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3146	TN	TN-31	Beja	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3147	TN	TN-13	Ben Arous	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3148	TN	TN-23	Bizerte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3149	TN	TN-81	Gabes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3150	TN	TN-71	Gafsa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3151	TN	TN-32	Jendouba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3152	TN	TN-41	Kairouan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3153	TN	TN-42	Kasserine	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3154	TN	TN-73	Kebili	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3155	TN	TN-12	L'Ariana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3156	TN	TN-14	La Manouba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3157	TN	TN-33	Le Kef	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3158	TN	TN-53	Mahdia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3159	TN	TN-82	Medenine	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3160	TN	TN-52	Monastir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3161	TN	TN-21	Nabeul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3162	TN	TN-61	Sfax	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3163	TN	TN-43	Sidi Bouzid	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3164	TN	TN-34	Siliana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3165	TN	TN-51	Sousse	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3166	TN	TN-83	Tataouine	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3167	TN	TN-72	Tozeur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3168	TN	TN-11	Tunis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3169	TN	TN-22	Zaghouan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3170	TO	TO-01	'Eua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3171	TO	TO-02	Ha'apai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3172	TO	TO-03	Niuas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3173	TO	TO-04	Tongatapu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3174	TO	TO-05	Vava'u	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3175	TR	TR-01	Adana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3176	TR	TR-02	Adiyaman	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3177	TR	TR-03	Afyonkarahisar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3178	TR	TR-04	Agri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3179	TR	TR-68	Aksaray	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3180	TR	TR-05	Amasya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3181	TR	TR-06	Ankara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3182	TR	TR-07	Antalya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3183	TR	TR-75	Ardahan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3184	TR	TR-08	Artvin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3185	TR	TR-09	Aydin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3186	TR	TR-10	Balikesir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3187	TR	TR-74	Bartin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3188	TR	TR-72	Batman	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3189	TR	TR-69	Bayburt	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3190	TR	TR-11	Bilecik	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3191	TR	TR-12	Bingol	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3192	TR	TR-13	Bitlis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3193	TR	TR-14	Bolu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3194	TR	TR-15	Burdur	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3195	TR	TR-16	Bursa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3196	TR	TR-17	Canakkale	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3197	TR	TR-18	Cankiri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3198	TR	TR-19	Corum	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3199	TR	TR-20	Denizli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3200	TR	TR-21	Diyarbakir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3201	TR	TR-81	Duzce	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3202	TR	TR-22	Edirne	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3203	TR	TR-23	Elazig	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3204	TR	TR-24	Erzincan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3205	TR	TR-25	Erzurum	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3206	TR	TR-26	Eskisehir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3207	TR	TR-27	Gaziantep	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3208	TR	TR-28	Giresun	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3209	TR	TR-29	Gumushane	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3210	TR	TR-30	Hakkari	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3211	TR	TR-31	Hatay	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3212	TR	TR-76	Igdir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3213	TR	TR-32	Isparta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3214	TR	TR-34	Istanbul	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3215	TR	TR-35	Izmir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3216	TR	TR-46	Kahramanmaras	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3217	TR	TR-78	Karabuk	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3218	TR	TR-70	Karaman	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3219	TR	TR-36	Kars	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3220	TR	TR-37	Kastamonu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3221	TR	TR-38	Kayseri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3222	TR	TR-79	Kilis	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3223	TR	TR-71	Kirikkale	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3224	TR	TR-39	Kirklareli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3225	TR	TR-40	Kirsehir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3226	TR	TR-41	Kocaeli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3227	TR	TR-42	Konya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3228	TR	TR-43	Kutahya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3229	TR	TR-44	Malatya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3230	TR	TR-45	Manisa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3231	TR	TR-47	Mardin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3232	TR	TR-33	Mersin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3233	TR	TR-48	Mugla	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3234	TR	TR-49	Mus	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3235	TR	TR-50	Nevsehir	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3236	TR	TR-51	Nigde	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3237	TR	TR-52	Ordu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3238	TR	TR-80	Osmaniye	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3239	TR	TR-53	Rize	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3240	TR	TR-54	Sakarya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3241	TR	TR-55	Samsun	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3242	TR	TR-63	Sanliurfa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3243	TR	TR-56	Siirt	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3244	TR	TR-57	Sinop	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3245	TR	TR-73	Sirnak	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3246	TR	TR-58	Sivas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3247	TR	TR-59	Tekirdag	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3248	TR	TR-60	Tokat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3249	TR	TR-61	Trabzon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3250	TR	TR-62	Tunceli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3251	TR	TR-64	Usak	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3252	TR	TR-65	Van	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3253	TR	TR-77	Yalova	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3254	TR	TR-66	Yozgat	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3255	TR	TR-67	Zonguldak	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3256	TT	TT-ARI	Arima	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3257	TT	TT-CHA	Chaguanas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3258	TT	TT-CTT	Couva-Tabaquite-Talparo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3259	TT	TT-DMN	Diego Martin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3260	TT	TT-MRC	Mayaro-Rio Claro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3261	TT	TT-PED	Penal-Debe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3262	TT	TT-PTF	Point Fortin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3263	TT	TT-POS	Port of Spain	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3264	TT	TT-PRT	Princes Town	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3265	TT	TT-SFO	San Fernando	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3266	TT	TT-SJL	San Juan-Laventille	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3267	TT	TT-SGE	Sangre Grande	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3268	TT	TT-SIP	Siparia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3269	TT	TT-TOB	Tobago	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3270	TT	TT-TUP	Tunapuna-Piarco	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3271	TV	TV-FUN	Funafuti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3272	TW	TW-CHA	Changhua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3273	TW	TW-CYQ	Chiayi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3274	TW	TW-HSQ	Hsinchu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3275	TW	TW-HUA	Hualien	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3276	TW	TW-KHH	Kaohsiung	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3277	TW	TW-KEE	Keelung	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3278	TW	TW-KIN	Kinmen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3279	TW	TW-LIE	Lienchiang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3280	TW	TW-MIA	Miaoli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3281	TW	TW-NAN	Nantou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3282	TW	TW-NWT	New Taipei	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3283	TW	TW-PEN	Penghu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3284	TW	TW-PIF	Pingtung	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3285	TW	TW-TXG	Taichung	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3286	TW	TW-TNN	Tainan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3287	TW	TW-TPE	Taipei	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3288	TW	TW-TTT	Taitung	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3289	TW	TW-TAO	Taoyuan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3290	TW	TW-ILA	Yilan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3291	TW	TW-YUN	Yunlin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3292	TZ	TZ-01	Arusha	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3293	TZ	TZ-02	Dar es Salaam	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3294	TZ	TZ-03	Dodoma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3295	TZ	TZ-27	Geita	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3296	TZ	TZ-04	Iringa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3297	TZ	TZ-05	Kagera	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3298	TZ	TZ-06	Kaskazini Pemba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3299	TZ	TZ-07	Kaskazini Unguja	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3300	TZ	TZ-28	Katavi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3301	TZ	TZ-08	Kigoma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3302	TZ	TZ-09	Kilimanjaro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3303	TZ	TZ-10	Kusini Pemba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3304	TZ	TZ-11	Kusini Unguja	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3305	TZ	TZ-12	Lindi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3306	TZ	TZ-26	Manyara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3307	TZ	TZ-13	Mara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3308	TZ	TZ-14	Mbeya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3309	TZ	TZ-15	Mjini Magharibi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3310	TZ	TZ-16	Morogoro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3311	TZ	TZ-17	Mtwara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3312	TZ	TZ-18	Mwanza	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3313	TZ	TZ-29	Njombe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3314	TZ	TZ-19	Pwani	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3315	TZ	TZ-20	Rukwa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3316	TZ	TZ-21	Ruvuma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3317	TZ	TZ-22	Shinyanga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3318	TZ	TZ-30	Simiyu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3319	TZ	TZ-23	Singida	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3320	TZ	TZ-31	Songwe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3321	TZ	TZ-24	Tabora	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3322	TZ	TZ-25	Tanga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3323	UA	UA-43	Avtonomna Respublika Krym	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3324	UA	UA-71	Cherkaska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3325	UA	UA-74	Chernihivska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3326	UA	UA-77	Chernivetska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3327	UA	UA-12	Dnipropetrovska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3328	UA	UA-14	Donetska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3329	UA	UA-26	Ivano-Frankivska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3330	UA	UA-63	Kharkivska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3331	UA	UA-65	Khersonska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3332	UA	UA-68	Khmelnytska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3333	UA	UA-35	Kirovohradska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3334	UA	UA-30	Kyiv	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3335	UA	UA-32	Kyivska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3336	UA	UA-09	Luhanska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3337	UA	UA-46	Lvivska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3338	UA	UA-48	Mykolaivska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3339	UA	UA-51	Odeska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3340	UA	UA-53	Poltavska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3341	UA	UA-56	Rivnenska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3342	UA	UA-40	Sevastopol	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3343	UA	UA-59	Sumska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3344	UA	UA-61	Ternopilska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3345	UA	UA-05	Vinnytska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3346	UA	UA-07	Volynska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3347	UA	UA-21	Zakarpatska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3348	UA	UA-23	Zaporizka oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3349	UA	UA-18	Zhytomyrska oblast	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3350	UG	UG-314	Abim	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3351	UG	UG-301	Adjumani	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3352	UG	UG-322	Agago	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3353	UG	UG-323	Alebtong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3354	UG	UG-302	Apac	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3355	UG	UG-303	Arua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3356	UG	UG-217	Budaka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3357	UG	UG-218	Bududa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3358	UG	UG-201	Bugiri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3359	UG	UG-420	Buhweju	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3360	UG	UG-117	Buikwe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3361	UG	UG-219	Bukedea	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3362	UG	UG-118	Bukomansibi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3363	UG	UG-225	Bulambuli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3364	UG	UG-416	Buliisa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3365	UG	UG-401	Bundibugyo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3366	UG	UG-402	Bushenyi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3367	UG	UG-202	Busia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3368	UG	UG-120	Buvuma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3369	UG	UG-226	Buyende	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3370	UG	UG-121	Gomba	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3371	UG	UG-304	Gulu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3372	UG	UG-403	Hoima	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3373	UG	UG-417	Ibanda	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3374	UG	UG-203	Iganga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3375	UG	UG-418	Isingiro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3376	UG	UG-204	Jinja	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3377	UG	UG-318	Kaabong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3378	UG	UG-404	Kabale	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3379	UG	UG-405	Kabarole	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3380	UG	UG-213	Kaberamaido	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3381	UG	UG-101	Kalangala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3382	UG	UG-222	Kaliro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3383	UG	UG-122	Kalungu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3384	UG	UG-102	Kampala	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3385	UG	UG-205	Kamuli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3386	UG	UG-413	Kamwenge	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3387	UG	UG-414	Kanungu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3388	UG	UG-206	Kapchorwa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3389	UG	UG-406	Kasese	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3390	UG	UG-207	Katakwi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3391	UG	UG-112	Kayunga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3392	UG	UG-407	Kibaale	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3393	UG	UG-103	Kiboga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3394	UG	UG-227	Kibuku	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3395	UG	UG-419	Kiruhura	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3396	UG	UG-421	Kiryandongo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3397	UG	UG-408	Kisoro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3398	UG	UG-305	Kitgum	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3399	UG	UG-319	Koboko	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3400	UG	UG-325	Kole	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3401	UG	UG-306	Kotido	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3402	UG	UG-208	Kumi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3403	UG	UG-228	Kween	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3404	UG	UG-123	Kyankwanzi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3405	UG	UG-422	Kyegegwa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3406	UG	UG-415	Kyenjojo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3407	UG	UG-326	Lamwo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3408	UG	UG-307	Lira	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3409	UG	UG-229	Luuka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3410	UG	UG-104	Luwero	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3411	UG	UG-124	Lwengo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3412	UG	UG-114	Lyantonde	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3413	UG	UG-223	Manafwa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3414	UG	UG-320	Maracha	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3415	UG	UG-105	Masaka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3416	UG	UG-409	Masindi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3417	UG	UG-214	Mayuge	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3418	UG	UG-209	Mbale	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3419	UG	UG-410	Mbarara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3420	UG	UG-423	Mitooma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3421	UG	UG-115	Mityana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3422	UG	UG-308	Moroto	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3423	UG	UG-309	Moyo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3424	UG	UG-106	Mpigi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3425	UG	UG-107	Mubende	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3426	UG	UG-108	Mukono	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3427	UG	UG-311	Nakapiripirit	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3428	UG	UG-116	Nakaseke	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3429	UG	UG-109	Nakasongola	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3430	UG	UG-327	Napak	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3431	UG	UG-310	Nebbi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3432	UG	UG-424	Ntoroko	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3433	UG	UG-411	Ntungamo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3434	UG	UG-328	Nwoya	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3435	UG	UG-312	Pader	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3436	UG	UG-110	Rakai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3437	UG	UG-425	Rubirizi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3438	UG	UG-412	Rukungiri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3439	UG	UG-111	Sembabule	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3440	UG	UG-426	Sheema	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3441	UG	UG-215	Sironko	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3442	UG	UG-211	Soroti	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3443	UG	UG-212	Tororo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3444	UG	UG-113	Wakiso	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3445	UG	UG-313	Yumbe	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3446	UG	UG-330	Zombo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3447	UM	UM-95	Palmyra Atoll	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3448	US	US-AL	Alabama	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3449	US	US-AK	Alaska	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3450	US	US-AZ	Arizona	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3451	US	US-AR	Arkansas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3452	US	US-CA	California	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3453	US	US-CO	Colorado	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3454	US	US-CT	Connecticut	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3455	US	US-DE	Delaware	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3456	US	US-DC	District of Columbia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3457	US	US-FL	Florida	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3458	US	US-GA	Georgia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3459	US	US-HI	Hawaii	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3460	US	US-ID	Idaho	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3461	US	US-IL	Illinois	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3462	US	US-IN	Indiana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3463	US	US-IA	Iowa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3464	US	US-KS	Kansas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3465	US	US-KY	Kentucky	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3466	US	US-LA	Louisiana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3467	US	US-ME	Maine	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3468	US	US-MD	Maryland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3469	US	US-MA	Massachusetts	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3470	US	US-MI	Michigan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3471	US	US-MN	Minnesota	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3472	US	US-MS	Mississippi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3473	US	US-MO	Missouri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3474	US	US-MT	Montana	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3475	US	US-NE	Nebraska	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3476	US	US-NV	Nevada	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3477	US	US-NH	New Hampshire	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3478	US	US-NJ	New Jersey	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3479	US	US-NM	New Mexico	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3480	US	US-NY	New York	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3481	US	US-NC	North Carolina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3482	US	US-ND	North Dakota	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3483	US	US-OH	Ohio	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3484	US	US-OK	Oklahoma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3485	US	US-OR	Oregon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3486	US	US-PA	Pennsylvania	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3487	US	US-RI	Rhode Island	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3488	US	US-SC	South Carolina	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3489	US	US-SD	South Dakota	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3490	US	US-TN	Tennessee	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3491	US	US-TX	Texas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3492	US	US-UT	Utah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3493	US	US-VT	Vermont	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3494	US	US-VA	Virginia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3495	US	US-WA	Washington	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3496	US	US-WV	West Virginia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3497	US	US-WI	Wisconsin	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3498	US	US-WY	Wyoming	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3499	UY	UY-AR	Artigas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3500	UY	UY-CA	Canelones	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3501	UY	UY-CL	Cerro Largo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3502	UY	UY-CO	Colonia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3503	UY	UY-DU	Durazno	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3504	UY	UY-FS	Flores	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3505	UY	UY-FD	Florida	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3506	UY	UY-LA	Lavalleja	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3507	UY	UY-MA	Maldonado	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3508	UY	UY-MO	Montevideo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3509	UY	UY-PA	Paysandu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3510	UY	UY-RN	Rio Negro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3511	UY	UY-RV	Rivera	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3512	UY	UY-RO	Rocha	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3513	UY	UY-SA	Salto	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3514	UY	UY-SJ	San Jose	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3515	UY	UY-SO	Soriano	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3516	UY	UY-TA	Tacuarembo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3517	UY	UY-TT	Treinta y Tres	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3518	UZ	UZ-AN	Andijon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3519	UZ	UZ-BU	Buxoro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3520	UZ	UZ-FA	Farg'ona	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3521	UZ	UZ-JI	Jizzax	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3522	UZ	UZ-NG	Namangan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3523	UZ	UZ-NW	Navoiy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3524	UZ	UZ-QA	Qashqadaryo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3525	UZ	UZ-QR	Qoraqalpog'iston Respublikasi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3526	UZ	UZ-SA	Samarqand	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3527	UZ	UZ-SI	Sirdaryo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3528	UZ	UZ-SU	Surxondaryo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3529	UZ	UZ-TK	Toshkent	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3530	UZ	UZ-XO	Xorazm	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3531	VA	-	Vatican City	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3532	VC	VC-01	Charlotte	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3533	VC	VC-06	Grenadines	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3534	VC	VC-04	Saint George	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3535	VC	VC-05	Saint Patrick	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3536	VE	VE-Z	Amazonas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3537	VE	VE-B	Anzoategui	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3538	VE	VE-C	Apure	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3539	VE	VE-D	Aragua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3540	VE	VE-E	Barinas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3541	VE	VE-F	Bolivar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3542	VE	VE-G	Carabobo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3543	VE	VE-H	Cojedes	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3544	VE	VE-Y	Delta Amacuro	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3545	VE	VE-W	Dependencias Federales	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3546	VE	VE-A	Distrito Capital	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3547	VE	VE-I	Falcon	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3548	VE	VE-J	Guarico	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3549	VE	VE-X	La Guaira	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3550	VE	VE-K	Lara	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3551	VE	VE-L	Merida	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3552	VE	VE-M	Miranda	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3553	VE	VE-N	Monagas	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3554	VE	VE-O	Nueva Esparta	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3555	VE	VE-P	Portuguesa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3556	VE	VE-R	Sucre	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3557	VE	VE-S	Tachira	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3558	VE	VE-T	Trujillo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3559	VE	VE-U	Yaracuy	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3560	VE	VE-V	Zulia	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3561	VG	-	Virgin Islands, British	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3562	VI	-	Virgin Islands, U.S.	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3563	VN	VN-44	An Giang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3564	VN	VN-43	Ba Ria - Vung Tau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3565	VN	VN-54	Bac Giang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3566	VN	VN-53	Bac Kan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3567	VN	VN-55	Bac Lieu	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3568	VN	VN-56	Bac Ninh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3569	VN	VN-50	Ben Tre	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3570	VN	VN-31	Binh Dinh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3571	VN	VN-57	Binh Duong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3572	VN	VN-58	Binh Phuoc	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3573	VN	VN-40	Binh Thuan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3574	VN	VN-59	Ca Mau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3575	VN	VN-CT	Can Tho	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3576	VN	VN-04	Cao Bang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3577	VN	VN-DN	Da Nang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3578	VN	VN-33	Dak Lak	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3579	VN	VN-72	Dak Nong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3580	VN	VN-71	Dien Bien	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3581	VN	VN-39	Dong Nai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3582	VN	VN-45	Dong Thap	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3583	VN	VN-30	Gia Lai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3584	VN	VN-03	Ha Giang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3585	VN	VN-63	Ha Nam	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3586	VN	VN-HN	Ha Noi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3587	VN	VN-23	Ha Tinh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3588	VN	VN-61	Hai Duong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3589	VN	VN-HP	Hai Phong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3590	VN	VN-73	Hau Giang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3591	VN	VN-SG	Ho Chi Minh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3592	VN	VN-14	Hoa Binh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3593	VN	VN-66	Hung Yen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3594	VN	VN-34	Khanh Hoa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3595	VN	VN-47	Kien Giang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3596	VN	VN-28	Kon Tum	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3597	VN	VN-01	Lai Chau	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3598	VN	VN-35	Lam Dong	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3599	VN	VN-09	Lang Son	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3600	VN	VN-02	Lao Cai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3601	VN	VN-41	Long An	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3602	VN	VN-67	Nam Dinh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3603	VN	VN-22	Nghe An	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3604	VN	VN-18	Ninh Binh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3605	VN	VN-36	Ninh Thuan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3606	VN	VN-68	Phu Tho	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3607	VN	VN-32	Phu Yen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3608	VN	VN-24	Quang Binh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3609	VN	VN-27	Quang Nam	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3610	VN	VN-29	Quang Ngai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3611	VN	VN-13	Quang Ninh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3612	VN	VN-25	Quang Tri	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3613	VN	VN-52	Soc Trang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3614	VN	VN-05	Son La	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3615	VN	VN-37	Tay Ninh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3616	VN	VN-20	Thai Binh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3617	VN	VN-69	Thai Nguyen	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3618	VN	VN-21	Thanh Hoa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3619	VN	VN-26	Thua Thien-Hue	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3620	VN	VN-46	Tien Giang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3621	VN	VN-51	Tra Vinh	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3622	VN	VN-07	Tuyen Quang	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3623	VN	VN-49	Vinh Long	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3624	VN	VN-70	Vinh Phuc	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3625	VN	VN-06	Yen Bai	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3626	VU	VU-MAP	Malampa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3627	VU	VU-SAM	Sanma	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3628	VU	VU-SEE	Shefa	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3629	VU	VU-TAE	Tafea	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3630	WF	WF-SG	Sigave	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3631	WF	WF-UV	Uvea	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3632	WS	WS-AT	Atua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3633	WS	WS-FA	Fa'asaleleaga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3634	WS	WS-TU	Tuamasaga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3635	YE	YE-AD	'Adan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3636	YE	YE-AM	'Amran	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3637	YE	YE-AB	Abyan	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3638	YE	YE-DA	Ad Dali'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3639	YE	YE-BA	Al Bayda'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3640	YE	YE-HU	Al Hudaydah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3641	YE	YE-JA	Al Jawf	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3642	YE	YE-MW	Al Mahwit	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3643	YE	YE-SA	Amanat al 'Asimah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3644	YE	YE-DH	Dhamar	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3645	YE	YE-HD	Hadramawt	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3646	YE	YE-HJ	Hajjah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3647	YE	YE-IB	Ibb	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3648	YE	YE-LA	Lahij	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3649	YE	YE-MA	Ma'rib	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3650	YE	YE-RA	Raymah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3651	YE	YE-SD	Sa'dah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3652	YE	YE-SN	San'a'	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3653	YE	YE-SH	Shabwah	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3654	YE	YE-TA	Ta'izz	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3655	YT	-	Bandraboua	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3656	YT	-	Bandrele	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3657	YT	-	Kani-Keli	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3658	YT	-	Mamoudzou	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3659	YT	-	Pamandzi	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3660	YT	-	Tsingoni	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3661	ZA	ZA-EC	Eastern Cape	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3662	ZA	ZA-FS	Free State	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3663	ZA	ZA-GP	Gauteng	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3664	ZA	ZA-KZN	Kwazulu-Natal	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3665	ZA	ZA-LP	Limpopo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3666	ZA	ZA-MP	Mpumalanga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3667	ZA	ZA-NW	North-West	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3668	ZA	ZA-NC	Northern Cape	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3669	ZA	ZA-WC	Western Cape	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3670	ZM	ZM-02	Central	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3671	ZM	ZM-08	Copperbelt	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3672	ZM	ZM-03	Eastern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3673	ZM	ZM-04	Luapula	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3674	ZM	ZM-09	Lusaka	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3675	ZM	ZM-10	Muchinga	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3676	ZM	ZM-06	North-Western	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3677	ZM	ZM-05	Northern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3678	ZM	ZM-07	Southern	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3679	ZM	ZM-01	Western	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3680	ZW	ZW-BU	Bulawayo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3681	ZW	ZW-HA	Harare	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3682	ZW	ZW-MA	Manicaland	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3683	ZW	ZW-MC	Mashonaland Central	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3684	ZW	ZW-ME	Mashonaland East	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3685	ZW	ZW-MW	Mashonaland West	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3686	ZW	ZW-MV	Masvingo	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3687	ZW	ZW-MN	Matabeleland North	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3688	ZW	ZW-MS	Matabeleland South	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3689	ZW	ZW-MI	Midlands	State	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3690	\N	AD	Andorra	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3691	\N	AE	United Arab Emirates	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3692	\N	AF	Afghanistan	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3693	\N	AG	Antigua and Barbuda	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3694	\N	AI	Anguilla	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3695	\N	AL	Albania	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3696	\N	AM	Armenia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3697	\N	AO	Angola	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3698	\N	AQ	Antarctica	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3699	\N	AR	Argentina	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3700	\N	AS	American Samoa	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3701	\N	AT	Austria	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3702	\N	AU	Australia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3703	\N	AW	Aruba	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3704	\N	AX	Åland Islands	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3705	\N	AZ	Azerbaijan	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3706	\N	BA	Bosnia and Herzegovina	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3707	\N	BB	Barbados	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3708	\N	BD	Bangladesh	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3709	\N	BE	Belgium	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3710	\N	BF	Burkina Faso	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3711	\N	BG	Bulgaria	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3712	\N	BH	Bahrain	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3713	\N	BI	Burundi	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3714	\N	BJ	Benin	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3715	\N	BL	Saint Barthélemy	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3716	\N	BM	Bermuda	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3717	\N	BN	Brunei Darussalam	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3718	\N	BO	Bolivia, Plurinational State of	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3719	\N	BQ	Bonaire, Sint Eustatius and Saba	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3720	\N	BR	Brazil	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3721	\N	BS	Bahamas	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3722	\N	BT	Bhutan	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3723	\N	BV	Bouvet Island	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3724	\N	BW	Botswana	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3725	\N	BY	Belarus	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3726	\N	BZ	Belize	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3727	\N	CA	Canada	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3728	\N	CC	Cocos (Keeling) Islands	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3729	\N	CD	Congo, The Democratic Republic of the	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3730	\N	CF	Central African Republic	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3731	\N	CG	Congo	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3732	\N	CH	Switzerland	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3733	\N	CI	Côte d'Ivoire	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3734	\N	CK	Cook Islands	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3735	\N	CL	Chile	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3736	\N	CM	Cameroon	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3737	\N	CN	China	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3738	\N	CO	Colombia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3739	\N	CR	Costa Rica	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3740	\N	CU	Cuba	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3741	\N	CV	Cabo Verde	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3742	\N	CW	Curaçao	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3743	\N	CX	Christmas Island	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3744	\N	CY	Cyprus	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3745	\N	CZ	Czechia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3746	\N	DE	Germany	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3747	\N	DJ	Djibouti	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3748	\N	DK	Denmark	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3749	\N	DM	Dominica	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3750	\N	DO	Dominican Republic	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3751	\N	DZ	Algeria	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3752	\N	EC	Ecuador	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3753	\N	EE	Estonia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3754	\N	EG	Egypt	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3755	\N	EH	Western Sahara	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3756	\N	ER	Eritrea	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3757	\N	ES	Spain	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3758	\N	ET	Ethiopia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3759	\N	FI	Finland	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3760	\N	FJ	Fiji	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3761	\N	FK	Falkland Islands (Malvinas)	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3762	\N	FM	Micronesia, Federated States of	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3763	\N	FO	Faroe Islands	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3764	\N	FR	France	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3765	\N	GA	Gabon	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3766	\N	GB	United Kingdom	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3767	\N	GD	Grenada	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3768	\N	GE	Georgia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3769	\N	GF	French Guiana	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3770	\N	GG	Guernsey	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3771	\N	GH	Ghana	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3772	\N	GI	Gibraltar	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3773	\N	GL	Greenland	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3774	\N	GM	Gambia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3775	\N	GN	Guinea	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3776	\N	GP	Guadeloupe	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3777	\N	GQ	Equatorial Guinea	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3778	\N	GR	Greece	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3779	\N	GS	South Georgia and the South Sandwich Islands	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3780	\N	GT	Guatemala	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3781	\N	GU	Guam	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3782	\N	GW	Guinea-Bissau	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3783	\N	GY	Guyana	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3784	\N	HK	Hong Kong	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3785	\N	HM	Heard Island and McDonald Islands	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3786	\N	HN	Honduras	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3787	\N	HR	Croatia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3788	\N	HT	Haiti	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3789	\N	HU	Hungary	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3790	\N	ID	Indonesia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3791	\N	IE	Ireland	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3792	\N	IL	Israel	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3793	\N	IM	Isle of Man	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3794	\N	IN	India	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3795	\N	IO	British Indian Ocean Territory	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3796	\N	IQ	Iraq	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3797	\N	IR	Iran, Islamic Republic of	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3798	\N	IS	Iceland	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3799	\N	IT	Italy	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3800	\N	JE	Jersey	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3801	\N	JM	Jamaica	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3802	\N	JO	Jordan	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3803	\N	JP	Japan	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3804	\N	KE	Kenya	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3805	\N	KG	Kyrgyzstan	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3806	\N	KH	Cambodia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3807	\N	KI	Kiribati	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3808	\N	KM	Comoros	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3809	\N	KN	Saint Kitts and Nevis	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3810	\N	KP	Korea, Democratic People's Republic of	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3811	\N	KR	Korea, Republic of	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3812	\N	KW	Kuwait	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3813	\N	KY	Cayman Islands	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3814	\N	KZ	Kazakhstan	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3815	\N	LA	Lao People's Democratic Republic	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3816	\N	LB	Lebanon	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3817	\N	LC	Saint Lucia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3818	\N	LI	Liechtenstein	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3819	\N	LK	Sri Lanka	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3820	\N	LR	Liberia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3821	\N	LS	Lesotho	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3822	\N	LT	Lithuania	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3823	\N	LU	Luxembourg	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3824	\N	LV	Latvia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3825	\N	LY	Libya	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3826	\N	MA	Morocco	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3827	\N	MC	Monaco	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3828	\N	MD	Moldova, Republic of	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3829	\N	ME	Montenegro	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3830	\N	MF	Saint Martin (French part)	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3831	\N	MG	Madagascar	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3832	\N	MH	Marshall Islands	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3833	\N	MK	North Macedonia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3834	\N	ML	Mali	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3835	\N	MM	Myanmar	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3836	\N	MN	Mongolia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3837	\N	MO	Macao	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3838	\N	MP	Northern Mariana Islands	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3839	\N	MQ	Martinique	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3840	\N	MR	Mauritania	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3841	\N	MS	Montserrat	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3842	\N	MT	Malta	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3843	\N	MU	Mauritius	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3844	\N	MV	Maldives	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3845	\N	MW	Malawi	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3846	\N	MX	Mexico	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3847	\N	MY	Malaysia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3848	\N	MZ	Mozambique	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3849	\N	NC	New Caledonia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3850	\N	NE	Niger	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3851	\N	NF	Norfolk Island	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3852	\N	NG	Nigeria	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3853	\N	NI	Nicaragua	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3854	\N	NL	Netherlands	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3855	\N	NO	Norway	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3856	\N	NP	Nepal	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3857	\N	NR	Nauru	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3858	\N	NU	Niue	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3859	\N	NZ	New Zealand	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3860	\N	OM	Oman	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3861	\N	PA	Panama	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3862	\N	PE	Peru	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3863	\N	PF	French Polynesia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3864	\N	PG	Papua New Guinea	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3865	\N	PH	Philippines	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3866	\N	PK	Pakistan	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3867	\N	PL	Poland	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3868	\N	PM	Saint Pierre and Miquelon	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3869	\N	PN	Pitcairn	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3870	\N	PR	Puerto Rico	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3871	\N	PS	Palestine, State of	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3872	\N	PT	Portugal	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3873	\N	PW	Palau	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3874	\N	PY	Paraguay	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3875	\N	QA	Qatar	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3876	\N	RE	Réunion	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3877	\N	RO	Romania	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3878	\N	RS	Serbia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3879	\N	RU	Russian Federation	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3880	\N	RW	Rwanda	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3881	\N	SA	Saudi Arabia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3882	\N	SB	Solomon Islands	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3883	\N	SC	Seychelles	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3884	\N	SD	Sudan	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3885	\N	SE	Sweden	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3886	\N	SG	Singapore	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3887	\N	SH	Saint Helena, Ascension and Tristan da Cunha	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3888	\N	SI	Slovenia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3889	\N	SJ	Svalbard and Jan Mayen	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3890	\N	SK	Slovakia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3891	\N	SL	Sierra Leone	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3892	\N	SM	San Marino	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3893	\N	SN	Senegal	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3894	\N	SO	Somalia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3895	\N	SR	Suriname	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3896	\N	SS	South Sudan	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3897	\N	ST	Sao Tome and Principe	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3898	\N	SV	El Salvador	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3899	\N	SX	Sint Maarten (Dutch part)	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3900	\N	SY	Syrian Arab Republic	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3901	\N	SZ	Eswatini	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3902	\N	TC	Turks and Caicos Islands	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3903	\N	TD	Chad	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3904	\N	TF	French Southern Territories	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3905	\N	TG	Togo	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3906	\N	TH	Thailand	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3907	\N	TJ	Tajikistan	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3908	\N	TK	Tokelau	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3909	\N	TL	Timor-Leste	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3910	\N	TM	Turkmenistan	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3911	\N	TN	Tunisia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3912	\N	TO	Tonga	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3913	\N	TR	Turkey	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3914	\N	TT	Trinidad and Tobago	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3915	\N	TV	Tuvalu	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3916	\N	TW	Taiwan, Province of China	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3917	\N	TZ	Tanzania, United Republic of	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3918	\N	UA	Ukraine	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3919	\N	UG	Uganda	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3920	\N	UM	United States Minor Outlying Islands	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3921	\N	US	United States	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3922	\N	UY	Uruguay	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3923	\N	UZ	Uzbekistan	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3924	\N	VA	Holy See (Vatican City State)	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3925	\N	VC	Saint Vincent and the Grenadines	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3926	\N	VE	Venezuela, Bolivarian Republic of	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3927	\N	VG	Virgin Islands, British	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3928	\N	VI	Virgin Islands, U.S.	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3929	\N	VN	Viet Nam	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3930	\N	VU	Vanuatu	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3931	\N	WF	Wallis and Futuna	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3932	\N	WS	Samoa	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3933	\N	YE	Yemen	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3934	\N	YT	Mayotte	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3935	\N	ZA	South Africa	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3936	\N	ZM	Zambia	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3937	\N	ZW	Zimbabwe	Country	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
\.


--
-- Data for Name: division_type; Type: TABLE DATA; Schema: ref; Owner: -
--

COPY ref.division_type (row_id, division_type, division_name, division_description, division_level, parent_id, is_active, localized_names, created_at, updated_at, created_by, updated_by) FROM stdin;
1	CT	Country	Sovereign Nation	1	\N	t	{"en": "Country"}	2025-05-19 00:00:00	\N	system	\N
2	ST	State	State or Province	2	1	t	{"en": "State", "fr": "État"}	2025-05-19 00:00:00	\N	system	\N
3	DT	District	District or Prefecture	3	2	t	{"en": "District"}	2025-05-19 00:00:00	\N	system	\N
4	MD	Mandal	Sub-district or Mandal	4	3	t	{"en": "Mandal", "te": "మండలం"}	2025-05-19 00:00:00	\N	system	\N
5	CY	County	County or Taluk	4	3	t	{"en": "County"}	2025-05-19 00:00:00	\N	system	\N
6	VL	Village	Village, Town or Municipality	5	4	t	{"en": "Village"}	2025-05-19 00:00:00	\N	system	\N
\.


--
-- Data for Name: document_categories; Type: TABLE DATA; Schema: ref; Owner: -
--

COPY ref.document_categories (id, code, name, description, parent_id, icon, color, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: document_file_type; Type: TABLE DATA; Schema: ref; Owner: -
--

COPY ref.document_file_type (id, code, name, description, extension, mime_type, icon, color, is_active, created_at, updated_at, created_by, updated_by) FROM stdin;
\.


--
-- Data for Name: group_roles; Type: TABLE DATA; Schema: ref; Owner: -
--

COPY ref.group_roles (id, code, label, description, is_active, created_at) FROM stdin;
1	admin	Administrator	Full control over group settings	t	2025-10-29 08:27:52.020591
2	member	Member	Standard group participant	t	2025-10-29 08:27:52.020591
3	viewer	Viewer	Read-only group member	t	2025-10-29 08:27:52.020591
4	guest	Guest	Limited access group member	t	2025-10-29 08:27:52.020591
\.


--
-- Data for Name: property_category; Type: TABLE DATA; Schema: ref; Owner: -
--

COPY ref.property_category (id, name, description, created_by, created_at, updated_by, updated_at) FROM stdin;
1	Residential	Residential property	1	2025-10-29 08:27:52.020591	\N	2025-10-29 08:27:52.020591
2	Commercial	Commercial property	1	2025-10-29 08:27:52.020591	\N	2025-10-29 08:27:52.020591
3	Agricultural	Agricultural land	1	2025-10-29 08:27:52.020591	\N	2025-10-29 08:27:52.020591
4	Industrial	Industrial property	1	2025-10-29 08:27:52.020591	\N	2025-10-29 08:27:52.020591
5	Vacant Land	Unimproved land	1	2025-10-29 08:27:52.020591	\N	2025-10-29 08:27:52.020591
6	Mixed-Use	Combination of residential and commercial	1	2025-10-29 08:27:52.020591	\N	2025-10-29 08:27:52.020591
\.


--
-- Data for Name: property_feature; Type: TABLE DATA; Schema: ref; Owner: -
--

COPY ref.property_feature (id, name, description, icon, category, is_active, created_at, updated_at, created_by, updated_by) FROM stdin;
\.


--
-- Data for Name: property_ownership_mode; Type: TABLE DATA; Schema: ref; Owner: -
--

COPY ref.property_ownership_mode (id, code, name, description, is_active, created_at, updated_at, created_by, updated_by) FROM stdin;
\.


--
-- Data for Name: property_ownership_type; Type: TABLE DATA; Schema: ref; Owner: -
--

COPY ref.property_ownership_type (id, name, description, created_by, created_at, updated_by, updated_at) FROM stdin;
1	Full Ownership	Complete ownership of the property	1	2025-10-29 08:27:52.020591	\N	2025-10-29 08:27:52.020591
2	Partial Ownership	Shared ownership of the property	1	2025-10-29 08:27:52.020591	\N	2025-10-29 08:27:52.020591
3	Leasehold	Temporary ownership with lease agreement	1	2025-10-29 08:27:52.020591	\N	2025-10-29 08:27:52.020591
4	Freehold	Permanent ownership of the property	1	2025-10-29 08:27:52.020591	\N	2025-10-29 08:27:52.020591
5	Joint Tenancy	Equal ownership among multiple owners	1	2025-10-29 08:27:52.020591	\N	2025-10-29 08:27:52.020591
6	Tenancy in Common	Shared ownership with unequal shares	1	2025-10-29 08:27:52.020591	\N	2025-10-29 08:27:52.020591
\.


--
-- Data for Name: property_status; Type: TABLE DATA; Schema: ref; Owner: -
--

COPY ref.property_status (id, code, name, description, color, is_active, created_at, updated_at, created_by, updated_by) FROM stdin;
\.


--
-- Data for Name: property_type; Type: TABLE DATA; Schema: ref; Owner: -
--

COPY ref.property_type (id, code, short_code, label, country_code, avatar_url, created_at, updated_at, created_by, updated_by) FROM stdin;
1	flat	FLT	Flat	IN	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2	plot	PLT	Plot	IN	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3	agriculture_land	AGL	Agriculture Land	IN	\N	2025-10-29 08:27:52.020591	\N	\N	\N
4	independent_house	IH	Independent House	IN	\N	2025-10-29 08:27:52.020591	\N	\N	\N
5	builder_floor	BF	Builder Floor	IN	\N	2025-10-29 08:27:52.020591	\N	\N	\N
6	row_house	RH	Row House	IN	\N	2025-10-29 08:27:52.020591	\N	\N	\N
7	apartment	APT	Apartment	IN	\N	2025-10-29 08:27:52.020591	\N	\N	\N
8	townhome	TH	Townhome	US	\N	2025-10-29 08:27:52.020591	\N	\N	\N
9	farm	FRM	Farm	US	\N	2025-10-29 08:27:52.020591	\N	\N	\N
10	house	HSE	House	US	\N	2025-10-29 08:27:52.020591	\N	\N	\N
11	condo	CND	Condo	US	\N	2025-10-29 08:27:52.020591	\N	\N	\N
12	multi_family	MF	Multi family	US	\N	2025-10-29 08:27:52.020591	\N	\N	\N
13	mobile	MOB	Mobile	US	\N	2025-10-29 08:27:52.020591	\N	\N	\N
14	movable_house	MVH	Movable House	US	\N	2025-10-29 08:27:52.020591	\N	\N	\N
15	casa	CSA	Casa	MX	\N	2025-10-29 08:27:52.020591	\N	\N	\N
16	terreno	TRN	Terreno	MX	\N	2025-10-29 08:27:52.020591	\N	\N	\N
17	departamento	DPT	Departamento	MX	\N	2025-10-29 08:27:52.020591	\N	\N	\N
18	rancho	RNC	Rancho	MX	\N	2025-10-29 08:27:52.020591	\N	\N	\N
\.


--
-- Data for Name: subdivision_portal; Type: TABLE DATA; Schema: ref; Owner: -
--

COPY ref.subdivision_portal (row_id, division_code, division_type, division_short_code, division_name, subdivision_type, subdivision_short_code, subdivision_name, portal_name, portal_url, portal_type, portal_category, portal_subcategory, portal_description, is_active, created_at, updated_at, created_by, updated_by) FROM stdin;
1	IN-AN	STATE	AN	Andaman & Nicobar Islands				eRevenue Andaman	https://erevenue.andaman.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
2	IN-AP	STATE	AP	Andhra Pradesh				MeeBhoomi	https://meebhoomi.ap.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
3	IN-AS	STATE	AS	Assam				Dharitree	https://revenueassam.nic.in/dharitree	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
4	IN-BR	STATE	BR	Bihar				Bihar Bhumi	https://biharbhumi.bihar.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
5	IN-CH	STATE	CH	Chandigarh				Land Records Chandigarh	https://chandigarh.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
6	IN-CT	STATE	CT	Chhattisgarh				Bhuiyan	https://bhuiyan.cg.nic.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
7	IN-DH	STATE	DD	Dadra & Nagar Haveli and Daman & Diu				eDistrict DNHDD	https://ddedistrict.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
8	IN-DL	STATE	DL	Delhi				Bhulekh Delhi	https://dlrc.delhi.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
9	IN-GA	STATE	GA	Goa				DSLRS Goa	https://dslr.goa.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
10	IN-GJ	STATE	GJ	Gujarat				AnyROR @ Anywhere	https://anyror.gujarat.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
11	IN-HR	STATE	HR	Haryana				Jamabandi Haryana	https://jamabandi.nic.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
12	IN-HP	STATE	HP	Himachal Pradesh				HimBhoomi	https://himachal.nic.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
13	IN-JK	STATE	JK	Jammu & Kashmir				JK Land Records	https://landrecords.jk.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
14	IN-JH	STATE	JH	Jharkhand				Jharbhoomi	https://jharbhoomi.nic.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
15	IN-KA	STATE	KA	Karnataka				Bhoomi	https://landrecords.karnataka.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
16	IN-KL	STATE	KL	Kerala				e-Rekha	https://erekha.kerala.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
17	IN-LA	STATE	LA	Ladakh				Leh NIC	https://leh.nic.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
18	IN-MP	STATE	MP	Madhya Pradesh				MP Bhulekh	https://mpbhulekh.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
19	IN-MH	STATE	MH	Maharashtra				Mahabhulekh	https://bhulekh.mahabhumi.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
20	IN-MN	STATE	MN	Manipur				LRC Manipur	http://lrcmanipur.nic.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
21	IN-ML	STATE	ML	Meghalaya				Revenue Meghalaya	http://megrevenue.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
22	IN-NL	STATE	NL	Nagaland				NLRS	https://nlrs.nagaland.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
23	IN-OD	STATE	OD	Odisha				Bhulekh Odisha	https://bhulekh.ori.nic.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
24	IN-PY	STATE	PY	Puducherry				eServices Puducherry	https://eservices.py.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
25	IN-PB	STATE	PB	Punjab				Jamabandi Punjab	https://jamabandi.punjab.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
26	IN-RJ	STATE	RJ	Rajasthan				Apna Khata	https://apnakhata.raj.nic.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
27	IN-SK	STATE	SK	Sikkim				LRDM Sikkim	http://sikkimlrdm.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
28	IN-TN	STATE	TN	Tamil Nadu				TN Patta Chitta	https://eservices.tn.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
29	IN-TS	STATE	TS	Telangana				Dharani	https://dharani.telangana.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
30	IN-TR	STATE	TR	Tripura				eDistrict Tripura	https://edistrict.tripura.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
31	IN-UP	STATE	UP	Uttar Pradesh				UP Bhulekh	https://upbhulekh.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
32	IN-UK	STATE	UK	Uttarakhand				Devbhoomi	https://devbhoomi.uk.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
33	IN-WB	STATE	WB	West Bengal				Banglarbhumi	https://banglarbhumi.gov.in	\N	\N	\N	\N	\N	2025-10-29 08:27:52.020591	\N	\N	\N
\.


--
-- Data for Name: user_network_rank_kind; Type: TABLE DATA; Schema: ref; Owner: -
--

COPY ref.user_network_rank_kind (code, description) FROM stdin;
\.


--
-- Data for Name: user_network_type; Type: TABLE DATA; Schema: ref; Owner: -
--

COPY ref.user_network_type (code, description) FROM stdin;
\.


--
-- Name: document_access_logs_id_seq; Type: SEQUENCE SET; Schema: app; Owner: -
--

SELECT pg_catalog.setval('app.document_access_logs_id_seq', 1, false);


--
-- Name: document_sharing_id_seq; Type: SEQUENCE SET; Schema: app; Owner: -
--

SELECT pg_catalog.setval('app.document_sharing_id_seq', 1, false);


--
-- Name: documents_id_seq; Type: SEQUENCE SET; Schema: app; Owner: -
--

SELECT pg_catalog.setval('app.documents_id_seq', 1, false);


--
-- Name: group_events_id_seq; Type: SEQUENCE SET; Schema: app; Owner: -
--

SELECT pg_catalog.setval('app.group_events_id_seq', 1, false);


--
-- Name: group_invitations_id_seq; Type: SEQUENCE SET; Schema: app; Owner: -
--

SELECT pg_catalog.setval('app.group_invitations_id_seq', 1, false);


--
-- Name: group_members_id_seq; Type: SEQUENCE SET; Schema: app; Owner: -
--

SELECT pg_catalog.setval('app.group_members_id_seq', 1, false);


--
-- Name: group_messages_id_seq; Type: SEQUENCE SET; Schema: app; Owner: -
--

SELECT pg_catalog.setval('app.group_messages_id_seq', 1, false);


--
-- Name: properties_id_seq; Type: SEQUENCE SET; Schema: app; Owner: -
--

SELECT pg_catalog.setval('app.properties_id_seq', 1, false);


--
-- Name: property_documents_id_seq; Type: SEQUENCE SET; Schema: app; Owner: -
--

SELECT pg_catalog.setval('app.property_documents_id_seq', 1, false);


--
-- Name: property_favorites_id_seq; Type: SEQUENCE SET; Schema: app; Owner: -
--

SELECT pg_catalog.setval('app.property_favorites_id_seq', 1, false);


--
-- Name: property_owners_id_seq; Type: SEQUENCE SET; Schema: app; Owner: -
--

SELECT pg_catalog.setval('app.property_owners_id_seq', 1, false);


--
-- Name: property_views_id_seq; Type: SEQUENCE SET; Schema: app; Owner: -
--

SELECT pg_catalog.setval('app.property_views_id_seq', 1, false);


--
-- Name: user_encryption_keys_id_seq; Type: SEQUENCE SET; Schema: app; Owner: -
--

SELECT pg_catalog.setval('app.user_encryption_keys_id_seq', 1, false);


--
-- Name: user_networks_id_seq; Type: SEQUENCE SET; Schema: app; Owner: -
--

SELECT pg_catalog.setval('app.user_networks_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: app; Owner: -
--

SELECT pg_catalog.setval('app.users_id_seq', 1, false);


--
-- Name: division_row_id_seq; Type: SEQUENCE SET; Schema: ref; Owner: -
--

SELECT pg_catalog.setval('ref.division_row_id_seq', 3937, true);


--
-- Name: division_type_row_id_seq; Type: SEQUENCE SET; Schema: ref; Owner: -
--

SELECT pg_catalog.setval('ref.division_type_row_id_seq', 6, true);


--
-- Name: document_categories_id_seq; Type: SEQUENCE SET; Schema: ref; Owner: -
--

SELECT pg_catalog.setval('ref.document_categories_id_seq', 1, false);


--
-- Name: document_file_type_id_seq; Type: SEQUENCE SET; Schema: ref; Owner: -
--

SELECT pg_catalog.setval('ref.document_file_type_id_seq', 1, false);


--
-- Name: group_roles_id_seq; Type: SEQUENCE SET; Schema: ref; Owner: -
--

SELECT pg_catalog.setval('ref.group_roles_id_seq', 4, true);


--
-- Name: property_category_id_seq; Type: SEQUENCE SET; Schema: ref; Owner: -
--

SELECT pg_catalog.setval('ref.property_category_id_seq', 6, true);


--
-- Name: property_feature_id_seq; Type: SEQUENCE SET; Schema: ref; Owner: -
--

SELECT pg_catalog.setval('ref.property_feature_id_seq', 1, false);


--
-- Name: property_ownership_mode_id_seq; Type: SEQUENCE SET; Schema: ref; Owner: -
--

SELECT pg_catalog.setval('ref.property_ownership_mode_id_seq', 1, false);


--
-- Name: property_ownership_type_id_seq; Type: SEQUENCE SET; Schema: ref; Owner: -
--

SELECT pg_catalog.setval('ref.property_ownership_type_id_seq', 6, true);


--
-- Name: property_status_id_seq; Type: SEQUENCE SET; Schema: ref; Owner: -
--

SELECT pg_catalog.setval('ref.property_status_id_seq', 1, false);


--
-- Name: property_type_id_seq; Type: SEQUENCE SET; Schema: ref; Owner: -
--

SELECT pg_catalog.setval('ref.property_type_id_seq', 18, true);


--
-- Name: subdivision_portal_row_id_seq; Type: SEQUENCE SET; Schema: ref; Owner: -
--

SELECT pg_catalog.setval('ref.subdivision_portal_row_id_seq', 33, true);


--
-- Name: document_access_logs document_access_logs_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.document_access_logs
    ADD CONSTRAINT document_access_logs_pkey PRIMARY KEY (id);


--
-- Name: document_sharing document_sharing_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.document_sharing
    ADD CONSTRAINT document_sharing_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: group_events group_events_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_events
    ADD CONSTRAINT group_events_pkey PRIMARY KEY (id);


--
-- Name: group_invitations group_invitations_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_invitations
    ADD CONSTRAINT group_invitations_pkey PRIMARY KEY (id);


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);


--
-- Name: group_messages group_messages_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_messages
    ADD CONSTRAINT group_messages_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: property_documents property_documents_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_documents
    ADD CONSTRAINT property_documents_pkey PRIMARY KEY (id);


--
-- Name: property_favorites property_favorites_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_favorites
    ADD CONSTRAINT property_favorites_pkey PRIMARY KEY (id);


--
-- Name: property_owners property_owners_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_owners
    ADD CONSTRAINT property_owners_pkey PRIMARY KEY (id);


--
-- Name: property_views property_views_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_views
    ADD CONSTRAINT property_views_pkey PRIMARY KEY (id);


--
-- Name: user_encryption_keys user_encryption_keys_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_encryption_keys
    ADD CONSTRAINT user_encryption_keys_pkey PRIMARY KEY (id);


--
-- Name: user_encryption_keys user_encryption_keys_user_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_encryption_keys
    ADD CONSTRAINT user_encryption_keys_user_id_key UNIQUE (user_id);


--
-- Name: user_networks user_networks_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_networks
    ADD CONSTRAINT user_networks_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);


--
-- Name: beneficiaries beneficiaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficiaries
    ADD CONSTRAINT beneficiaries_pkey PRIMARY KEY (id);


--
-- Name: deed_types deed_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deed_types
    ADD CONSTRAINT deed_types_pkey PRIMARY KEY (id);


--
-- Name: districts districts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.districts
    ADD CONSTRAINT districts_pkey PRIMARY KEY (id);


--
-- Name: document_parties document_parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_parties
    ADD CONSTRAINT document_parties_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: family_members family_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_members
    ADD CONSTRAINT family_members_pkey PRIMARY KEY (id);


--
-- Name: family_notifiers family_notifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_notifiers
    ADD CONSTRAINT family_notifiers_pkey PRIMARY KEY (id);


--
-- Name: fee_schedule fee_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_schedule
    ADD CONSTRAINT fee_schedule_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: inactivity_escalations inactivity_escalations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inactivity_escalations
    ADD CONSTRAINT inactivity_escalations_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: mandals mandals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mandals
    ADD CONSTRAINT mandals_pkey PRIMARY KEY (id);


--
-- Name: market_values market_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_values
    ADD CONSTRAINT market_values_pkey PRIMARY KEY (id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--
-- Name: notification_log notification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_pkey PRIMARY KEY (id);


--
-- Name: parcel_owners parcel_owners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel_owners
    ADD CONSTRAINT parcel_owners_pkey PRIMARY KEY (id);


--
-- Name: parcels parcels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcels
    ADD CONSTRAINT parcels_pkey PRIMARY KEY (id);


--
-- Name: passbooks passbooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passbooks
    ADD CONSTRAINT passbooks_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: property_owners property_owners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_owners
    ADD CONSTRAINT property_owners_pkey PRIMARY KEY (id);


--
-- Name: registered_documents registered_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registered_documents
    ADD CONSTRAINT registered_documents_pkey PRIMARY KEY (id);


--
-- Name: service_requests service_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_pkey PRIMARY KEY (id);


--
-- Name: sro_offices sro_offices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sro_offices
    ADD CONSTRAINT sro_offices_pkey PRIMARY KEY (id);


--
-- Name: states states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.states
    ADD CONSTRAINT states_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: villages villages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.villages
    ADD CONSTRAINT villages_pkey PRIMARY KEY (id);


--
-- Name: division division_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.division
    ADD CONSTRAINT division_pkey PRIMARY KEY (row_id);


--
-- Name: division_type division_type_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.division_type
    ADD CONSTRAINT division_type_pkey PRIMARY KEY (row_id);


--
-- Name: document_categories document_categories_code_key; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.document_categories
    ADD CONSTRAINT document_categories_code_key UNIQUE (code);


--
-- Name: document_categories document_categories_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.document_categories
    ADD CONSTRAINT document_categories_pkey PRIMARY KEY (id);


--
-- Name: document_file_type document_file_type_code_key; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.document_file_type
    ADD CONSTRAINT document_file_type_code_key UNIQUE (code);


--
-- Name: document_file_type document_file_type_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.document_file_type
    ADD CONSTRAINT document_file_type_pkey PRIMARY KEY (id);


--
-- Name: group_roles group_roles_code_key; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.group_roles
    ADD CONSTRAINT group_roles_code_key UNIQUE (code);


--
-- Name: group_roles group_roles_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.group_roles
    ADD CONSTRAINT group_roles_pkey PRIMARY KEY (id);


--
-- Name: property_category property_category_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.property_category
    ADD CONSTRAINT property_category_pkey PRIMARY KEY (id);


--
-- Name: property_feature property_feature_name_key; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.property_feature
    ADD CONSTRAINT property_feature_name_key UNIQUE (name);


--
-- Name: property_feature property_feature_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.property_feature
    ADD CONSTRAINT property_feature_pkey PRIMARY KEY (id);


--
-- Name: property_ownership_mode property_ownership_mode_code_key; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.property_ownership_mode
    ADD CONSTRAINT property_ownership_mode_code_key UNIQUE (code);


--
-- Name: property_ownership_mode property_ownership_mode_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.property_ownership_mode
    ADD CONSTRAINT property_ownership_mode_pkey PRIMARY KEY (id);


--
-- Name: property_ownership_type property_ownership_type_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.property_ownership_type
    ADD CONSTRAINT property_ownership_type_pkey PRIMARY KEY (id);


--
-- Name: property_status property_status_code_key; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.property_status
    ADD CONSTRAINT property_status_code_key UNIQUE (code);


--
-- Name: property_status property_status_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.property_status
    ADD CONSTRAINT property_status_pkey PRIMARY KEY (id);


--
-- Name: property_type property_type_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.property_type
    ADD CONSTRAINT property_type_pkey PRIMARY KEY (id);


--
-- Name: subdivision_portal subdivision_portal_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.subdivision_portal
    ADD CONSTRAINT subdivision_portal_pkey PRIMARY KEY (row_id);


--
-- Name: user_network_rank_kind user_network_rank_kind_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.user_network_rank_kind
    ADD CONSTRAINT user_network_rank_kind_pkey PRIMARY KEY (code);


--
-- Name: user_network_type user_network_type_pkey; Type: CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.user_network_type
    ADD CONSTRAINT user_network_type_pkey PRIMARY KEY (code);


--
-- Name: idx_groups_email; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_groups_email ON app.groups USING btree (email);


--
-- Name: idx_groups_legal_entity_type; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_groups_legal_entity_type ON app.groups USING btree (legal_entity_type);


--
-- Name: idx_groups_tags; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_groups_tags ON app.groups USING gin (tags);


--
-- Name: idx_groups_visibility; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_groups_visibility ON app.groups USING btree (visibility) WHERE (deleted_at IS NULL);


--
-- Name: idx_groups_visibility_owner; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_groups_visibility_owner ON app.groups USING btree (visibility, owned_by) WHERE (deleted_at IS NULL);


--
-- Name: ix_app_properties_address_city; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_app_properties_address_city ON app.properties USING btree (address_city);


--
-- Name: ix_app_properties_address_state; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_app_properties_address_state ON app.properties USING btree (address_state);


--
-- Name: ix_app_properties_group_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_app_properties_group_id ON app.properties USING btree (group_id);


--
-- Name: ix_app_properties_title; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_app_properties_title ON app.properties USING btree (title);


--
-- Name: idx_escalation_owner_group; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_escalation_owner_group ON public.inactivity_escalations USING btree (owner_user_id, group_id);


--
-- Name: idx_family_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_family_group ON public.family_members USING btree (owner_user_id, group_id);


--
-- Name: idx_family_legacy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_family_legacy ON public.family_members USING btree (legacy_beneficiary_id);


--
-- Name: idx_family_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_family_owner ON public.family_members USING btree (owner_user_id);


--
-- Name: idx_family_self_grp; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_family_self_grp ON public.family_members USING btree (owner_user_id, group_id) WHERE is_self;


--
-- Name: idx_groups_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_owner ON public.groups USING btree (owner_user_id);


--
-- Name: idx_notes_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_entity ON public.notes USING btree (owner_user_id, entity_type, entity_id);


--
-- Name: idx_notifiers_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifiers_group ON public.family_notifiers USING btree (group_id);


--
-- Name: idx_notiflog_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notiflog_created ON public.notification_log USING btree (created_at);


--
-- Name: idx_parcel_owners_parcel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parcel_owners_parcel ON public.parcel_owners USING btree (parcel_id);


--
-- Name: idx_parcels_passbook; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parcels_passbook ON public.parcels USING btree (passbook_id);


--
-- Name: idx_passbooks_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passbooks_group ON public.passbooks USING btree (group_id);


--
-- Name: idx_properties_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_owner ON public.properties USING btree (owner_user_id);


--
-- Name: idx_property_owners_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_owners_property ON public.property_owners USING btree (property_id);


--
-- Name: ix_ref_division_row_id; Type: INDEX; Schema: ref; Owner: -
--

CREATE INDEX ix_ref_division_row_id ON ref.division USING btree (row_id);


--
-- Name: ix_ref_division_type_row_id; Type: INDEX; Schema: ref; Owner: -
--

CREATE INDEX ix_ref_division_type_row_id ON ref.division_type USING btree (row_id);


--
-- Name: ix_ref_property_ownership_type_id; Type: INDEX; Schema: ref; Owner: -
--

CREATE INDEX ix_ref_property_ownership_type_id ON ref.property_ownership_type USING btree (id);


--
-- Name: ix_ref_property_type_id; Type: INDEX; Schema: ref; Owner: -
--

CREATE INDEX ix_ref_property_type_id ON ref.property_type USING btree (id);


--
-- Name: ix_ref_subdivision_portal_row_id; Type: INDEX; Schema: ref; Owner: -
--

CREATE INDEX ix_ref_subdivision_portal_row_id ON ref.subdivision_portal USING btree (row_id);


--
-- Name: document_access_logs document_access_logs_document_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.document_access_logs
    ADD CONSTRAINT document_access_logs_document_id_fkey FOREIGN KEY (document_id) REFERENCES app.documents(id) ON DELETE CASCADE;


--
-- Name: document_access_logs document_access_logs_shared_by_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.document_access_logs
    ADD CONSTRAINT document_access_logs_shared_by_user_id_fkey FOREIGN KEY (shared_by_user_id) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: document_access_logs document_access_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.document_access_logs
    ADD CONSTRAINT document_access_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: document_sharing document_sharing_document_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.document_sharing
    ADD CONSTRAINT document_sharing_document_id_fkey FOREIGN KEY (document_id) REFERENCES app.documents(id) ON DELETE CASCADE;


--
-- Name: document_sharing document_sharing_shared_by_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.document_sharing
    ADD CONSTRAINT document_sharing_shared_by_user_id_fkey FOREIGN KEY (shared_by_user_id) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: document_sharing document_sharing_shared_with_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.document_sharing
    ADD CONSTRAINT document_sharing_shared_with_user_id_fkey FOREIGN KEY (shared_with_user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: documents documents_category_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.documents
    ADD CONSTRAINT documents_category_id_fkey FOREIGN KEY (category_id) REFERENCES ref.document_categories(id);


--
-- Name: documents documents_encryption_key_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.documents
    ADD CONSTRAINT documents_encryption_key_id_fkey FOREIGN KEY (encryption_key_id) REFERENCES app.user_encryption_keys(id);


--
-- Name: documents documents_group_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.documents
    ADD CONSTRAINT documents_group_id_fkey FOREIGN KEY (group_id) REFERENCES app.groups(id) ON DELETE CASCADE;


--
-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: group_events group_events_group_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_events
    ADD CONSTRAINT group_events_group_id_fkey FOREIGN KEY (group_id) REFERENCES app.groups(id);


--
-- Name: group_invitations group_invitations_group_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_invitations
    ADD CONSTRAINT group_invitations_group_id_fkey FOREIGN KEY (group_id) REFERENCES app.groups(id) ON DELETE CASCADE;


--
-- Name: group_invitations group_invitations_invited_by_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_invitations
    ADD CONSTRAINT group_invitations_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES app.users(id);


--
-- Name: group_invitations group_invitations_invited_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_invitations
    ADD CONSTRAINT group_invitations_invited_user_id_fkey FOREIGN KEY (invited_user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES app.groups(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_role_code_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_members
    ADD CONSTRAINT group_members_role_code_fkey FOREIGN KEY (role_code) REFERENCES ref.group_roles(code);


--
-- Name: group_members group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_members
    ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: group_messages group_messages_group_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_messages
    ADD CONSTRAINT group_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES app.groups(id) ON DELETE CASCADE;


--
-- Name: group_messages group_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.group_messages
    ADD CONSTRAINT group_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES app.users(id);


--
-- Name: groups groups_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.groups
    ADD CONSTRAINT groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id);


--
-- Name: groups groups_owned_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.groups
    ADD CONSTRAINT groups_owned_by_fkey FOREIGN KEY (owned_by) REFERENCES app.users(id);


--
-- Name: properties properties_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.properties
    ADD CONSTRAINT properties_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id);


--
-- Name: properties properties_group_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.properties
    ADD CONSTRAINT properties_group_id_fkey FOREIGN KEY (group_id) REFERENCES app.groups(id) ON DELETE CASCADE;


--
-- Name: properties properties_owned_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.properties
    ADD CONSTRAINT properties_owned_by_fkey FOREIGN KEY (owned_by) REFERENCES app.users(id);


--
-- Name: properties properties_property_category_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.properties
    ADD CONSTRAINT properties_property_category_id_fkey FOREIGN KEY (property_category_id) REFERENCES ref.property_category(id);


--
-- Name: properties properties_property_ownership_type_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.properties
    ADD CONSTRAINT properties_property_ownership_type_id_fkey FOREIGN KEY (property_ownership_type_id) REFERENCES ref.property_ownership_type(id);


--
-- Name: properties properties_property_type_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.properties
    ADD CONSTRAINT properties_property_type_id_fkey FOREIGN KEY (property_type_id) REFERENCES ref.property_type(id);


--
-- Name: property_documents property_documents_property_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_documents
    ADD CONSTRAINT property_documents_property_id_fkey FOREIGN KEY (property_id) REFERENCES app.properties(id) ON DELETE CASCADE;


--
-- Name: property_documents property_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_documents
    ADD CONSTRAINT property_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES app.users(id);


--
-- Name: property_favorites property_favorites_property_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_favorites
    ADD CONSTRAINT property_favorites_property_id_fkey FOREIGN KEY (property_id) REFERENCES app.properties(id) ON DELETE CASCADE;


--
-- Name: property_favorites property_favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_favorites
    ADD CONSTRAINT property_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: property_owners property_owners_property_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_owners
    ADD CONSTRAINT property_owners_property_id_fkey FOREIGN KEY (property_id) REFERENCES app.properties(id) ON DELETE CASCADE;


--
-- Name: property_owners property_owners_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_owners
    ADD CONSTRAINT property_owners_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: property_views property_views_property_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_views
    ADD CONSTRAINT property_views_property_id_fkey FOREIGN KEY (property_id) REFERENCES app.properties(id) ON DELETE CASCADE;


--
-- Name: property_views property_views_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.property_views
    ADD CONSTRAINT property_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: user_encryption_keys user_encryption_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_encryption_keys
    ADD CONSTRAINT user_encryption_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_networks user_networks_network_type_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_networks
    ADD CONSTRAINT user_networks_network_type_fkey FOREIGN KEY (network_type) REFERENCES ref.user_network_type(code);


--
-- Name: user_networks user_networks_rank_kind_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_networks
    ADD CONSTRAINT user_networks_rank_kind_fkey FOREIGN KEY (rank_kind) REFERENCES ref.user_network_rank_kind(code);


--
-- Name: user_networks user_networks_related_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_networks
    ADD CONSTRAINT user_networks_related_user_id_fkey FOREIGN KEY (related_user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_networks user_networks_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_networks
    ADD CONSTRAINT user_networks_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: division_type division_type_parent_id_fkey; Type: FK CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.division_type
    ADD CONSTRAINT division_type_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES ref.division_type(row_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_categories document_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: ref; Owner: -
--

ALTER TABLE ONLY ref.document_categories
    ADD CONSTRAINT document_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES ref.document_categories(id);


--
-- PostgreSQL database dump complete
--

