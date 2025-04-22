document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    // WARNING: Storing API keys client-side is insecure for production.
    // Consider using a backend proxy.
    const LASTFM_API_KEY = '29a800d202a60b1cc7f4f703a81ca7b1';
    const LASTFM_API_BASE_URL = 'https://ws.audioscrobbler.com/2.0/';
    const ITEMS_LIMIT = 5; // How many items to display per list

    // --- API Fetch Function ---
    async function fetchLastFmData(method, params = {}) {
        const baseParams = {
            method: method,
            api_key: LASTFM_API_KEY,
            format: 'json',
            limit: ITEMS_LIMIT,
        };
        // Explicitly add period if it exists in params
        if (params.period) {
            baseParams.period = params.period;
        }
        // Add any other potential future params similarly
        // delete params.period; // remove it so it's not added again by spread
        // Object.assign(baseParams, params); // Add remaining params

        const urlParams = new URLSearchParams(baseParams);
        const url = `${LASTFM_API_BASE_URL}?${urlParams.toString()}`;
        console.log("Requesting URL:", url); // Log the URL to check

        try {
            const response = await fetch(url);
            if (!response.ok) {
                // Try to get more error details from the response body
                let errorBody = 'Could not read error body.';
                try {
                    errorBody = await response.text(); // Try reading as text first
                } catch (e) {
                    console.error("Error reading response body:", e);
                }
                // Log the detailed error and throw
                console.error(`Last.fm API Error Response Body: ${errorBody}`);
                throw new Error(`HTTP error! Status: ${response.status}, Body: ${errorBody}`);
            }
            const data = await response.json();
            // Basic error check for Last.fm specific errors within a 200 OK response
            if (data.error) {
                 console.error(`Last.fm API returned an error code: ${data.error} - ${data.message}`);
                throw new Error(`Last.fm API error: ${data.message}`);
            }
            return data;
        } catch (error) {
            // Log the caught error (could be fetch network error or the thrown error above)
            console.error('Error fetching Last.fm data:', error);
            return null; // Return null to indicate failure
        }
    }

    // --- Spotify Search URL Generator ---
    function createSpotifySearchUrl(query) {
        // Simple search URL constructor
        return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
    }

    // --- Populate HTML List ---
    function populateList(elementId, items, type) {
        const listElement = document.getElementById(elementId);
        if (!listElement) {
            console.error(`Element with ID ${elementId} not found.`);
            return;
        }
        if (!items || items.length === 0) {
            listElement.innerHTML = '<li>Could not load data or no data available.</li>';
            return;
        }

        listElement.innerHTML = ''; // Clear loading message

        // Determine if we need the top item only (for 'day' approximation)
        const itemsToDisplay = elementId.includes('-day') ? items.slice(0, 1) : items;

        itemsToDisplay.forEach(item => {
            const listItem = document.createElement('li');
            const artistName = item.artist.name || item.artist; // Handle different structures
            const itemName = item.name;
            const image = item.image.find(img => img.size === 'medium'); // Get medium size image
            const imageUrl = image ? image['#text'] : 'placeholder.png'; // Use a placeholder if no image

            // Construct Spotify search query
            const searchQuery = type === 'album' ? `${artistName} ${itemName}` : `${artistName} ${itemName}`;
            const spotifyUrl = createSpotifySearchUrl(searchQuery);

            listItem.innerHTML = `
                <img src="${imageUrl}" alt="${itemName}" loading="lazy">
                <div>
                    <a href="${spotifyUrl}" target="_blank">${itemName}</a>
                    <span>by ${artistName}</span>
                </div>
            `;
            listElement.appendChild(listItem);
        });
    }

    // --- Load Data Function ---
    async function loadCharts() {
        // Fetch Albums
        const albumsYear = await fetchLastFmData('chart.getTopAlbums', { period: '12month' });
        const albumsMonth = await fetchLastFmData('chart.getTopAlbums', { period: '1month' });
        const albumsWeek = await fetchLastFmData('chart.getTopAlbums', { period: '7day' });

        // Populate Album Lists
        populateList('albums-year', albumsYear?.albums?.album, 'album');
        populateList('albums-month', albumsMonth?.albums?.album, 'album');
        populateList('albums-week', albumsWeek?.albums?.album, 'album');
        populateList('albums-day', albumsWeek?.albums?.album, 'album'); // Use weekly data for 'day'

        // Fetch Songs (Tracks)
        const songsYear = await fetchLastFmData('chart.getTopTracks', { period: '12month' });
        const songsMonth = await fetchLastFmData('chart.getTopTracks', { period: '1month' });
        const songsWeek = await fetchLastFmData('chart.getTopTracks', { period: '7day' });

        // Populate Song Lists
        populateList('songs-year', songsYear?.tracks?.track, 'song');
        populateList('songs-month', songsMonth?.tracks?.track, 'song');
        populateList('songs-week', songsWeek?.tracks?.track, 'song');
        populateList('songs-day', songsWeek?.tracks?.track, 'song'); // Use weekly data for 'day'
    }

    // --- Initial Load ---
    loadCharts();
});