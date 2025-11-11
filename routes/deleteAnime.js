// routes/deleteAnime.js
const express = require('express');
const router = express.Router();
const Anime = require('../models/Anime');
const Users = require("../models/User")

// Get delete anime page with all anime list
router.get('/delete-anime', async (req, res) => {
    try {
        const anime = await Anime.find().sort({ name: 1 }); // Sort by name for easier finding
        console.log("Delete Anime", anime)
        res.render('deleteAnime', { anime });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// Delete specific anime by ID
router.post('/delete-anime/:id', async (req, res) => {
    try {
        const animeId = req.params.id;
        const deleteAnime = await Anime.findOneAndDelete({ _id: animeId });

        if (!deleteAnime) {
            return res.status(404).send('Anime not found');
        }

        // Remove the anime from users' animeMylist
        await Users.updateMany(
            { animeMylist: animeId },
            { $pull: { animeMylist: animeId } }
        );

        // Remove the anime references from users' watchedAnime array
        await Users.updateMany(
            { 'watchedAnime.animeID': animeId },
            { $pull: { watchedAnime: { animeID: animeId } } }
        );

        const anime = await Anime.find().sort({ name: 1 });
        res.render('deleteAnime', { 
            anime, 
            successMessage: 'Anime deleted successfully!' 
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});


module.exports = router;