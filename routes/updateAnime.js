const express = require('express');
const router = express.Router();
const Anime = require('../models/Anime');
const s3 = require('../service/aws.s3.bucket');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
});

// MP4 conversion function
async function convertToMP4(inputBuffer, originalExtension) {
    return new Promise(async (resolve, reject) => {
        const tempInputPath = path.join(__dirname, 'temp', `input_${uuidv4()}${originalExtension}`);
        const tempOutputPath = path.join(__dirname, 'temp', `output_${uuidv4()}.mp4`);

        try {
            const tempDir = path.join(__dirname, 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

            await writeFile(tempInputPath, inputBuffer);

            ffmpeg(tempInputPath)
                .outputOptions(['-c:v libx264', '-c:a aac', '-movflags frag_keyframe+empty_moov'])
                .output(tempOutputPath)
                .on('error', async (err) => {
                    await unlink(tempInputPath).catch(() => {});
                    await unlink(tempOutputPath).catch(() => {});
                    reject(err);
                })
                .on('end', async () => {
                    const convertedBuffer = fs.readFileSync(tempOutputPath);
                    await unlink(tempInputPath).catch(() => {});
                    await unlink(tempOutputPath).catch(() => {});
                    resolve(convertedBuffer);
                })
                .run();
        } catch (error) {
            await unlink(tempInputPath).catch(() => {});
            await unlink(tempOutputPath).catch(() => {});
            reject(error);
        }
    });
}

function decodeHTMLEntities(text) {
    if (typeof text !== 'string') return text;
    const entities = {
        '&amp;': '&',
        '&lt;': '<', 
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'",
        '&#x27;': "'",
        '&#x2F;': '/'
    };
    return text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&apos;|&#x27;|&#x2F;/g, match => entities[match]);
}

// HTML entity decoding middleware for anime updates
const decodeAnimeUpdateData = (req, res, next) => {
    try {
        if (req.body.animeDetailsData && typeof req.body.animeDetailsData === 'string') {
            req.body.animeDetailsData = JSON.parse(req.body.animeDetailsData);
        }

        const animeDetailsData = req.body.animeDetailsData;
        
        if (animeDetailsData && animeDetailsData.animeDetails) {
            ['name', 'overview', 'genres'].forEach(field => {
                if (animeDetailsData.animeDetails[field]) {
                    animeDetailsData.animeDetails[field] = decodeHTMLEntities(animeDetailsData.animeDetails[field]);
                }
            });
        }
        
        if (animeDetailsData && animeDetailsData.seasons) {
            animeDetailsData.seasons.forEach(season => {
                if (season.episodes) {
                    season.episodes.forEach(episode => {
                        ['name', 'overview'].forEach(field => {
                            if (episode[field]) {
                                episode[field] = decodeHTMLEntities(episode[field]);
                            }
                        });
                    });
                }
            });
        }
        
        req.body = animeDetailsData;
        
        next();
    } catch (error) {
        console.error('Error decoding HTML entities:', error);
        next(error);
    }
};

// Updated S3 upload endpoint for anime updates with MP4 conversion
router.post('/upload-anime-to-s3-update', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No file uploaded' 
            });
        }

        const { animeName, season, episode } = req.body;
        
        // Check if conversion needed
        const fileExtension = '.' + req.file.originalname.split('.').pop().toLowerCase();
        const videoFormats = ['.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'];
        const isConvertibleVideo = videoFormats.includes(fileExtension);

        let uploadBuffer = req.file.buffer;
        let finalExtension = fileExtension;
        let finalContentType = 'video/mp4';

        // Convert to MP4
        if (isConvertibleVideo) {
            console.log(`Converting ${fileExtension} to MP4...`);
            try {
                const convertedBuffer = await convertToMP4(req.file.buffer, fileExtension);
                uploadBuffer = convertedBuffer;
                finalExtension = '.mp4';
                console.log('Conversion to MP4 successful');
            } catch (conversionError) {
                console.error('Conversion failed:', conversionError);
            }
        }

        // Generate S3 key
        let s3Key = '';
        if (animeName && season && episode) {
            s3Key = `videos/anime/${animeName.replace(/[^a-zA-Z0-9]/g, '_')}/season_${season}/episode_${episode}_${uuidv4()}${finalExtension}`;
        } else {
            s3Key = `videos/anime/${uuidv4()}${finalExtension}`;
        }

        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
            Body: uploadBuffer,
            ContentType: finalContentType,
            ContentDisposition: 'inline',
            CacheControl: 'public, max-age=31536000'
        };

        const uploadResult = await s3.upload(uploadParams).promise();
        
        console.log(`Anime file uploaded to S3: ${uploadResult.Location}`);
        
        res.json({
            success: true,
            url: uploadResult.Location,
            key: uploadResult.Key,
            size: uploadBuffer.length,
            type: finalContentType,
            converted: isConvertibleVideo
        });

    } catch (error) {
        console.error('S3 upload error for anime:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to upload file to S3'
        });
    }
});

