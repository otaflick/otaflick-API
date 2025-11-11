require('dotenv').config();
const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User')
const { exec } = require('child_process');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
    sendResetPasswordCodeEmail,
    sendResetPasswordVerifiedEmail,
    sendChangePasswordCodeEmail,
    sendPasswordChangedVerifiedEmail,
    sendWelcomeEmail
} = require('../service/email.service');

const httpServerInfo = {
    "email": process.env.HTTP_SERVER_USERNAME,
    "password": process.env.HTTP_SERVER_PASSWORD
}

// Generate random 6-digit code
function generateVerificationCode() {
    return crypto.randomInt(100000, 999999).toString();
}

// Store verification codes in memory (in production, use Redis)
const verificationCodes = new Map();


// Endpoint to power off the server
router.get('/poweroff', (req, res) => {
    exec('sudo poweroff', (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            res.status(500).send('Error powering off server');
            return;
        }
        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
        res.send('Server is powering off...');
    });
});

// Endpoint to restart the server
router.get('/restart', (req, res) => {
    exec('sudo reboot', (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            res.status(500).send('Error restarting server');
            return;
        }
        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
        res.send('Server is restarting...');
    });
});

router.post('/register', async (req, res) => {
    try {
        const isAdmin = req.body.isAdmin === true;
        const expoPushToken = req.body.expoPushToken || null;
        const email = req.body.email;
        const password = req.body.password;

        // Comprehensive email validation regex
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        
        // Validation checks
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email and password are required' 
            });
        }

        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Please provide a valid email address' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                error: 'Password must be at least 6 characters long' 
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email already registered' 
            });
        }

        const user = await User.register(
            new User({
                email: email.toLowerCase(),
                isAdmin,
                expoPushToken
            }),
            password
        );

        // Send welcome email after successful registration
        try {
            await sendWelcomeEmail(
                email,
                email.split('@')[0],
                'otaflick@gmail.com',
            );
            console.log(`Welcome email sent to ${email}`);
        } catch (emailError) {
            console.error('Failed to send welcome email:', emailError);
            // Continue with registration even if email fails
        }

        passport.authenticate('local')(req, res, () => {
            res.json({ 
                success: true, 
                user, 
                httpServerInfo,
                message: 'Registration successful! Welcome email sent.'
            });
        });
    } catch (error) {
        console.error('Registration error:', error);
        
        // Handle specific registration errors
        if (error.name === 'UserExistsError') {
            return res.status(400).json({ 
                success: false, 
                error: 'Email already registered' 
            });
        }
        
        if (error.name === 'MissingPasswordError') {
            return res.status(400).json({ 
                success: false, 
                error: 'Password is required' 
            });
        }
        
        res.status(500).json({ 
            success: false, 
            error: 'Registration failed. Please try again.' 
        });
    }
});

router.post('/login', (req, res, next) => {
    passport.authenticate('local', async (err, user, info) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        if (!user) {
            return res.json({ success: false, message: 'Authentication failed' });
        }

        if (req.body.expoPushToken) {
            try {
                user.expoPushToken = req.body.expoPushToken;
                await user.save();
            } catch (updateError) {
                console.error('Error updating Expo push token:', updateError);
            }
        }

        // If authentication is successful, manually log in the user
        req.logIn(user, (loginErr) => {
            if (loginErr) {
                return res.status(500).json({ success: false, error: loginErr.message });
            }
            // Send a success response
            return res.json({ success: true, user, httpServerInfo });
        });
    })(req, res, next);
});

router.get('/check-auth', (req, res) => {
    console.log("User auth", req.isAuthenticated())
    if (req.isAuthenticated()) {
        // User is authenticated
        res.json({ authenticated: true, user: req.user, httpServerInfo });
    } else {
        // User is not authenticated
        res.json({ authenticated: false, user: null });
    }
});

router.get('/logout', (req, res) => {
    req.logout(err => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true });
    });
});

router.get('/admin/register', (req, res) => {
    res.render('adminRegister'); // Assuming 'adminRegister.hbs' exists in the 'views' folder
});

