import { TMDB, mapMovie } from "../utils/tmdb.js";

// ---------- Trending ----------
export async function getTrending(req, res) {
    try {
        const region = (req.query.region || "IN").toString();
        const page = Number(req.query.page || 1);
        const lang = (req.query.lang || "en").toString();

        const { data } = await TMDB.get("/trending/movie/day", {
            params: { region, page, language: lang },
        });

        res.json({
            ok: true,
            page: data.page,
            total_pages: data.total_pages,
            total_results: data.total_results,
            items: (data.results || []).map(mapMovie),
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
}

// ---------- Search ----------
export async function searchMovies(req, res) {
    try {
        const { q, page = 1, region = "IN", lang = "en" } = req.query;
        if (!q) return res.status(400).json({ ok: false, error: "q required" });

        const { data } = await TMDB.get("/search/movie", {
            params: { query: q, page, region, language: lang },
        });

        res.json({
            ok: true,
            page: data.page,
            total_pages: data.total_pages,
            total_results: data.total_results,
            items: (data.results || []).map(mapMovie),
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
}

// ---------- Genres ----------
export async function getGenres(req, res) {
    try {
        const lang = (req.query.lang || "en").toString();
        const { data } = await TMDB.get("/genre/movie/list", { params: { language: lang } });

        res.json({ ok: true, items: data.genres });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
}

// ---------- Hindi Movies ----------
export async function getHindiMovies(req, res) {
    try {
        const { page = 1, region = "IN", sortBy = "popularity.desc" } = req.query;

        const { data } = await TMDB.get("/discover/movie", {
            params: {
                with_original_language: "hi",
                page,
                region,
                sort_by: sortBy,
            },
        });

        res.json({ ok: true, items: (data.results || []).map(mapMovie) });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
}
