// routes/anime.js
const express = require('express');
const router = express.Router();
const Anime = require('../models/Anime')

// Endpoint to get all anime
router.get('/getAllAnime', async (req, res) => {
  try {
    const allAnime = await Anime.find();
    res.json(allAnime);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

const getUniqueGenres = (anime) => {
  const genresSet = new Set();

  // Iterate through each anime and add its genres to the set
  anime.forEach((anime) => {
    anime.genres.forEach((genre) => {
      genresSet.add(genre);
    });
  });

  // Convert the set to an array to get unique genres
  const uniqueGenres = [...genresSet];

  return uniqueGenres;
};

// Endpoint to get recently uploaded anime
router.get('/getRecentAnime', async (req, res) => {
  try {
      // Fetch the recently uploaded anime, sorted by uploadTime (newest first)
      const recentAnime = await Anime.find({})
          .sort({ uploadTime: -1 }) // Sort by uploadTime field, descending
          .limit(20); // Limit to the most recent 20 anime

      // Respond with the list of anime
      res.status(200).json({ success: true, anime: recentAnime });
  } catch (error) {
      console.error('Error fetching recent anime:', error);
      res.status(500).json({ success: false, message: 'Error fetching recent anime' });
  }
});

// Endpoint to get the latest 20 released anime
router.get('/latest-released-anime', async (req, res) => {
  try {
    const latestAnime = await Anime.find()
      .sort({ releaseDate: -1 }) // Sort by releaseDate in descending order
      .limit(20);               // Limit the results to 20
    res.status(200).json(latestAnime);
  } catch (error) {
    console.error('Error fetching latest anime releases:', error);
    res.status(500).json({ error: 'Failed to fetch latest anime releases' });
  }
});

// Endpoint to get all anime genres
router.get('/getAllAnimeGenres', async (req, res) => {
  try {
    // Retrieve all anime from the database
    const allAnime = await Anime.find();

    // Extract unique genres from the anime data
    const uniqueGenres = getUniqueGenres(allAnime);

    // Send the unique genres as a response
    res.json(uniqueGenres);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint to get all anime grouped by genre
router.get('/getAllAnimeByGenre', async (req, res) => {
  try {
    // Step 1: Fetch all distinct genres
    const distinctGenres = await Anime.distinct('genres');

    // Step 2: For each genre, fetch anime
    const animeByGenre = await Promise.all(
      distinctGenres.map(async (genre) => {
        const anime = await Anime.find({ genres: genre });
        return { genre, anime };
      })
    );

    res.json(animeByGenre);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint to search anime by name
router.get('/searchAnime/:animeName', async (req, res) => {
  try {
    const { animeName } = req.params;

    // Use a case-insensitive regular expression to perform a partial match on anime names
    const matchingAnime = await Anime.find({ name: { $regex: new RegExp(animeName, 'i') } });

    res.json(matchingAnime);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Additional anime-specific endpoints

// Endpoint to get anime by status (ongoing, completed, etc.)
router.get('/getAnimeByStatus/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const animeByStatus = await Anime.find({ status: { $regex: new RegExp(status, 'i') } });
    res.json(animeByStatus);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint to get popular anime (highest rated)
router.get('/getPopularAnime', async (req, res) => {
  try {
    const popularAnime = await Anime.find()
      .sort({ ratings: -1 })
      .limit(20);
    res.json(popularAnime);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint to get anime with specific genre
router.get('/getAnimeBySpecificGenre/:genre', async (req, res) => {
  try {
    const { genre } = req.params;
    const animeByGenre = await Anime.find({ genres: { $regex: new RegExp(genre, 'i') } });
    res.json(animeByGenre);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;