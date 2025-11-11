require('dotenv').config();
const express = require('express');
const router = express.Router()
const Shows = require('../models/Shows')


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
        if (req.body.showDetails) {
            // Decode show details
            ['name', 'overview', 'genres'].forEach(field => {
                if (req.body.showDetails[field]) {
                    req.body.showDetails[field] = decodeHTMLEntities(req.body.showDetails[field]);
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


router.post('/fetch-shows', async (req, res) => {
    let search_term = req.body.searchTerm;
    console.log("Search Term is",search_term)

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
        // console.log("TV Shows", result);

        // Check if any results were found
        if (result.results.length === 0) {
            return res.status(404).json({ error: 'No TV Shows found with the given search term' });
        }

        // Render the page with a list of movies and posters
        res.render('addShowsList', { showsList: result.results });
        // res.json(result)
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch TV Show details' });
    }
});

// Create a new route for handling movie selection
router.get('/addShows/:showID', async (req, res) => {
    const showID = req.params.showID;

    try {
        const url = `https://api.themoviedb.org/3/tv/${showID}?language=en-US`;
        const options = {
            method: 'GET',
            headers: {
                accept: 'application/json',
                Authorization: process.env.TMDB_AUTH_KEY
            }
        };

        const showsData = await fetch(url, options);
        const showsDetails = await showsData.json();

        const genreIds = showsDetails.genres.map(genre => genre.id);
        const genreNames = showsDetails.genres.map(genre => genre.name);
        console.log("Genre Names are as follows",genreNames)
        showsDetails.production_companies = showsDetails.production_companies.map(company => company.name);

        showsDetails.genreIds = genreIds;
        showsDetails.genres = genreNames;

        console.log("TV Shows Details", showsDetails)

        // Render the addMovie page with the details of the selected movie
        // res.render('addMovie', { movieDetails });


        const numOfSeasons = showsDetails.number_of_seasons
        console.log("Number of seasons",numOfSeasons)

        showsDetails.seasons = [];

        for (let i = 1; i <= numOfSeasons; i++) {

            const seasonUrl = `https://api.themoviedb.org/3/tv/${showID}/season/${i}?language=en-US`;
            const response = await fetch(seasonUrl, options);
            const seasonData = await response.json();
            // console.log("Season Data", seasonData)
            const episodes = seasonData.episodes.map(episode => ({
                episode_number: episode.episode_number,
                name: episode.name,
                runtime: episode.runtime,
                overview: episode.overview,
                poster: "https://image.tmdb.org/t/p/original"+episode.still_path,
                downloadLink: ""
            }));
        
            showsDetails.seasons.push({
                season_number: seasonData.season_number,
                episodes: episodes
            });
        }

        const selectedShowDetails = {
            first_air_date: showsDetails.first_air_date,
            genres: showsDetails.genres,
            id: showsDetails.id,
            name: showsDetails.name,
            overview: showsDetails.overview,
            poster_path: "https://image.tmdb.org/t/p/original"+showsDetails.poster_path,
            backdrop_path: "https://image.tmdb.org/t/p/original"+showsDetails.backdrop_path,
            vote_average: showsDetails.vote_average,
            seasons: showsDetails.seasons
        };

        // res.json(selectedShowDetails)
        res.render('addShows', { showsDetails:selectedShowDetails })
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch TV Shows details' });
    }
});



router.post('/add-show-details', decodeShowData, async (req, res) => {
    try {
        const showsDetailsData = req.body;

        console.log("Show Details on adding (DECODED):", showsDetailsData)

        const newShowsDocument = new Shows({
            // Remove the replaceAll since we're now properly decoding
            genres: Array.isArray(showsDetailsData.showDetails.genres) 
                ? showsDetailsData.showDetails.genres 
                : showsDetailsData.showDetails.genres.split(',').map(genre => genre.trim()),
            overview: showsDetailsData.showDetails.overview,
            posterPath: showsDetailsData.showDetails.poster_path,
            backdropPath: showsDetailsData.showDetails.backdrop_path,
            releaseDate: new Date(showsDetailsData.showDetails.first_air_date),
            name: showsDetailsData.showDetails.name,
            ratings: Number(showsDetailsData.showDetails.vote_average),
            ignoreTitleOnScan: showsDetailsData.showDetails.ignoreTitleOnScan,
            showDirName: showsDetailsData.showDetails.showDirName,
            seasons: showsDetailsData.seasons.map(season => ({
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
        const savedShows = await newShowsDocument.save();

        console.log('Shows details saved successfully:', savedShows);
        res.json({ success: true })
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to submit show details' });
    }
});

module.exports = router;