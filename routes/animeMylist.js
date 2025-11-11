const express = require('express');
const router = express.Router();
const isLoggedIn = require('../routes/isLoggedin')
const Anime = require('../models/Anime')

// Add anime to my list
router.post('/add-anime-to-mylist/:animeID', isLoggedIn, async (req, res) => {
    try {
        const user = req.user;
        const animeID = req.params.animeID;

        // Check if anime already exists in my list
        if (user.animeMylist.includes(animeID)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Anime already in your list' 
            });
        }

        user.animeMylist.push(animeID);
        await user.save();
        
        res.json({ 
            success: true, 
            message: 'Anime added to your list successfully',
            user 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Remove anime from my list
router.post('/remove-anime-from-mylist/:animeID', isLoggedIn, async (req, res) => {
    try {
        const user = req.user;
        const animeID = req.params.animeID;

        // Check if anime exists in my list before removing
        if (!user.animeMylist.includes(animeID)) {
            return res.status(404).json({ 
                success: false, 
                message: 'Anime not found in your list' 
            });
        }

        user.animeMylist = user.animeMylist.filter(id => id.toString() !== animeID);
        await user.save();
        
        res.json({ 
            success: true, 
            message: 'Anime removed from your list successfully',
            user 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all anime in my list
router.get('/animeMylist', isLoggedIn, async (req, res) => {
    try {
        const user = req.user;
        
        // Populate the anime details using the anime IDs in the user's mylist
        const animeInMyList = await Anime.find({ _id: { $in: user.animeMylist } });

        // Sort by the order they were added (maintains user's preferred order)
        const sortedAnime = user.animeMylist.map(animeId => 
            animeInMyList.find(anime => anime._id.toString() === animeId.toString())
        ).filter(anime => anime != null);

        res.json({ 
            success: true, 
            animeInMyList: sortedAnime,
            totalCount: sortedAnime.length 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Check if anime is in my list
router.get('/check-anime-in-mylist/:animeID', isLoggedIn, async (req, res) => {
    try {
        const user = req.user;
        const animeID = req.params.animeID;

        const isInList = user.animeMylist.some(id => id.toString() === animeID);
        
        res.json({ 
            success: true, 
            isInList 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bulk add multiple anime to my list
router.post('/bulk-add-anime-to-mylist', isLoggedIn, async (req, res) => {
    try {
        const user = req.user;
        const { animeIDs } = req.body;

        if (!animeIDs || !Array.isArray(animeIDs)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid anime IDs provided' 
            });
        }

        let addedCount = 0;
        animeIDs.forEach(animeID => {
            if (!user.animeMylist.includes(animeID)) {
                user.animeMylist.push(animeID);
                addedCount++;
            }
        });

        await user.save();
        
        res.json({ 
            success: true, 
            message: `Successfully added ${addedCount} anime to your list`,
            addedCount,
            user 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Clear entire anime my list
router.delete('/clear-anime-mylist', isLoggedIn, async (req, res) => {
    try {
        const user = req.user;
        const listCount = user.animeMylist.length;

        user.animeMylist = [];
        await user.save();
        
        res.json({ 
            success: true, 
            message: `Cleared ${listCount} anime from your list`,
            clearedCount: listCount,
            user 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reorder anime in my list
router.post('/reorder-anime-mylist', isLoggedIn, async (req, res) => {
    try {
        const user = req.user;
        const { animeIDs } = req.body;

        if (!animeIDs || !Array.isArray(animeIDs)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid anime IDs provided' 
            });
        }

        // Verify all provided IDs exist in user's list
        const isValidReorder = animeIDs.every(animeID => 
            user.animeMylist.some(id => id.toString() === animeID)
        );

        if (!isValidReorder) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid anime IDs in reorder list' 
            });
        }

        user.animeMylist = animeIDs;
        await user.save();
        
        res.json({ 
            success: true, 
            message: 'Anime list reordered successfully',
            user 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;