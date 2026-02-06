import pool from '../lib/db.js';
import * as cheerio from 'cheerio';
// import { query } from '../lib/db.js'; // Can use pool directly or query helper

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const SITEMAP_URL = 'https://nibsnetwork.com/sitemap.xml';

async function fetchSitemap() {
    console.log(`Fetching sitemap: ${SITEMAP_URL}`);
    try {
        const response = await fetch(SITEMAP_URL);
        const text = await response.text();
        const $ = cheerio.load(text, { xmlMode: true });
        const urls = [];

        $('url > loc').each((i, el) => {
            const url = $(el).text().trim();
            // Filter logic:
            // 1. Must be nibsnetwork.com
            // 2. Exclude /tag/ pages
            // 3. Exclude root category pages (e.g. /technology/, /health/)
            // 4. Must be an article (usually has at least 4 segments after domain, or just not end with category name)

            // Heuristic: Category pages in this sitemap seem to be just https://nibsnetwork.com/categoryname/
            // Articles are https://nibsnetwork.com/categoryname/slug/

            if (url.includes('nibsnetwork.com') && !url.includes('/tag/')) {
                const relativePath = url.replace('https://nibsnetwork.com', '');
                const segments = relativePath.split('/').filter(s => s.length > 0);

                // If segments > 1, it's likely an article (e.g. /technology/slug)
                // If segments === 1, it's likely a category page (e.g. /technology)
                // But let's verify if the user wants strictly articles. Yes.
                if (segments.length > 1) {
                    urls.push(url);
                }
            }
        });
        return urls;
    } catch (error) {
        console.error('Error fetching sitemap:', error);
        return [];
    }
}

async function scrapeArticle(url) {
    try {
        // console.log(`Scraping: ${url}`);
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);

        const title = $('h1').first().text().trim() || $('title').text().trim();
        const image = $('meta[property="og:image"]').attr('content') || $('img').first().attr('src');
        // Extract category from URL
        const parts = url.replace('https://nibsnetwork.com/', '').split('/');
        const category = parts[0] || 'Uncategorized';

        const description = $('meta[name="description"]').attr('content') ||
            $('meta[property="og:description"]').attr('content') || '';

        return {
            title,
            url,
            image,
            category: category.charAt(0).toUpperCase() + category.slice(1),
            description
        };
    } catch (error) {
        console.error(`Error scraping ${url}:`, error.message);
        return null;
    }
}

async function crawl() {
    console.log('=== Blog Sitemap Crawler (PostgreSQL) ===');

    // Test DB connection
    try {
        const client = await pool.connect();
        console.log('✓ Connected to AWS RDS PostgreSQL');
        client.release();
    } catch (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }

    // Ensure table and columns exist
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS blog_articles (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                url TEXT UNIQUE NOT NULL,
                image TEXT,
                category TEXT,
                description TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
            ALTER TABLE blog_articles ADD COLUMN IF NOT EXISTS image TEXT;
            ALTER TABLE blog_articles ADD COLUMN IF NOT EXISTS description TEXT;
            ALTER TABLE blog_articles ADD COLUMN IF NOT EXISTS category TEXT;
        `);
        console.log('✓ Database Schema Verified');
    } catch (err) {
        console.error('Schema migration failed:', err.message);
    }

    const allUrls = await fetchSitemap();
    console.log(`Found ${allUrls.length} potential articles in sitemap.`);

    let newCount = 0;
    let skipCount = 0;

    // Process in batches to avoid overwhelming
    const BATCH_SIZE = 5;
    for (let i = 0; i < allUrls.length; i += BATCH_SIZE) {
        const batch = allUrls.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (url) => {
            // Check if exists
            const start = Date.now();
            try {
                const res = await pool.query('SELECT id FROM blog_articles WHERE url = $1', [url]);
                if (res.rowCount > 0) {
                    process.stdout.write('.');
                    skipCount++;
                    return;
                }

                // Scrape
                const article = await scrapeArticle(url);
                if (article && article.title) {
                    await pool.query(
                        `INSERT INTO blog_articles (title, url, image, category, description, created_at)
                         VALUES ($1, $2, $3, $4, $5, NOW())
                         ON CONFLICT (url) DO NOTHING`,
                        [article.title, article.url, article.image, article.category, article.description]
                    );
                    const duration = Date.now() - start;
                    // console.log(`Saved: ${article.title.substring(0, 30)}... (${duration}ms)`);
                    process.stdout.write('+');
                    newCount++;
                }
            } catch (err) {
                console.error(`\nError processing ${url}:`, err.message);
            }
        }));
    }

    console.log(`\n\n=== Sync Complete ===`);
    console.log(`Total Found: ${allUrls.length}`);
    console.log(`New Added: ${newCount}`);
    console.log(`Skipped (Already Existed): ${skipCount}`);

    pool.end();
}

crawl();
