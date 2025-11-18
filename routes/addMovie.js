require('dotenv').config();
const express = require('express');
const router = express.Router()
const Movie = require('../models/movie')
const s3 = require('../service/aws.s3.bucket');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { PassThrough } = require('stream');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath); 


// MP4 conversion function
async function convertToMP4(inputBuffer, originalExtension) {
    return new Promise(async (resolve, reject) => {
        const tempInputPath = path.join(__dirname, 'temp', `input_${uuidv4()}${originalExtension}`);
        const tempOutputPath = path.join(__dirname, 'temp', `output_${uuidv4()}.mp4`);

        try {
            // Create temp directory if it doesn't exist
            const tempDir = path.join(__dirname, 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir);
            }

            // Write buffer to temporary file
            await writeFile(tempInputPath, inputBuffer);

            const outputChunks = [];
            const outputStream = new PassThrough();

            outputStream.on('data', (chunk) => outputChunks.push(chunk));
            outputStream.on('end', async () => {
                // Clean up temp files
                await unlink(tempInputPath).catch(() => { });
                await unlink(tempOutputPath).catch(() => { });
                resolve(Buffer.concat(outputChunks));
            });
            outputStream.on('error', async (err) => {
                // Clean up temp files
                await unlink(tempInputPath).catch(() => { });
                await unlink(tempOutputPath).catch(() => { });
                reject(err);
            });

            ffmpeg(tempInputPath)
                .outputOptions([
                    '-c:v libx264',
                    '-c:a aac',
                    '-movflags frag_keyframe+empty_moov'
                ])
                .output(tempOutputPath)
                .on('error', async (err) => {
                    await unlink(tempInputPath).catch(() => { });
                    await unlink(tempOutputPath).catch(() => { });
                    reject(err);
                })
                .on('end', async () => {
                    // Read the converted file
                    const convertedBuffer = fs.readFileSync(tempOutputPath);
                    outputStream.end(convertedBuffer);
                })
                .run();

        } catch (error) {
            // Clean up temp files
            await unlink(tempInputPath).catch(() => { });
            await unlink(tempOutputPath).catch(() => { });
            reject(error);
        }
    });
}

// Configure multer for file uploads - NO SIZE LIMITS
const upload = multer({
    storage: multer.memoryStorage()
    // No limits object for unlimited file size
});

// HTML entity decoder function
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

// HTML entity decoding middleware for movies
const decodeMovieData = (req, res, next) => {
    try {
        if (req.body) {
            // Decode all text fields that might contain HTML entities
            const fieldsToDecode = [
                'title', 'overview', 'original_title', 'genres',
                'production_companies', 'watchProviders', 'status'
            ];

            fieldsToDecode.forEach(field => {
                if (req.body[field]) {
                    req.body[field] = decodeHTMLEntities(req.body[field]);
                }
            });
        }
        next();
    } catch (error) {
        console.error('Error decoding HTML entities:', error);
        next(error);
    }
};

// S3 upload endpoint
router.post('/upload-to-s3', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        const { movieName } = req.body;

        // Check if it's a video file that needs conversion
        const fileExtension = '.' + req.file.originalname.split('.').pop().toLowerCase();
        const videoFormats = ['.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'];
        const isConvertibleVideo = videoFormats.includes(fileExtension);

        let uploadBuffer = req.file.buffer;
        let finalExtension = fileExtension;
        let finalContentType = 'video/mp4';

        // Convert to MP4 if it's a convertible video format
        if (isConvertibleVideo) {
            console.log(`Converting ${fileExtension} to MP4...`);
            try {
                const convertedBuffer = await convertToMP4(req.file.buffer, fileExtension);
                uploadBuffer = convertedBuffer;
                finalExtension = '.mp4';
                console.log('Conversion to MP4 successful');
            } catch (conversionError) {
                console.error('Conversion failed:', conversionError);
                // Continue with original file
            }
        }

        // Generate S3 key with correct extension
        let s3Key = '';
        if (movieName) {
            s3Key = `videos/movies/${movieName.replace(/[^a-zA-Z0-9]/g, '_')}_${uuidv4()}${finalExtension}`;
        } else {
            s3Key = `videos/movies/${uuidv4()}${finalExtension}`;
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
        console.error('Upload failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload file'
        });
    }
});

// MP4 conversion function


