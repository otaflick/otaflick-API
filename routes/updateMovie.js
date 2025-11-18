const express = require('express');
const router = express.Router();
const Movie = require('../models/movie');
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
                'title', 'overview', 'originalTitle', 'genres', 
                'productionCompanies', 'watchProviders', 'status'
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

router.get('/edit-movie-list', async (req, res) => {
    try {
        const movies = await Movie.find().sort({ _id: -1 });
        console.log("Movie list are", movies)
        res.render('editMovieList', { movies });

    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/movies/:id', async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        res.render('updateMovieDetails', { movie });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// Updated S3 upload endpoint with MP4 conversion
router.post('/upload-to-s3-update', upload.single('file'), async (req, res) => {
    console.log('=== S3 UPLOAD FOR UPDATE ===');
    
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No file uploaded' 
            });
        }

        const { movieName } = req.body;
        
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
        if (movieName) {
            s3Key = `videos/movies/${movieName.replace(/[^a-zA-Z0-9]/g, '_')}_${uuidv4()}${finalExtension}`;
        } else {
            s3Key = `videos/movies/${uuidv4()}${finalExtension}`;
        }

        console.log('S3 Key:', s3Key);

        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
            Body: uploadBuffer,
            ContentType: finalContentType,
            ContentDisposition: 'inline',
            CacheControl: 'public, max-age=31536000'
        };

        const uploadResult = await s3.upload(uploadParams).promise();
        
        console.log('Upload successful!');
        console.log('S3 Location:', uploadResult.Location);
        
        res.json({
            success: true,
            url: uploadResult.Location,
            key: uploadResult.Key,
            size: uploadBuffer.length,
            type: finalContentType,
            converted: isConvertibleVideo
        });

    } catch (error) {
        console.error('S3 UPLOAD FAILED:', error);
        
        let userMessage = 'Failed to upload file to S3';
        
        if (error.message.includes('timeout')) {
            userMessage = 'S3 upload timed out. The file may be too large or there may be network issues.';
        } else if (error.code === 'UnknownEndpoint') {
            userMessage = `Cannot connect to S3 in region '${process.env.AWS_REGION}'. Check if the bucket exists in this region.`;
        } else if (error.code === 'NetworkingError') {
            userMessage = 'Network error connecting to AWS S3. Check your internet connection.';
        } else if (error.code === 'InvalidAccessKeyId') {
            userMessage = 'AWS Access Key is invalid. Check your AWS credentials.';
        } else if (error.code === 'SignatureDoesNotMatch') {
            userMessage = 'AWS Secret Key is invalid. Check your AWS credentials.';
        } else if (error.code === 'NoSuchBucket') {
            userMessage = `S3 bucket '${process.env.AWS_BUCKET_NAME}' does not exist.`;
        }
        
        res.status(500).json({ 
            success: false,
            error: userMessage,
            details: error.message,
            code: error.code
        });
    }
});

// Update your existing update route to handle S3 uploads with HTML entity decoding
router.post('/update-movie/:id', upload.any(), decodeMovieData, async (req, res) => {
    try {
        // Check if there's a file upload for the movie
        let downloadLink = req.body.downloadLink;
        const uploadedFile = req.files.find(file => file.fieldname === 'file_downloadLink');

        if (uploadedFile) {
            try {
                // Convert video to MP4 before upload
                const fileExtension = '.' + uploadedFile.originalname.split('.').pop().toLowerCase();
                const videoFormats = ['.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'];
                const isConvertibleVideo = videoFormats.includes(fileExtension);

                let uploadBuffer = uploadedFile.buffer;
                let finalExtension = fileExtension;

                if (isConvertibleVideo) {
                    console.log(`Converting movie file to MP4...`);
                    try {
                        const convertedBuffer = await convertToMP4(uploadedFile.buffer, fileExtension);
                        uploadBuffer = convertedBuffer;
                        finalExtension = '.mp4';
                    } catch (conversionError) {
                        console.error('Conversion failed for movie:', conversionError);
                    }
                }

                const uploadParams = {
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: `videos/movies/${req.body.title || 'movie'}_${uuidv4()}${finalExtension}`,
                    Body: uploadBuffer,
                    ContentType: 'video/mp4',
                    ContentDisposition: 'inline',
                    CacheControl: 'public, max-age=31536000'
                };

                const uploadResult = await s3.upload(uploadParams).promise();
                downloadLink = uploadResult.Location;
                console.log('Movie file uploaded to S3:', downloadLink);
            } catch (uploadError) {
                console.error('Failed to upload movie file:', uploadError);
            }
        }

        const updatedMovie = await Movie.findByIdAndUpdate(
            req.params.id,
            {
                movieID: Number(req.body.movieID),
                backdropPath: req.body.backdropPath,
                budget: Number(req.body.budget),
                genreIds: req.body.genreIds.split(',').map(id => Number(id)),
                genres: req.body.genres.split(','),
                originalTitle: req.body.originalTitle,
                overview: req.body.overview,
                ratings: Number(req.body.ratings),
                popularity: Number(req.body.popularity),
                posterPath: req.body.posterPath,
                productionCompanies: req.body.productionCompanies.split(','),
                releaseDate: req.body.releaseDate,
                revenue: Number(req.body.revenue),
                runtime: Number(req.body.runtime),
                status: req.body.status,
                title: req.body.title,
                watchProviders: [req.body.watchProviders],
                logos: req.body.logos.startsWith('http') ? req.body.logos : 'https://image.tmdb.org/t/p/original' + req.body.logos,
                downloadLink: downloadLink,
                ignoreTitleOnScan: req.body.ignoreTitleOnScan
            },
            { new: true }
        );

        res.render('updateMovieDetails', {
            movie: updatedMovie,
            successMessage: 'Movie updated successfully!',
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;