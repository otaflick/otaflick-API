require('dotenv').config();
const express = require('express');
const router = express.Router()
const Anime = require('../models/Anime')

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
        if (req.body.animeDetails) {
            // Decode anime details
            ['name', 'overview', 'genres'].forEach(field => {
                if (req.body.animeDetails[field]) {
                    req.body.animeDetails[field] = decodeHTMLEntities(req.body.animeDetails[field]);
                }
            });
        }
        
        if (req.body.seasons) {
            // Decode seasons and episodes
            req.body.seasons.forEach(season => {
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
        next();
    } catch (error) {
        console.error('Error decoding HTML entities:', error);
        next(error);
    }
};

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
        // console.log("Anime Results", result);

        // Check if any results were found
        if (result.results.length === 0) {
            return res.status(404).json({ error: 'No anime found with the given search term' });
        }

        // Filter for anime (you might want to add more specific filtering)
        const animeResults = result.results.filter(show => 
            show.genre_ids.includes(16) || // Animation genre
            show.name.toLowerCase().includes('anime') ||
            show.original_language === 'ja' // Japanese origin
        );

        if (animeResults.length === 0) {
            return res.status(404).json({ error: 'No anime found with the given search term' });
        }

        // Render the page with a list of anime
        res.render('addAnimeList', { animeList: animeResults });
        // res.json(result)
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch anime details' });
    }
});

// Create a new route for handling anime selection
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
        console.log("Genre Names are as follows", genreNames)
        animeDetails.production_companies = animeDetails.production_companies.map(company => company.name);

        animeDetails.genreIds = genreIds;
        animeDetails.genres = genreNames;

        console.log("Anime Details", animeDetails)

        const numOfSeasons = animeDetails.number_of_seasons
        console.log("Number of seasons", numOfSeasons)

        animeDetails.seasons = [];

        for (let i = 1; i <= numOfSeasons; i++) {
            const seasonUrl = `https://api.themoviedb.org/3/tv/${animeID}/season/${i}?language=en-US`;
            const response = await fetch(seasonUrl, options);
            const seasonData = await response.json();
            // console.log("Season Data", seasonData)
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

        // res.json(selectedAnimeDetails)
        res.render('addAnime', { animeDetails: selectedAnimeDetails })
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch anime details' });
    }
});

router.post('/add-anime-details', decodeAnimeData, async (req, res) => {
    try {
        const animeDetailsData = req.body;

        console.log("Anime Details on adding (DECODED):", animeDetailsData)

        const newAnimeDocument = new Anime({
            // Remove the replaceAll since we're now properly decoding
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
            seasons: animeDetailsData.seasons.map(season => ({
                season_number: Number(season.season_number),
                episodes: season.episodes.map(episode => ({
                    episode_number: Number(episode.episode_number),
                    name: episode.name,
                    runtime: Number(episode.runtime),
                    overview: episode.overview,
                    poster: episode.poster,
                    downloadLink: episode.downloadLink
                }))
            }))
        });

        // Save the document to the database
        const savedAnime = await newAnimeDocument.save();

        console.log('Anime details saved successfully:', savedAnime);
        res.json({ success: true })
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to submit anime details' });
    }
});

module.exports = router;