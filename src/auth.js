/**
 * Auth utilities for FastBuyJSON
 * 
 * This module provides JWT and certificate-based authentication utilities.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// For demo purposes, we use a hardcoded secret
// In production, this should be stored securely and loaded from environment variables
const JWT_SECRET = 'fastbuyjson-demo-secret-key-change-in-production';
const JWT_REFRESH_SECRET = 'fastbuyjson-demo-refresh-secret-key-change-in-production';
const JWT_EXPIRES_IN = '1h';
const JWT_REFRESH_EXPIRES_IN = '7d';

// Mock user database
const users = [
  {
    id: 'user1',
    username: 'demo',
    password: 'password123', // In production, store hashed passwords only
    email: 'demo@example.com',
    roles: ['customer']
  },
  {
    id: 'user2',
    username: 'admin',
    password: 'admin123',
    email: 'admin@example.com',
    roles: ['admin', 'customer']
  }
];

// Store for refresh tokens (in production, use a database)
const refreshTokens = new Map();

// Store for certificate sessions
const certificateSessions = new Map();

/**
 * Generate a JWT token for a user
 * 
 * @param {Object} user User object
 * @returns {Object} Access and refresh tokens
 */
export function generateTokens(user) {
  // Create payload with user information
  const payload = {
    sub: user.id,
    username: user.username,
    email: user.email,
    roles: user.roles,
  };

  // Generate access token
  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });

  // Generate refresh token
  const refreshToken = jwt.sign({ sub: user.id }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN
  });

  // Store refresh token
  refreshTokens.set(refreshToken, {
    userId: user.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  });

  return {
    accessToken,
    refreshToken,
    tokenType: 'bearer',
    expiresIn: 3600 // 1 hour in seconds
  };
}

/**
 * Verify and refresh a JWT token
 * 
 * @param {string} refreshToken Refresh token
 * @returns {Object|null} New access token or null if invalid
 */
export function refreshAccessToken(refreshToken) {
  // Check if refresh token exists in store
  const storedToken = refreshTokens.get(refreshToken);
  if (!storedToken) {
    return null;
  }

  // Check if token is expired
  if (new Date() > storedToken.expiresAt) {
    refreshTokens.delete(refreshToken);
    return null;
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    
    // Find user
    const user = users.find(u => u.id === decoded.sub);
    if (!user) {
      return null;
    }

    // Generate new access token
    const payload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      roles: user.roles,
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });

    return {
      accessToken,
      tokenType: 'bearer',
      expiresIn: 3600 // 1 hour in seconds
    };
  } catch (error) {
    // Invalid token
    refreshTokens.delete(refreshToken);
    return null;
  }
}

/**
 * Authenticate a user with username and password
 * 
 * @param {string} username Username
 * @param {string} password Password
 * @returns {Object|null} User object or null if authentication fails
 */
export function authenticateUser(username, password) {
  // Find user by username
  const user = users.find(u => u.username === username);
  
  // Check if user exists and password matches
  if (!user || user.password !== password) {
    return null;
  }

  // Return user without password
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

/**
 * Verify a client certificate
 * 
 * @param {string} certificatePem Certificate in PEM format
 * @returns {Object|null} Session info or null if verification fails
 */
export function verifyCertificate(certificatePem) {
  try {
    // In a real implementation, you would:
    // 1. Validate the certificate against a CA
    // 2. Check certificate revocation status
    // 3. Verify certificate attributes
    
    // For demo purposes, we just check if it's a valid PEM certificate
    const cert = crypto.createPublicKey(certificatePem);
    
    // Create a session ID
    const sessionId = crypto.randomUUID();
    
    // Store session (in production, use a database)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    certificateSessions.set(sessionId, {
      certificateFingerprint: crypto.createHash('sha256').update(certificatePem).digest('hex'),
      expiresAt
    });
    
    return {
      sessionId,
      expiresIn: 24 * 60 * 60 // 24 hours in seconds
    };
  } catch (error) {
    console.error('Certificate verification failed:', error);
    return null;
  }
}

/**
 * Verify JWT token middleware
 */
export function verifyJwtMiddleware(req, res, next) {
  // Get authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Valid Bearer token required'
    });
  }
  
  // Extract token
  const token = authHeader.split(' ')[1];
  
  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Add user info to request
    req.user = decoded;
    
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid token',
      message: error.message
    });
  }
}

/**
 * Verify certificate session middleware
 */
export function verifyCertificateMiddleware(req, res, next) {
  // Get certificate session header
  const sessionId = req.headers['x-certificate-session'];
  
  if (!sessionId) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Valid certificate session required'
    });
  }
  
  // Check if session exists
  const session = certificateSessions.get(sessionId);
  if (!session) {
    return res.status(401).json({
      error: 'Invalid certificate session',
      message: 'Session not found'
    });
  }
  
  // Check if session is expired
  if (new Date() > session.expiresAt) {
    certificateSessions.delete(sessionId);
    return res.status(401).json({
      error: 'Certificate session expired',
      message: 'Please authenticate again'
    });
  }
  
  // Add session info to request
  req.certificateSession = session;
  
  next();
}
