const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        unique: true
    },
    password: String,
    isAdmin: {
        type: Boolean,
        default: false, // Default value is false for regular users
    },
    mylist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Movie'
    }],

    showsMylist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shows'
    }],

    animeMylist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Anime'
    }],

    watchedMovies: [{
        movie: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Movie',
        },
        watchedTime: {
            type: Number,
            default: 0,
        },
        uploadTime: {
            type: Date,
            default: Date.now,
        },
    }],

    watchedShows: [{
        episode: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Shows',
        },
        showID: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Shows',
        },
        watchedTime: {
            type: Number,
            default: 0,
        },
        uploadTime: {
            type: Date,
            default: Date.now,
        },
    }],

    watchedAnime: [{
        episode: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Anime',
        },
        animeID: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Anime',
        },
        watchedTime: {
            type: Number,
            default: 0,
        },
        uploadTime: {
            type: Date,
            default: Date.now,
        },
    }],
    verificationToken: String,
    verificationTokenExpiresAt: Date,
    expoPushToken: {
        type: Object,
        default: null,
    },
    isOnline: { type: Boolean, default: false },
});

// Add passport-local-mongoose plugin to handle user authentication
userSchema.plugin(passportLocalMongoose, {
    usernameField: 'email',
    usernameLowerCase: true,
    usernameUnique: true
});
const User = mongoose.model('User', userSchema);

module.exports = User;