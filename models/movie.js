const mongoose = require('mongoose');


const movieSchema = new mongoose.Schema({
    movieID: Number,
    backdropPath: String,
    budget: Number,
    genres: [String],
    genreIds: [Number],
    originalTitle: String,
    overview: String,
    popularity: Number,
    posterPath: String,
    productionCompanies: [String],
    releaseDate: Date,
    revenue: Number,
    runtime: Number,
    status: String,
    title: String,
    watchProviders: [String],
    logos: String,
    downloadLink: String,
    ratings: Number,
    uploadTime: {  // Add the uploadTime field
        type: Date,
        default: Date.now // Automatically set to the current date and time
    },
    ignoreTitleOnScan: Boolean
});

const Movie = mongoose.model('Movie', movieSchema);

module.exports = Movie;