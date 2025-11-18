const express = require('express');
const router = express.Router();
const Shows = require('../models/Shows');
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

// HTML entity decoding middleware
const decodeShowData = (req, res, next) => {
    try {
        if (req.body.showsDetailsData && typeof req.body.showsDetailsData === 'string') {
            req.body.showsDetailsData = JSON.parse(req.body.showsDetailsData);
        }

        const showsDetailsData = req.body.showsDetailsData;
        
        if (showsDetailsData && showsDetailsData.showDetails) {
            ['name', 'overview', 'genres'].forEach(field => {
                if (showsDetailsData.showDetails[field]) {
                    showsDetailsData.showDetails[field] = decodeHTMLEntities(showsDetailsData.showDetails[field]);
                }
            });
        }
        
        if (showsDetailsData && showsDetailsData.seasons) {
            showsDetailsData.seasons.forEach(season => {
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
        
        req.body = showsDetailsData;
        
        next();
    } catch (error) {
        console.error('Error decoding HTML entities:', error);
        next(error);
    }
};

router.get('/edit-shows-list', async (req, res) => {
    try {
        const shows = await Shows.find().sort({ _id: -1 });
        console.log("TV Shows list are", shows)
        res.render('editShowList', { shows });

    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/shows/:id', async (req, res) => {
    try {
        const show = await Shows.findById(req.params.id);
        console.log("TV Show details update",show)
        res.render('updateShowsDetail', { showsDetails: show });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// Updated S3 upload endpoint for shows with MP4 conversion
router.post('/upload-show-to-s3-update', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No file uploaded' 
            });
        }

        const { showName, season, episode } = req.body;
        
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
        if (showName && season && episode) {
            s3Key = `videos/shows/${showName.replace(/[^a-zA-Z0-9]/g, '_')}/season_${season}/episode_${episode}_${uuidv4()}${finalExtension}`;
        } else {
            s3Key = `videos/shows/${uuidv4()}${finalExtension}`;
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
        
        console.log(`Show file uploaded to S3: ${uploadResult.Location}`);
        
        res.json({
            success: true,
            url: uploadResult.Location,
            key: uploadResult.Key,
            size: uploadBuffer.length,
            type: finalContentType,
            converted: isConvertibleVideo
        });

    } catch (error) {
        console.error('S3 upload error for show:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to upload file to S3'
        });
    }
});

// Update your existing update route to handle S3 uploads with MP4 conversion
router.post('/update-show/:id', upload.any(), decodeShowData, async (req, res) => {
    try {
        const existingShow = await Shows.findById(req.params.id);

        if (!existingShow) {
            return res.status(404).send('Show not found');
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
                                    Key: `videos/shows/${req.body.showDetails.name}/season_${season.season_number}/episode_${episode.episode_number}_${uuidv4()}${finalExtension}`,
                                    Body: uploadBuffer,
                                    ContentType: 'video/mp4',
                                    ContentDisposition: 'inline',
                                    CacheControl: 'public, max-age=31536000'
                                };

                                const uploadResult = await s3.upload(uploadParams).promise();
                                downloadLinkUrl = uploadResult.Location;
                                console.log(`Episode ${episode.episode_number} file uploaded to S3:`, downloadLinkUrl);
                            } catch (uploadError) {
                                console.error(`Failed to upload episode ${episode.episode_number}:`, uploadError);
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

        await Shows.findByIdAndUpdate(
            req.params.id,
            {
                genres: req.body.showDetails.genres.split(',').map(genre => genre.trim()),
                name: req.body.showDetails.name,
                overview: req.body.showDetails.overview,
                ratings: Number(req.body.showDetails.vote_average),
                posterPath: req.body.showDetails.poster_path,
                backdropPath: req.body.showDetails.backdrop_path,
                releaseDate: req.body.showDetails.first_air_date,
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

module.exports = router;