router.post('/admin/register', async (req, res) => {
    try {
        console.log('Admin registration attempt:', req.body);

        // Check if the secret code is valid
        const secretCode = req.body.secretCode;
        if (secretCode !== process.env.ADMIN_REGISTER_SECRET_CODE) {
            console.log('Invalid secret code');
            return res.render('adminRegister', { errorMessage: 'Invalid secret code' });
        }

        const { email, password } = req.body;

        // Validate email
        if (!email || !email.includes('@')) {
            return res.render('adminRegister', { errorMessage: 'Valid email is required' });
        }

        if (!password || password.length < 6) {
            return res.render('adminRegister', { errorMessage: 'Password must be at least 6 characters long' });
        }

        console.log('Attempting to register admin with email:', email);

        // Register the admin - NO AUTO LOGIN
        const user = await User.register(
            new User({
                email: email.toLowerCase().trim(),
                isAdmin: true
            }),
            password
        );

        console.log('Admin registered successfully:', user.email);

        return res.redirect('/admin/login?message=Admin registration successful! Please login.');

    } catch (error) {
        console.error('Registration error:', error);

        if (error.name === 'UserExistsError') {
            return res.render('adminRegister', { errorMessage: 'Email already exists' });
        }

        return res.render('adminRegister', {
            errorMessage: 'Registration failed: ' + (error.message || 'Unknown error')
        });
    }
});

router.get('/admin/login', (req, res) => {
    res.render('adminLogin'); // Assuming 'adminLogin.hbs' exists in the 'views' folder
});

router.post('/admin/login', (req, res, next) => {
    console.log('Admin login attempt:', { email: req.body.email });

    passport.authenticate('local', (err, user, info) => {
        console.log('Passport authenticate result:', {
            err: err ? err.message : 'none',
            user: user ? { email: user.email, isAdmin: user.isAdmin } : 'no user',
            info: info
        });

        if (err) {
            console.error('Authentication error:', err);
            return res.render('adminLogin', { errorMessage: 'Authentication failed' });
        }

        if (!user) {
            console.log('No user found or invalid password');
            return res.render('adminLogin', { errorMessage: 'Invalid email or password' });
        }

        // Check if the user is an admin
        if (!user.isAdmin) {
            console.log('User is not admin:', user.email);
            return res.render('adminLogin', { errorMessage: 'You are not an admin' });
        }

        console.log('Admin user authenticated:', user.email);

        // Log in the user
        req.logIn(user, (loginErr) => {
            if (loginErr) {
                console.error('Login error:', loginErr);
                return res.render('adminLogin', { errorMessage: 'Login failed' });
            }

            console.log('Admin login successful, redirecting to dashboard');
            res.redirect('/');
        });
    })(req, res, next);
});

router.get('/admin/logout', (req, res) => {
    req.logout(err => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.redirect('/admin/login')
    });
});

router.get('/online-user', async (req, res) => {
    try {
        console.log('Fetching online users...');

        const onlineUsers = await User.find({ isOnline: true }).sort({ createdAt: -1 });
        const totalUsers = await User.countDocuments();
        const offlineUsersCount = totalUsers - onlineUsers.length;

        console.log(`Found ${onlineUsers.length} online users out of ${totalUsers} total users`);

        res.render('onlineUsers', {
            onlineUsersCount: onlineUsers.length,
            totalUsers: totalUsers,
            offlineUsersCount: offlineUsersCount,
            onlineUsers: onlineUsers
        });
    } catch (error) {
        console.error('Error fetching online users:', error);
        res.render('onlineUsers', {
            onlineUsersCount: 0,
            totalUsers: 0,
            offlineUsersCount: 0,
            onlineUsers: []
        });
    }
});

router.get('/online-users-count', async (req, res) => {
    try {
        const onlineUsersCount = await User.countDocuments({ isOnline: true });

        res.json({
            success: true,
            onlineUsersCount: onlineUsersCount,
            message: `There are ${onlineUsersCount} users online currently`
        });
    } catch (error) {
        console.error('Error fetching online users count:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch online users count'
        });
    }
});









router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Find user by email
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            // Changed: Now revealing if user doesn't exist for better UX
            return res.status(400).json({
                success: false,
                message: 'No user found with this email address'
            });
        }

        // Generate verification code
        const verificationCode = generateVerificationCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        // Store code in user schema (replaces old code if exists)
        user.verificationToken = verificationCode;
        user.verificationTokenExpiresAt = expiresAt;
        await user.save();

        // Send email with verification code
        await sendResetPasswordCodeEmail(
            email,
            user.email,
            verificationCode,
            '15',
            'otaflick@gmail.com'
        );

        res.json({
            success: true,
            message: 'Verification code sent to your email'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});



