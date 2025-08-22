// server/index.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import axios from 'axios'
import cron from 'node-cron'
import { OpenAI } from 'openai'
import { z } from 'zod'

const app = express()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }))
app.use(express.json({ limit: '2mb' }))

// ---------- TMDB ----------
const TMDB = axios.create({
    baseURL: 'https://api.themoviedb.org/3',
    params: { api_key: process.env.TMDB_KEY }, // v3 key
})

// ---------- Start ----------
const port = Number(process.env.PORT || 8080)
app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`)
    console.log('Allowed origin:', process.env.ALLOWED_ORIGIN || '*')
})


// ---------- Style profile (customizable) ----------
const DEFAULT_STYLE = {
    persona: 'Energetic, street-smart Hinglish — witty, confident, desi-Mumbai vibe',
    tone: 'mast & attractive; crisp lines; no cringe; no over-explaining',
    slang: 'light Hindi/Mumbai slang only (bhai, yaar, scene, mast) — keep it natural',
    pace: 'fast, punchy; 150–170 wpm; micro-pauses implied',
    devices: 'rhetorical questions, contrast, quick twists, wordplay',
    emoji: '0–2 total, max; avoid spam',
    address: 'second-person (tum/you) direct camera address',
    ctaStyle: 'Short, hype, imperative. Ask to follow/subscribe for more movie shorts in Hinglish',
    hashtagsStyle: '5–7; mix of English/Hinglish; all lowercase; no spaces; no movie-title duplicates',
};

function mergeStyle(userStyle = {}) {
    try {
        // Optional: allow env JSON to override defaults
        const fromEnv = process.env.SCRIPT_STYLE_JSON ? JSON.parse(process.env.SCRIPT_STYLE_JSON) : {};
        return { ...DEFAULT_STYLE, ...fromEnv, ...userStyle };
    } catch {
        return { ...DEFAULT_STYLE, ...userStyle };
    }
}

function styleToText(s) {
    return [
        `Persona: ${s.persona}`,
        `Tone: ${s.tone}`,
        `Slang: ${s.slang}`,
        `Pace: ${s.pace}`,
        `Devices: ${s.devices}`,
        `Emoji: ${s.emoji}`,
        `Address: ${s.address}`,
        `CTA Style: ${s.ctaStyle}`,
        `Hashtags Style: ${s.hashtagsStyle}`,
    ].join('\n');
}


// ---------- Common mapper ----------
function mapMovie(m) {
    return {
        id: m.id,
        title: m.title || m.original_title,
        overview: m.overview || '',
        year: (m.release_date || '').slice(0, 4),
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    }
}

// ---------- Trending (with pagination) ----------
async function fetchTrending(region = 'IN', page = 1, lang = 'en') {
    const { data } = await TMDB.get('/trending/movie/day', {
        params: { region, page, language: lang },
    })
    return {
        page: data?.page || page,
        total_pages: data?.total_pages || 1,
        total_results: data?.total_results || (data?.results?.length || 0),
        items: (data?.results || []).map(mapMovie),
    }
}

// ---------- Search (with pagination) ----------
async function fetchSearch({ q, page = 1, region = 'IN', lang = 'en', includeAdult = false, year }) {
    const params = {
        query: q,
        page,
        region,
        language: lang,
        include_adult: includeAdult,
    }
    if (year) params.year = year

    const { data } = await TMDB.get('/search/movie', { params })
    const results = (data?.results || []).map(mapMovie)
    return {
        page: data?.page || page,
        total_pages: data?.total_pages || 1,
        total_results: data?.total_results || results.length,
        items: results,
    }
}

// ---------- Genres (cached) ----------
let GENRES_CACHE = { data: null, ts: 0 }
const GENRES_TTL_MS = 1000 * 60 * 60 * 12 // 12 hours

async function fetchGenres(lang = 'en') {
    const now = Date.now()
    if (GENRES_CACHE.data && (now - GENRES_CACHE.ts) < GENRES_TTL_MS) {
        return GENRES_CACHE.data
    }
    const { data } = await TMDB.get('/genre/movie/list', { params: { language: lang } })
    const list = (data?.genres || []).map(g => ({ id: g.id, name: g.name }))
    GENRES_CACHE = { data: list, ts: now }
    return list
}

// ---------- Discover by Genre ----------
async function fetchByGenre({
    genreId, page = 1, region = 'IN', lang = 'en', sortBy = 'popularity.desc', year, includeAdult = false,
}) {
    const params = {
        with_genres: genreId, // e.g., "28" or "28,35"
        page,
        region,
        language: lang,
        sort_by: sortBy,
        include_adult: includeAdult,
    }
    if (year) params.primary_release_year = year

    const { data } = await TMDB.get('/discover/movie', { params })
    const results = (data?.results || []).map(mapMovie)
    return {
        page: data?.page || page,
        total_pages: data?.total_pages || 1,
        total_results: data?.total_results || results.length,
        items: results,
    }
}


// ---------- Normalizers ----------
function toArray(v) {
    if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
    if (typeof v === 'string') {
        // bullets हटाओ, फिर newline/comma/semicolon/pipe पर split
        return v
            .replace(/^\s*[-•*\d.)]+\s*/gm, '')
            .split(/\r?\n|,|;|\|/g)
            .map(s => s.trim())
            .filter(Boolean);
    }
    return [];
}

function toHashtags(v) {
    // "#tag" या "tag" — दोनों चलेगा; lowercase + de-dup + max 7
    const arr = toArray(v)
        .map(s => s.replace(/^#/, '').trim().toLowerCase())
        .filter(Boolean);
    return [...new Set(arr)].slice(0, 7);
}

// पूरे object को normalize कर दे
function normalizeScript(obj) {
    return {
        title: String(obj.title ?? ''),
        hook: String(obj.hook ?? ''),
        fact: String(obj.fact ?? ''),
        cta: String(obj.cta ?? ''),
        beats: toArray(obj.beats),
        scenes: toArray(obj.scenes),
        captions: toArray(obj.captions),
        hashtags: toHashtags(obj.hashtags),
    };
}


// ---------- Script schema + helper ----------
// ---------- Script schema ----------
const ScriptSchema = z.object({
    title: z.string().default(''),
    hook: z.string().max(80).default(''),
    fact: z.string().default(''),
    cta: z.string().default(''),

    // strings को arrays में बदल कर validate करो
    beats: z.preprocess(toArray, z.array(z.string())),
    scenes: z.preprocess(toArray, z.array(z.string())),
    captions: z.preprocess(toArray, z.array(z.string())),
    hashtags: z.preprocess(toHashtags, z.array(z.string())),
});


// ---------- Review schema ----------
// ---------- Review schema ----------
const ReviewSchema = z.object({
    title: z.string(),
    oneLiner: z.string(),
    summary: z.string(),
    plotTheme: z.string().default(''),
    whatWorks: z.preprocess(toArray, z.array(z.string())),
    whatDoesnt: z.preprocess(toArray, z.array(z.string())),
    bestScenes: z.preprocess(toArray, z.array(z.string())),
    performances: z.string(),
    writingDirection: z.string(),
    actionTechnical: z.string(),
    musicVfx: z.string(),
    paceTone: z.string(),
    familyGuide: z.string(),
    whoShouldWatch: z.preprocess(toArray, z.array(z.string())),
    whoShouldSkip: z.preprocess(toArray, z.array(z.string())),
    ratings: z.object({
        overall: z.coerce.number().min(0).max(10),
        story: z.coerce.number().min(0).max(10),
        acting: z.coerce.number().min(0).max(10),
        direction: z.coerce.number().min(0).max(10),
        action: z.coerce.number().min(0).max(10),
        music: z.coerce.number().min(0).max(10),
        vfx: z.coerce.number().min(0).max(10),
    }),
    verdict: z.string(),
    narration: z.string(),              // 👈 NEW: voice-over friendly paragraph(s)
});


function safeJsonParse(text) {
    const fenced = text.replace(/```(json)?/gi, '').trim()
    try { return JSON.parse(fenced) } catch { }
    const start = fenced.indexOf('{')
    const end = fenced.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
        const slice = fenced.slice(start, end + 1)
        try { return JSON.parse(slice) } catch { }
    }
    throw new Error('Invalid JSON returned by model')
}

