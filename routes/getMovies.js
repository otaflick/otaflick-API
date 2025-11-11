// routes/movies.js
const express = require('express');
const router = express.Router();
const Movie = require('../models/movie'); // Assuming the path is correct

// Endpoint to get all movies
router.get('/getMovies/:genreID?', async (req, res) => {
  try {
    const { genreID } = req.params;

    // Check if a genre is provided
    if (genreID) {
      const moviesByGenre = await Movie.find({ genres: genreID });
      res.json(moviesByGenre);
    } else {
      // If no genre is provided, return all movies
      const allMovies = await Movie.find();
      res.json(allMovies);
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint to get recently uploaded Movies
router.get('/getRecentAddedMovies', async (req, res) => {
  try {
      // Fetch the recently uploaded Movies, sorted by uploadTime (newest first)
      const recentMovies = await Movie.find({})
          .sort({ uploadTime: -1 }) // Sort by uploadTime field, descending
          .limit(20); // Limit to the most recent 20 Movies

      // Respond with the list of Movies
      res.status(200).json({ success: true, movies: recentMovies });
  } catch (error) {
      console.error('Error fetching recent shows:', error);
      res.status(500).json({ success: false, message: 'Error fetching recent shows' });
  }
});

// Endpoint to get the latest 20 released movies
router.get('/latest-released-movies', async (req, res) => {
  try {
    const latestMovies = await Movie.find()
      .sort({ releaseDate: -1 }) // Sort by releaseDate in descending order
      .limit(20);               // Limit the results to 20
    res.status(200).json(latestMovies);
  } catch (error) {
    console.error('Error fetching latest releases:', error);
    res.status(500).json({ error: 'Failed to fetch latest releases' });
  }
});


router.get('/getSimilarMovies/:movieID', async (req, res) => {
  try {
    const { movieID } = req.params;

    // Find the selected movie by its ID
    const selectedMovie = await Movie.findById(movieID);

    // Ensure the movie is found
    if (!selectedMovie) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    // Find similar movies based on genres
    const similarMovies = await Movie.find({
      genreIds: { $in: selectedMovie.genreIds },
      _id: { $ne: movieID } // Exclude the selected movie itself
    });

    res.json(similarMovies);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

const getUniqueGenres = (movies) => {
  const genresSet = new Set();

  // Iterate through each show and add its genres to the set
  movies.forEach((movie) => {
    movie.genres.forEach((genre) => {
      genresSet.add(genre);
    });
  });

  // Convert the set to an array to get unique genres
  const uniqueGenres = [...genresSet];

  return uniqueGenres;
};

router.get('/getAllMoviesGenres', async (req, res) => {
  try {
    // Retrieve all shows from the database
    const allMovies = await Movie.find();

    // Extract unique genres from the shows data
    const uniqueGenres = getUniqueGenres(allMovies);

    // Send the unique genres as a response in the expected format
    res.json({ 
      success: true, 
      genres: uniqueGenres 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal Server Error' 
    });
  }
});

router.get('/getAllMoviesByGenre', async (req, res) => {
  try {
    // Step 1: Fetch all distinct genres
    const distinctGenres = await Movie.distinct('genres');

    // Step 2: For each genre, fetch shows
    const moviesByGenre = await Promise.all(
      distinctGenres.map(async (genre) => {
        const movie = await Movie.find({ genres: genre });
        return { genre, movie };
      })
    );

    res.json(moviesByGenre);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/searchMovies/:movieName', async (req, res) => {
  try {
    const { movieName } = req.params;

    // Use a case-insensitive regular expression to perform a partial match on movie names
    const matchingMovies = await Movie.find({ title: { $regex: new RegExp(movieName, 'i') } });

    res.json(matchingMovies);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;