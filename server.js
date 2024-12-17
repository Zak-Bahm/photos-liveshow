require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// --- Configure Session Middleware ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'session-secret',
  resave: false,
  saveUninitialized: true,
}));

// --- Parse URL-encoded and JSON bodies ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/**
 * Helper: Return the user's access token from the session.
 */
function getAccessToken(req) {
  return req.session ? req.session.access_token : null;
}

/**
 * Middleware: Ensure user is authenticated (has an access token)
 */
function ensureAuthenticated(req, res, next) {
  const token = getAccessToken(req);
  if (!token) {
    return res.redirect('/');
  }
  next();
}

/* -----------------------------------------------------------------------------
 *  GOOGLE OAUTH ENDPOINTS
 * -----------------------------------------------------------------------------
 */

/**
 * /auth/google/login
 * Redirects the user to Google's OAuth 2.0 consent screen.
 */
app.get('/auth/google/login', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/photoslibrary.readonly',
  ];
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent'); // Force consent for demo

  res.redirect(authUrl.toString());
});

/**
 * /auth/google/callback
 * Google calls back here with ?code= in the query string.
 * We exchange the code for an access token.
 */
app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('No code provided.');
  }

  // Exchange `code` for access token
  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const params = new URLSearchParams();
  params.append('code', code);
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('redirect_uri', REDIRECT_URI);
  params.append('grant_type', 'authorization_code');

  try {
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error('Token exchange failed:', errorBody);
      return res.status(500).send('Failed to exchange code for tokens.');
    }

    const tokens = await tokenResponse.json();
    // Store the access_token in session
    req.session.access_token = tokens.access_token;
    // If needed, also store tokens.refresh_token

    return res.redirect('/albums');
  } catch (err) {
    console.error('Error exchanging code for token:', err);
    res.status(500).send('Authentication failed.');
  }
});

/* -----------------------------------------------------------------------------
 *  PAGES
 * -----------------------------------------------------------------------------
 */

/**
 * Home page:
 * - If no user session token, shows index.html with a link to /auth/google/login
 * - If user is authenticated, redirect to /albums
 */
app.get('/', (req, res) => {
  const token = getAccessToken(req);
  if (!token) {
    // Not logged in -> serve index.html
    return res.sendFile(path.join(__dirname, 'views', 'index.html'));
  } else {
    // If logged in, redirect to /albums
    return res.redirect('/albums');
  }
});

/**
 * /albums
 * Lists any publicly accessible albums (shared albums) for the user.
 * If "Accept: application/json" is specified, returns JSON.
 */
app.get('/albums', ensureAuthenticated, async (req, res) => {
  const accessToken = getAccessToken(req);

  try {
    // Call the Google Photos API directly
    // GET https://photoslibrary.googleapis.com/v1/albums?pageSize=50
    const albumsUrl = 'https://photoslibrary.googleapis.com/v1/albums?pageSize=50';
    const apiResponse = await fetch(albumsUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      }
    });

    if (!apiResponse.ok) {
      const body = await apiResponse.text();
      console.error('Failed to list albums:', body);
      return res.status(500).send('Error fetching albums.');
    }

    const data = await apiResponse.json();
    const albums = data.albums || [];

    // If request wants JSON, return JSON
    if (req.headers['accept'] && req.headers['accept'].includes('application/json')) {
      return res.json(albums);
    }

    // Otherwise, serve a static HTML page that fetches JSON dynamically (albums.html)
    res.sendFile(path.join(__dirname, 'views', 'albums.html'));
  } catch (err) {
    console.error('Error listing albums:', err);
    res.status(500).send('Failed to list albums.');
  }
});

/**
 * /albums/:albumId
 * Shows pictures in a particular album.
 * If "Accept: application/json" is specified, returns JSON.
 */
app.get('/albums/:albumId', ensureAuthenticated, async (req, res) => {
  const albumId = req.params.albumId;
  const accessToken = getAccessToken(req);

  if (!albumId) {
    return res.status(400).send('Album ID is required.');
  }

  try {
    // POST https://photoslibrary.googleapis.com/v1/mediaItems:search
    //  { albumId: <albumId> }
    const searchUrl = 'https://photoslibrary.googleapis.com/v1/mediaItems:search';
    const searchResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        albumId: albumId,
        pageSize: 50
      }),
    });

    if (!searchResponse.ok) {
      const body = await searchResponse.text();
      console.error('Error fetching album items:', body);
      return res.status(500).send('Failed to list album items.');
    }

    const data = await searchResponse.json();
    const mediaItems = data.mediaItems || [];

    // If request wants JSON, return JSON
    if (req.headers['accept'] && req.headers['accept'].includes('application/json')) {
      return res.json(mediaItems);
    }

    // Otherwise, serve album.html (which fetches JSON on the client side)
    res.sendFile(path.join(__dirname, 'views', 'album.html'));
  } catch (err) {
    console.error('Error fetching album items:', err);
    res.status(500).send('Failed to list album items.');
  }
});

/* -----------------------------------------------------------------------------
 *  START SERVER
 * -----------------------------------------------------------------------------
 */
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