// ---------- OpenAI generation (long, detailed, high-retention) ----------
async function generateScript({ title, year, overview, style }) {
    const styleText = styleToText(mergeStyle(style));

    const prompt = `You are a shorts scriptwriter. Write a HIGH-RETENTION YouTube Shorts script in Hinglish for the movie "${title}${year ? ` (${year})` : ''}".
Keep spoilers light. The video length should feel 60–75 seconds.

STYLE PROFILE
${styleText}

Return ONLY JSON with exactly these keys:
"title", "hook", "beats", "fact", "cta", "hashtags", "scenes", "captions".

Rules:
- HOOK: <= 8 words, direct address (you/tum), curiosity gap, 0–1 emoji max.
- LENGTH & FLOW:
  - Make overall pacing feel 60–75s.
  - EXACTLY 6 beats with mm:ss start markers (e.g., "00:00 - ...").
  - Beat plan:
    1) Tease the central conflict (no spoilers).
    2) Raise stakes with a vivid detail.
    3) Character/relationship tension in 1 crisp line.
    4) Visual set-piece tease (fast, cinematic).
    5) A twist / unexpected angle (no major spoiler).
    6) Payoff feeling + tease more, lead into CTA.
  - Each beat must be punchy and intriguing.
- FACT: 1 surprising production/behind-the-scenes tidbit.
- CTA: short, hype, imperative — ask to follow/subscribe for more Hinglish movie shorts.
- HASHTAGS: 7 items, all lowercase, no spaces (# optional), no duplicates, avoid movie title itself.
- SCENES (9:16): 8–10 shots, each a short creator-friendly line including VISUAL + ACTION + (optional) on-screen text + (optional) [SFX:], all in one string.
- CAPTIONS: 20–28 lines, SRT-style text (no timestamps), <= 40 chars per line, crisp Hinglish, readable on phone, natural line breaks.
- STYLE GUARDRAILS: keep slang natural (no cringe), avoid over-emoji.
- JSON STRICTNESS: Arrays MUST be valid JSON arrays like ["...","..."]. Do NOT join items into a single string.

${overview ? `Overview (for reference): ${overview}` : ''}`;

    const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.8,          // a bit spicier
        max_tokens: 900,           // more room for longer output
        messages: [
            { role: 'system', content: 'Return pure JSON. No prose, no code fences.' },
            { role: 'user', content: prompt },
        ],
    });

    const text = resp.choices?.[0]?.message?.content?.trim() || '{}';
    const json = safeJsonParse(text);

    // If you added the normalizers earlier, you can normalize here before parse.
    // const normalized = normalizeScript({ title, ...json });
    // return ScriptSchema.parse(normalized);

    const parsed = ScriptSchema.parse({ title, ...json });
    return parsed;
}


