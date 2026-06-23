-- AUTO-GENERATED point-in-time DDL snapshot of live `public` schema (project ujiiaqvwpnniaasdhyrb).
-- For backup/reference only. NOT the declarative source of truth.
-- May not be perfectly re-runnable.

--
-- 1. ENUMS
--
-- (no enum types in public schema)

--
-- 2. TABLES
--
CREATE TABLE public.brw_history (
    cluster_slug text NOT NULL,
    jahr integer NOT NULL,
    brw_eur_qm numeric(8,2) NOT NULL,
    referenz_flaeche numeric(8,2),
    quelle text DEFAULT 'BORIS Brandenburg'::text,
    CONSTRAINT brw_history_pkey PRIMARY KEY (cluster_slug, jahr),
    CONSTRAINT brw_history_jahr_check CHECK (((jahr >= 2010) AND (jahr <= 2050)))
);

CREATE TABLE public.cluster (
    slug text NOT NULL,
    name text NOT NULL,
    plz text,
    ort text,
    lage_kurz text,
    bahnhof_name text,
    bahnhof_minuten_auto integer,
    bahnhof_minuten_fuss integer,
    brw_2026 integer,
    versorger_strom text,
    versorger_wasser text,
    versorger_gas text,
    versorger_abwasser text,
    versorger_telekom text,
    hochwasser_status text DEFAULT 'frei'::text,
    starkregen_status text DEFAULT 'unbekannt'::text,
    lat numeric(10,7),
    lon numeric(10,7),
    reihenfolge integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT cluster_pkey PRIMARY KEY (slug)
);

CREATE TABLE public.companies (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    sector text,
    size smallint,
    linkedin_url text,
    website citext,
    phone_number text,
    address text,
    zipcode text,
    city text,
    state_abbr text,
    sales_id bigint,
    context_links json,
    country text,
    description text,
    revenue text,
    tax_identifier text,
    logo jsonb,
    zvg_slug text,
    zvg_gericht_id integer,
    abteilung text,
    postanschrift text,
    email text,
    telefon_notiz text,
    telefon_2 text,
    telefon_2_notiz text,
    telefon_3 text,
    telefon_3_notiz text,
    telefax text,
    verbindung text,
    sprechzeiten jsonb,
    serviceleistungen jsonb,
    biethinweise_link text,
    gmaps_embed_url text,
    zvg_raw_kontakt jsonb,
    zvg_last_synced_at timestamp with time zone,
    zvg_portal_ag_id text,
    email_quelle text,
    email_hinweis text,
    xjustiz_id text,
    lieferanschrift text,
    internet_2 text,
    CONSTRAINT companies_pkey PRIMARY KEY (id)
);

CREATE TABLE public.configuration (
    id integer DEFAULT 1 NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT configuration_pkey PRIMARY KEY (id),
    CONSTRAINT configuration_singleton CHECK ((id = 1))
);

CREATE TABLE public.contact_notes (
    id bigint NOT NULL,
    contact_id bigint NOT NULL,
    text text,
    date timestamp with time zone DEFAULT now(),
    sales_id bigint,
    status text,
    attachments jsonb[],
    CONSTRAINT "contactNotes_pkey" PRIMARY KEY (id)
);

