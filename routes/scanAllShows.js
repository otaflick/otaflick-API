require('dotenv').config();
const express = require('express');
const router = express.Router();
const Shows = require('../models/Shows')
const User = require('../models/User')
const path = require('path');
const fs = require('fs');

const directory = process.env.SHOWS_DIR;
const absolutePath = path.resolve(directory);

let clients = [];


async function scanDirectory(dir, filenames = [], titles = [], filepaths = [], ignoredShowDirNames = []) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            if (ignoredShowDirNames.includes(file)) {
                console.log(`Skipping ignored directory: ${file}`);
                continue; // Skip this directory
            }
            await scanDirectory(filePath, filenames, titles, filepaths, ignoredShowDirNames);
        } else {
            // Skip .srt files
            if (file.endsWith('.srt')) {
                // console.log(`Skipping .srt file: ${file}`);
                continue;
            }

            // Regular expression to capture the show title and season
            const showTitleMatch = file.match(/^(.+?)\s*-?\s*S(\d{2})/);

            if (showTitleMatch) {
                let showTitle = showTitleMatch[1].replace(/\./g, ' ').trim(); // Clean up the show title

                // Remove the year part (if it exists) after capturing the show title
                showTitle = showTitle.replace(/\(\d{4}\)/, '').replace(/\d{4}/, '').trim();

                if (!titles.includes(showTitle)) {
                    titles.push(showTitle); // Add the formatted title to the titles list
                }

                // console.log("Show Title:", showTitle); // For debugging

                // Generate full and relative file paths
                const fileFullPath = path.join(dir, file);
                const filePathWithoutPrefix = fileFullPath
                    .replace(/.*?TV Shows\\/, '') // Adjust to your specific directory structure
                    .replace(/\\/g, '/'); // Normalize path separators to '/'

                filenames.push(file);
                filepaths.push(filePathWithoutPrefix);
            }
        }
    }

    return { titles, filenames, filepaths };
}


async function fetchDetailedShowDetails(showID, options) {
    const url = `https://api.themoviedb.org/3/tv/${showID}?language=en-US`;
    const showsData = await fetch(url, options);
    const showsDetails = await showsData.json();

    if (!showsDetails) {
        return null;
    }

    const genreIds = showsDetails.genres.map(genre => genre.id);
    const genreNames = showsDetails.genres.map(genre => genre.name);
    // showsDetails.production_companies = showsDetails.production_companies.map(company => company.name);

    showsDetails.genreIds = genreIds;
    showsDetails.genres = genreNames;

    const numOfSeasons = showsDetails.number_of_seasons;

    showsDetails.seasons = [];

    for (let i = 1; i <= numOfSeasons; i++) {
        const seasonUrl = `https://api.themoviedb.org/3/tv/${showID}/season/${i}?language=en-US`;
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

        showsDetails.seasons.push({
            season_number: seasonData.season_number,
            episodes: episodes
        });
    }

    return {
        first_air_date: showsDetails.first_air_date,
        genres: showsDetails.genres,
        id: showsDetails.id,
        name: showsDetails.name,
        overview: showsDetails.overview,
        poster_path: "https://image.tmdb.org/t/p/original" + showsDetails.poster_path,
        backdrop_path: "https://image.tmdb.org/t/p/original" + showsDetails.backdrop_path,
        vote_average: showsDetails.vote_average,
        seasons: showsDetails.seasons
    };
}

async function addDownloadLink(shows, filePaths) {
    shows.forEach(show => {
        const { showDetails } = show;
        const { seasons } = showDetails;

        seasons.forEach(season => {
            const { season_number, episodes } = season;

            episodes.forEach(episode => {
                const formattedSeason = String(season_number).padStart(2, '0');
                const formattedEpisode = String(episode.episode_number).padStart(2, '0');
                const episodeDesignation = `S${formattedSeason}E${formattedEpisode}`;

                // Debug log to check the show name and episode designation
                console.log("Show Name:", showDetails.name);
                console.log("Formatted Season:", formattedSeason);
                console.log("Formatted Episode:", formattedEpisode);
                console.log("Episode Designation:", episodeDesignation);

                // Remove any year (4 digits) from the show name
                const showNameWithoutYear = showDetails.name.replace(/\(\d{4}\)/, '').trim();

                // Match file path by checking if show name (without year) and episode designation are part of the file path
                const matchingFilePath = filePaths.find(filePath =>
                    filePath.toLowerCase().includes(showNameWithoutYear.toLowerCase().replace(/\s+/g, ' ').replace(/[:.]/g, '').trim()) &&
                    filePath.toLowerCase().includes(episodeDesignation.toLowerCase())
                );

                // Log to inspect the matching file path
                console.log("Matching File Path:", matchingFilePath);

                const filePathWithoutPrefix = matchingFilePath ? `${process.env.HTTP_SERVER_ADDR}/shows/${matchingFilePath.replace(/^.*?shows[\\/]/i, '').replace(/\s/g, '%20')}` : "Filepath not found";

                // Update the episode download link
                episode.downloadLink = filePathWithoutPrefix;
                console.log(`Download Link for ${episodeDesignation}:`, episode.downloadLink);
            });
        });
    });

    return shows;
}