// Update anime details with S3 upload support and MP4 conversion
router.post('/update-anime/:id', upload.any(), decodeAnimeUpdateData, async (req, res) => {
    try {
        const existingAnime = await Anime.findById(req.params.id);

        if (!existingAnime) {
            return res.status(404).send('Anime not found');
        }

        console.log("Request body", req.body);

        // Process download links for episodes with S3 uploads and MP4 conversion
        const processedSeasons = await Promise.all(
            req.body.seasons.map(async (season) => {
                const processedEpisodes = await Promise.all(
                    season.episodes.map(async (episode) => {
                        let downloadLinkUrl = episode.downloadLink;
                        
                        // Check if there's a file upload for this episode
                        const uploadedFile = req.files.find(file => 
                            file.fieldname === `file_edl${season.season_number}${episode.episode_number}`
                        );

                        if (uploadedFile) {
                            try {
                                // Convert video to MP4 before upload
                                const fileExtension = '.' + uploadedFile.originalname.split('.').pop().toLowerCase();
                                const videoFormats = ['.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'];
                                const isConvertibleVideo = videoFormats.includes(fileExtension);

                                let uploadBuffer = uploadedFile.buffer;
                                let finalExtension = fileExtension;

                                if (isConvertibleVideo) {
                                    console.log(`Converting episode ${episode.episode_number} to MP4...`);
                                    try {
                                        const convertedBuffer = await convertToMP4(uploadedFile.buffer, fileExtension);
                                        uploadBuffer = convertedBuffer;
                                        finalExtension = '.mp4';
                                    } catch (conversionError) {
                                        console.error(`Conversion failed for episode ${episode.episode_number}:`, conversionError);
                                    }
                                }

                                const uploadParams = {
                                    Bucket: process.env.AWS_BUCKET_NAME,
                                    Key: `videos/anime/${req.body.animeDetails.name}/season_${season.season_number}/episode_${episode.episode_number}_${uuidv4()}${finalExtension}`,
                                    Body: uploadBuffer,
                                    ContentType: 'video/mp4',
                                    ContentDisposition: 'inline',
                                    CacheControl: 'public, max-age=31536000'
                                };

                                const uploadResult = await s3.upload(uploadParams).promise();
                                downloadLinkUrl = uploadResult.Location;
                                console.log(`Anime Episode ${episode.episode_number} file uploaded to S3:`, downloadLinkUrl);
                            } catch (uploadError) {
                                console.error(`Failed to upload anime episode ${episode.episode_number}:`, uploadError);
                            }
                        }

                        return {
                            episode_number: Number(episode.episode_number),
                            name: episode.name,
                            runtime: Number(episode.runtime),
                            overview: episode.overview,
                            poster: episode.poster || "",
                            downloadLink: downloadLinkUrl
                        };
                    })
                );

                return {
                    season_number: Number(season.season_number),
                    episodes: processedEpisodes
                };
            })
        );

        await Anime.findByIdAndUpdate(
            req.params.id,
            {
                genres: req.body.animeDetails.genres.split(',').map(genre => genre.trim()),
                name: req.body.animeDetails.name,
                overview: req.body.animeDetails.overview,
                ratings: Number(req.body.animeDetails.vote_average),
                posterPath: req.body.animeDetails.poster_path,
                backdropPath: req.body.animeDetails.backdrop_path,
                releaseDate: req.body.animeDetails.first_air_date,
                animeDirName: req.body.animeDetails.animeDirName,
                ignoreTitleOnScan: req.body.animeDetails.ignoreTitleOnScan,
                status: req.body.animeDetails.status || 'completed',
                seasons: processedSeasons
            },
            { new: true }
        );

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// Your existing routes remain the same...
router.get('/edit-anime-list', async (req, res) => {
    try {
        const anime = await Anime.find().sort({ _id: -1 });
        console.log("Anime list are", anime)
        res.render('editAnimeList', { anime });

    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/anime/:id', async (req, res) => {
    try {
        const anime = await Anime.findById(req.params.id);
        console.log("Anime details for update", anime)
        res.render('updateAnimeDetails', { animeDetails: anime });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// Delete anime
router.delete('/delete-anime/:id', async (req, res) => {
    try {
        const deletedAnime = await Anime.findByIdAndDelete(req.params.id);
        
        if (!deletedAnime) {
            return res.status(404).json({ success: false, message: 'Anime not found' });
        }

        console.log("Anime deleted successfully:", deletedAnime.name);
        res.json({ success: true, message: 'Anime deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// Bulk delete anime
router.post('/delete-multiple-anime', async (req, res) => {
    try {
        const { animeIds } = req.body;
        
        if (!animeIds || !Array.isArray(animeIds) || animeIds.length === 0) {
            return res.status(400).json({ success: false, message: 'No anime IDs provided' });
        }

        const result = await Anime.deleteMany({ _id: { $in: animeIds } });
        
        console.log(`Deleted ${result.deletedCount} anime`);
        res.json({ 
            success: true, 
            message: `Successfully deleted ${result.deletedCount} anime` 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// Update anime status
router.patch('/update-anime-status/:id', async (req, res) => {
    try {
        const { status } = req.body;
        
        const updatedAnime = await Anime.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );

        if (!updatedAnime) {
            return res.status(404).json({ success: false, message: 'Anime not found' });
        }

        res.json({ 
            success: true, 
            message: 'Anime status updated successfully',
            anime: updatedAnime 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;