CREATE TABLE public.contacts (
    id bigint NOT NULL,
    first_name text,
    last_name text,
    gender text,
    title text,
    background text,
    avatar jsonb,
    first_seen timestamp with time zone,
    last_seen timestamp with time zone,
    has_newsletter boolean,
    status text,
    tags bigint[],
    company_id bigint,
    sales_id bigint,
    linkedin_url text,
    email_jsonb jsonb,
    phone_jsonb jsonb,
    kleinanzeigen_kid bigint,
    CONSTRAINT contacts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.de_plz_centroid (
    plz text NOT NULL,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    ort text,
    CONSTRAINT de_plz_centroid_pkey PRIMARY KEY (plz)
);

CREATE TABLE public.deal_notes (
    id bigint NOT NULL,
    deal_id bigint NOT NULL,
    type text,
    text text,
    date timestamp with time zone DEFAULT now(),
    sales_id bigint,
    attachments jsonb[],
    CONSTRAINT "dealNotes_pkey" PRIMARY KEY (id)
);

CREATE TABLE public.deals (
    id bigint NOT NULL,
    name text NOT NULL,
    company_id bigint,
    contact_ids bigint[],
    category text,
    stage text NOT NULL,
    description text,
    amount bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    expected_closing_date date,
    sales_id bigint,
    index smallint,
    CONSTRAINT deals_pkey PRIMARY KEY (id)
);

CREATE TABLE public.favicons_excluded_domains (
    id bigint NOT NULL,
    domain text NOT NULL,
    CONSTRAINT favicons_excluded_domains_pkey PRIMARY KEY (id)
);

CREATE TABLE public.imap_polling_state (
    id integer DEFAULT 1 NOT NULL,
    mailbox text DEFAULT 'INBOX'::text NOT NULL,
    last_uid bigint DEFAULT 0 NOT NULL,
    last_polled_at timestamp with time zone DEFAULT now() NOT NULL,
    last_run_log text,
    CONSTRAINT imap_polling_state_pkey PRIMARY KEY (id),
    CONSTRAINT imap_polling_state_id_check CHECK ((id = 1))
);

CREATE TABLE public.kleinanzeigen_dokumente (
    id bigint DEFAULT nextval('kleinanzeigen_dokumente_id_seq'::regclass) NOT NULL,
    kid bigint NOT NULL,
    idx integer NOT NULL,
    dateiname text NOT NULL,
    pfad text NOT NULL,
    herkunft_url text NOT NULL,
    bytes integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT kleinanzeigen_dokumente_kid_idx_key UNIQUE (kid, idx),
    CONSTRAINT kleinanzeigen_dokumente_pkey PRIMARY KEY (id)
);

CREATE TABLE public.kleinanzeigen_favoriten (
    kid bigint NOT NULL,
    sales_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT kleinanzeigen_favoriten_pkey PRIMARY KEY (kid, sales_id)
);

CREATE TABLE public.kleinanzeigen_grundstueck (
    kid bigint NOT NULL,
    url text NOT NULL,
    href text NOT NULL,
    title text NOT NULL,
    beschreibung text,
    preis_eur numeric(12,2),
    preis_vb boolean DEFAULT false,
    flaeche_qm numeric(10,2),
    preis_pro_qm numeric(10,2) GENERATED ALWAYS AS (
CASE
    WHEN (flaeche_qm > (0)::numeric) THEN (preis_eur / flaeche_qm)
    ELSE NULL::numeric
END) STORED,
    plz text,
    ort text,
    ortsteil text,
    state_abbr text DEFAULT 'BB'::text,
    grundstuecksart text,
    angebotsart text DEFAULT 'Kaufen'::text,
    provision text,
    tags text[],
    cover_bild_path text,
    bilder_paths text[],
    bilder_anzahl integer DEFAULT 0,
    status text DEFAULT 'aktiv'::text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    inserat_erstellt date,
    aufrufe integer,
    notiz text,
    favorit boolean DEFAULT false,
    triage text,
    triage_grund text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    anbieter_name text,
    anbieter_typ text,
    anbieter_aktiv_seit date,
    locality_full text,
    hat_anschrift boolean GENERATED ALWAYS AS (COALESCE((locality_full ~* '(?:str(?:aße|asse|\.)?|weg|allee|platz|gasse|chaussee|ring|damm|ufer|landstr|hof|steig)\s+\d{1,4}[a-z]?\M'::text), false)) STORED,
    dokumente_anzahl integer DEFAULT 0,
    details_raw jsonb,
    bauerwartungsland boolean DEFAULT false,
    grz numeric(4,2),
    gfz numeric(4,2),
    vollgeschosse smallint,
    bpl_vorhanden boolean,
    bpl_nummer text,
    erschliessung text,
    teilbar boolean,
    bebaubarkeit_kurz text,
    risiken text[],
    ki_analyse_at timestamp with time zone,
    baureif boolean GENERATED ALWAYS AS ((NOT COALESCE(bauerwartungsland, false))) STORED,
    lat numeric(9,6),
    lon numeric(9,6),
    geocoded_at timestamp with time zone,
    geocode_quelle text,
    paragraph_34 boolean DEFAULT false,
    provision_satz_pct numeric(5,2),
    baubarkeit_typ text[],
    bebaubare_flaeche_qm numeric(10,2),
    grundflaeche_qm numeric(10,2),
    baufeld_qm numeric(10,2),
    wohnflaeche_qm numeric(10,2),
    strasse text,
    kontakt_id bigint,
    bautraegerfrei boolean,
    gemarkung text,
    flur text,
    flurstueck text,
    erbbaurecht boolean,
    anbieter_objekt_id text,
    eigenangebot boolean DEFAULT false,
    search_text text GENERATED ALWAYS AS (lower(((((((((COALESCE(title, ''::text) || ' '::text) || COALESCE(anbieter_name, ''::text)) || ' '::text) || COALESCE(ort, ''::text)) || ' '::text) || COALESCE(ortsteil, ''::text)) || ' '::text) || COALESCE(strasse, ''::text)))) STORED,
    paragraph_35 boolean,
    bild_analyse_text text,
    bild_analyse_at timestamp with time zone,
    bild_strasse_hinweis text,
    bild_gps_lat numeric(9,6),
    bild_gps_lon numeric(9,6),
    hat_kataster boolean GENERATED ALWAYS AS (((gemarkung IS NOT NULL) AND (flur IS NOT NULL) AND (flurstueck IS NOT NULL))) STORED,
    hat_lage_daten boolean GENERATED ALWAYS AS (((strasse IS NOT NULL) OR ((gemarkung IS NOT NULL) AND (flur IS NOT NULL) AND (flurstueck IS NOT NULL)))) STORED,
    CONSTRAINT kleinanzeigen_grundstueck_pkey PRIMARY KEY (kid),
    CONSTRAINT baubarkeit_typ_check CHECK (((baubarkeit_typ IS NULL) OR (baubarkeit_typ <@ ARRAY['EFH'::text, 'DHH'::text, 'EFH/EW'::text, 'MFH'::text, 'gemischt'::text])))
);

CREATE TABLE public.objekt (
    oid integer NOT NULL,
    cluster_slug text NOT NULL,
    name text NOT NULL,
    strasse text,
    hausnummer text,
    plz text,
    ort text,
    flurstueck text,
    gemarkung text,
    qm numeric(10,2) NOT NULL,
    vk_eur integer,
    prqm_eur integer GENERATED ALWAYS AS (
CASE
    WHEN ((qm > (0)::numeric) AND (vk_eur IS NOT NULL)) THEN (round(((vk_eur)::numeric / qm)))::integer
    ELSE NULL::integer
END) STORED,
    status text DEFAULT 'verfügbar'::text NOT NULL,
    bebauung text,
    medien text,
    alkis text,
    lat numeric(10,7),
    lon numeric(10,7),
    bemerkung text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT objekt_pkey PRIMARY KEY (oid),
    CONSTRAINT objekt_status_check CHECK ((status = ANY (ARRAY['verfügbar'::text, 'reserviert'::text, 'verkauft'::text, 'in_akquise'::text, 'vertriebssperre'::text, 'bestand'::text])))
);

CREATE TABLE public.portal_ingest_state (
    id integer DEFAULT 1 NOT NULL,
    cursor integer DEFAULT 0 NOT NULL,
    last_run timestamp with time zone,
    last_stats jsonb,
    CONSTRAINT portal_ingest_state_pkey PRIMARY KEY (id)
);

CREATE TABLE public.sales (
    id bigint NOT NULL,
    first_name text DEFAULT 'Pending'::text NOT NULL,
    last_name text DEFAULT 'Pending'::text NOT NULL,
    email citext NOT NULL,
    administrator boolean NOT NULL,
    user_id uuid NOT NULL,
    avatar jsonb,
    disabled boolean DEFAULT false NOT NULL,
    CONSTRAINT sales_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tags (
    id bigint NOT NULL,
    name text NOT NULL,
    color text NOT NULL,
    CONSTRAINT tags_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tasks (
    id bigint NOT NULL,
    contact_id bigint NOT NULL,
    type text,
    text text,
    due_date timestamp with time zone,
    done_date timestamp with time zone,
    sales_id bigint,
    CONSTRAINT tasks_pkey PRIMARY KEY (id)
);

CREATE TABLE public.zvg_akte (
    zid text NOT NULL,
    az text NOT NULL,
    az_norm text,
    az_jahr integer,
    ag_company_id bigint,
    ag_name_raw text,
    art text,
    is_teilung boolean,
    termin timestamp with time zone,
    termin_jahr integer,
    vkw_eur numeric(12,2),
    gpreis_eur numeric(10,2),
    gutachten_url text,
    obj_titel text,
    obj_beschreibung text,
    raw_json jsonb NOT NULL,
    status text DEFAULT 'neu'::text NOT NULL,
    triage_note text,
    stop_reason text,
    bietreichweite_eur numeric(12,2),
    deal_id bigint,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    rechtspfleger_contact_id bigint,
    objektart text,
    objekt_strasse text,
    objekt_hausnummer text,
    objekt_plz text,
    objekt_ort text,
    objekt_ortsteil text,
    objekt_lat numeric,
    objekt_lon numeric,
    saal text,
    versteigerungsort_override text,
    detail_fetched_at timestamp with time zone,
    sachverstaendiger_contact_id bigint,
    objekt_anschrift text,
    aufnahmetag date,
    expose_path text,
    anordnung_path text,
    biethinweis_path text,
    glaeubiger_path text,
    cover_bild_path text,
    bilder_paths text[],
    detail_json jsonb,
    notify_subscribed_at timestamp with time zone,
    notify_email text DEFAULT 'anfrage@persiusufer.de'::text,
    zvg_portal_id integer,
    zvg_portal_land_abk text,
    zvg_portal_last_updated timestamp with time zone,
    vkw_eur_zvg_portal numeric,
    vkw_diff_note text,
    state_abbr text,
    geringstes_gebot_eur numeric(12,2),
    geringstes_gebot_rang_betreibend smallint,
    geringstes_gebot_quelle text,
    geringstes_gebot_notiz text,
    geringstes_gebot_warnung text,
    bestehenbleibende_rechte_jsonb jsonb,
    geringstes_gebot_ermittelt_am timestamp with time zone,
    geringstes_gebot_modell text,
    geringstes_gebot_job_error text,
    geringstes_gebot_job_started_at timestamp with time zone,
    dokument_backfill_started_at timestamp with time zone,
    dokument_backfill_no_docs boolean DEFAULT false,
    letzte_anfrage_id bigint,
    letzte_anfrage_status text,
    letzte_anfrage_am timestamp with time zone,
    letzte_anfrage_option smallint,
    vkw_unbekannt boolean GENERATED ALWAYS AS (((vkw_eur IS NULL) OR (vkw_eur <= (1)::numeric))) STORED,
    hat_gutachten_lokal boolean DEFAULT false NOT NULL,
    dokumente_count integer DEFAULT 0 NOT NULL,
    hat_expose_lokal boolean DEFAULT false NOT NULL,
    bilder_extraction_at timestamp with time zone,
    bilder_extraction_count integer DEFAULT 0 NOT NULL,
    bilder_extraction_error text,
    fotos_count integer DEFAULT 0 NOT NULL,
    geocoding_precision text,
    geocoding_at timestamp with time zone,
    gemarkung text,
    flur text,
    flurstueck text,
    flurstueck_groesse_qm numeric,
    CONSTRAINT zvg_akte_pkey PRIMARY KEY (zid),
    CONSTRAINT zvg_akte_status_check CHECK ((status = ANY (ARRAY['neu'::text, 'triagiert'::text, 'phase1'::text, 'phase2'::text, 'phase3a'::text, 'phase3b'::text, 'phase4'::text, 'phase5'::text, 'phase6'::text, 'stop'::text, 'aufgehoben'::text, 'ersteigert'::text, 'verloren'::text])))
);

CREATE TABLE public.zvg_akte_bild (
    id bigint DEFAULT nextval('zvg_akte_bild_id_seq'::regclass) NOT NULL,
    zid text NOT NULL,
    source_doc_art text NOT NULL,
    source_doc_id bigint,
    storage_path text NOT NULL,
    bucket text DEFAULT 'zvg-akte-bilder'::text NOT NULL,
    page_index integer,
    image_index integer,
    width integer,
    height integer,
    size_bytes bigint,
    mime_type text DEFAULT 'image/jpeg'::text,
    extracted_at timestamp with time zone DEFAULT now() NOT NULL,
    hidden boolean DEFAULT false NOT NULL,
    CONSTRAINT zvg_akte_bild_pkey PRIMARY KEY (id)
);

CREATE TABLE public.zvg_akte_dokumente (
    id bigint DEFAULT nextval('zvg_akte_dokumente_id_seq'::regclass) NOT NULL,
    zid text NOT NULL,
    art text NOT NULL,
    titel text NOT NULL,
    storage_path text NOT NULL,
    bucket text DEFAULT 'zvg-documents'::text NOT NULL,
    mime_type text DEFAULT 'application/pdf'::text,
    size_bytes bigint,
    source text,
    hochgeladen_am timestamp with time zone DEFAULT now(),
    hochgeladen_von_sales_id bigint,
    notizen text,
    reihenfolge integer DEFAULT 100,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT zvg_akte_dokumente_zid_path_unique UNIQUE (zid, storage_path),
    CONSTRAINT zvg_akte_dokumente_pkey PRIMARY KEY (id),
    CONSTRAINT zvg_akte_dokumente_art_check CHECK ((art = ANY (ARRAY['expose'::text, 'anordnung'::text, 'biethinweis'::text, 'glaeubiger'::text, 'gutachten'::text, 'grundbuch'::text, 'b_plan'::text, 'gma'::text, 'foto'::text, 'anwalt'::text, 'notiz'::text, 'sonstiges'::text])))
);

CREATE TABLE public.zvg_akte_favoriten (
    zid text NOT NULL,
    sales_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT zvg_akte_favoriten_pkey PRIMARY KEY (zid, sales_id)
);

CREATE TABLE public.zvg_anfrage (
    id bigint NOT NULL,
    zid text NOT NULL,
    ag_company_id bigint,
    gesendet_am timestamp with time zone,
    gesendet_an_email text,
    gesendet_per text DEFAULT 'email'::text NOT NULL,
    gesendet_von_sales_id bigint,
    anlass text DEFAULT 'nach_termin'::text,
    betreff text,
    body text,
    antwort_eingegangen_am timestamp with time zone,
    antwort_option smallint,
    antwort_neuer_termin timestamp with time zone,
    antwort_neuer_termin_saal text,
    antwort_zuschlag_im_termin boolean,
    antwort_zuschlag_versagt boolean,
    antwort_versagung_grund text,
    antwort_verfahren_eingestellt boolean,
    antwort_verteilungstermin timestamp with time zone,
    antwort_freitext text,
    antwort_raw_text text,
    re_anfrage_faellig_am date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    rechtspfleger_contact_id bigint,
    anrede text,
    status text DEFAULT 'entwurf'::text NOT NULL,
    override_rate_limit boolean DEFAULT false NOT NULL,
    job_started_at timestamp with time zone,
    job_error text,
    sent_copy_info jsonb,
    reply_token text,
    reply_token_used_at timestamp with time zone,
    reply_form_views_count integer DEFAULT 0 NOT NULL,
    reply_form_first_viewed_at timestamp with time zone,
    CONSTRAINT zvg_anfrage_reply_token_key UNIQUE (reply_token),
    CONSTRAINT zvg_anfrage_pkey PRIMARY KEY (id),
    CONSTRAINT zvg_anfrage_anlass_check CHECK ((anlass = ANY (ARRAY['nach_termin'::text, 'vor_termin'::text, 'adhoc'::text, 're_anfrage'::text]))),
    CONSTRAINT zvg_anfrage_antwort_option_check CHECK (((antwort_option IS NULL) OR ((antwort_option >= 1) AND (antwort_option <= 8)))),
    CONSTRAINT zvg_anfrage_gesendet_per_check CHECK ((gesendet_per = ANY (ARRAY['email'::text, 'fax'::text, 'brief'::text, 'telefon'::text, 'egvp'::text]))),
    CONSTRAINT zvg_anfrage_status_check CHECK ((status = ANY (ARRAY['entwurf'::text, 'gesendet'::text, 'beantwortet'::text, 'verworfen'::text])))
);

--
-- 3. FOREIGN KEYS
--
ALTER TABLE public.brw_history ADD CONSTRAINT brw_history_cluster_slug_fkey FOREIGN KEY (cluster_slug) REFERENCES cluster(slug) ON DELETE CASCADE;
ALTER TABLE public.companies ADD CONSTRAINT companies_sales_id_fkey FOREIGN KEY (sales_id) REFERENCES sales(id);
ALTER TABLE public.contact_notes ADD CONSTRAINT "contactNotes_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES contacts(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.contact_notes ADD CONSTRAINT "contactNotes_sales_id_fkey" FOREIGN KEY (sales_id) REFERENCES sales(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_sales_id_fkey FOREIGN KEY (sales_id) REFERENCES sales(id);
ALTER TABLE public.deal_notes ADD CONSTRAINT "dealNotes_deal_id_fkey" FOREIGN KEY (deal_id) REFERENCES deals(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.deal_notes ADD CONSTRAINT "dealNotes_sales_id_fkey" FOREIGN KEY (sales_id) REFERENCES sales(id);
ALTER TABLE public.deals ADD CONSTRAINT deals_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.deals ADD CONSTRAINT deals_sales_id_fkey FOREIGN KEY (sales_id) REFERENCES sales(id);
ALTER TABLE public.kleinanzeigen_dokumente ADD CONSTRAINT kleinanzeigen_dokumente_kid_fkey FOREIGN KEY (kid) REFERENCES kleinanzeigen_grundstueck(kid) ON DELETE CASCADE;
ALTER TABLE public.kleinanzeigen_favoriten ADD CONSTRAINT kleinanzeigen_favoriten_kid_fkey FOREIGN KEY (kid) REFERENCES kleinanzeigen_grundstueck(kid) ON DELETE CASCADE;
ALTER TABLE public.kleinanzeigen_favoriten ADD CONSTRAINT kleinanzeigen_favoriten_sales_id_fkey FOREIGN KEY (sales_id) REFERENCES sales(id) ON DELETE CASCADE;
ALTER TABLE public.kleinanzeigen_grundstueck ADD CONSTRAINT kleinanzeigen_grundstueck_kontakt_id_fkey FOREIGN KEY (kontakt_id) REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE public.objekt ADD CONSTRAINT objekt_cluster_slug_fkey FOREIGN KEY (cluster_slug) REFERENCES cluster(slug) ON DELETE RESTRICT;
ALTER TABLE public.sales ADD CONSTRAINT sales_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.zvg_akte ADD CONSTRAINT zvg_akte_ag_company_id_fkey FOREIGN KEY (ag_company_id) REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE public.zvg_akte ADD CONSTRAINT zvg_akte_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;
ALTER TABLE public.zvg_akte ADD CONSTRAINT zvg_akte_rechtspfleger_contact_id_fkey FOREIGN KEY (rechtspfleger_contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE public.zvg_akte ADD CONSTRAINT zvg_akte_sachverstaendiger_contact_id_fkey FOREIGN KEY (sachverstaendiger_contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE public.zvg_akte_bild ADD CONSTRAINT zvg_akte_bild_source_doc_id_fkey FOREIGN KEY (source_doc_id) REFERENCES zvg_akte_dokumente(id) ON DELETE SET NULL;
ALTER TABLE public.zvg_akte_bild ADD CONSTRAINT zvg_akte_bild_zid_fkey FOREIGN KEY (zid) REFERENCES zvg_akte(zid) ON DELETE CASCADE;
ALTER TABLE public.zvg_akte_dokumente ADD CONSTRAINT zvg_akte_dokumente_hochgeladen_von_sales_id_fkey FOREIGN KEY (hochgeladen_von_sales_id) REFERENCES sales(id) ON DELETE SET NULL;
ALTER TABLE public.zvg_akte_dokumente ADD CONSTRAINT zvg_akte_dokumente_zid_fkey FOREIGN KEY (zid) REFERENCES zvg_akte(zid) ON DELETE CASCADE;
ALTER TABLE public.zvg_akte_favoriten ADD CONSTRAINT zvg_akte_favoriten_sales_id_fkey FOREIGN KEY (sales_id) REFERENCES sales(id) ON DELETE CASCADE;
ALTER TABLE public.zvg_akte_favoriten ADD CONSTRAINT zvg_akte_favoriten_zid_fkey FOREIGN KEY (zid) REFERENCES zvg_akte(zid) ON DELETE CASCADE;
ALTER TABLE public.zvg_anfrage ADD CONSTRAINT zvg_anfrage_ag_company_id_fkey FOREIGN KEY (ag_company_id) REFERENCES companies(id);
ALTER TABLE public.zvg_anfrage ADD CONSTRAINT zvg_anfrage_gesendet_von_sales_id_fkey FOREIGN KEY (gesendet_von_sales_id) REFERENCES sales(id);
ALTER TABLE public.zvg_anfrage ADD CONSTRAINT zvg_anfrage_rechtspfleger_contact_id_fkey FOREIGN KEY (rechtspfleger_contact_id) REFERENCES contacts(id);
ALTER TABLE public.zvg_anfrage ADD CONSTRAINT zvg_anfrage_zid_fkey FOREIGN KEY (zid) REFERENCES zvg_akte(zid) ON DELETE CASCADE;

--
-- 4. INDEXES
--
CREATE INDEX companies_xjustiz_id_idx ON public.companies USING btree (xjustiz_id) WHERE (xjustiz_id IS NOT NULL);
CREATE UNIQUE INDEX companies_zvg_gericht_id_unique ON public.companies USING btree (zvg_gericht_id) WHERE (zvg_gericht_id IS NOT NULL);
CREATE UNIQUE INDEX companies_zvg_portal_ag_id_unique ON public.companies USING btree (zvg_portal_ag_id) WHERE (zvg_portal_ag_id IS NOT NULL);
CREATE UNIQUE INDEX companies_zvg_slug_uniq ON public.companies USING btree (zvg_slug) WHERE (zvg_slug IS NOT NULL);
CREATE INDEX contact_notes_contact_id_idx ON public.contact_notes USING btree (contact_id);
CREATE INDEX contacts_company_id_idx ON public.contacts USING btree (company_id);
CREATE INDEX contacts_kleinanzeigen_kid_idx ON public.contacts USING btree (kleinanzeigen_kid) WHERE (kleinanzeigen_kid IS NOT NULL);
CREATE INDEX deal_notes_deal_id_idx ON public.deal_notes USING btree (deal_id);
CREATE INDEX deals_company_id_idx ON public.deals USING btree (company_id);
CREATE INDEX idx_de_plz_centroid_plz ON public.de_plz_centroid USING btree (plz);
CREATE INDEX idx_zvg_akte_bild_zid ON public.zvg_akte_bild USING btree (zid);
CREATE INDEX idx_zvg_akte_dokumente_count ON public.zvg_akte USING btree (dokumente_count) WHERE (dokumente_count > 0);
CREATE INDEX idx_zvg_akte_dokumente_hochgeladen_am ON public.zvg_akte_dokumente USING btree (hochgeladen_am DESC);
CREATE INDEX idx_zvg_akte_dokumente_zid ON public.zvg_akte_dokumente USING btree (zid);
CREATE INDEX idx_zvg_akte_dokumente_zid_art ON public.zvg_akte_dokumente USING btree (zid, art);
CREATE INDEX idx_zvg_akte_favoriten_sales ON public.zvg_akte_favoriten USING btree (sales_id);
CREATE INDEX idx_zvg_akte_fotos_count ON public.zvg_akte USING btree (fotos_count) WHERE (fotos_count > 0);
CREATE INDEX idx_zvg_akte_geocoding_precision ON public.zvg_akte USING btree (geocoding_precision);
CREATE INDEX idx_zvg_akte_hat_expose ON public.zvg_akte USING btree (hat_expose_lokal) WHERE hat_expose_lokal;
CREATE INDEX idx_zvg_akte_hat_gutachten ON public.zvg_akte USING btree (hat_gutachten_lokal) WHERE hat_gutachten_lokal;
CREATE INDEX idx_zvg_akte_letzte_anfrage_status ON public.zvg_akte USING btree (letzte_anfrage_status);
CREATE INDEX idx_zvg_akte_vkw_eur ON public.zvg_akte USING btree (vkw_eur);
CREATE INDEX idx_zvg_akte_vkw_unbekannt ON public.zvg_akte USING btree (vkw_unbekannt);
CREATE INDEX idx_zvg_anfrage_reply_token ON public.zvg_anfrage USING btree (reply_token) WHERE (reply_token IS NOT NULL);
CREATE INDEX kleinanzeigen_btf_idx ON public.kleinanzeigen_grundstueck USING btree (bautraegerfrei) WHERE (bautraegerfrei IS NOT NULL);
CREATE INDEX kleinanzeigen_dokumente_kid_idx ON public.kleinanzeigen_dokumente USING btree (kid);
CREATE INDEX kleinanzeigen_eigenangebot_idx ON public.kleinanzeigen_grundstueck USING btree (eigenangebot) WHERE eigenangebot;
CREATE INDEX kleinanzeigen_erbbau_idx ON public.kleinanzeigen_grundstueck USING btree (erbbaurecht) WHERE (erbbaurecht IS NOT NULL);
CREATE INDEX kleinanzeigen_grundstueck_baubarkeit_idx ON public.kleinanzeigen_grundstueck USING btree (baubarkeit_typ) WHERE (baubarkeit_typ IS NOT NULL);
CREATE INDEX kleinanzeigen_grundstueck_bauerwartung_idx ON public.kleinanzeigen_grundstueck USING btree (bauerwartungsland) WHERE bauerwartungsland;
CREATE INDEX kleinanzeigen_grundstueck_baureif_idx ON public.kleinanzeigen_grundstueck USING btree (baureif) WHERE baureif;
CREATE INDEX kleinanzeigen_grundstueck_flaeche_idx ON public.kleinanzeigen_grundstueck USING btree (flaeche_qm);
CREATE INDEX kleinanzeigen_grundstueck_geo_idx ON public.kleinanzeigen_grundstueck USING btree (lat, lon) WHERE (lat IS NOT NULL);
CREATE INDEX kleinanzeigen_grundstueck_hat_anschrift_idx ON public.kleinanzeigen_grundstueck USING btree (hat_anschrift) WHERE hat_anschrift;
CREATE INDEX kleinanzeigen_grundstueck_last_seen_idx ON public.kleinanzeigen_grundstueck USING btree (last_seen_at DESC);
CREATE INDEX kleinanzeigen_grundstueck_p34_idx ON public.kleinanzeigen_grundstueck USING btree (paragraph_34) WHERE paragraph_34;
CREATE INDEX kleinanzeigen_grundstueck_plz_idx ON public.kleinanzeigen_grundstueck USING btree (plz);
CREATE INDEX kleinanzeigen_grundstueck_preis_idx ON public.kleinanzeigen_grundstueck USING btree (preis_eur);
CREATE INDEX kleinanzeigen_grundstueck_status_idx ON public.kleinanzeigen_grundstueck USING btree (status);
CREATE INDEX kleinanzeigen_hat_kataster_idx ON public.kleinanzeigen_grundstueck USING btree (hat_kataster) WHERE hat_kataster;
CREATE INDEX kleinanzeigen_hat_lage_daten_idx ON public.kleinanzeigen_grundstueck USING btree (hat_lage_daten) WHERE hat_lage_daten;
CREATE INDEX kleinanzeigen_kontakt_id_idx ON public.kleinanzeigen_grundstueck USING btree (kontakt_id) WHERE (kontakt_id IS NOT NULL);
CREATE INDEX kleinanzeigen_p35_idx ON public.kleinanzeigen_grundstueck USING btree (paragraph_35) WHERE (paragraph_35 IS NOT NULL);
CREATE INDEX kleinanzeigen_search_text_trgm_idx ON public.kleinanzeigen_grundstueck USING gin (search_text gin_trgm_ops);
CREATE INDEX objekt_cluster_idx ON public.objekt USING btree (cluster_slug);
CREATE INDEX objekt_status_idx ON public.objekt USING btree (status);
CREATE UNIQUE INDEX uq__sales__user_id ON public.sales USING btree (user_id);
CREATE INDEX zvg_akte_ag_company_id_idx ON public.zvg_akte USING btree (ag_company_id);
CREATE INDEX zvg_akte_backfill_idx ON public.zvg_akte USING btree (dokument_backfill_started_at) WHERE (dokument_backfill_started_at IS NOT NULL);
CREATE INDEX zvg_akte_detail_pending_idx ON public.zvg_akte USING btree (first_seen) WHERE (detail_fetched_at IS NULL);
CREATE INDEX zvg_akte_first_seen_idx ON public.zvg_akte USING btree (first_seen DESC);
CREATE INDEX zvg_akte_geringstes_gebot_idx ON public.zvg_akte USING btree (geringstes_gebot_eur) WHERE (geringstes_gebot_eur IS NOT NULL);
CREATE INDEX zvg_akte_gpreis_zero_idx ON public.zvg_akte USING btree (gpreis_eur) WHERE ((gpreis_eur = (0)::numeric) AND (gutachten_url IS NOT NULL));
CREATE INDEX zvg_akte_objekt_geo_idx ON public.zvg_akte USING btree (objekt_lat, objekt_lon) WHERE (objekt_lat IS NOT NULL);
CREATE INDEX zvg_akte_objektart_idx ON public.zvg_akte USING btree (objektart) WHERE (objektart IS NOT NULL);
CREATE INDEX zvg_akte_rechtspfleger_contact_id_idx ON public.zvg_akte USING btree (rechtspfleger_contact_id) WHERE (rechtspfleger_contact_id IS NOT NULL);
CREATE INDEX zvg_akte_sachverstaendiger_idx ON public.zvg_akte USING btree (sachverstaendiger_contact_id) WHERE (sachverstaendiger_contact_id IS NOT NULL);
CREATE INDEX zvg_akte_state_abbr_idx ON public.zvg_akte USING btree (state_abbr);
CREATE INDEX zvg_akte_status_idx ON public.zvg_akte USING btree (status);
CREATE INDEX zvg_akte_termin_idx ON public.zvg_akte USING btree (termin) WHERE (status <> ALL (ARRAY['stop'::text, 'abgegeben'::text, 'verloren'::text]));
CREATE UNIQUE INDEX zvg_akte_zvg_portal_id_unique ON public.zvg_akte USING btree (zvg_portal_id) WHERE (zvg_portal_id IS NOT NULL);
CREATE INDEX zvg_anfrage_ag_company_id_idx ON public.zvg_anfrage USING btree (ag_company_id);
CREATE INDEX zvg_anfrage_gesendet_am_idx ON public.zvg_anfrage USING btree (gesendet_am DESC);
CREATE INDEX zvg_anfrage_offene_idx ON public.zvg_anfrage USING btree (zid, gesendet_am DESC) WHERE (antwort_eingegangen_am IS NULL);
CREATE INDEX zvg_anfrage_rechtspfleger_idx ON public.zvg_anfrage USING btree (rechtspfleger_contact_id);
CREATE INDEX zvg_anfrage_status_idx ON public.zvg_anfrage USING btree (status);
CREATE INDEX zvg_anfrage_zid_idx ON public.zvg_anfrage USING btree (zid);

--
-- 5. FUNCTIONS
--
CREATE OR REPLACE FUNCTION public.backfill_admin_start()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Falls bereits aktiv, erst entfernen
  PERFORM cron.unschedule('backfill-portal-batch-a') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'backfill-portal-batch-a');
  
  PERFORM cron.schedule('backfill-portal-batch-a', '* * * * *', $cron$
    SELECT net.http_get(url := 'https://ujiiaqvwpnniaasdhyrb.supabase.co/functions/v1/backfill-portal-dokumente?token=backfill-portal-7f3k9q2v&batch=15&w=a', timeout_milliseconds := 90000);
    SELECT net.http_get(url := 'https://ujiiaqvwpnniaasdhyrb.supabase.co/functions/v1/backfill-portal-dokumente?token=backfill-portal-7f3k9q2v&batch=15&w=b', timeout_milliseconds := 90000);
    SELECT net.http_get(url := 'https://ujiiaqvwpnniaasdhyrb.supabase.co/functions/v1/backfill-portal-dokumente?token=backfill-portal-7f3k9q2v&batch=15&w=c', timeout_milliseconds := 90000);
    SELECT net.http_get(url := 'https://ujiiaqvwpnniaasdhyrb.supabase.co/functions/v1/backfill-portal-dokumente?token=backfill-portal-7f3k9q2v&batch=15&w=d', timeout_milliseconds := 90000);
    SELECT net.http_get(url := 'https://ujiiaqvwpnniaasdhyrb.supabase.co/functions/v1/backfill-portal-dokumente?token=backfill-portal-7f3k9q2v&batch=15&w=e', timeout_milliseconds := 90000);
    SELECT net.http_get(url := 'https://ujiiaqvwpnniaasdhyrb.supabase.co/functions/v1/backfill-portal-dokumente?token=backfill-portal-7f3k9q2v&batch=15&w=f', timeout_milliseconds := 90000);
  $cron$);
  
  RETURN jsonb_build_object('ok', true, 'job', 'backfill-portal-batch-a', 'schedule', '* * * * *', 'workers', 6);
END; $function$


CREATE OR REPLACE FUNCTION public.backfill_admin_stop()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  PERFORM cron.unschedule('backfill-portal-batch-a') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'backfill-portal-batch-a');
  RETURN jsonb_build_object('ok', true, 'stopped', 'backfill-portal-batch-a');
END; $function$


CREATE OR REPLACE FUNCTION public.backfill_reset_no_docs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE n int;
BEGIN
  UPDATE zvg_akte SET dokument_backfill_no_docs = false, dokument_backfill_started_at = NULL
  WHERE dokument_backfill_no_docs = true AND status != 'aufgehoben' AND termin >= NOW();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $function$


CREATE OR REPLACE FUNCTION public.backfill_status()
 RETURNS TABLE(ziel integer, mit_doks integer, markiert_ohne_doks integer, noch_zu_pruefen integer, prozent_geprueft numeric, in_arbeit integer, docs_letzte_5min integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH ziel_c AS (
    SELECT COUNT(*)::int AS total FROM zvg_akte a
    WHERE a.status != 'aufgehoben' AND a.zvg_portal_id IS NOT NULL AND a.termin >= NOW()
  ), erledigt_c AS (
    SELECT COUNT(DISTINCT d.zid)::int AS done FROM zvg_akte_dokumente d
    JOIN zvg_akte a ON a.zid = d.zid
    WHERE a.status != 'aufgehoben' AND a.zvg_portal_id IS NOT NULL AND a.termin >= NOW() AND d.art = 'anordnung'
  ), nodocs_c AS (
    SELECT COUNT(*)::int AS marked FROM zvg_akte
    WHERE status != 'aufgehoben' AND zvg_portal_id IS NOT NULL AND termin >= NOW() AND dokument_backfill_no_docs = true
  ), in_arbeit_c AS (
    SELECT COUNT(*)::int AS locked FROM zvg_akte a
    WHERE a.dokument_backfill_started_at > NOW() - INTERVAL '10 minutes'
      AND NOT EXISTS (SELECT 1 FROM zvg_akte_dokumente d WHERE d.zid = a.zid AND d.art = 'anordnung')
  ), docs5_c AS (
    SELECT COUNT(*)::int AS c FROM zvg_akte_dokumente
    WHERE source = 'zvg-portal.de' AND created_at > NOW() - INTERVAL '5 minutes'
  )
  SELECT z.total, e.done, n.marked, 
         GREATEST(0, z.total - e.done - n.marked),
         ROUND(100.0 * (e.done + n.marked) / NULLIF(z.total, 0), 1),
         p.locked, d5.c
  FROM ziel_c z, erledigt_c e, nodocs_c n, in_arbeit_c p, docs5_c d5;
END; $function$


CREATE OR REPLACE FUNCTION public.cleanup_note_attachments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    DECLARE
      payload jsonb;
      request_headers jsonb;
      auth_header text;
    BEGIN
      request_headers := coalesce(
        nullif(current_setting('request.headers', true), '')::jsonb,
        '{}'::jsonb
      );
      auth_header := request_headers ->> 'authorization';

      IF auth_header IS NULL OR auth_header = '' THEN
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;

        RETURN NEW;
      END IF;

      payload := jsonb_build_object(
        'old_record', OLD,
        'record', NEW,
        'type', TG_OP
      );

      PERFORM net.http_post(
        url := public.get_note_attachments_function_url(),
        body := payload,
        params := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type',
          'application/json',
          'Authorization',
          auth_header
        ),
        timeout_milliseconds := 10000
      );

      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;

      RETURN NEW;
    END;
    $function$


CREATE OR REPLACE FUNCTION public.derive_ag_email(p_name text, p_state text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  slug text;
BEGIN
  slug := derive_ag_slug(p_name);
  IF slug IS NULL OR slug = '' THEN RETURN NULL; END IF;
  RETURN CASE p_state
    WHEN 'BW' THEN 'poststelle@ag-' || slug || '.justiz.bwl.de'
    WHEN 'BE' THEN NULL  -- Berlin: Kontaktformular
    WHEN 'BY' THEN 'poststelle@ag-' || slug || '.bayern.de'
    WHEN 'HB' THEN 'office@amtsgericht.bremen.de'  -- Bremen zentral
    WHEN 'HE' THEN 'verwaltung@ag-' || slug || '.justiz.hessen.de'
    WHEN 'HH' THEN 'poststelle@ag-' || slug || '.justiz.hamburg.de'
    WHEN 'MV' THEN 'poststelle@ag-' || slug || '.mv-justiz.de'
    WHEN 'NI' THEN 'poststelle@ag-' || slug || '.niedersachsen.de'
    WHEN 'NW' THEN 'poststelle@ag-' || slug || '.nrw.de'
    WHEN 'RP' THEN 'poststelle@ag-' || slug || '.justiz.rlp.de'
    WHEN 'SH' THEN 'poststelle@ag-' || slug || '.landsh.de'
    WHEN 'SL' THEN 'poststelle@ag-' || slug || '.justiz.saarland.de'
    WHEN 'SN' THEN 'poststelle@ag-' || slug || '.justiz.sachsen.de'
    WHEN 'ST' THEN 'poststelle@ag-' || slug || '.justiz.sachsen-anhalt.de'
    WHEN 'TH' THEN 'poststelle@ag-' || slug || '.thueringen.de'
    ELSE NULL
  END;
END $function$


CREATE OR REPLACE FUNCTION public.derive_ag_slug(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  s text;
BEGIN
  s := regexp_replace(p_name, '^Amtsgericht\s+', '', 'i');
  s := replace(s, 'Ä', 'Ae');
  s := replace(s, 'Ö', 'Oe');
  s := replace(s, 'Ü', 'Ue');
  s := replace(s, 'ä', 'ae');
  s := replace(s, 'ö', 'oe');
  s := replace(s, 'ü', 'ue');
  s := replace(s, 'ß', 'ss');
  s := regexp_replace(s, '\(([^)]+)\)', ' \1', 'g');  -- Klammerinhalt entklammern
  s := regexp_replace(s, '[^A-Za-z0-9\s-]', '', 'g'); -- Sonderzeichen weg
  s := regexp_replace(s, '\s+', '-', 'g');             -- Spaces -> -
  s := regexp_replace(s, '-+', '-', 'g');              -- Mehrfach-Bindestriche
  s := trim(both '-' from lower(s));
  RETURN s;
END $function$


CREATE OR REPLACE FUNCTION public.generate_reply_token()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  chars text := 'abcdefghijkmnpqrstuvwxyz23456789';
  result text := '';
  i int;
BEGIN
  FOR i IN 1..22 LOOP
    result := result || substring(chars FROM (floor(random() * length(chars)) + 1)::int FOR 1);
  END LOOP;
  RETURN result;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_avatar_for_email(email text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare email_hash text;
declare gravatar_url text;
declare gravatar_status int8;
declare email_domain text;
declare favicon_url text;
declare domain_status int8;

begin
    -- Try to fetch a gravatar image
    email_hash = encode(extensions.digest(email, 'sha256'), 'hex');
    gravatar_url = concat('https://www.gravatar.com/avatar/', email_hash, '?d=404');

    select status from extensions.http_get(gravatar_url) into gravatar_status;

    if gravatar_status = 200 then
        return gravatar_url;
    end if;

    -- Fallback to email's domain favicon if not excluded
    email_domain = split_part(email, '@', 2);
    return get_domain_favicon(email_domain);
exception
    when others then
        return 'ERROR';
end;
$function$


CREATE OR REPLACE FUNCTION public.get_domain_favicon(domain_name text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare domain_status int8;

begin
    if exists (select from favicons_excluded_domains as fav where fav.domain = domain_name) then
        return null;
    end if;

    return concat(
        'https://favicon.show/',
        (regexp_matches(domain_name, '^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/?\n]+)', 'i'))[1]
    );
end;
$function$


CREATE OR REPLACE FUNCTION public.get_note_attachments_function_url()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
    DECLARE
      issuer text;
      function_url text;
    BEGIN
      issuer := coalesce(
        nullif(current_setting('request.jwt.claim.iss', true), ''),
        (
          coalesce(
            nullif(current_setting('request.jwt.claims', true), ''),
            '{}'
          )::jsonb ->> 'iss'
        )
      );
      issuer := nullif(issuer, '');
      IF issuer IS NOT NULL THEN
        issuer := rtrim(issuer, '/');
        IF right(issuer, 8) = '/auth/v1' THEN
          function_url :=
            left(issuer, length(issuer) - 8) || '/functions/v1/delete_note_attachments';

          IF function_url LIKE 'http://127.0.0.1:%' THEN
            RETURN replace(
              function_url,
              'http://127.0.0.1:',
              'http://host.docker.internal:'
            );
          END IF;

          IF function_url LIKE 'http://localhost:%' THEN
            RETURN replace(
              function_url,
              'http://localhost:',
              'http://host.docker.internal:'
            );
          END IF;

          RETURN function_url;
        END IF;
      END IF;

      RETURN 'http://host.docker.internal:54321/functions/v1/delete_note_attachments';
    END;
    $function$


CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email text)
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT au.id FROM auth.users au WHERE au.email = $1;
END;
$function$


CREATE OR REPLACE FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_query_trgm$function$


CREATE OR REPLACE FUNCTION public.gin_extract_value_trgm(text, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_value_trgm$function$


CREATE OR REPLACE FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_consistent$function$


CREATE OR REPLACE FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)
 RETURNS "char"
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_triconsistent$function$


CREATE OR REPLACE FUNCTION public.gtrgm_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_compress$function$


CREATE OR REPLACE FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_consistent$function$


CREATE OR REPLACE FUNCTION public.gtrgm_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_decompress$function$


CREATE OR REPLACE FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_distance$function$


CREATE OR REPLACE FUNCTION public.gtrgm_in(cstring)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_in$function$


CREATE OR REPLACE FUNCTION public.gtrgm_options(internal)
 RETURNS void
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE
AS '$libdir/pg_trgm', $function$gtrgm_options$function$


CREATE OR REPLACE FUNCTION public.gtrgm_out(gtrgm)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_out$function$


CREATE OR REPLACE FUNCTION public.gtrgm_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_penalty$function$


CREATE OR REPLACE FUNCTION public.gtrgm_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_picksplit$function$


CREATE OR REPLACE FUNCTION public.gtrgm_same(gtrgm, gtrgm, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_same$function$


CREATE OR REPLACE FUNCTION public.gtrgm_union(internal, internal)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_union$function$


CREATE OR REPLACE FUNCTION public.handle_company_saved()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare company_logo text;

begin
    if new.logo is not null then
        return new;
    end if;

    company_logo = get_domain_favicon(new.website);
    if company_logo is null then
        return new;
    end if;

    new.logo = concat('{"src":"', company_logo, '","title":"Company favicon"}');
    return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.handle_contact_note_created_or_updated()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.contacts set last_seen = new.date where contacts.id = new.contact_id and contacts.last_seen < new.date;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.handle_contact_saved()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$declare contact_avatar text;
declare emails_length int8;
declare item jsonb;

begin
    if new.avatar is not null then
        return new;
    end if;

    select coalesce(jsonb_array_length(new.email_jsonb), 0) into emails_length;

    if emails_length = 0 then
        return new;
    end if;

    for item in select jsonb_array_elements(new.email_jsonb)
    loop
        select public.get_avatar_for_email(item->>'email') into contact_avatar;
        if (contact_avatar is not null) then
            exit;
        end if;
    end loop;

    if contact_avatar is null then
        return new;
    end if;

    new.avatar = concat('{"src":"', contact_avatar, '"}');
    return new;
end;$function$


CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sales_count int;
begin
  select count(id) into sales_count
  from public.sales;

  insert into public.sales (first_name, last_name, email, user_id, administrator)
  values (
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    new.email,
    new.id,
    case when sales_count > 0 then FALSE else TRUE end
  );
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.handle_update_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.sales
  set
    first_name = coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    last_name = coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    email = new.email
  where user_id = new.id;

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.import_justizadressen_records(p_state_abbr text, p_records jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  r jsonb;
  v_id bigint;
  v_name text;
  v_xjustiz text;
  v_liefer text;
  v_post text;
  v_telefon text;
  v_fax text;
  v_internet text;
  v_internet2 text;
  v_email text;
  v_disclaimer text;
  v_city text;
  v_zip text;
  v_street text;
  v_lines text[];
  v_last text;
  v_match text[];
  matched int := 0;
  inserted int := 0;
  errors jsonb := '[]'::jsonb;
  summary jsonb := '[]'::jsonb;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_records) LOOP
    v_name      := r->>'name';
    v_xjustiz   := r->>'xjustiz_id';
    v_liefer    := r->>'lieferanschrift';
    v_post      := r->>'postanschrift';
    v_telefon   := r->>'telefon';
    v_fax       := r->>'fax';
    v_internet  := r->>'internet';
    v_internet2 := r->>'internet_2';
    v_email     := r->>'email';
    v_disclaimer:= r->>'mail_disclaimer';
    v_id := NULL;
    v_city := NULL;
    v_zip := NULL;
    v_street := NULL;

    -- Parse Lieferanschrift
    IF v_liefer IS NOT NULL THEN
      v_lines := string_to_array(v_liefer, E'\n');
      v_last := trim(v_lines[array_length(v_lines,1)]);
      v_match := regexp_match(v_last, '^(\d{5})\s+(.+)$');
      IF v_match IS NOT NULL THEN
        v_zip := v_match[1];
        v_city := v_match[2];
        IF array_length(v_lines,1) > 1 THEN
          v_street := array_to_string(v_lines[1:array_length(v_lines,1)-1], ', ');
        END IF;
      ELSE
        v_street := array_to_string(v_lines, ', ');
      END IF;
    END IF;

    -- Match 1: XJustiz-ID (eindeutig, bundesweit)
    IF v_xjustiz IS NOT NULL THEN
      SELECT id INTO v_id FROM companies WHERE xjustiz_id = v_xjustiz LIMIT 1;
    END IF;

    -- Match 2: exakter Name + state_abbr (case-insensitive, NFC-tolerant via normalize)
    IF v_id IS NULL THEN
      SELECT id INTO v_id
        FROM companies
       WHERE state_abbr = p_state_abbr
         AND (lower(name) = lower(v_name)
              OR lower(normalize(name, NFC)) = lower(normalize(v_name, NFC)))
       LIMIT 1;
    END IF;

    -- Match 3 ENTFERNT: kein city_part-Heuristik mehr (war zu aggressiv und überschrieb falsche Records)

    IF v_id IS NOT NULL THEN
      UPDATE companies SET
        xjustiz_id      = COALESCE(v_xjustiz, xjustiz_id),
        lieferanschrift = COALESCE(v_liefer, lieferanschrift),
        postanschrift   = COALESCE(v_post, postanschrift),
        phone_number    = COALESCE(v_telefon, phone_number),
        telefax         = COALESCE(v_fax, telefax),
        website         = COALESCE(v_internet, website),
        internet_2      = COALESCE(v_internet2, internet_2),
        email           = COALESCE(v_email, email),
        email_hinweis   = COALESCE(v_disclaimer, email_hinweis),
        email_quelle    = CASE WHEN v_email IS NOT NULL THEN 'justizadressen'
                               WHEN v_disclaimer IS NOT NULL THEN 'nicht_veroeffentlicht'
                               ELSE email_quelle END
      WHERE id = v_id;
      matched := matched + 1;
      summary := summary || jsonb_build_object('id', v_id, 'name', v_name, 'action', 'updated');
    ELSE
      INSERT INTO companies (
        name, sector, state_abbr, city, zipcode, address,
        xjustiz_id, lieferanschrift, postanschrift, phone_number, telefax,
        website, internet_2, email, email_hinweis, email_quelle
      ) VALUES (
        v_name, 'Amtsgericht', p_state_abbr, v_city, v_zip, v_street,
        v_xjustiz, v_liefer, v_post, v_telefon, v_fax,
        v_internet, v_internet2, v_email, v_disclaimer,
        CASE WHEN v_email IS NOT NULL THEN 'justizadressen'
             WHEN v_disclaimer IS NOT NULL THEN 'nicht_veroeffentlicht'
             ELSE NULL END
      ) RETURNING id INTO v_id;
      inserted := inserted + 1;
      summary := summary || jsonb_build_object('id', v_id, 'name', v_name, 'action', 'inserted');
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'state_abbr', p_state_abbr,
    'matched', matched,
    'inserted', inserted,
    'errors', errors,
    'summary', summary
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return exists (
    select 1 from public.sales where user_id = auth.uid() and administrator = true
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.lowercase_email_jsonb()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email_jsonb IS NOT NULL THEN
    NEW.email_jsonb = COALESCE((
      SELECT jsonb_agg(
        jsonb_set(elem, '{email}', to_jsonb(LOWER(elem->>'email')))
      )
      FROM jsonb_array_elements(NEW.email_jsonb) AS elem
    ), '[]'::jsonb);
  END IF;
  RETURN NEW;
END;
$function$



CREATE OR REPLACE FUNCTION public.merge_contacts(loser_id bigint, winner_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  winner_contact contacts%ROWTYPE;
  loser_contact contacts%ROWTYPE;
  deal_record RECORD;
  merged_emails jsonb;
  merged_phones jsonb;
  merged_tags bigint[];
  winner_emails jsonb;
  loser_emails jsonb;
  winner_phones jsonb;
  loser_phones jsonb;
  email_map jsonb;
  phone_map jsonb;
BEGIN
  -- Fetch both contacts
  SELECT * INTO winner_contact FROM contacts WHERE id = winner_id;
  SELECT * INTO loser_contact FROM contacts WHERE id = loser_id;

  IF winner_contact IS NULL OR loser_contact IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- 1. Reassign tasks from loser to winner
  UPDATE tasks SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 2. Reassign contact notes from loser to winner
  UPDATE contact_notes SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 3. Update deals - replace loser with winner in contact_ids array
  FOR deal_record IN
    SELECT id, contact_ids
    FROM deals
    WHERE contact_ids @> ARRAY[loser_id]
  LOOP
    UPDATE deals
    SET contact_ids = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(
          array_remove(deal_record.contact_ids, loser_id) || ARRAY[winner_id]
        )
      )
    )
    WHERE id = deal_record.id;
  END LOOP;

  -- 4. Merge contact data

  -- Get email arrays
  winner_emails := COALESCE(winner_contact.email_jsonb, '[]'::jsonb);
  loser_emails := COALESCE(loser_contact.email_jsonb, '[]'::jsonb);

  -- Merge emails with deduplication by email address
  -- Build a map of email -> email object, then convert back to array
  email_map := '{}'::jsonb;

  -- Add winner emails to map
  IF jsonb_array_length(winner_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_emails)-1 LOOP
      email_map := email_map || jsonb_build_object(
        winner_emails->i->>'email',
        winner_emails->i
      );
    END LOOP;
  END IF;

  -- Add loser emails to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_emails)-1 LOOP
      IF NOT email_map ? (loser_emails->i->>'email') THEN
        email_map := email_map || jsonb_build_object(
          loser_emails->i->>'email',
          loser_emails->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_emails := (SELECT jsonb_agg(value) FROM jsonb_each(email_map));
  merged_emails := COALESCE(merged_emails, '[]'::jsonb);

  -- Get phone arrays
  winner_phones := COALESCE(winner_contact.phone_jsonb, '[]'::jsonb);
  loser_phones := COALESCE(loser_contact.phone_jsonb, '[]'::jsonb);

  -- Merge phones with deduplication by number
  phone_map := '{}'::jsonb;

  -- Add winner phones to map
  IF jsonb_array_length(winner_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_phones)-1 LOOP
      phone_map := phone_map || jsonb_build_object(
        winner_phones->i->>'number',
        winner_phones->i
      );
    END LOOP;
  END IF;

  -- Add loser phones to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_phones)-1 LOOP
      IF NOT phone_map ? (loser_phones->i->>'number') THEN
        phone_map := phone_map || jsonb_build_object(
          loser_phones->i->>'number',
          loser_phones->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_phones := (SELECT jsonb_agg(value) FROM jsonb_each(phone_map));
  merged_phones := COALESCE(merged_phones, '[]'::jsonb);

  -- Merge tags (remove duplicates)
  merged_tags := ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(winner_contact.tags, ARRAY[]::bigint[]) ||
      COALESCE(loser_contact.tags, ARRAY[]::bigint[])
    )
  );

  -- 5. Update winner with merged data
  UPDATE contacts SET
    avatar = COALESCE(winner_contact.avatar, loser_contact.avatar),
    gender = COALESCE(winner_contact.gender, loser_contact.gender),
    first_name = COALESCE(winner_contact.first_name, loser_contact.first_name),
    last_name = COALESCE(winner_contact.last_name, loser_contact.last_name),
    title = COALESCE(winner_contact.title, loser_contact.title),
    company_id = COALESCE(winner_contact.company_id, loser_contact.company_id),
    email_jsonb = merged_emails,
    phone_jsonb = merged_phones,
    linkedin_url = COALESCE(winner_contact.linkedin_url, loser_contact.linkedin_url),
    background = COALESCE(winner_contact.background, loser_contact.background),
    has_newsletter = COALESCE(winner_contact.has_newsletter, loser_contact.has_newsletter),
    first_seen = LEAST(COALESCE(winner_contact.first_seen, loser_contact.first_seen), COALESCE(loser_contact.first_seen, winner_contact.first_seen)),
    last_seen = GREATEST(COALESCE(winner_contact.last_seen, loser_contact.last_seen), COALESCE(loser_contact.last_seen, winner_contact.last_seen)),
    sales_id = COALESCE(winner_contact.sales_id, loser_contact.sales_id),
    tags = merged_tags
  WHERE id = winner_id;

  -- 6. Delete loser contact
  DELETE FROM contacts WHERE id = loser_id;

  RETURN winner_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.my_sales_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT id FROM public.sales WHERE user_id = auth.uid() LIMIT 1;
$function$


CREATE OR REPLACE FUNCTION public.normalize_az(p_az text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v_clean text;
  v_match text[];
  v_abt text;
  v_lfd text;
  v_jahr text;
BEGIN
  IF p_az IS NULL OR btrim(p_az) = '' THEN RETURN p_az; END IF;
  v_clean := regexp_replace(p_az, '\s+', ' ', 'g');
  v_clean := btrim(v_clean);
  -- Doppeltes K reduzieren (ohne word boundary — PG-POSIX interpretiert das anders als erwartet)
  v_clean := regexp_replace(v_clean, 'K\s+K\s', 'K ', 'g');
  
  v_match := regexp_match(v_clean, '^(\d+)\s+K\s+(\d+)\s*[/\-]\s*(\d{2,4})$');
  IF v_match IS NOT NULL THEN
    v_abt := ltrim(v_match[1], '0');
    IF v_abt = '' THEN v_abt := '0'; END IF;
    v_lfd := ltrim(v_match[2], '0');
    IF v_lfd = '' THEN v_lfd := '0'; END IF;
    v_jahr := v_match[3];
    IF length(v_jahr) = 4 THEN v_jahr := substring(v_jahr from 3); END IF;
    RETURN v_abt || ' K ' || v_lfd || '/' || v_jahr;
  END IF;
  
  v_match := regexp_match(v_clean, '^K\s+(\d+)\s*[/\-]\s*(\d{2,4})$');
  IF v_match IS NOT NULL THEN
    v_lfd := ltrim(v_match[1], '0');
    IF v_lfd = '' THEN v_lfd := '0'; END IF;
    v_jahr := v_match[2];
    IF length(v_jahr) = 4 THEN v_jahr := substring(v_jahr from 3); END IF;
    RETURN 'K ' || v_lfd || '/' || v_jahr;
  END IF;
  
  v_match := regexp_match(v_clean, '^(\d+[a-zA-Z]?)\s+K\s+(\d+)\s*[/\-]\s*(\d{2,4})$');
  IF v_match IS NOT NULL THEN
    v_abt := v_match[1];
    v_lfd := ltrim(v_match[2], '0');
    IF v_lfd = '' THEN v_lfd := '0'; END IF;
    v_jahr := v_match[3];
    IF length(v_jahr) = 4 THEN v_jahr := substring(v_jahr from 3); END IF;
    RETURN v_abt || ' K ' || v_lfd || '/' || v_jahr;
  END IF;
  
  RETURN v_clean;
END;
$function$


CREATE OR REPLACE FUNCTION public.parse_justizadressen_html(p_html text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_blocks text[]; v_block text;
  v_records jsonb := '[]'::jsonb;
  v_name text; v_xjustiz text; v_email text; v_telefon text; v_fax text;
  v_internet text; v_liefer text; v_post text; v_disclaimer text;
  v_match text[]; v_pager text;
BEGIN
  v_match := regexp_match(p_html, '«\s*(\d+)\s*/\s*(\d+)\s*»');
  IF v_match IS NOT NULL THEN v_pager := v_match[1] || '/' || v_match[2]; END IF;
  
  v_blocks := regexp_split_to_array(p_html, '<h6[^>]*>(?=Amtsgericht\s)');
  IF array_length(v_blocks, 1) IS NULL OR array_length(v_blocks, 1) < 2 THEN
    RETURN jsonb_build_object('count', 0, 'pager', v_pager, 'records', '[]'::jsonb);
  END IF;
  
  FOR i IN 2..array_length(v_blocks, 1) LOOP
    v_block := v_blocks[i];
    v_name := NULL; v_xjustiz := NULL; v_email := NULL; v_telefon := NULL;
    v_fax := NULL; v_internet := NULL; v_liefer := NULL; v_post := NULL; v_disclaimer := NULL;
    
    v_match := regexp_match(v_block, '^([^<]+)</h6>');
    IF v_match IS NOT NULL THEN v_name := btrim(v_match[1]); END IF;
    
    v_match := regexp_match(v_block, '<strong>Lieferanschrift</strong>([\s\S]+?)</address>');
    IF v_match IS NOT NULL THEN
      v_liefer := regexp_replace(v_match[1], '<[^>]+>', E'\n', 'g');
      v_liefer := regexp_replace(v_liefer, '[ \t]+', ' ', 'g');
      v_liefer := regexp_replace(v_liefer, '(^| )\n', E'\n', 'g');
      v_liefer := btrim(regexp_replace(v_liefer, '\n+', E'\n', 'g'), E' \n\t');
    END IF;
    
    v_match := regexp_match(v_block, '<strong>Postanschrift</strong>([\s\S]+?)</address>');
    IF v_match IS NOT NULL THEN
      v_post := regexp_replace(v_match[1], '<[^>]+>', E'\n', 'g');
      v_post := regexp_replace(v_post, '[ \t]+', ' ', 'g');
      v_post := regexp_replace(v_post, '(^| )\n', E'\n', 'g');
      v_post := btrim(regexp_replace(v_post, '\n+', E'\n', 'g'), E' \n\t');
    END IF;
    
    v_match := regexp_match(v_block, '<span>XJustiz-ID:</span>\s*([A-Z0-9]+)');
    IF v_match IS NOT NULL THEN v_xjustiz := v_match[1]; END IF;
    
    v_match := regexp_match(v_block, 'mailto:([^"]+)"');
    IF v_match IS NOT NULL THEN v_email := v_match[1]; END IF;
    
    v_match := regexp_match(v_block, '<span>Telefon:</span>\s*([^<]+?)\s*<br');
    IF v_match IS NOT NULL THEN v_telefon := btrim(v_match[1]); END IF;
    
    v_match := regexp_match(v_block, '<span>Fax:</span>\s*([^<]+?)\s*<br');
    IF v_match IS NOT NULL THEN v_fax := btrim(v_match[1]); END IF;
    
    v_match := regexp_match(v_block, '<span>Internet:</span>\s*<a[^>]*href="([^"]+)"');
    IF v_match IS NOT NULL THEN v_internet := v_match[1]; END IF;
    
    IF v_block ILIKE '%Mailadresse nur für Verwaltungsangelegenheiten%' THEN
      v_disclaimer := 'Mailadresse nur für Verwaltungsangelegenheiten; nicht in Rechtssachen';
    END IF;
    
    -- Zweigstellen ohne xjustiz_id (Hauptstandort behält die ID)
    IF v_name ILIKE '%Zweigstelle%' THEN v_xjustiz := NULL; END IF;
    
    IF v_name IS NOT NULL THEN
      v_records := v_records || jsonb_build_object(
        'name', v_name, 'xjustiz_id', v_xjustiz,
        'lieferanschrift', v_liefer, 'postanschrift', v_post,
        'email', v_email, 'telefon', v_telefon, 'fax', v_fax,
        'internet', v_internet, 'mail_disclaimer', v_disclaimer
      );
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object('count', jsonb_array_length(v_records), 'pager', v_pager, 'records', v_records);
END;
$function$


CREATE OR REPLACE FUNCTION public.refresh_zvg_akte_dokumente_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_zid text;
BEGIN
  target_zid := COALESCE(NEW.zid, OLD.zid);
  IF target_zid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE zvg_akte
  SET dokumente_count = (SELECT COUNT(*) FROM zvg_akte_dokumente WHERE zid = target_zid)
  WHERE zid = target_zid;
  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.refresh_zvg_akte_fotos_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_zid text;
BEGIN
  target_zid := COALESCE(NEW.zid, OLD.zid);
  IF target_zid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE zvg_akte
  SET fotos_count = (SELECT COUNT(*) FROM zvg_akte_bild WHERE zid = target_zid AND NOT hidden)
  WHERE zid = target_zid;
  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.refresh_zvg_akte_hat_gutachten()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_zid text;
BEGIN
  target_zid := COALESCE(NEW.zid, OLD.zid);
  IF target_zid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE zvg_akte SET
    hat_gutachten_lokal = EXISTS (SELECT 1 FROM zvg_akte_dokumente WHERE zid = target_zid AND art = 'gutachten'),
    hat_expose_lokal    = EXISTS (SELECT 1 FROM zvg_akte_dokumente WHERE zid = target_zid AND art = 'expose')
  WHERE zid = target_zid;
  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.refresh_zvg_akte_letzte_anfrage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_zid text;
BEGIN
  target_zid := COALESCE(NEW.zid, OLD.zid);
  IF target_zid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  UPDATE zvg_akte a SET
    letzte_anfrage_id     = sub.id,
    letzte_anfrage_status = sub.status,
    letzte_anfrage_am     = COALESCE(sub.antwort_eingegangen_am, sub.gesendet_am, sub.created_at),
    letzte_anfrage_option = sub.antwort_option
  FROM (
    SELECT id, status, antwort_eingegangen_am, gesendet_am, antwort_option, created_at
    FROM zvg_anfrage
    WHERE zid = target_zid
    ORDER BY id DESC
    LIMIT 1
  ) AS sub
  WHERE a.zid = target_zid;

  -- Falls keine Anfrage mehr existiert (Delete des letzten), Felder leeren
  IF NOT EXISTS (SELECT 1 FROM zvg_anfrage WHERE zid = target_zid) THEN
    UPDATE zvg_akte SET
      letzte_anfrage_id = NULL,
      letzte_anfrage_status = NULL,
      letzte_anfrage_am = NULL,
      letzte_anfrage_option = NULL
    WHERE zid = target_zid;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.reserve_backfill_akten(p_limit integer DEFAULT 20)
 RETURNS TABLE(zid text, az text, zvg_portal_id integer, zvg_portal_land_abk text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH cte AS (
    SELECT a.zid FROM zvg_akte a
    WHERE a.status != 'aufgehoben'
      AND a.zvg_portal_id IS NOT NULL
      AND a.termin >= NOW()
      AND (a.dokument_backfill_no_docs = false OR a.dokument_backfill_no_docs IS NULL)
      AND (a.dokument_backfill_started_at IS NULL OR a.dokument_backfill_started_at < NOW() - INTERVAL '10 minutes')
      AND NOT EXISTS (SELECT 1 FROM zvg_akte_dokumente d WHERE d.zid = a.zid AND d.art = 'anordnung')
    ORDER BY a.termin ASC LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE zvg_akte u SET dokument_backfill_started_at = NOW()
  FROM cte WHERE u.zid = cte.zid
  RETURNING u.zid, u.az, u.zvg_portal_id, u.zvg_portal_land_abk;
END; $function$


CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$


CREATE OR REPLACE FUNCTION public.scrape_justizadressen_page(p_lkz text, p_s integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_url text;
  v_req_id bigint;
  v_html text;
  v_status int;
  v_attempts int := 0;
  v_record_match text[];
  v_blocks text[];
  v_block text;
  v_records jsonb := '[]'::jsonb;
  v_rec jsonb;
  v_name text;
  v_xjustiz text;
  v_email text;
  v_telefon text;
  v_fax text;
  v_internet text;
  v_liefer text;
  v_post text;
  v_disclaimer text;
  v_pager text;
  v_max_page int := 1;
  v_addr_match text[];
BEGIN
  IF p_s IS NULL THEN
    v_url := 'https://www.justizadressen.nrw.de/de/justiz/behoerden?typ=2&plz=&ort=&lkz=' || p_lkz;
  ELSE
    v_url := 'https://www.justizadressen.nrw.de/de/justiz/behoerden?typ=2&plz=&ort=&lkz=' || p_lkz || '&s=' || p_s;
  END IF;
  
  SELECT net.http_get(url := v_url, headers := '{"User-Agent":"Mozilla/5.0"}'::jsonb) INTO v_req_id;
  
  LOOP
    PERFORM pg_sleep(1);
    SELECT status_code, content INTO v_status, v_html FROM net._http_response WHERE id = v_req_id;
    v_attempts := v_attempts + 1;
    EXIT WHEN v_status IS NOT NULL;
    EXIT WHEN v_attempts >= 30;
  END LOOP;
  
  IF v_status IS NULL OR v_status != 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'http_status', 'status', v_status);
  END IF;
  
  v_record_match := regexp_match(v_html, '«\s*(\d+)\s*/\s*(\d+)\s*»');
  IF v_record_match IS NOT NULL THEN
    v_max_page := v_record_match[2]::int;
    v_pager := v_record_match[1] || '/' || v_record_match[2];
  END IF;
  
  -- Blocks: trenne an <h6>...</h6> aber behalte den Namen im Block
  v_blocks := regexp_split_to_array(v_html, '<h6[^>]*>(?=Amtsgericht\s)');
  
  IF array_length(v_blocks, 1) IS NULL OR array_length(v_blocks, 1) < 2 THEN
    RETURN jsonb_build_object('ok', true, 'lkz', p_lkz, 's', p_s, 'pager', v_pager, 'count', 0, 'records', '[]'::jsonb, 'html_len', length(v_html));
  END IF;
  
  FOR i IN 2..array_length(v_blocks, 1) LOOP
    v_block := v_blocks[i];
    v_name := NULL; v_xjustiz := NULL; v_email := NULL; v_telefon := NULL;
    v_fax := NULL; v_internet := NULL; v_liefer := NULL; v_post := NULL; v_disclaimer := NULL;
    
    -- Name aus erstem </h6>
    v_record_match := regexp_match(v_block, '^([^<]+)</h6>');
    IF v_record_match IS NOT NULL THEN
      v_name := btrim(regexp_replace(v_record_match[1], '&[a-z]+;', ' ', 'g'));
    END IF;
    
    -- Lieferanschrift: <strong>Lieferanschrift</strong><br>...<br>...
    v_addr_match := regexp_match(v_block, '<strong>Lieferanschrift</strong><br[^>]*>\s*([^<]+(?:<br[^>]*>\s*[^<]+)*)\s*<br[^>]*>\s*(?:</address>|<address>)');
    IF v_addr_match IS NOT NULL THEN
      v_liefer := btrim(regexp_replace(regexp_replace(v_addr_match[1], '<br[^>]*>', E'\n', 'g'), '\s+', ' ', 'g'));
      -- Newlines wieder einsetzen
      v_liefer := regexp_replace(v_addr_match[1], '<br[^>]*>', E'\n', 'g');
      v_liefer := btrim(regexp_replace(v_liefer, '[ \t]+', ' ', 'g'));
    END IF;
    
    -- Postanschrift
    v_addr_match := regexp_match(v_block, '<strong>Postanschrift</strong><br[^>]*>\s*([^<]+(?:<br[^>]*>\s*[^<]+)*)\s*<br[^>]*>');
    IF v_addr_match IS NOT NULL THEN
      v_post := regexp_replace(v_addr_match[1], '<br[^>]*>', E'\n', 'g');
      v_post := btrim(regexp_replace(v_post, '[ \t]+', ' ', 'g'));
    END IF;
    
    -- XJustiz-ID
    v_record_match := regexp_match(v_block, '<span>XJustiz-ID:</span>\s*([A-Z0-9]+)');
    IF v_record_match IS NOT NULL THEN v_xjustiz := v_record_match[1]; END IF;
    
    -- E-Mail
    v_record_match := regexp_match(v_block, 'mailto:([^"]+)"');
    IF v_record_match IS NOT NULL THEN v_email := v_record_match[1]; END IF;
    
    -- Telefon
    v_record_match := regexp_match(v_block, '<span>Telefon:</span>\s*([^<]+?)\s*<br');
    IF v_record_match IS NOT NULL THEN v_telefon := btrim(v_record_match[1]); END IF;
    
    -- Fax
    v_record_match := regexp_match(v_block, '<span>Fax:</span>\s*([^<]+?)\s*<br');
    IF v_record_match IS NOT NULL THEN v_fax := btrim(v_record_match[1]); END IF;
    
    -- Internet
    v_record_match := regexp_match(v_block, '<span>Internet:</span>\s*<a[^>]*href="([^"]+)"');
    IF v_record_match IS NOT NULL THEN v_internet := v_record_match[1]; END IF;
    
    -- Disclaimer
    IF v_block ILIKE '%Mailadresse nur für Verwaltungsangelegenheiten%' THEN
      v_disclaimer := 'Mailadresse nur für Verwaltungsangelegenheiten; nicht in Rechtssachen';
    END IF;
    
    IF v_name IS NOT NULL THEN
      v_rec := jsonb_build_object(
        'name', v_name,
        'xjustiz_id', v_xjustiz,
        'lieferanschrift', v_liefer,
        'postanschrift', v_post,
        'email', v_email,
        'telefon', v_telefon,
        'fax', v_fax,
        'internet', v_internet,
        'mail_disclaimer', v_disclaimer
      );
      v_records := v_records || v_rec;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'ok', true,
    'lkz', p_lkz,
    's', p_s,
    'pager', v_pager,
    'max_page', v_max_page,
    'count', jsonb_array_length(v_records),
    'records', v_records
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.set_limit(real)
 RETURNS real
 LANGUAGE c
 STRICT
AS '$libdir/pg_trgm', $function$set_limit$function$


CREATE OR REPLACE FUNCTION public.set_sales_id_default()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.sales_id IS NULL THEN
    SELECT id INTO NEW.sales_id FROM sales WHERE user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end; $function$


CREATE OR REPLACE FUNCTION public.show_limit()
 RETURNS real
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_limit$function$


CREATE OR REPLACE FUNCTION public.show_trgm(text)
 RETURNS text[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_trgm$function$


CREATE OR REPLACE FUNCTION public.similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity$function$


CREATE OR REPLACE FUNCTION public.similarity_dist(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_dist$function$


CREATE OR REPLACE FUNCTION public.similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_op$function$


CREATE OR REPLACE FUNCTION public.strict_word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity$function$


CREATE OR REPLACE FUNCTION public.strict_word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_commutator_op$function$


CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_commutator_op$function$


CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_op$function$


CREATE OR REPLACE FUNCTION public.strict_word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_op$function$


CREATE OR REPLACE FUNCTION public.word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity$function$


CREATE OR REPLACE FUNCTION public.word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_commutator_op$function$


CREATE OR REPLACE FUNCTION public.word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_commutator_op$function$


CREATE OR REPLACE FUNCTION public.word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_op$function$


CREATE OR REPLACE FUNCTION public.word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_op$function$


CREATE OR REPLACE FUNCTION public.zvg_akte_az_normalize_trg()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.az IS NOT NULL THEN
    NEW.az := normalize_az(NEW.az);
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.zvg_akte_dokumente_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.zvg_akte_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.zvg_akte_sync_state_abbr()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.ag_company_id IS NOT NULL THEN
    SELECT c.state_abbr INTO NEW.state_abbr
    FROM public.companies c WHERE c.id = NEW.ag_company_id;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.zvg_anfrage_block_aufgehoben()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_akte_status text;
BEGIN
  IF NEW.status IN ('entwurf', 'gesendet') THEN
    SELECT status INTO v_akte_status FROM zvg_akte WHERE zid = NEW.zid;
    IF v_akte_status = 'aufgehoben' THEN
      RAISE EXCEPTION 'Versteigerungstermin ist aufgehoben — Statusanfrage nicht möglich (zid=%, az=%)', NEW.zid, (SELECT az FROM zvg_akte WHERE zid = NEW.zid);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.zvg_anfrage_check_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_can BOOLEAN;
  v_sperre TIMESTAMPTZ;
BEGIN
  IF NEW.status = 'gesendet' AND COALESCE(OLD.status,'') <> 'gesendet' AND NEW.override_rate_limit = false THEN
    SELECT kann_senden, sperre_bis INTO v_can, v_sperre
      FROM public.zvg_anfrage_kann_senden(NEW.ag_company_id);
    IF v_can = false THEN
      RAISE EXCEPTION 'Rate-Limit verletzt: An dieses AG ging bereits in den letzten 7 Tagen eine Anfrage. Sperre läuft bis %. Override mit override_rate_limit=true möglich.', v_sperre;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.zvg_anfrage_kann_senden(p_ag_company_id bigint)
 RETURNS TABLE(kann_senden boolean, letzte_anfrage_am timestamp with time zone, letzte_anfrage_zid text, sperre_bis timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  WITH letzte AS (
    SELECT gesendet_am, zid
    FROM public.zvg_anfrage
    WHERE ag_company_id = p_ag_company_id
      AND status IN ('gesendet','beantwortet')
      AND gesendet_am IS NOT NULL
    ORDER BY gesendet_am DESC
    LIMIT 1
  )
  SELECT
    CASE WHEN l.gesendet_am IS NULL OR l.gesendet_am < now() - INTERVAL '7 days' THEN true ELSE false END AS kann_senden,
    l.gesendet_am AS letzte_anfrage_am,
    l.zid AS letzte_anfrage_zid,
    CASE WHEN l.gesendet_am IS NOT NULL THEN l.gesendet_am + INTERVAL '7 days' ELSE NULL END AS sperre_bis
  FROM (SELECT NULL::timestamptz AS gesendet_am, NULL::text AS zid UNION ALL SELECT gesendet_am, zid FROM letzte) l
  ORDER BY l.gesendet_am DESC NULLS LAST
  LIMIT 1;
$function$


CREATE OR REPLACE FUNCTION public.zvg_anfrage_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


--
-- 6. TRIGGERS
--
CREATE TRIGGER rebuild_netlify_on_brw_change AFTER INSERT OR DELETE OR UPDATE ON public.brw_history FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://api.netlify.com/build_hooks/6a0f39bb6e0a45859f1b1370', 'POST', '{"Content-type":"application/json"}', '{}', '5000');
CREATE TRIGGER rebuild_netlify_on_cluster_change AFTER INSERT OR DELETE OR UPDATE ON public.cluster FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://api.netlify.com/build_hooks/6a0f39bb6e0a45859f1b1370', 'POST', '{"Content-type":"application/json"}', '{}', '5000');
CREATE TRIGGER trg_cluster_updated_at BEFORE UPDATE ON public.cluster FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER company_saved BEFORE INSERT OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION handle_company_saved();
CREATE TRIGGER set_company_sales_id_trigger BEFORE INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION set_sales_id_default();
CREATE TRIGGER on_contact_notes_attachments_updated_delete_note_attachments AFTER UPDATE ON public.contact_notes FOR EACH ROW WHEN ((old.attachments IS DISTINCT FROM new.attachments)) EXECUTE FUNCTION cleanup_note_attachments();
CREATE TRIGGER on_contact_notes_deleted_delete_note_attachments AFTER DELETE ON public.contact_notes FOR EACH ROW EXECUTE FUNCTION cleanup_note_attachments();
CREATE TRIGGER on_public_contact_notes_created_or_updated AFTER INSERT ON public.contact_notes FOR EACH ROW EXECUTE FUNCTION handle_contact_note_created_or_updated();
CREATE TRIGGER set_contact_notes_sales_id_trigger BEFORE INSERT ON public.contact_notes FOR EACH ROW EXECUTE FUNCTION set_sales_id_default();
CREATE TRIGGER "10_lowercase_contact_emails" BEFORE INSERT OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION lowercase_email_jsonb();
CREATE TRIGGER "20_contact_saved" BEFORE INSERT OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION handle_contact_saved();
CREATE TRIGGER set_contact_sales_id_trigger BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION set_sales_id_default();
CREATE TRIGGER on_deal_notes_attachments_updated_delete_note_attachments AFTER UPDATE ON public.deal_notes FOR EACH ROW WHEN ((old.attachments IS DISTINCT FROM new.attachments)) EXECUTE FUNCTION cleanup_note_attachments();
CREATE TRIGGER on_deal_notes_deleted_delete_note_attachments AFTER DELETE ON public.deal_notes FOR EACH ROW EXECUTE FUNCTION cleanup_note_attachments();
CREATE TRIGGER set_deal_notes_sales_id_trigger BEFORE INSERT ON public.deal_notes FOR EACH ROW EXECUTE FUNCTION set_sales_id_default();
CREATE TRIGGER set_deal_sales_id_trigger BEFORE INSERT ON public.deals FOR EACH ROW EXECUTE FUNCTION set_sales_id_default();
CREATE TRIGGER kleinanzeigen_grundstueck_updated_at BEFORE UPDATE ON public.kleinanzeigen_grundstueck FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER rebuild_netlify_on_objekt_change AFTER INSERT OR DELETE OR UPDATE ON public.objekt FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://api.netlify.com/build_hooks/6a0f39bb6e0a45859f1b1370', 'POST', '{"Content-type":"application/json"}', '{}', '5000');
CREATE TRIGGER trg_objekt_updated_at BEFORE UPDATE ON public.objekt FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_task_sales_id_trigger BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION set_sales_id_default();
CREATE TRIGGER zvg_akte_az_normalize BEFORE INSERT OR UPDATE OF az ON public.zvg_akte FOR EACH ROW EXECUTE FUNCTION zvg_akte_az_normalize_trg();
CREATE TRIGGER zvg_akte_sync_state_abbr_trigger BEFORE INSERT OR UPDATE OF ag_company_id ON public.zvg_akte FOR EACH ROW EXECUTE FUNCTION zvg_akte_sync_state_abbr();
CREATE TRIGGER zvg_akte_updated_at_trg BEFORE UPDATE ON public.zvg_akte FOR EACH ROW EXECUTE FUNCTION zvg_akte_set_updated_at();
CREATE TRIGGER trg_refresh_fotos_count_del AFTER DELETE ON public.zvg_akte_bild FOR EACH ROW EXECUTE FUNCTION refresh_zvg_akte_fotos_count();
CREATE TRIGGER trg_refresh_fotos_count_ins AFTER INSERT ON public.zvg_akte_bild FOR EACH ROW EXECUTE FUNCTION refresh_zvg_akte_fotos_count();
CREATE TRIGGER trg_refresh_fotos_count_upd AFTER UPDATE OF hidden, zid ON public.zvg_akte_bild FOR EACH ROW EXECUTE FUNCTION refresh_zvg_akte_fotos_count();
CREATE TRIGGER trg_refresh_dokumente_count_del AFTER DELETE ON public.zvg_akte_dokumente FOR EACH ROW EXECUTE FUNCTION refresh_zvg_akte_dokumente_count();
CREATE TRIGGER trg_refresh_dokumente_count_ins AFTER INSERT ON public.zvg_akte_dokumente FOR EACH ROW EXECUTE FUNCTION refresh_zvg_akte_dokumente_count();
CREATE TRIGGER trg_refresh_dokumente_count_upd AFTER UPDATE OF zid ON public.zvg_akte_dokumente FOR EACH ROW EXECUTE FUNCTION refresh_zvg_akte_dokumente_count();
CREATE TRIGGER trg_refresh_hat_gutachten_del AFTER DELETE ON public.zvg_akte_dokumente FOR EACH ROW EXECUTE FUNCTION refresh_zvg_akte_hat_gutachten();
CREATE TRIGGER trg_refresh_hat_gutachten_ins AFTER INSERT ON public.zvg_akte_dokumente FOR EACH ROW EXECUTE FUNCTION refresh_zvg_akte_hat_gutachten();
CREATE TRIGGER trg_refresh_hat_gutachten_upd AFTER UPDATE OF art, zid ON public.zvg_akte_dokumente FOR EACH ROW EXECUTE FUNCTION refresh_zvg_akte_hat_gutachten();
CREATE TRIGGER zvg_akte_dokumente_updated_at_trigger BEFORE UPDATE ON public.zvg_akte_dokumente FOR EACH ROW EXECUTE FUNCTION zvg_akte_dokumente_set_updated_at();
CREATE TRIGGER trg_refresh_letzte_anfrage_del AFTER DELETE ON public.zvg_anfrage FOR EACH ROW EXECUTE FUNCTION refresh_zvg_akte_letzte_anfrage();
CREATE TRIGGER trg_refresh_letzte_anfrage_ins AFTER INSERT ON public.zvg_anfrage FOR EACH ROW EXECUTE FUNCTION refresh_zvg_akte_letzte_anfrage();
CREATE TRIGGER trg_refresh_letzte_anfrage_upd AFTER UPDATE OF status, antwort_eingegangen_am, gesendet_am, antwort_option ON public.zvg_anfrage FOR EACH ROW EXECUTE FUNCTION refresh_zvg_akte_letzte_anfrage();
CREATE TRIGGER zvg_anfrage_block_aufgehoben_trg BEFORE INSERT OR UPDATE ON public.zvg_anfrage FOR EACH ROW EXECUTE FUNCTION zvg_anfrage_block_aufgehoben();
CREATE TRIGGER zvg_anfrage_rate_limit_trigger BEFORE INSERT OR UPDATE OF status ON public.zvg_anfrage FOR EACH ROW EXECUTE FUNCTION zvg_anfrage_check_rate_limit();
CREATE TRIGGER zvg_anfrage_updated_at_trigger BEFORE UPDATE ON public.zvg_anfrage FOR EACH ROW EXECUTE FUNCTION zvg_anfrage_set_updated_at();

--
-- 7. VIEWS
--
CREATE OR REPLACE VIEW public.activity_log AS  SELECT ('company.'::text || c.id) || '.created'::text AS id,
    'company.created'::text AS type,
    c.created_at AS date,
    c.id AS company_id,
    c.sales_id,
    to_json(c.*) AS company,
    NULL::json AS contact,
    NULL::json AS deal,
    NULL::json AS contact_note,
    NULL::json AS deal_note
   FROM companies c
UNION ALL
 SELECT ('contact.'::text || co.id) || '.created'::text AS id,
    'contact.created'::text AS type,
    co.first_seen AS date,
    co.company_id,
    co.sales_id,
    NULL::json AS company,
    to_json(co.*) AS contact,
    NULL::json AS deal,
    NULL::json AS contact_note,
    NULL::json AS deal_note
   FROM contacts co
UNION ALL
 SELECT ('contactNote.'::text || cn.id) || '.created'::text AS id,
    'contactNote.created'::text AS type,
    cn.date,
    co.company_id,
    cn.sales_id,
    NULL::json AS company,
    NULL::json AS contact,
    NULL::json AS deal,
    to_json(cn.*) AS contact_note,
    NULL::json AS deal_note
   FROM contact_notes cn
     LEFT JOIN contacts co ON co.id = cn.contact_id
UNION ALL
 SELECT ('deal.'::text || d.id) || '.created'::text AS id,
    'deal.created'::text AS type,
    d.created_at AS date,
    d.company_id,
    d.sales_id,
    NULL::json AS company,
    NULL::json AS contact,
    to_json(d.*) AS deal,
    NULL::json AS contact_note,
    NULL::json AS deal_note
   FROM deals d
UNION ALL
 SELECT ('dealNote.'::text || dn.id) || '.created'::text AS id,
    'dealNote.created'::text AS type,
    dn.date,
    d.company_id,
    dn.sales_id,
    NULL::json AS company,
    NULL::json AS contact,
    NULL::json AS deal,
    NULL::json AS contact_note,
    to_json(dn.*) AS deal_note
   FROM deal_notes dn
     LEFT JOIN deals d ON d.id = dn.deal_id;

CREATE OR REPLACE VIEW public.amtsgericht_overview AS  SELECT c.id AS company_id,
    c.name AS amtsgericht,
    c.zvg_slug,
    c.website,
    c.address,
    c.zipcode,
    c.city,
    count(z.zid) AS akten_total,
    count(z.zid) FILTER (WHERE z.status = 'neu'::text) AS akten_neu,
    count(z.zid) FILTER (WHERE z.status <> ALL (ARRAY['stop'::text, 'abgegeben'::text, 'verloren'::text, 'ersteigert'::text])) AS akten_aktiv,
    count(z.zid) FILTER (WHERE z.gpreis_eur = 0::numeric AND z.gutachten_url IS NOT NULL) AS freie_gutachten,
    count(z.zid) FILTER (WHERE z.is_teilung = true) AS teilungs_akten,
    min(z.termin) FILTER (WHERE z.termin > now()) AS naechster_termin,
    sum(z.vkw_eur)::bigint AS vkw_summe
   FROM companies c
     LEFT JOIN zvg_akte z ON z.ag_company_id = c.id
  WHERE c.sector = 'Amtsgericht'::text
  GROUP BY c.id, c.name, c.zvg_slug, c.website, c.address, c.zipcode, c.city;

CREATE OR REPLACE VIEW public.app_anthropic_config AS  SELECT decrypted_secret AS api_key
   FROM vault.decrypted_secrets
  WHERE name = 'ANTHROPIC_API_KEY'::text
 LIMIT 1;

CREATE OR REPLACE VIEW public.app_smtp_config AS  SELECT ( SELECT decrypted_secrets.decrypted_secret
           FROM vault.decrypted_secrets
          WHERE decrypted_secrets.name = 'smtp_host'::text) AS smtp_host,
    (( SELECT decrypted_secrets.decrypted_secret
           FROM vault.decrypted_secrets
          WHERE decrypted_secrets.name = 'smtp_port'::text))::integer AS smtp_port,
    (( SELECT decrypted_secrets.decrypted_secret
           FROM vault.decrypted_secrets
          WHERE decrypted_secrets.name = 'imap_port'::text))::integer AS imap_port,
    ( SELECT decrypted_secrets.decrypted_secret
           FROM vault.decrypted_secrets
          WHERE decrypted_secrets.name = 'smtp_user'::text) AS smtp_user,
    ( SELECT decrypted_secrets.decrypted_secret
           FROM vault.decrypted_secrets
          WHERE decrypted_secrets.name = 'smtp_pass'::text) AS smtp_pass,
    ( SELECT decrypted_secrets.decrypted_secret
           FROM vault.decrypted_secrets
          WHERE decrypted_secrets.name = 'smtp_from'::text) AS smtp_from;

CREATE OR REPLACE VIEW public.companies_summary AS  SELECT c.id,
    c.created_at,
    c.name,
    c.sector,
    c.size,
    c.linkedin_url,
    c.website,
    c.phone_number,
    c.address,
    c.zipcode,
    c.city,
    c.state_abbr,
    c.sales_id,
    c.context_links,
    c.country,
    c.description,
    c.revenue,
    c.tax_identifier,
    c.logo,
    count(DISTINCT d.id) AS nb_deals,
    count(DISTINCT co.id) AS nb_contacts
   FROM companies c
     LEFT JOIN deals d ON c.id = d.company_id
     LEFT JOIN contacts co ON c.id = co.company_id
  GROUP BY c.id;

CREATE OR REPLACE VIEW public.contacts_summary AS  SELECT co.id,
    co.first_name,
    co.last_name,
    co.gender,
    co.title,
    co.background,
    co.avatar,
    co.first_seen,
    co.last_seen,
    co.has_newsletter,
    co.status,
    co.tags,
    co.company_id,
    co.sales_id,
    co.linkedin_url,
    co.email_jsonb,
    co.phone_jsonb,
    jsonb_path_query_array(co.email_jsonb, '$[*]."email"'::jsonpath)::text AS email_fts,
    jsonb_path_query_array(co.phone_jsonb, '$[*]."number"'::jsonpath)::text AS phone_fts,
    c.name AS company_name,
    count(DISTINCT t.id) FILTER (WHERE t.done_date IS NULL) AS nb_tasks
   FROM contacts co
     LEFT JOIN tasks t ON co.id = t.contact_id
     LEFT JOIN companies c ON co.company_id = c.id
  GROUP BY co.id, c.name;

CREATE OR REPLACE VIEW public.init_state AS  SELECT count(id) AS is_initialized
   FROM ( SELECT sales.id
           FROM sales
         LIMIT 1) sub;

CREATE OR REPLACE VIEW public.objekt_public AS  SELECT o.oid,
    o.cluster_slug,
    o.name,
    o.strasse,
    o.hausnummer,
    o.plz,
    o.ort,
    o.flurstueck,
    o.gemarkung,
    o.qm,
    o.vk_eur,
    o.prqm_eur,
    o.status,
    o.bebauung,
    o.medien,
    o.alkis,
    o.lat,
    o.lon,
    o.created_at,
    o.updated_at,
    c.name AS cluster_name,
    c.lage_kurz,
    c.lat AS cluster_lat,
    c.lon AS cluster_lon
   FROM objekt o
     JOIN cluster c ON c.slug = o.cluster_slug
  WHERE o.status <> ALL (ARRAY['in_akquise'::text, 'vertriebssperre'::text]);

CREATE OR REPLACE VIEW public.zvg_akte_detail AS  SELECT z.zid,
    z.az,
    z.az_jahr,
    z.art,
    z.is_teilung,
    z.termin,
    z.vkw_eur,
    z.gpreis_eur,
    z.gutachten_url,
    z.obj_titel,
    z.objekt_strasse,
    z.objekt_plz,
    z.objekt_ort,
    z.status,
    z.bietreichweite_eur,
    z.first_seen,
    z.last_seen,
    z.triage_note,
    z.stop_reason,
    c.id AS ag_company_id,
    c.name AS amtsgericht_name,
    c.zvg_slug AS ag_slug,
    c.website AS ag_website,
    (rp.first_name || ' '::text) || rp.last_name AS rechtspfleger_name,
    rp.title AS rechtspfleger_titel,
    (sv.first_name || ' '::text) || sv.last_name AS sachverstaendiger_name,
    svc.name AS sachverstaendiger_buero,
    z.detail_fetched_at IS NULL AS detail_pending,
    ('https://www.zvg.com/objekt/'::text || z.zid) || '/show'::text AS zvg_url,
        CASE
            WHEN c.zvg_slug IS NOT NULL AND z.az_norm IS NOT NULL THEN ((('https://www.zvg.com/bilder/'::text || c.zvg_slug) || '/'::text) || z.az_norm) || '.jpg'::text
            ELSE NULL::text
        END AS bild_url
   FROM zvg_akte z
     JOIN companies c ON c.id = z.ag_company_id
     LEFT JOIN contacts rp ON rp.id = z.rechtspfleger_contact_id
     LEFT JOIN contacts sv ON sv.id = z.sachverstaendiger_contact_id
     LEFT JOIN companies svc ON svc.id = sv.company_id;

CREATE OR REPLACE VIEW public.zvg_akte_letzte_anfrage AS  SELECT DISTINCT ON (zid) zid,
    id AS anfrage_id,
    gesendet_am,
    gesendet_an_email,
    rechtspfleger_contact_id,
    anrede,
    antwort_eingegangen_am,
    antwort_option,
    antwort_neuer_termin,
    antwort_freitext,
    re_anfrage_faellig_am
   FROM zvg_anfrage
  ORDER BY zid, gesendet_am DESC;

--
-- 8. RLS + POLICIES
--
ALTER TABLE public.brw_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cluster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.de_plz_centroid ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favicons_excluded_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imap_polling_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kleinanzeigen_dokumente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kleinanzeigen_favoriten ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kleinanzeigen_grundstueck ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objekt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_ingest_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zvg_akte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zvg_akte_bild ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zvg_akte_dokumente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zvg_akte_favoriten ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zvg_anfrage ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY anon_read_brw ON public.brw_history AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_cluster ON public.cluster AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY "Company Delete Policy" ON public.companies AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.companies AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable read access for authenticated users" ON public.companies AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable update for authenticated users only" ON public.companies AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable insert for admins" ON public.configuration AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Enable read for authenticated" ON public.configuration AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable update for admins" ON public.configuration AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Contact Notes Delete Policy" ON public.contact_notes AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "Contact Notes Update policy" ON public.contact_notes AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.contact_notes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable read access for authenticated users" ON public.contact_notes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Contact Delete Policy" ON public.contacts AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.contacts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable read access for authenticated users" ON public.contacts AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable update for authenticated users only" ON public.contacts AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Deal Notes Delete Policy" ON public.deal_notes AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "Deal Notes Update Policy" ON public.deal_notes AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.deal_notes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable read access for authenticated users" ON public.deal_notes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Deals Delete Policy" ON public.deals AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.deals AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable read access for authenticated users" ON public.deals AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable update for authenticated users only" ON public.deals AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable access for authenticated users only" ON public.favicons_excluded_domains AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth read" ON public.kleinanzeigen_dokumente AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "service all" ON public.kleinanzeigen_dokumente AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "own favs delete" ON public.kleinanzeigen_favoriten AS PERMISSIVE FOR DELETE TO public USING ((sales_id = my_sales_id()));
CREATE POLICY "own favs insert" ON public.kleinanzeigen_favoriten AS PERMISSIVE FOR INSERT TO public WITH CHECK ((sales_id = my_sales_id()));
CREATE POLICY "own favs select" ON public.kleinanzeigen_favoriten AS PERMISSIVE FOR SELECT TO public USING ((sales_id = my_sales_id()));
CREATE POLICY "authenticated read" ON public.kleinanzeigen_grundstueck AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write" ON public.kleinanzeigen_grundstueck AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_role all" ON public.kleinanzeigen_grundstueck AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY anon_read_objekt ON public.objekt AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY "Enable read access for authenticated users" ON public.sales AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users only" ON public.tags AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.tags AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable read access for authenticated users" ON public.tags AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable update for authenticated users only" ON public.tags AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.tasks AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable read access for authenticated users" ON public.tasks AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Task Delete Policy" ON public.tasks AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "Task Update Policy" ON public.tasks AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY zvg_akte_authenticated_insert ON public.zvg_akte AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY zvg_akte_authenticated_select ON public.zvg_akte AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY zvg_akte_authenticated_update ON public.zvg_akte AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY zvg_akte_dokumente_authenticated_delete ON public.zvg_akte_dokumente AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY zvg_akte_dokumente_authenticated_insert ON public.zvg_akte_dokumente AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY zvg_akte_dokumente_authenticated_select ON public.zvg_akte_dokumente AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY zvg_akte_dokumente_authenticated_update ON public.zvg_akte_dokumente AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY favoriten_own_delete ON public.zvg_akte_favoriten AS PERMISSIVE FOR DELETE TO authenticated USING ((sales_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.user_id = auth.uid()))));
CREATE POLICY favoriten_own_insert ON public.zvg_akte_favoriten AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((sales_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.user_id = auth.uid()))));
CREATE POLICY favoriten_own_select ON public.zvg_akte_favoriten AS PERMISSIVE FOR SELECT TO authenticated USING ((sales_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.user_id = auth.uid()))));
CREATE POLICY zvg_anfrage_authenticated_delete ON public.zvg_anfrage AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY zvg_anfrage_authenticated_insert ON public.zvg_anfrage AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY zvg_anfrage_authenticated_select ON public.zvg_anfrage AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY zvg_anfrage_authenticated_update ON public.zvg_anfrage AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
