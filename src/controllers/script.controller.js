// Dummy script generator
export async function generateScript(req, res) {
    const { movie } = req.body;
    if (!movie) return res.status(400).json({ ok: false, error: "movie required" });

    const script = `Movie: ${movie.title}\n\nThis is an auto-generated script for ${movie.title}.`;
    res.json({ ok: true, script });
}