// ---------- OpenAI: review generation ----------
// ---------- OpenAI: review generation (longer narration) ----------
async function generateReview({ title, year, overview, style }) {
    const styleText = styleToText(mergeStyle(style));
    // optional knob: caller can set style.narrationWords, else default ~260 words
    const words = (style && Number(style.narrationWords)) || 260;

    const prompt = `Tu ek mast movie reviewer hai jo Hinglish me masti, style aur thoda masala dal ke review deta hai.
Movie: "${title}${year ? ` (${year})` : ''}"

STYLE PROFILE
${styleText}


Return ONLY JSON with exactly these keys:
"title","oneLiner","summary","plotTheme","whatWorks","whatDoesnt","bestScenes","performances","writingDirection","actionTechnical","musicVfx","paceTone","familyGuide","whoShouldWatch","whoShouldSkip","ratings","verdict","narration".

Rules:
- "narration": 3 short paras (total ~${words} words).
  * Para 1: Seedha audience se baat karo, thoda story tease karo — “Scene aisa hai ki tumhe lagega wah kya premise hai!”
  * Para 2: Mast factor batao — kya dhamaka hai (acting, action, music, VFX, comedy, jo bhi movie ka spice ho). Energetic tone, thoda Hinglish slang.
  * Para 3: Waaoo factor + verdict line, ekdum catchy. CTA style line do — "subscribe karna mat bhoolna" jaisa ekdum bindass.
- Avoid boring critic tone. Zyada engaging aur hype build karne wala.
- Keep spoilers very light, bas feel dikhana hai.
- "whatWorks": 4–6 bullets (mast cheezein).
- "whatDoesnt": 2–3 polite bullets.
- "bestScenes": 3–5 teaser highlights (waoo moments).
- "ratings": 0–10 numbers (overall, story, acting, direction, action, music, vfx).
- Arrays must be JSON arrays. Pure JSON output, no prose.


${overview ? `Overview (for reference): ${overview}` : ''}`;

    const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 1100, // more room for longer narration
        messages: [
            { role: 'system', content: 'Return pure JSON. No prose, no code fences.' },
            { role: 'user', content: prompt },
        ],
    });

    const text = resp.choices?.[0]?.message?.content?.trim() || '{}';
    const json = safeJsonParse(text);
    return ReviewSchema.parse({ ...json, title });
}





