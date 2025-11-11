const express = require('express');
const router = express.Router();
const isLoggedIn = require('../routes/isLoggedin')
const Anime = require('../models/Anime')

// Get all watched anime for the logged-in user
router.get('/all-watched-anime', isLoggedIn, async (req, res) => {
    try {
        const user = req.user;
        const allAnime = await Anime.find(); 

        const watchedAnime = await Promise.all(user.watchedAnime.map(async ({ _id, episode, watchedTime, uploadTime }) => {
            let episodeInfo = null;

            for (const animeItem of allAnime) { 
                for (const season of animeItem.seasons) {
                    const foundEpisode = season.episodes.find(ep => ep._id.toString() === episode.toString());
                    if (foundEpisode) {
                        episodeInfo = {
                            animeId: animeItem._id,
                            episodeID: episode,
                            animeName: animeItem.name,
                            seasonNumber: season.season_number,
                            animePoster: animeItem.posterPath,
                            episodeNumber: foundEpisode.episode_number,
                            episodePoster: foundEpisode.poster,
                            episodeRuntime: foundEpisode.runtime,
                            episodeLink: foundEpisode.downloadLink,
                            episodeName: foundEpisode.name,
                            animeStatus: animeItem.status 
                        };
                        break;
                    }
                }

                if (episodeInfo) {
                    break;
                }
            }

            return {
                id: _id,
                episodeInfo,
                watchedTime,
                uploadTime,
            };
        }));

        // Sort the watchedAnime based on the uploadTime in descending order
        watchedAnime.sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime)); // Fixed date comparison

        res.json({ success: true, watchedAnime });
    } catch (error) {
        console.error("Error in /all-watched-anime:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update anime watched time
router.post('/update-anime-watched-time/:episodeID', isLoggedIn, async (req, res) => {
    try {
        const user = req.user;
        const episodeID = req.params.episodeID;
        const watchedTime = req.body.watchedTime;
        const episodeAnimeID = req.body.animeID;

        // Find the anime in the user's watchedAnime and update the watched time
        const episodeToUpdate = user.watchedAnime.find(item => item.episode.equals(episodeID));
        if (episodeToUpdate) {
            episodeToUpdate.watchedTime = watchedTime;
            episodeToUpdate.uploadTime = Date.now();
        } else {
            user.watchedAnime.push({ 
                episode: episodeID, 
                animeID: episodeAnimeID, 
                watchedTime, 
                uploadTime: Date.now() 
            });
        }

        await user.save();
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get specific anime episode watch time
router.get('/get-anime-watchtime/:episodeID', isLoggedIn, async (req, res) => {
    try {
        const user = req.user;
        const episodeID = req.params.episodeID;

        // Find the episode in the watchedAnime array
        const watchedEpisode = user.watchedAnime.find(item => item.episode.equals(episodeID));

        if (watchedEpisode) {
            res.json({ success: true, watchedTime: watchedEpisode.watchedTime });
        } else {
            res.status(404).json({ success: false, message: 'Episode not found in watchedAnime' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Remove anime from watched list
router.delete('/remove-watched-anime/:episodeID', isLoggedIn, async (req, res) => {
    try {
        const user = req.user;
        const episodeID = req.params.episodeID;

        // Find the index of the episode in the watchedAnime array
        const indexToRemove = user.watchedAnime.findIndex(item => item.episode.equals(episodeID));

        if (indexToRemove !== -1) {
            // Remove the episode from the array if found
            user.watchedAnime.splice(indexToRemove, 1);
            await user.save();
            res.json({ success: true, user });
        } else {
            res.status(404).json({ success: false, message: 'Episode not found in watchedAnime' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get episode information
router.get('/anime/episode-info/:episodeId', async (req, res) => {
    try {
        const episodeId = req.params.episodeId;

        const allAnime = await Anime.find();
        let seasonArray = null;
        let animeID = null;

        for (const anime of allAnime) { 
            for (const season of anime.seasons) {
                const foundEpisode = season.episodes.find(ep => ep._id.toString() === episodeId);

                if (foundEpisode) {
                    seasonArray = season.episodes;
                    animeID = anime._id
                    break;
                }
            }

            if (seasonArray) {
                break;
            }
        }

        if (seasonArray) {
            res.json({ success: true, animeID, seasonArray });
        } else {
            res.status(404).json({ success: false, message: 'Episode not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
// Get latest watched episode ID for a specific anime
router.get('/get-latest-watched-episodeID/:animeID', isLoggedIn, async (req, res) => {
    try {
        const { animeID } = req.params;
        const user = req.user;
        const watchedAnime = user.watchedAnime.filter(anime => anime.animeID.toString() === animeID);
        
        if (watchedAnime.length === 0) {
            return res.json({ episodeID: null });
        }

        // Sort watched episodes by uploadTime in descending order
        watchedAnime.sort((a, b) => b.uploadTime - a.uploadTime);

        // Get the episodeID of the latest episode
        const latestEpisodeID = watchedAnime[0].episode;

        res.json({ episodeID: latestEpisodeID });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get anime progress (how many episodes watched vs total)
router.get('/anime-progress/:animeID', isLoggedIn, async (req, res) => {
    try {
        const { animeID } = req.params;
        const user = req.user;
        
        // Find the anime
        const anime = await Anime.findById(animeID);
        if (!anime) {
            return res.status(404).json({ success: false, message: 'Anime not found' });
        }

        // Get user's watched episodes for this anime
        const watchedEpisodes = user.watchedAnime.filter(item => item.animeID.toString() === animeID);
        
        // Calculate total episodes
        let totalEpisodes = 0;
        anime.seasons.forEach(season => {
            totalEpisodes += season.episodes.length;
        });

        // Calculate progress percentage
        const progressPercentage = totalEpisodes > 0 ? (watchedEpisodes.length / totalEpisodes) * 100 : 0;

        res.json({
            success: true,
            animeName: anime.name,
            watchedEpisodes: watchedEpisodes.length,
            totalEpisodes,
            progressPercentage: Math.round(progressPercentage),
            completed: watchedEpisodes.length === totalEpisodes
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Clear all watched history for a specific anime
router.delete('/clear-anime-history/:animeID', isLoggedIn, async (req, res) => {
    try {
        const { animeID } = req.params;
        const user = req.user;

        // Remove all episodes of this anime from watched list
        user.watchedAnime = user.watchedAnime.filter(item => !item.animeID.equals(animeID));
        
        await user.save();
        res.json({ 
            success: true, 
            message: 'Anime watch history cleared successfully',
            user 
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;