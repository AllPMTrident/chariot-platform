--
-- PostgreSQL database dump
--

\restrict MB1oi4YZJ4ljwJm3IpJjwlbe7Sc47fab9GxiS9zQMsF8rk8NQYiOIV6vWLe1qAS

-- Dumped from database version 18.1 (Postgres.app)
-- Dumped by pg_dump version 18.1 (Postgres.app)

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255),
    phone character varying(20),
    address text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.customers OWNER TO postgres;

--
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    status character varying(50) DEFAULT 'unpaid'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    paid_at timestamp without time zone
);


ALTER TABLE public.invoices OWNER TO postgres;

--
-- Name: jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    service_id uuid NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    scheduled_date timestamp without time zone,
    assigned_tech_id uuid,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.jobs OWNER TO postgres;

--
-- Name: services; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    price_base numeric(10,2),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.services OWNER TO postgres;

--
-- Name: technicians; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.technicians (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255),
    phone character varying(20),
    specialties text,
    status character varying(50) DEFAULT 'active'::character varying,
    location character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.technicians OWNER TO postgres;

--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customers (id, name, email, phone, address, created_at, updated_at) FROM stdin;
b4eed373-67d5-4963-9ec5-154db68f6862	John Smith	john@example.com	555-1234	123 Main St, Tampa, FL	2025-11-17 13:01:27.52251	2025-11-17 13:01:27.52251
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invoices (id, job_id, amount, status, created_at, paid_at) FROM stdin;
faf89f87-91c3-4b81-a759-bd09d0c8ca9a	a817e750-40a1-4257-b8da-85f52598c46e	1500.00	paid	2025-11-17 13:47:35.685027	2025-11-17 14:18:08.439
\.


--
-- Data for Name: jobs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.jobs (id, customer_id, service_id, status, scheduled_date, assigned_tech_id, notes, created_at, updated_at) FROM stdin;
a817e750-40a1-4257-b8da-85f52598c46e	b4eed373-67d5-4963-9ec5-154db68f6862	0034a79e-3d80-4d48-9a8b-8406cba2905b	completed	2025-11-20 10:00:00	39b9a046-947e-4589-aefe-a33476240a64	Engine repair completed. New spark plugs installed. Running smooth now.	2025-11-17 13:46:46.22979	2025-11-17 14:31:06.991884
\.


--
-- Data for Name: services; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.services (id, name, description, price_base, created_at) FROM stdin;
0034a79e-3d80-4d48-9a8b-8406cba2905b	Engine Repair	Complete engine diagnostics and repair	1500.00	2025-11-17 13:45:38.215493
\.


--
-- Data for Name: technicians; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.technicians (id, name, email, phone, specialties, status, location, created_at, updated_at) FROM stdin;
39b9a046-947e-4589-aefe-a33476240a64	Marcus Johnson	marcus@poseidonmarine.com	813-555-0123	Diesel engines, outboard motors	active	Tampa	2025-11-17 14:29:31.093952	2025-11-17 14:29:31.093952
72bec738-2485-485a-8fa1-5c7673cbd6cf	Sarah Chen	sarah@poseidonmarine.com	813-555-0456	Fiberglass repair, electrical systems	active	Miami	2025-11-17 14:30:10.5307	2025-11-17 14:30:10.5307
\.


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: technicians technicians_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.technicians
    ADD CONSTRAINT technicians_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);


--
-- Name: jobs jobs_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: jobs jobs_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- PostgreSQL database dump complete
--

\unrestrict MB1oi4YZJ4ljwJm3IpJjwlbe7Sc47fab9GxiS9zQMsF8rk8NQYiOIV6vWLe1qAS