// ---------- Routes ----------
app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() })
})

// trending with page/lang/region
app.get('/api/trending', async (req, res) => {
    try {
        const region = (req.query.region || 'IN').toString()
        const page = Number(req.query.page || 1)
        const lang = (req.query.lang || 'en').toString()
        const payload = await fetchTrending(region, page, lang)
        res.json({ ok: true, ...payload })
    } catch (e) {
        console.error('/api/trending', e)
        res.status(500).json({ ok: false, error: e.message })
    }
})

// ---------- Review route ----------
app.post('/api/review', async (req, res) => {
    try {
        const { title, year, overview, style } = req.body || {};
        if (!title || typeof title !== 'string') {
            return res.status(400).json({ ok: false, error: 'title required' });
        }
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY missing' });
        }
        const review = await generateReview({ title, year, overview, style });
        res.json({ ok: true, review });
    } catch (e) {
        console.error('/api/review', e);
        if (e?.issues) return res.status(400).json({ ok: false, error: 'bad_request', details: e.issues });
        res.status(500).json({ ok: false, error: e.message });
    }
});


// search
app.get('/api/search', async (req, res) => {
    try {
        const { q, page, region, lang, includeAdult, year } = req.query || {}
        if (!q) return res.status(400).json({ ok: false, error: 'q required' })

        const payload = await fetchSearch({
            q: q.toString(),
            page: Number(page || 1),
            region: (region || 'IN').toString(),
            lang: (lang || 'en').toString(),
            includeAdult: includeAdult === 'true',
            year: year ? Number(year) : undefined,
        })
        res.json({ ok: true, ...payload })
    } catch (e) {
        console.error('/api/search', e)
        res.status(500).json({ ok: false, error: e.message })
    }
})

// genres
app.get('/api/genres', async (req, res) => {
    try {
        const lang = (req.query.lang || 'en').toString()
        const items = await fetchGenres(lang)
        res.json({ ok: true, items })
    } catch (e) {
        console.error('/api/genres', e)
        res.status(500).json({ ok: false, error: e.message })
    }
})

// by genre
app.get('/api/movies/by-genre', async (req, res) => {
    try {
        const { genreId, page, region, lang, sortBy, year, includeAdult } = req.query || {}
        if (!genreId) {
            return res.status(400).json({ ok: false, error: 'genreId required (e.g. 28 or 28,35)' })
        }

        const payload = await fetchByGenre({
            genreId: genreId.toString(),
            page: Number(page || 1),
            region: (region || 'IN').toString(),
            lang: (lang || 'en').toString(),
            sortBy: (sortBy || 'popularity.desc').toString(),
            year: year ? Number(year) : undefined,
            includeAdult: includeAdult === 'true',
        })
        res.json({ ok: true, ...payload })
    } catch (e) {
        console.error('/api/movies/by-genre', e)
        res.status(500).json({ ok: false, error: e.message })
    }
})

