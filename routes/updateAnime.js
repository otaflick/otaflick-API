const express = require('express');
const router = express.Router();
const Anime = require('../models/Anime');

// Get list of all anime for editing
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

// Get specific anime details for updating
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

// Update anime details
router.post('/update-anime/:id', async (req, res) => {
    try {
        const existingAnime = await Anime.findById(req.params.id);

        if (!existingAnime) {
            return res.status(404).send('Anime not found');
        }

        console.log("Request body", req.body)

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
                seasons: req.body.seasons.map(season => ({
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
            },
            { new: true }
        );

        res.json({ success: true })
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