function normalizeTitle(title) {
    // Remove all non-alphanumeric characters and convert to lowercase
    return title.replace(/[^a-z0-9\s]/gi, '').toLowerCase().trim();
}

router.post('/scanAllLocalShows', async (req, res) => {
    try {
        res.status(200).send({ message: 'Processing started' });

        // Fetch all shows in the database
        const existingShows = await Shows.find({}, 'name');
        const existingTitles = existingShows.map(show => show.name);
        console.log('Existing titles in the database:', existingTitles);

        // // Ignore shows with `ignoreTitleOnScan` set to true
        const ignoredShows = await Shows.find({ ignoreTitleOnScan: true }, 'name');
        const ignoredShowDirNames = ignoredShows.map(show => show.name);

        // Scan the directory for new shows
        const { titles, filenames, filepaths } = await scanDirectory(
            absolutePath,
            [],
            [],
            [],
            ignoredShowDirNames
        );
        console.log('Scanned titles from directory:', titles);

        // Remove titles no longer present in the directory (normalize for comparison)
        const titlesToRemove = existingTitles.filter(
            title => !titles.some(scannedTitle => normalizeTitle(title) === normalizeTitle(scannedTitle))
        );
        console.log('Titles to remove:', titlesToRemove);

        for (const title of titlesToRemove) {
            try {
                const showToRemove = await Shows.findOne({ name: title });
                if (!showToRemove) continue;

                // Delete the show from the database
                await Shows.deleteOne({ name: title });

                // Remove references from users' watchedShows and showsMylist
                await User.updateMany(
                    { "watchedShows.showID": showToRemove._id },
                    { $pull: { watchedShows: { showID: showToRemove._id } } }
                );
                await User.updateMany(
                    { showsMylist: showToRemove._id },
                    { $pull: { showsMylist: showToRemove._id } }
                );

                console.log(`Removed show: ${title}`);
            } catch (error) {
                console.error(`Error removing show '${title}':`, error);
            }
        }

        // Process and add new shows
        const shows = [];
        const totalShows = titles.length;
        let processedShows = 0;

        for (const title of titles) {
            // Normalize and check if the show exists
            const normalizedTitle = normalizeTitle(title);
            const showExists = existingTitles.some(existingTitle => normalizeTitle(existingTitle) === normalizedTitle);
            if (showExists) {
                console.log(`Show '${title}' already exists. Skipping...`);
                continue;
            }
            // Notify clients about the progress
            clients.forEach(client => {
                client.res.write(`data: ${JSON.stringify({ index: processedShows + 1, total: totalShows, title })}\n\n`);
            });

            try {
                // Fetch show details from TMDB
                const url = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(title)}&include_adult=false&language=en-US&page=1`;
                const options = {
                    method: 'GET',
                    headers: {
                        accept: 'application/json',
                        Authorization: process.env.TMDB_AUTH_KEY
                    }
                };

                const responseData = await fetch(url, options);
                const result = await responseData.json();

                if (result && result.results && result.results.length > 0) {
                    const showID = result.results[0].id;
                    const showDetails = await fetchDetailedShowDetails(showID, options);

                    if (showDetails) {
                        shows.push({
                            showDetails,
                        });
                    }
                }
            } catch (error) {
                console.error(`Error fetching details for '${title}':`, error);
            }
            processedShows++;
        }

        // Add download links and save new shows to the database
        const modifiedShowDetails = await addDownloadLink(shows, filepaths);
        for (const modifiedShow of modifiedShowDetails) {
            try {
                const newShowsDocument = new Shows({
                    genres: modifiedShow.showDetails.genres,
                    overview: modifiedShow.showDetails.overview,
                    posterPath: modifiedShow.showDetails.poster_path,
                    backdropPath: modifiedShow.showDetails.backdrop_path,
                    releaseDate: new Date(modifiedShow.showDetails.first_air_date),
                    name: modifiedShow.showDetails.name,
                    ratings: modifiedShow.showDetails.vote_average,
                    ignoreTitleOnScan: false,
                    showDirName: '',
                    seasons: modifiedShow.showDetails.seasons.map(season => ({
                        season_number: season.season_number,
                        episodes: season.episodes.map(episode => ({
                            episode_number: episode.episode_number,
                            name: episode.name,
                            runtime: episode.runtime,
                            overview: episode.overview,
                            poster: episode.poster,
                            downloadLink: episode.downloadLink
                        }))
                    }))
                });

                await newShowsDocument.save();
                console.log(`Added new show: ${modifiedShow.showDetails.name}`);
            } catch (error) {
                console.error('Error saving show to MongoDB:', error);
            }
        }

        // Notify clients of completion
        clients.forEach(client => client.res.write('data: {"complete": true}\n\n'));
        clients.forEach(client => client.res.end());
        clients.length = 0;
    } catch (error) {
        console.error('Error scanning shows:', error);
        res.status(500).send('Internal Server Error');
    }
});


router.get('/progress-shows', (req, res) => {
    console.log('Client connected for progress updates');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // flush the headers to establish SSE with client

    clients.push({ res });
    console.log('Number of connected clients:', clients.length);

    req.on('close', () => {
        clients = clients.filter(client => client.res !== res);
        console.log('Client disconnected, remaining clients:', clients.length);
    });
});


module.exports = router;