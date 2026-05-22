import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { users, refreshTokens } from '../data/users.js';
import { authenticate } from '../middleware/authenticate.js';
import crypto from 'crypto';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'instafin-dev-secret-2024';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

function generateTokens(user) {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
  return { accessToken, refreshToken };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'dsa' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (users.find(u => u.email === email)) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const validRoles = ['admin', 'executive', 'dsa'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash,
      role
    };

    users.push(newUser);

    const { accessToken, refreshToken } = generateTokens(newUser);
    refreshTokens.push(refreshToken);

    const userResponse = { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role };
    res.status(201).json({ user: userResponse, accessToken, refreshToken });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user);
    refreshTokens.push(refreshToken);

    const userResponse = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ user: userResponse, accessToken, refreshToken });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  if (!refreshTokens.includes(refreshToken)) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const user = users.find(u => u.id === decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Remove old refresh token
    const index = refreshTokens.indexOf(refreshToken);
    refreshTokens.splice(index, 1);

    // Generate new tokens
    const tokens = generateTokens(user);
    refreshTokens.push(tokens.refreshToken);

    res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  const index = refreshTokens.indexOf(refreshToken);
  if (index > -1) {
    refreshTokens.splice(index, 1);
  }

  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const userResponse = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.json(userResponse);
});

export default router;