// script generation
// script generation
app.post('/api/scripts', async (req, res) => {
    try {
        const { title, year, overview, style } = req.body || {};
        if (!title || typeof title !== 'string') {
            return res.status(400).json({ ok: false, error: 'title required' });
        }
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY missing' });
        }
        const json = await generateScript({ title, year, overview, style });
        res.json({ ok: true, script: json });
    } catch (e) {
        console.error('/api/scripts', e);
        if (e?.issues) return res.status(400).json({ ok: false, error: 'bad_request', details: e.issues });
        res.status(500).json({ ok: false, error: e.message });
    }
});


// // ---------- Daily auto generation (optional log only) ----------
// cron.schedule('0 9 * * *', async () => {
//     try {
//         const { items } = await fetchTrending('IN', 1, 'en')
//         const first = items?.[0]
//         if (!first) return
//         const json = await generateScript({ title: first.title, year: first.year, overview: first.overview })
//         console.log('Daily script (not saved to DB):', json.title)
//     } catch (e) {
//         console.error('Cron error', e.message)
//     }
// }, { timezone: 'Asia/Kolkata' })




// ---------- Hindi movies ----------
async function fetchHindiMovies({
    page = 1, region = 'IN', sortBy = 'popularity.desc', year, includeAdult = false,
}) {
    const params = {
        with_original_language: 'hi',   // only Hindi
        page,
        region,
        sort_by: sortBy,
        include_adult: includeAdult,
    }
    if (year) params.primary_release_year = year

    const { data } = await TMDB.get('/discover/movie', { params })
    const results = (data?.results || []).map(mapMovie)
    return {
        page: data?.page || page,
        total_pages: data?.total_pages || 1,
        total_results: data?.total_results || results.length,
        items: results,
    }
}

app.get('/api/movies/hindi', async (req, res) => {
    try {
        const { page, region, sortBy, year, includeAdult } = req.query || {}
        const payload = await fetchHindiMovies({
            page: Number(page || 1),
            region: (region || 'IN').toString(),
            sortBy: (sortBy || 'popularity.desc').toString(),
            year: year ? Number(year) : undefined,
            includeAdult: includeAdult === 'true',
        })
        res.json({ ok: true, ...payload })
    } catch (e) {
        console.error('/api/movies/hindi', e)
        res.status(500).json({ ok: false, error: e.message })
    }
})


// ---------- Hindi movies by genre ----------
async function fetchHindiByGenre({
    genreId, page = 1, region = 'IN', sortBy = 'popularity.desc', year, includeAdult = false,
}) {
    const params = {
        with_original_language: 'hi',
        with_genres: genreId,   // Hindi + specific category
        page,
        region,
        sort_by: sortBy,
        include_adult: includeAdult,
    }
    if (year) params.primary_release_year = year

    const { data } = await TMDB.get('/discover/movie', { params })
    const results = (data?.results || []).map(mapMovie)
    return {
        page: data?.page || page,
        total_pages: data?.total_pages || 1,
        total_results: data?.total_results || results.length,
        items: results,
    }
}

app.get('/api/movies/hindi/by-genre', async (req, res) => {
    try {
        const { genreId, page, region, sortBy, year, includeAdult } = req.query || {}
        if (!genreId) {
            return res.status(400).json({ ok: false, error: 'genreId required' })
        }
        const payload = await fetchHindiByGenre({
            genreId: genreId.toString(),
            page: Number(page || 1),
            region: (region || 'IN').toString(),
            sortBy: (sortBy || 'popularity.desc').toString(),
            year: year ? Number(year) : undefined,
            includeAdult: includeAdult === 'true',
        })
        res.json({ ok: true, ...payload })
    } catch (e) {
        console.error('/api/movies/hindi/by-genre', e)
        res.status(500).json({ ok: false, error: e.message })
    }
})


// import express from "express";
// import cors from "cors";
// import reviewRoutes from "./routes/review.routes.js";
// import movieRoutes from "./routes/movie.routes.js";

// const app = express();
// app.use(cors());
// app.use(express.json());

// // Routes
// app.use("/api/review", reviewRoutes);
// app.use("/api", movieRoutes);

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//     console.log(`🚀 Server running on port ${PORT}`);
// });