// Update your existing route to handle JSON data (no file uploads)
router.post('/add-movie-details', decodeMovieData, async (req, res) => {
    try {
        const movieDetails = req.body;

        console.log("Movie Details (DECODED):", movieDetails)

        const genreIds = movieDetails.genreIds.split(',').map(id => Number(id));

        const existingMovie = await Movie.findOne({ movieID: movieDetails.id });

        if (existingMovie) {
            console.log(`Movie with movieID ${movieDetails.id} already exists. Skipping.`);
            return res.status(400).json({ error: `Movie with movieID ${movieDetails.id} already exists. Skipping.` });
        }

        // Note: File uploads are now handled by the separate /upload-to-s3 endpoint
        // The downloadLink should already contain the S3 URL from the frontend upload

        const newMovie = new Movie({
            movieID: movieDetails.id,
            backdropPath: 'https://image.tmdb.org/t/p/original' + movieDetails.backdrop_path,
            budget: Number(movieDetails.budget),
            genreIds: genreIds,
            genres: movieDetails.genres.split(','),
            originalTitle: movieDetails.original_title,
            overview: movieDetails.overview,
            ratings: Number(movieDetails.ratings),
            popularity: Number(movieDetails.popularity),
            posterPath: 'https://image.tmdb.org/t/p/original' + movieDetails.poster_path,
            productionCompanies: movieDetails.production_companies,
            releaseDate: movieDetails.release_date,
            revenue: Number(movieDetails.revenue),
            runtime: Number(movieDetails.runtime),
            status: movieDetails.status,
            title: movieDetails.title,
            watchProviders: movieDetails.watchProviders,
            logos: movieDetails.logos ? 'https://image.tmdb.org/t/p/original' + movieDetails.logos : '',
            downloadLink: movieDetails.downloadLink, // This should now contain the S3 URL
            ignoreTitleOnScan: movieDetails.ignoreTitleOnScan
        });

        const savedMovie = await newMovie.save();

        res.json({
            success: true,
            message: 'Movie details submitted successfully!',
            data: savedMovie
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to submit movie details' });
    }
});

// Your existing routes...
router.post('/fetch-movie', async (req, res) => {
    let search_term = req.body.searchTerm;

    try {
        const url = `https://api.themoviedb.org/3/search/movie?query=${search_term}&include_adult=false&language=en-US&page=1`;
        const options = {
            method: 'GET',
            headers: {
                accept: 'application/json',
                Authorization: process.env.TMDB_AUTH_KEY
            }
        };

        const responseData = await fetch(url, options);
        const result = await responseData.json();
        console.log("Result", result);

        // Check if any results were found
        if (result.results.length === 0) {
            return res.status(404).json({ error: 'No movies found with the given search term' });
        }

        // Render the page with a list of movies and posters
        res.render('addMovieList', { movieList: result.results });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch movie details' });
    }
});

router.get('/addMovie/:movieId', async (req, res) => {
    const movieId = req.params.movieId;

    try {
        const url = `https://api.themoviedb.org/3/movie/${movieId}?language=en-US`;
        const options = {
            method: 'GET',
            headers: {
                accept: 'application/json',
                Authorization: process.env.TMDB_AUTH_KEY
            }
        };

        const movieData = await fetch(url, options);
        const movieDetails = await movieData.json();

        const watchProvidersUrl = `https://api.themoviedb.org/3/movie/${movieId}/watch/providers`;
        const watchProvidersResponse = await fetch(watchProvidersUrl, options);
        const watchProvidersResult = await watchProvidersResponse.json();

        const watchProviders = Object.keys(watchProvidersResult.results)
            .filter((country) => country === "US")
            .map((country) => {
                const countryData = watchProvidersResult.results[country];
                return {
                    country,
                    providerName: countryData.flatrate ? countryData.flatrate[0]?.provider_name : countryData.buy[0]?.provider_name,
                };
            });

        movieDetails.watchProviders = watchProviders;

        const genreIds = movieDetails.genres.map(genre => genre.id);
        const genreNames = movieDetails.genres.map(genre => genre.name);
        movieDetails.production_companies = movieDetails.production_companies.map(company => company.name);
        movieDetails.watchProviders = watchProviders.map(provider => provider.providerName);

        movieDetails.genreIds = genreIds;
        movieDetails.genres = genreNames;

        console.log("Movie Details", movieDetails)

        res.render('addMovie', { movieDetails });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch movie details' });
    }
});

module.exports = router;