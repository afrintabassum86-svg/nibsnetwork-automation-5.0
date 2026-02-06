import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../lib/db.js';
import { uploadToS3 } from '../lib/s3-helper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.resolve(__dirname, './browser_session');

async function uploadImage(id, imageBuffer) {
    const filename = `posts/${id}.jpg`;
    console.log(`   Uploading ${filename} to S3...`);

    const publicUrl = await uploadToS3(filename, imageBuffer, 'image/jpeg');

    if (!publicUrl) {
        console.error(`   Error uploading image ${id} to S3`);
        return null;
    }

    return publicUrl;
}

async function scrapePersistent() {
    console.log("=== Instagram Scraper (AWS Edition) ===");
    console.log("");

    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

    console.log("Launching browser...");
    const isProduction = process.env.NODE_ENV === 'production' || process.env.USER === 'ubuntu';
    const context = await chromium.launchPersistentContext(SESSION_DIR, {
        headless: true, // Always true for server stability. Use 'new' if needed.
        viewport: { width: 1280, height: 900 },
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    try {
        console.log("Navigating to https://www.instagram.com/nibsnetwork/");
        await page.goto('https://www.instagram.com/nibsnetwork/', { waitUntil: 'domcontentloaded' });

        console.log("\n=== WAITING FOR POSTS ===");
        let loggedIn = false;
        let waitCount = 0;
        while (!loggedIn && waitCount < 120) {
            await page.waitForTimeout(5000);
            waitCount++;
            const postCount = await page.evaluate(() => document.querySelectorAll('a[href*="/p/"] img').length).catch(() => 0);
            if (postCount > 0) {
                loggedIn = true;
                console.log(`\n✓ Found ${postCount} posts!`);
            } else {
                process.stdout.write(`\rWaiting... (${waitCount * 5}s)`);
            }
        }

        if (!loggedIn) return await context.close();

        // Load existing post IDs from PostgreSQL
        const existingResult = await query('SELECT id FROM instagram_posts');
        const existingIds = new Set(existingResult.rows.map(p => p.id));
        console.log(`Loaded ${existingIds.size} existing posts from database.`);

        while (true) {
            const visiblePosts = await page.evaluate(() => {
                const imgs = Array.from(document.querySelectorAll('a[href*="/p/"] img, a[href*="/reel/"] img'));
                return imgs.map(img => {
                    const anchor = img.closest('a');
                    if (!anchor || img.width < 150) return null;
                    const match = anchor.href.match(/\/(p|reel)\/([^\/]+)/);
                    if (!match) return null;
                    return {
                        id: `ig-${match[2]}`,
                        title: (img.alt || "Instagram Post").substring(0, 100),
                        url: anchor.href,
                        image: img.src,
                        timestamp: null,
                        type: match[1] === 'reel' ? 'video' : 'image'
                    };
                }).filter(Boolean);
            }).catch(() => []);

            if (visiblePosts.length > 0) {
                for (const post of visiblePosts) {
                    if (!existingIds.has(post.id)) {
                        console.log(`⌛ New Post Detected: ${post.id}`);
                        try {
                            const imageBuffer = await page.evaluate(async (imgUrl) => {
                                const r = await fetch(imgUrl);
                                const b = await r.blob();
                                return new Promise(res => {
                                    const reader = new FileReader();
                                    reader.onload = () => res(reader.result.split(',')[1]);
                                    reader.readAsDataURL(b);
                                });
                            }, post.image);

                            if (imageBuffer) {
                                const publicUrl = await uploadImage(post.id, imageBuffer);
                                if (publicUrl) {
                                    post.image = publicUrl;

                                    await query(
                                        `INSERT INTO instagram_posts (id, title, url, image, type, timestamp)
                                         VALUES ($1, $2, $3, $4, $5, $6)
                                         ON CONFLICT (id) DO NOTHING`,
                                        [post.id, post.title, post.url, post.image, post.type, post.timestamp]
                                    );

                                    existingIds.add(post.id);
                                    console.log(`   ✓ Saved to PostgreSQL & S3`);
                                }
                            }
                        } catch (e) {
                            console.error(`   ✗ Error capturing ${post.id}:`, e.message);
                        }
                    }
                }
            }
            await page.waitForTimeout(8000);
            process.stdout.write(`\rScanning... (${visiblePosts.length} visible, ${existingIds.size} total)`);
        }
    } catch (e) {
        console.error("\nSession ended:", e.message);
    } finally {
        await context.close();
    }
}

scrapePersistent();