router.post('/reset-password', async (req, res) => {
    try {
        const { email, resetToken, newPassword, confirmPassword } = req.body;

        if (!email || !resetToken || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Passwords do not match'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Find user and verify reset token
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user || user.verificationToken !== resetToken) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        if (user.verificationTokenExpiresAt < new Date()) {
            // Clear expired token
            user.verificationToken = undefined;
            user.verificationTokenExpiresAt = undefined;
            await user.save();

            return res.status(400).json({
                success: false,
                message: 'Reset token has expired'
            });
        }

        // FIX: Use setPassword method from passport-local-mongoose instead of direct assignment
        await new Promise((resolve, reject) => {
            user.setPassword(newPassword, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        // Clear verification token
        user.verificationToken = undefined;
        user.verificationTokenExpiresAt = undefined;
        await user.save();

        // Send confirmation email
        await sendPasswordChangedVerifiedEmail(
            email,
            user.email,
            'otaflick@gmail.com'
        );

        res.json({
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});


router.post('/change-password/request', async (req, res) => {
    try {
        const { email, oldPassword } = req.body;

        if (!email || !oldPassword) {
            return res.status(400).json({
                success: false,
                message: 'Email and old password are required'
            });
        }

        // Find user
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify old password using passport-local-mongoose's method
        user.authenticate(oldPassword, async (err, authenticated) => {
            if (err) {
                console.error('Password verification error:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Error verifying password'
                });
            }

            if (!authenticated) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }

            // Generate verification code
            const verificationCode = generateVerificationCode();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

            // Store code in user schema (replaces old code if exists)
            user.verificationToken = verificationCode;
            user.verificationTokenExpiresAt = expiresAt;
            await user.save();

            // Send email with verification code
            await sendChangePasswordCodeEmail(
                email,
                user.email,
                verificationCode,
                '15',
                'otaflick@gmail.com'
            );

            res.json({
                success: true,
                message: 'Verification code sent to your email'
            });
        });

    } catch (error) {
        console.error('Change password request error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

router.post('/change-password/verify', async (req, res) => {
    try {
        const { email, code, newPassword, confirmPassword } = req.body;

        if (!email || !code || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Passwords do not match'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Find user and verify code
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user || !user.verificationToken) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired code'
            });
        }

        if (user.verificationTokenExpiresAt < new Date()) {
            // Clear expired token
            user.verificationToken = undefined;
            user.verificationTokenExpiresAt = undefined;
            await user.save();

            return res.status(400).json({
                success: false,
                message: 'Code has expired'
            });
        }

        if (user.verificationToken !== code) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code'
            });
        }

        // FIX: Use setPassword method
        await new Promise((resolve, reject) => {
            user.setPassword(newPassword, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        // Clear verification token
        user.verificationToken = undefined;
        user.verificationTokenExpiresAt = undefined;
        await user.save();

        // Send confirmation email
        await sendPasswordChangedVerifiedEmail(
            email,
            user.email,
            'otaflick@gmail.com'
        );

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password verify error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});



router.post('/verify-reset-code', async (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and code are required' 
            });
        }

        // Find user and check verification code
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user || !user.verificationToken) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired code' 
            });
        }

        if (user.verificationTokenExpiresAt < new Date()) {
            // Clear expired token
            user.verificationToken = undefined;
            user.verificationTokenExpiresAt = undefined;
            await user.save();
            
            return res.status(400).json({ 
                success: false, 
                message: 'Code has expired' 
            });
        }

        if (user.verificationToken !== code) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid verification code' 
            });
        }

        // Code is valid, generate reset token for password reset
        const resetToken = crypto.randomBytes(32).toString('hex');
        
        // Store reset token in verification token field
        user.verificationToken = resetToken;
        user.verificationTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes for reset
        await user.save();

        res.json({ 
            success: true, 
            message: 'Code verified successfully',
            resetToken 
        });

    } catch (error) {
        console.error('Verify reset code error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});






module.exports = router;