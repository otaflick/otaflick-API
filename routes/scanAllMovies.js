require('dotenv').config();
const express = require('express');
const router = express.Router();
const Movie = require('../models/movie');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');

const directory = process.env.MOVIE_DIR;
const absolutePath = path.resolve(directory);

let clients = [];

router.post('/scanAllLocalMovies', async (req, res) => {
    try {
        res.status(200).send({ message: 'Processing started' });

        const files = fs.readdirSync(absolutePath);
        console.log("Files are", files)
        const regexPattern = /^(.+?)(?:\s|\.)?(\d{4})/;

        // Get all movies currently in the database
        const existingMovies = await Movie.find({}, 'title');
        const existingTitles = existingMovies.map(movie => movie.title);
        console.log("Existing movies", existingTitles)

        // // Identify files to add and titles to remove
        const movieFiles = files.map(file => {
            const match = file.match(regexPattern);
            const movieName = match ? match[1] : file;

            return {
                movieName: movieName.replace(/\(|\)/g, '').replace(/\./g, ' '),
                filename: file
            };
        });

        // Filter new movies that are not in the existing titles
        const newMovies = movieFiles.filter(file => !existingTitles.includes(file.movieName));

        // Filter titles to remove (titles in the database that are not found in the movie files)
        const titlesToRemove = existingTitles.filter(title =>
            !movieFiles.some(file => file.movieName === title)
        );

        console.log('New movies to add:', newMovies);
        console.log('Titles to remove:', titlesToRemove);

        // Remove titles no longer present in the directory
        for (const title of titlesToRemove) {
            const movieToRemove = await Movie.findOne({ title });
            if (!movieToRemove) continue;

            await Movie.deleteOne({ title });

            await User.updateMany(
                { "watchedMovies.movie": movieToRemove._id },
                { $pull: { watchedMovies: { movie: movieToRemove._id } } }
            );

            await User.updateMany(
                { mylist: movieToRemove._id },
                { $pull: { mylist: movieToRemove._id } }
            );
        }


        // Process and add new movies
        let processedMovies = 0;
        for (const movie of newMovies) {
            // console.log("Movie processing",movie)
            const totalMovies = newMovies.length;
            const search_term = encodeURIComponent(movie.movieName);
            const url = `https://api.themoviedb.org/3/search/movie?query=${search_term}&include_adult=false&language=en-US&page=1`;
            const options = {
                method: 'GET',
                headers: {
                    accept: 'application/json',
                    Authorization: process.env.TMDB_AUTH_KEY
                }
            };

            // Notify clients about the progress
            clients.forEach(client => {
                client.res.write(`data: ${JSON.stringify({ index: processedMovies + 1, total: totalMovies, movie })}\n\n`);
            });

            try {
                const response = await fetch(url, options);
                const result = await response.json();
                const movieId = result.results.length > 0 ? result.results[0].id : null;

                if (movieId) {
                    const movieDetailsUrl = `https://api.themoviedb.org/3/movie/${movieId}?language=en-US`;
                    const movieDetailsResponse = await fetch(movieDetailsUrl, options);
                    const movieDetailsResult = await movieDetailsResponse.json();

                    const genreNames = movieDetailsResult.genres.map(genre => genre.name);
                    const genreIds = movieDetailsResult.genres.map(genre => genre.id);
                    const downloadLink = `${process.env.HTTP_SERVER_ADDR}/movies/${encodeURIComponent(movie.filename)}`;

                    const newMovie = new Movie({
                        movieID: movieDetailsResult.id,
                        title: movieDetailsResult.title,
                        originalTitle: movieDetailsResult.original_title,
                        genres: genreNames,
                        genreIds: genreIds,
                        overview: movieDetailsResult.overview,
                        releaseDate: movieDetailsResult.release_date,
                        runtime: movieDetailsResult.runtime,
                        posterPath: 'https://image.tmdb.org/t/p/original' + movieDetailsResult.poster_path,
                        backdropPath: 'https://image.tmdb.org/t/p/original' + movieDetailsResult.backdrop_path,
                        downloadLink,
                        ignoreTitleOnScan: false
                    });

                    await newMovie.save();
                    processedMovies++;
                }
                
            } catch (error) {
                console.error(`Error fetching details for ${movie}:`, error);
            }
        }

        // Notify clients of completion
        clients.forEach(client => client.res.write('data: {"complete": true}\n\n'));
        clients.forEach(client => client.res.end());
        clients.length = 0;

    } catch (error) {
        console.error('Error during scan:', error);
        res.status(500).send({ error: 'Error during scan' });
    }
});

router.get('/progress', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    clients.push({ res });

    req.on('close', () => {
        clients = clients.filter(client => client.res !== res);
    });
});

module.exports = router;