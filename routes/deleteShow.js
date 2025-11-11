// routes/deleteMovie.js
const express = require('express');
const router = express.Router();
const Shows = require('../models/Shows');
const Users = require("../models/User")

router.get('/delete-show', async (req, res) => {
    try {
        const shows = await Shows.find();
        console.log("Delete Shows",shows)
        res.render('deleteShow', { shows });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/delete-show/:id', async (req, res) => {
    try {
        const showId = req.params.id;
        const deleteShow = await Shows.findOneAndDelete({ _id: showId });

        if (!deleteShow) {
            return res.status(404).send('Show not found');
        }

        // Remove the show from users' showsMylist
        await Users.updateMany(
            { showsMylist: showId },
            { $pull: { showsMylist: showId } }
        );

        // Remove the show references from users' watchedShows array
        await Users.updateMany(
            { 'watchedShows.showID': showId },
            { $pull: { watchedShows: { showID: showId } } }
        );
        const shows = await Shows.find();
        res.render('deleteShow', { shows, successMessage: 'Movie deleted successfully!' });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
