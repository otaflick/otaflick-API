const mongoose = require('mongoose');

const animeSchema = new mongoose.Schema({
    name: String,
    overview: String,
    genres: [String],
    posterPath: String,
    backdropPath: String,
    releaseDate: Date,
    ratings: Number,
    ignoreTitleOnScan: Boolean,
    animeDirName: String, // Changed from showDirName to animeDirName
    uploadTime: {
        type: Date,
        default: Date.now
    },
    type: { // Added anime type field
        type: String,
        default: 'anime'
    },
    status: { // Added status field (ongoing, completed, etc.)
        type: String,
        default: 'completed'
    },
    seasons: [{
        season_number: Number,
        episodes: [{
            episode_number: Number,
            name: String,
            runtime: Number,
            overview: String,
            poster: String,
            downloadLink: String
        }]
    }]
});

const Anime = mongoose.model('Anime', animeSchema);

module.exports = Anime;