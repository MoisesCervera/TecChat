/**
 * Script to generate thumbnails for video files
 * Uses fluent-ffmpeg to extract the first frame from each video
 */

const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { getPool } = require('../database/provider-factory');

// Configure ffmpeg path if needed
// ffmpeg.setFfmpegPath('/usr/local/bin/ffmpeg');
// ffmpeg.setFfprobePath('/usr/local/bin/ffprobe');

const videoDir = path.join(__dirname, '../uploads/videos');
const thumbnailDir = path.join(__dirname, '../uploads/thumbnails');

// Create thumbnails directory if it doesn't exist
if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir, { recursive: true });
    console.log(`Created thumbnails directory at ${thumbnailDir}`);
}

/**
 * Generate thumbnail for a single video file
 */
async function generateThumbnail(videoPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .on('error', (err) => {
                console.error(`Error generating thumbnail for ${videoPath}:`, err.message);
                reject(err);
            })
            .on('end', () => {
                console.log(`✅ Thumbnail generated for ${path.basename(videoPath)}`);
                resolve(outputPath);
            })
            .screenshots({
                timestamps: ['00:00:01.000'], // Take screenshot at the 1 second mark
                filename: path.basename(outputPath),
                folder: path.dirname(outputPath),
                size: '320x240'
            });
    });
}

/**
 * Update database with thumbnail URL
 */
async function updateDatabaseWithThumbnail(mediaId, thumbnailUrl) {
    try {
        const db = getPool();

        // Get the current metadata
        const media = await db.query('SELECT metadata FROM MULTIMEDIA WHERE id_media = ?', [mediaId]);

        if (media.length === 0) {
            console.error(`Media with ID ${mediaId} not found`);
            return false;
        }

        let metadata = {};
        try {
            metadata = JSON.parse(media[0].metadata || '{}');
        } catch (e) {
            console.error(`Error parsing metadata for media ${mediaId}:`, e);
        }

        // Add thumbnail URL to metadata
        metadata.thumbnailUrl = thumbnailUrl;

        // Update the database
        await db.query(
            'UPDATE MULTIMEDIA SET metadata = ? WHERE id_media = ?',
            [JSON.stringify(metadata), mediaId]
        );

        console.log(`✅ Database updated for media ID ${mediaId}`);
        return true;
    } catch (error) {
        console.error(`Error updating database for media ${mediaId}:`, error);
        return false;
    }
}

/**
 * Process all videos in the database
 */
async function processAllVideos() {
    try {
        const db = getPool();

        console.log('Fetching all video media from database...');
        const videos = await db.query(`
            SELECT m.id_media, m.url_archivo, m.metadata 
            FROM MULTIMEDIA m 
            WHERE m.tipo = 'video'
        `);

        console.log(`Found ${videos.length} videos to process`);

        for (const video of videos) {
            try {
                const videoFilename = path.basename(video.url_archivo);
                const videoPath = path.join(videoDir, videoFilename);

                // Skip if video file doesn't exist
                if (!fs.existsSync(videoPath)) {
                    console.warn(`⚠️ Video file not found: ${videoPath}`);
                    continue;
                }

                // Generate thumbnail filename
                const thumbnailFilename = `${path.parse(videoFilename).name}_thumb.jpg`;
                const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);

                // Generate thumbnail
                await generateThumbnail(videoPath, thumbnailPath);

                // Update database with thumbnail URL
                const thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
                await updateDatabaseWithThumbnail(video.id_media, thumbnailUrl);

            } catch (error) {
                console.error(`Error processing video ${video.id_media}:`, error);
            }
        }

        console.log('Video thumbnail generation complete!');
    } catch (error) {
        console.error('Error processing videos:', error);
    }
}

// Initialize database and process videos
const { initializeDatabase } = require('../database/provider-factory');

async function main() {
    try {
        console.log('Initializing database connection...');
        await initializeDatabase();

        console.log('Starting thumbnail generation process...');
        await processAllVideos();

        console.log('Thumbnail generation complete! ✅');
        process.exit(0);
    } catch (error) {
        console.error('Error in main process:', error);
        process.exit(1);
    }
}

main();
