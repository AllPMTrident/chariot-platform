const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('./database');

const router = express.Router();

// Configure multer for profile image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../chariot-frontend/public/images/profiles');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif)'));
    }
  }
});

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

// ============================================
// HELPER FUNCTIONS
// ============================================

// Generate access token
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// Generate refresh token
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
};

// ============================================
// AUTH MIDDLEWARE (exported for use in server.js)
// ============================================

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Get fresh user data from database
    const result = await pool.query(
      'SELECT id, email, role, first_name, last_name, active FROM "user" WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!result.rows[0].active) {
      return res.status(401).json({ error: 'Account deactivated' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Role-based access middleware
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access denied. Insufficient permissions.',
        required: allowedRoles,
        your_role: req.user.role
      });
    }

    next();
  };
};

// ============================================
// AUTH ROUTES
// ============================================

// POST /api/auth/register - Create new user account
router.post('/register', async (req, res) => {
  const { email, password, first_name, last_name, role, company_id, location_ids, phone } = req.body;

  // Validation
  if (!email || !password || !first_name || !last_name) {
    return res.status(400).json({
      error: 'Email, password, first_name, and last_name are required'
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters'
    });
  }

  try {
    // Check if email already exists
    const existingUser = await pool.query(
      'SELECT id FROM "user" WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create user
    const result = await pool.query(
      `INSERT INTO "user" (
        company_id, email, password_hash, first_name, last_name,
        phone, role, location_ids, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
      RETURNING id, email, first_name, last_name, role, created_at`,
      [
        company_id || '550e8400-e29b-41d4-a716-446655440000', // Default company
        email.toLowerCase(),
        password_hash,
        first_name,
        last_name,
        phone,
        role || 'technician', // Default role
        JSON.stringify(location_ids || [])
      ]
    );

    const user = result.rows[0];

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save refresh token to database
    await pool.query(
      'UPDATE "user" SET refresh_token = $1 WHERE id = $2',
      [refreshToken, user.id]
    );

    res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      },
      accessToken,
      refreshToken
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login - Login with email and password
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Find user by email
    const result = await pool.query(
      'SELECT * FROM "user" WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Check if account is active
    if (!user.active) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    // Check if user has a password set
    if (!user.password_hash) {
      return res.status(401).json({
        error: 'Password not set. Please contact administrator.'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Update refresh token and last login
    await pool.query(
      'UPDATE "user" SET refresh_token = $1, last_login = CURRENT_TIMESTAMP WHERE id = $2',
      [refreshToken, user.id]
    );

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        location_ids: user.location_ids
      },
      accessToken,
      refreshToken
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout - Logout and invalidate refresh token
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Clear refresh token in database
    await pool.query(
      'UPDATE "user" SET refresh_token = NULL WHERE id = $1',
      [req.user.id]
    );

    res.json({ message: 'Logged out successfully' });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// POST /api/auth/refresh - Get new access token using refresh token
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_SECRET);

    // Find user and verify refresh token matches
    const result = await pool.query(
      'SELECT * FROM "user" WHERE id = $1 AND refresh_token = $2 AND active = true',
      [decoded.id, refreshToken]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const user = result.rows[0];

    // Generate new access token
    const newAccessToken = generateAccessToken(user);

    res.json({
      accessToken: newAccessToken
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token expired. Please login again.' });
    }
    console.error('Refresh error:', error);
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});

// GET /api/auth/me - Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, phone,
              location_ids, active, created_at, last_login
       FROM "user" WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// POST /api/auth/change-password - Change password
router.post('/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      error: 'Current password and new password are required'
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      error: 'New password must be at least 8 characters'
    });
  }

  try {
    // Get current user with password hash
    const result = await pool.query(
      'SELECT password_hash FROM "user" WHERE id = $1',
      [req.user.id]
    );

    const user = result.rows[0];

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Update password
    await pool.query(
      'UPDATE "user" SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, req.user.id]
    );

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// PUT /api/auth/update-profile - Update user profile
router.put('/update-profile', authenticateToken, async (req, res) => {
  const { first_name, last_name, email, phone } = req.body;

  if (!first_name || !last_name || !email) {
    return res.status(400).json({
      error: 'First name, last name, and email are required'
    });
  }

  try {
    // Check if email is already taken by another user
    const emailCheck = await pool.query(
      'SELECT id FROM "user" WHERE email = $1 AND id != $2',
      [email.toLowerCase(), req.user.id]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Email already in use by another account' });
    }

    // Update user profile (removed updated_at since column may not exist)
    const result = await pool.query(
      `UPDATE "user"
       SET first_name = $1, last_name = $2, email = $3, phone = $4
       WHERE id = $5
       RETURNING id, email, first_name, last_name, phone, role, profile_image_url`,
      [first_name, last_name, email.toLowerCase(), phone, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile', details: error.message });
  }
});

// POST /api/auth/upload-profile-image - Upload profile image
router.post('/upload-profile-image', authenticateToken, upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Generate the URL path for the image
    const imageUrl = `/images/profiles/${req.file.filename}`;

    // Update user's profile_image_url in database
    const result = await pool.query(
      `UPDATE "user"
       SET profile_image_url = $1
       WHERE id = $2
       RETURNING id, profile_image_url`,
      [imageUrl, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile image uploaded successfully',
      imageUrl: imageUrl
    });

  } catch (error) {
    console.error('Upload profile image error:', error);
    res.status(500).json({ error: 'Failed to upload profile image' });
  }
});

// Export router and middleware
module.exports = {
  router,
  authenticateToken,
  requireRole
};