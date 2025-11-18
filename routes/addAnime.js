require('dotenv').config();
const express = require('express');
const router = express.Router()
const Anime = require('../models/Anime')
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
  storage: multer.memoryStorage()
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

// HTML entity decoding middleware for anime
const decodeAnimeData = (req, res, next) => {
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

// Updated S3 upload with conversion
router.post('/upload-anime-to-s3', upload.single('file'), async (req, res) => {
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
        
        res.json({
            success: true,
            url: uploadResult.Location,
            key: uploadResult.Key,
            size: uploadBuffer.length,
            type: finalContentType,
            converted: isConvertibleVideo
        });

    } catch (error) {
        console.error('S3 upload error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to upload file to S3'
        });
    }
});

// Your existing routes...
router.post('/fetch-anime', async (req, res) => {
    let search_term = req.body.searchTerm;
    console.log("Search Term is", search_term)

    try {
        const url = `https://api.themoviedb.org/3/search/tv?query=${search_term}&include_adult=false&language=en-US&page=1`;
        const options = {
            method: 'GET',
            headers: {
                accept: 'application/json',
                Authorization: process.env.TMDB_AUTH_KEY
            }
        };

        const responseData = await fetch(url, options);
        const result = await responseData.json();

        // Filter for anime
        const animeResults = result.results.filter(show => 
            show.genre_ids.includes(16) ||
            show.name.toLowerCase().includes('anime') ||
            show.original_language === 'ja'
        );

        if (animeResults.length === 0) {
            return res.status(404).json({ error: 'No anime found with the given search term' });
        }

        res.render('addAnimeList', { animeList: animeResults });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch anime details' });
    }
});

router.get('/addAnime/:animeID', async (req, res) => {
    const animeID = req.params.animeID;

    try {
        const url = `https://api.themoviedb.org/3/tv/${animeID}?language=en-US`;
        const options = {
            method: 'GET',
            headers: {
                accept: 'application/json',
                Authorization: process.env.TMDB_AUTH_KEY
            }
        };

        const animeData = await fetch(url, options);
        const animeDetails = await animeData.json();

        const genreIds = animeDetails.genres.map(genre => genre.id);
        const genreNames = animeDetails.genres.map(genre => genre.name);
        animeDetails.production_companies = animeDetails.production_companies.map(company => company.name);

        animeDetails.genreIds = genreIds;
        animeDetails.genres = genreNames;

        const numOfSeasons = animeDetails.number_of_seasons;
        animeDetails.seasons = [];

        for (let i = 1; i <= numOfSeasons; i++) {
            const seasonUrl = `https://api.themoviedb.org/3/tv/${animeID}/season/${i}?language=en-US`;
            const response = await fetch(seasonUrl, options);
            const seasonData = await response.json();
            
            const episodes = seasonData.episodes.map(episode => ({
                episode_number: episode.episode_number,
                name: episode.name,
                runtime: episode.runtime,
                overview: episode.overview,
                poster: "https://image.tmdb.org/t/p/original" + episode.still_path,
                downloadLink: ""
            }));

            animeDetails.seasons.push({
                season_number: seasonData.season_number,
                episodes: episodes
            });
        }

        const selectedAnimeDetails = {
            first_air_date: animeDetails.first_air_date,
            genres: animeDetails.genres,
            id: animeDetails.id,
            name: animeDetails.name,
            overview: animeDetails.overview,
            poster_path: "https://image.tmdb.org/t/p/original" + animeDetails.poster_path,
            backdrop_path: "https://image.tmdb.org/t/p/original" + animeDetails.backdrop_path,
            vote_average: animeDetails.vote_average,
            seasons: animeDetails.seasons
        };

        res.render('addAnime', { animeDetails: selectedAnimeDetails })
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch anime details' });
    }
});

// Update the add-anime-details route with MP4 conversion
router.post('/add-anime-details', upload.any(), decodeAnimeData, async (req, res) => {
    try {
        const animeDetailsData = req.body;

        console.log("Anime Details on adding (DECODED):", animeDetailsData);

        // Process download links for episodes
        const processedSeasons = await Promise.all(
            animeDetailsData.seasons.map(async (season) => {
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
                                    Key: `videos/anime/${animeDetailsData.animeDetails.showDirName || animeDetailsData.animeDetails.name}/season_${season.season_number}/episode_${episode.episode_number}_${uuidv4()}${finalExtension}`,
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

        const newAnimeDocument = new Anime({
            genres: Array.isArray(animeDetailsData.animeDetails.genres) 
                ? animeDetailsData.animeDetails.genres 
                : animeDetailsData.animeDetails.genres.split(',').map(genre => genre.trim()),
            overview: animeDetailsData.animeDetails.overview,
            posterPath: animeDetailsData.animeDetails.poster_path,
            backdropPath: animeDetailsData.animeDetails.backdrop_path,
            releaseDate: new Date(animeDetailsData.animeDetails.first_air_date),
            name: animeDetailsData.animeDetails.name,
            ratings: Number(animeDetailsData.animeDetails.vote_average),
            ignoreTitleOnScan: animeDetailsData.animeDetails.ignoreTitleOnScan,
            showDirName: animeDetailsData.animeDetails.showDirName,
            seasons: processedSeasons
        });

        const savedAnime = await newAnimeDocument.save();

        console.log('Anime details saved successfully:', savedAnime);
        res.json({ success: true })
    } catch (error) {
        console.error('Error saving anime:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to submit anime details',
            details: error.message 
        });
    }
});

module.exports = router;