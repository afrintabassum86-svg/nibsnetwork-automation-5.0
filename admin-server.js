import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { query } from './lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONSTANTS_PATH = path.resolve(__dirname, 'src/constants.js');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/api/ping', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// API to save mappings back to PostgreSQL
app.post('/api/save-posts', async (req, res) => {
    try {
        const { posts } = req.body;
        if (!posts || !Array.isArray(posts)) {
            return res.status(400).json({ error: 'Invalid posts data' });
        }

        console.log(`[Admin] Saving ${posts.length} posts to PostgreSQL...`);

        for (const post of posts) {
            await query(
                `INSERT INTO instagram_posts (id, title, url, image, type, blog_url, timestamp, manual_edit)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, true)
                 ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    url = EXCLUDED.url,
                    image = EXCLUDED.image,
                    type = EXCLUDED.type,
                    blog_url = EXCLUDED.blog_url,
                    timestamp = EXCLUDED.timestamp,
                    manual_edit = true`,
                [post.id, post.title, post.url, post.image, post.type, post.blogUrl, post.timestamp]
            );
        }

        // Also update local constants.js as a backup
        const fileContent = `export const INSTAGRAM_POSTS = ${JSON.stringify(posts, null, 2)};\n`;
        fs.writeFileSync(CONSTANTS_PATH, fileContent);

        console.log(`[Admin] Successfully saved to PostgreSQL and constants.js`);
        res.json({ success: true, message: 'Saved to database successfully' });
    } catch (error) {
        console.error('[Admin Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// API to update a single post mapping
app.post('/api/update-post-mapping', async (req, res) => {
    try {
        const { postId, blogUrl, title } = req.body;
        console.log(`[Admin Mapping] Request received: ${postId} -> ${blogUrl}`);

        if (!postId || !blogUrl) {
            return res.status(400).json({ error: 'Missing postId or blogUrl' });
        }

        let queryText = 'UPDATE instagram_posts SET blog_url = $1';
        let params = [blogUrl];

        if (title) {
            queryText += ', title = $2 WHERE id = $3';
            params.push(title, postId);
        } else {
            queryText += ' WHERE id = $2';
            params.push(postId);
        }

        await query(queryText, params);
        console.log(`[Admin Mapping] PostgreSQL updated.`);

        // Also update constants.js to keep in sync
        try {
            const content = fs.readFileSync(CONSTANTS_PATH, 'utf-8');
            const match = content.match(/export const INSTAGRAM_POSTS = (\[[\s\S]*?\]);/);
            if (match) {
                let posts = JSON.parse(match[1]);
                posts = posts.map(p => {
                    if (p.id === postId) {
                        return { ...p, blogUrl: blogUrl, title: title || p.title };
                    }
                    return p;
                });
                fs.writeFileSync(CONSTANTS_PATH, `export const INSTAGRAM_POSTS = ${JSON.stringify(posts, null, 2)};\n`);
            }
        } catch (fsError) {
            console.error('[Admin Mapping] Failed to update constants.js:', fsError.message);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[Admin Mapping Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// API to load articles from PostgreSQL
app.get('/api/articles', async (req, res) => {
    try {
        const result = await query(
            'SELECT title, url, category, slug FROM blog_articles ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (e) {
        console.error('[Admin Error]', e);
        res.status(500).json({ error: e.message });
    }
});

// API to load posts
app.get('/api/posts', async (req, res) => {
    try {
        const result = await query(
            'SELECT id, title, url, image, type, blog_url, timestamp FROM instagram_posts ORDER BY timestamp DESC NULLS LAST'
        );

        const posts = result.rows.map(p => ({
            id: p.id,
            title: p.title,
            url: p.url,
            image: p.image,
            type: p.type,
            blogUrl: p.blog_url,
            timestamp: p.timestamp
        }));

        res.json(posts);
    } catch (e) {
        console.error('[Admin Error]', e);
        res.status(500).json({ error: e.message });
    }
});

// API to get script status
app.get('/api/script-status', async (req, res) => {
    try {
        const result = await query(
            "SELECT * FROM script_status WHERE id = 1 LIMIT 1"
        );
        res.json(result.rows[0] || { status: 'idle' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Automation Scripts Execution
const { exec } = await import('child_process');

app.post('/api/run-script', async (req, res) => {
    const { script } = req.body;
    let command = '';

    switch (script) {
        case 'sync-insta': command = 'node instagram-scraper-mcp/scrape_mirror.js'; break; // Use mirror scraper on server
        case 'sync-blog': command = 'node instagram-scraper-mcp/crawl_blog.js'; break;
        case 'auto-map': command = 'node instagram-scraper-mcp/ocr_match.js'; break;
        case 'sync-time': command = 'node instagram-scraper-mcp/sync_timestamps.js'; break;
        case 'sync-mirror': command = 'node instagram-scraper-mcp/scrape_mirror.js'; break;
        case 'fetch-api': command = 'node instagram-scraper-mcp/fetch_api.js'; break;
        case 'full-map': command = 'node instagram-scraper-mcp/map_to_blog.js'; break;
        case 'refresh-caps': command = 'node instagram-scraper-mcp/refresh_captions.js'; break;
        default: return res.status(400).json({ error: 'Invalid script' });
    }

    console.log(`[Admin] Executing: ${command}`);

    // Update status in database (Use ID=1 to avoid losing the row)
    await query(
        "UPDATE script_status SET status = 'running', script_name = $1, start_time = NOW(), output = NULL WHERE id = 1",
        [script]
    );

    exec(command, { cwd: __dirname }, async (error, stdout, stderr) => {
        const status = error ? 'error' : 'completed';
        const output = stdout || stderr || error?.message;

        await query(
            "UPDATE script_status SET status = $1, script_name = 'global', end_time = NOW(), output = $2 WHERE id = 1",
            [status, output]
        );

        if (error) {
            console.error(`[Admin Error] ${error.message}`);
        } else {
            console.log(`[Admin] Script completed successfully.`);
        }
    });

    res.json({ success: true, message: 'Script started' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Admin Server running at http://localhost:${PORT}`);
    console.log(`Database: AWS RDS PostgreSQL\n`);
});
