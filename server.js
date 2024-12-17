import express, { urlencoded, json } from 'express';
import session from 'express-session';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
app.use(urlencoded({ extended: true }));
app.use(json());

/**
 * Helper: Return the user's access token from the session.
 */
function getAccessToken(req) {
  return req.session ? req.session.access_token : null;
}

function getTokenExpiration(req) {
  return req.session ? req.session.token_expiration : null;
}

function getRefreshToken(req) {
  return req.session ? req.session.refresh_token : null;
}

function isTokenExpired(req) {
  const expiration = getTokenExpiration(req);
  if (!expiration) return true;
  // Add 1 minute buffer before expiration
  return Date.now() >= (expiration - 60000);
}

async function refreshAccessToken(refreshToken) {
  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  if (!response.ok) {
    throw new Error('Token refresh failed');
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    expires_in: data.expires_in
  };
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

async function refreshTokenIfNeeded(req, res, next) {
  if (!getAccessToken(req) || !isTokenExpired(req)) {
    return next();
  }

  const refreshToken = getRefreshToken(req);
  if (!refreshToken) {
    req.session.destroy();
    return res.redirect('/');
  }

  try {
    const { access_token, expires_in } = await refreshAccessToken(refreshToken);
    req.session.access_token = access_token;
    req.session.token_expiration = Date.now() + (expires_in * 1000);
    next();
  } catch (err) {
    console.error('Token refresh failed:', err);
    req.session.destroy();
    res.redirect('/');
  }
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
    req.session.refresh_token = tokens.refresh_token;
    req.session.token_expiration = Date.now() + (tokens.expires_in * 1000);

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
 * /api/albums
 * Lists all publicly joinable albums for the user.
 * If "Accept: text/html" is specified, returns html page that will then get json.
 */
app.get('/api/albums', ensureAuthenticated, refreshTokenIfNeeded, async (req, res) => {
  const accessToken = getAccessToken(req);

  try {
    // immediately return HTML if requested
    if (req.headers['accept']?.includes('text/html')) {
      return res.sendFile(join(__dirname, 'views', 'albums.html'));
    }

    // Fetch all albums and shared albums
    const seenAlbumIds = new Set();
    let allAlbums = [];

    // Helper function to fetch paginated results
    async function fetchAlbumPages(url, isSharedEndpoint = false) {
      let nextPageToken = null;
      do {
        const params = new URLSearchParams({
          pageSize: '50',
          ...(nextPageToken && { pageToken: nextPageToken })
        });
        
        const apiResponse = await fetch(`${url}?${params}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          }
        });

        if (!apiResponse.ok) {
          throw new Error(`Failed to fetch albums: ${await apiResponse.text()}`);
        }

        const data = await apiResponse.json();
        const albums = isSharedEndpoint ? (data.sharedAlbums || []) : (data.albums || []);
        
        // Filter and deduplicate albums
        albums.forEach(album => {
          if (!seenAlbumIds.has(album.id)) {
            seenAlbumIds.add(album.id);
            allAlbums.push(album);
          }
        });
        
        nextPageToken = data.nextPageToken;
      } while (nextPageToken);
    }

    // Fetch both own and shared albums in parallel
    await Promise.all([
      fetchAlbumPages('https://photoslibrary.googleapis.com/v1/albums'),
      fetchAlbumPages('https://photoslibrary.googleapis.com/v1/sharedAlbums', true)
    ]);

    res.json(allAlbums);
  } catch (err) {
    console.error('Error listing albums:', err);
    res.status(500).send('Failed to list albums.');
  }
});

/**
 * /api/albums/:albumId
 * Shows pictures in a particular album.
 * If "Accept: text/html" is specified, returns HTML page that will then get json.
 * Optional query param: latestId - fetches until this media item is found
 * Optional query param: nextPage - fetches next page of results
 */
app.get('/api/albums/:albumId', ensureAuthenticated, refreshTokenIfNeeded, async (req, res) => {
  const albumId = req.params.albumId;
  const latestId = req.query.latestId;
  const nextPage = req.query.nextPage;
  const accessToken = getAccessToken(req);

  if (!albumId) {
    return res.status(400).send('Album ID is required.');
  }

  try {
    if (req.headers['accept']?.includes('text/html')) {
      return res.sendFile(join(__dirname, 'views', 'album.html'));
    }

    const searchUrl = 'https://photoslibrary.googleapis.com/v1/mediaItems:search';
    const searchResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        albumId: albumId,
        pageSize: 50,
        ...(nextPage && { pageToken: nextPage })
      }),
    });

    if (!searchResponse.ok) {
      const body = await searchResponse.text();
      console.error('Error fetching album items:', body);
      return res.status(500).send('Failed to list album items.');
    }

    const data = await searchResponse.json();

    // If latestId specified and found, trim response
    if (latestId && data.mediaItems) {
      const latestIndex = data.mediaItems.findIndex(item => item.id === latestId);
      if (latestIndex !== -1) {
        data.mediaItems = data.mediaItems.slice(0, latestIndex);
        delete data.nextPageToken;
      }
    }

    res.json(data);
  } catch (err) {
    console.error('Error fetching album items:', err);
    res.status(500).send('Failed to list album items.');
  }
});

/**
 * Api page:
 * - If no user session token, shows index.html with a link to /auth/google/login
 * - If user is authenticated, redirect to /albums
 */
app.get('/api', (req, res) => {
    const token = getAccessToken(req);
    if (!token) {
      // Not logged in -> serve index.html
      return res.sendFile(join(__dirname, 'views', 'index.html'));
    } else {
      // If logged in, redirect to /albums
      return res.redirect('/albums');
    }
  });

/* -----------------------------------------------------------------------------
 *  REACT APP SERVING
 * -----------------------------------------------------------------------------
 */

// Serve static files from the React build directory
app.use('/static', express.static(join(__dirname, 'build/static')));

// Catch-all route for React app (excluding /api and /auth)
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
        return next();
    }
    res.sendFile(join(__dirname, 'build', 'index.html'));
});

/* -----------------------------------------------------------------------------
 *  START SERVER
 * -----------------------------------------------------------------------------
 */
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
