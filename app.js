// API Keys
const LASTFM_API_KEY = '29a800d202a60b1cc7f4f703a81ca7b1';
const DISCOGS_CONSUMER_KEY = 'qOiqRPQnuycISqxlQlvw';
const DISCOGS_CONSUMER_SECRET = 'CTYgbKWJHixwpfKsGhBaGBiMtseWtcSN';

// DOM Elements
const resultsContainer = document.getElementById('results');
const loadingSpinner = document.querySelector('.loading-spinner');
const typeLinks = document.querySelectorAll('nav a');
const timeButtons = document.querySelectorAll('.time-btn');

// State
let currentType = 'albums';
let currentPeriod = 'day';
let currentPage = 1;
let itemsPerPage = 10;
let allItems = []; // Define allItems globally
let retryCount = 0;
const MAX_RETRIES = 3;

// Cache system
const cache = {
    data: {},
    timestamp: {},
    CACHE_DURATION: 5 * 60 * 1000 // 5 minutes in milliseconds
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    
    // Event listeners
    typeLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            typeLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            currentType = link.dataset.type;
            currentPage = 1; // Reset to first page on type change
            fetchData();
        });
    });
    
    timeButtons.forEach(button => {
        button.addEventListener('click', () => {
            timeButtons.forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            currentPeriod = button.dataset.period;
            currentPage = 1; // Reset to first page on period change
            fetchData();
        });
    });
    
    // Pagination event listeners
    if (document.getElementById('prev-page')) {
        document.getElementById('prev-page').addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                displayPage();
            }
        });
    }
    
    if (document.getElementById('next-page')) {
        document.getElementById('next-page').addEventListener('click', () => {
            if (currentPage < Math.ceil(allItems.length / itemsPerPage)) {
                currentPage++;
                displayPage();
            }
        });
    }
    
    // Add a refresh button to force reload data
    const refreshButton = document.createElement('button');
    refreshButton.id = 'refresh-btn';
    refreshButton.className = 'refresh-btn';
    refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
    refreshButton.title = 'Refresh data';
    
    refreshButton.addEventListener('click', () => {
        // Clear cache for current view only
        const cacheKey = `${currentType}-${currentPeriod}`;
        delete cache.data[cacheKey];
        delete cache.timestamp[cacheKey];
        
        // Fetch fresh data
        fetchData();
    });
    
    document.querySelector('.time-filters').appendChild(refreshButton);
});

// Fetch data from Last.fm API with retry logic
async function fetchData() {
    showLoading();
    retryCount = 0;
    
    try {
        // Create a cache key based on current selections
        const cacheKey = `${currentType}-${currentPeriod}`;
        
        // Check if we have cached data and it's still valid
        if (cache.data[cacheKey] && 
            (Date.now() - cache.timestamp[cacheKey] < cache.CACHE_DURATION)) {
            console.log('Using cached data');
            allItems = cache.data[cacheKey];
            displayPage();
        } else {
            // Fetch new data if no cache or cache expired
            if (currentType === 'albums') {
                allItems = await fetchWithRetry(fetchTopAlbums);
                // Skip Discogs enhancement due to CORS issues
                // allItems = await fetchWithRetry(() => enhanceWithDiscogsData(allItems));
            } else {
                allItems = await fetchWithRetry(fetchTopTracks);
            }
            
            // Save to cache
            cache.data[cacheKey] = allItems;
            cache.timestamp[cacheKey] = Date.now();
            displayPage();
        }
    } catch (error) {
        handleError(error);
    } finally {
        hideLoading();
    }
}

// Function to display the current page
function displayPage() {
    // Calculate start and end indices for the current page
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, allItems.length);
    
    // Get items for the current page
    const pageItems = allItems.slice(startIndex, endIndex);
    
    // Display the items
    displayResults(pageItems);
    
    // Update pagination controls if they exist
    const totalPages = Math.ceil(allItems.length / itemsPerPage);
    const pageInfo = document.getElementById('page-info');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages;
}

// Generic retry function
async function fetchWithRetry(fetchFunction, maxRetries = MAX_RETRIES) {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fetchFunction();
        } catch (error) {
            console.warn(`Attempt ${attempt + 1} failed:`, error);
            lastError = error;
            
            // Wait before retrying (exponential backoff)
            if (attempt < maxRetries - 1) {
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // If we've exhausted all retries, throw the last error
    throw lastError;
}

// Fetch top albums from Last.fm with time period
async function fetchTopAlbums() {
    const periodMap = {
        'day': 'day',
        'week': '7day',
        'month': '1month',
        'year': '12month'
    };
    
    // For albums, we'll use the chart.getTopArtists method with period
    const url = `https://ws.audioscrobbler.com/2.0/?method=chart.gettopartists&api_key=${LASTFM_API_KEY}&format=json&period=${periodMap[currentPeriod]}&limit=25`;
    
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Last.fm API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Get top artists
    const artists = data.artists.artist.slice(0, 10);
    
    // For each artist, get their top album
    const albumPromises = artists.map(async (artist) => {
        const albumUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.gettopalbums&artist=${encodeURIComponent(artist.name)}&api_key=${LASTFM_API_KEY}&format=json&limit=1&period=${periodMap[currentPeriod]}`;
        const albumResponse = await fetch(albumUrl);
        
        if (!albumResponse.ok) {
            throw new Error(`Last.fm API error: ${albumResponse.status}`);
        }
        
        const albumData = await albumResponse.json();
        
        if (albumData.topalbums && albumData.topalbums.album && albumData.topalbums.album.length > 0) {
            // Get the album image or use a placeholder
            let albumImage = 'placeholder.png';
            
            if (albumData.topalbums.album[0].image && albumData.topalbums.album[0].image.length > 0) {
                // Try to get the extralarge image first
                const xlImage = albumData.topalbums.album[0].image.find(img => img.size === 'extralarge');
                if (xlImage && xlImage['#text'] && xlImage['#text'].length > 10 && 
                    !xlImage['#text'].includes('2a96cbd8b46e442fc41c2b86b821562f')) {
                    albumImage = xlImage['#text'];
                } else {
                    // Try large image if extralarge not available
                    const largeImage = albumData.topalbums.album[0].image.find(img => img.size === 'large');
                    if (largeImage && largeImage['#text'] && largeImage['#text'].length > 10 && 
                        !largeImage['#text'].includes('2a96cbd8b46e442fc41c2b86b821562f')) {
                        albumImage = largeImage['#text'];
                    }
                }
            }
            
            // Remove the console.log that was causing errors
            // console.log("Track image data:", track.image);
            
            return {
                name: albumData.topalbums.album[0].name,
                artist: artist.name,
                image: albumImage,
                // We'll search for this on Spotify later
                searchQuery: `${artist.name} ${albumData.topalbums.album[0].name}`,
                // Add basic info that would have come from Discogs
                year: 'N/A',
                genre: 'N/A',
                label: 'N/A',
                isEnhanced: false
            };
        }
        return null;
    });
    
    const albums = (await Promise.all(albumPromises)).filter(album => album !== null);
    return albums;
}

// Fetch top tracks from Last.fm
async function fetchTopTracks() {
    const periodMap = {
        'day': 'day',
        'week': '7day',
        'month': '1month',
        'year': '12month'
    };
    
    // Use the period parameter in the API call
    const url = `https://ws.audioscrobbler.com/2.0/?method=chart.gettoptracks&api_key=${LASTFM_API_KEY}&format=json&limit=50&period=${periodMap[currentPeriod]}`;
    
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Last.fm API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return data.tracks.track.map(track => {
        // Fix the image extraction - Last.fm track images are structured differently
        let imageUrl = 'placeholder.png';
        
        // Try to get image from track
        if (track.image && track.image.length > 0) {
            // Get the largest image (usually the last one in the array)
            const largeImage = track.image.find(img => img.size === 'extralarge');
            
            if (largeImage && largeImage['#text'] && largeImage['#text'].length > 10) {
                // Check if it's not the default Last.fm placeholder
                if (!largeImage['#text'].includes('2a96cbd8b46e442fc41c2b86b821562f')) {
                    imageUrl = largeImage['#text'];
                }
            } else {
                // Try medium image if large not available
                const mediumImage = track.image.find(img => img.size === 'large') || 
                                   track.image.find(img => img.size === 'medium');
                if (mediumImage && mediumImage['#text'] && mediumImage['#text'].length > 10 && 
                    !mediumImage['#text'].includes('2a96cbd8b46e442fc41c2b86b821562f')) {
                    imageUrl = mediumImage['#text'];
                }
            }
        }
        
        return {
            name: track.name,
            artist: track.artist.name,
            image: imageUrl,
            searchQuery: `${track.artist.name} ${track.name}`,
            isEnhanced: false
        };
    });
}

// Helper function to fetch artist image
async function fetchArtistImage(artistName) {
    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artistName)}&api_key=${LASTFM_API_KEY}&format=json`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Last.fm API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.artist && data.artist.image && data.artist.image.length > 0) {
            // Get the largest image
            const largeImage = data.artist.image.find(img => img.size === 'extralarge') || 
                              data.artist.image.find(img => img.size === 'large') ||
                              data.artist.image[data.artist.image.length - 1];
                              
            if (largeImage && largeImage['#text']) {
                return largeImage['#text'];
            }
        }
        
        return null;
    } catch (error) {
        console.warn(`Failed to fetch image for artist ${artistName}:`, error);
        return null;
    }
}

// Display results in the UI
function displayResults(items) {
    resultsContainer.innerHTML = '';
    
    // Remove this code - it's outside the loop where card is defined
    // const img = card.querySelector('img');
    // img.addEventListener('load', () => {
    //     img.classList.add('loaded');
    // });

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'music-card';
        
        // Create enhanced card content if the item has Discogs data
        let cardContent = '';
        
        // Check if image URL is valid and use placeholder if not
        const imageUrl = item.image && item.image !== '' ? 
            item.image : 'placeholder.png';
        
        if (item.isEnhanced) {
            cardContent = `
                <div class="img-container">
                    <img src="${imageUrl}" alt="${item.name}" onerror="this.onerror=null; this.src='placeholder.png';">
                </div>
                <div class="music-card-content">
                    <h3>${item.name}</h3>
                    <p>${item.artist}</p>
                    <div class="music-card-details">
                        <p><span>Year:</span> ${item.year}</p>
                        <p><span>Genre:</span> ${item.genre}</p>
                        ${item.style ? `<p><span>Style:</span> ${item.style}</p>` : ''}
                        <p><span>Label:</span> ${item.label}</p>
                    </div>
                </div>
                <div class="play-btn">
                    <i class="fas fa-play"></i>
                </div>
            `;
        } else {
            cardContent = `
                <div class="img-container">
                    <img src="${imageUrl}" alt="${item.name}" onerror="this.onerror=null; this.src='placeholder.png';">
                </div>
                <div class="music-card-content">
                    <h3>${item.name}</h3>
                    <p>${item.artist}</p>
                </div>
                <div class="play-btn">
                    <i class="fas fa-play"></i>
                </div>
            `;
        }
        
        card.innerHTML = cardContent;
        
        // If you want to add the image load event listener, do it here
        const img = card.querySelector('img');
        if (img) {
            img.addEventListener('load', () => {
                img.classList.add('loaded');
            });
        }
        
        // Add click event to open Spotify search
        card.addEventListener('click', () => {
            const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(item.searchQuery)}`;
            window.open(spotifySearchUrl, '_blank');
        });
        
        resultsContainer.appendChild(card);
    });
}

// Helper functions for loading state
function showLoading() {
    loadingSpinner.style.display = 'flex';
    resultsContainer.innerHTML = '';
}

function hideLoading() {
    loadingSpinner.style.display = 'none';
}

// Error handling function
function handleError(error) {
    console.error('Error fetching data:', error);
    
    let errorMessage = 'Error loading data. Please try again later.';
    
    // Customize error message based on error type
    if (error.message.includes('API error: 429')) {
        errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
    } else if (error.message.includes('API error: 403')) {
        errorMessage = 'Authentication error. Please check your API keys.';
    } else if (error.message.includes('API error: 404')) {
        errorMessage = 'The requested resource was not found.';
    } else if (error.message.includes('NetworkError') || error.name === 'TypeError') {
        errorMessage = 'Network error. Please check your internet connection.';
    }
    
    resultsContainer.innerHTML = `
        <div class="error-container">
            <p class="error">${errorMessage}</p>
            <button id="retry-btn" class="retry-btn">Try Again</button>
        </div>
    `;
    
    // Add retry button functionality
    document.getElementById('retry-btn').addEventListener('click', fetchData);
}

// Function to clear cache (useful for debugging or manual refresh)
function clearCache() {
    cache.data = {};
    cache.timestamp = {};
    console.log('Cache cleared');
}

// Function to search Spotify directly
function searchSpotify(query) {
    const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
    window.open(spotifySearchUrl, '_blank');
}

/* 
 * Commented out due to CORS issues
 * To use Discogs API, you would need to:
 * 1. Use a CORS proxy
 * 2. Or create a small backend server
 * 3. Or use the proper OAuth flow with Discogs
 */

async function enhanceWithDiscogsData(items) {
    try {
        // Create a new array with enhanced items
        const enhancedItems = await Promise.all(items.map(async (item) => {
            try {
                // Use a CORS proxy to access Discogs API
                const corsProxy = 'https://cors-anywhere.herokuapp.com/';
                const searchUrl = `${corsProxy}https://api.discogs.com/database/search?q=${encodeURIComponent(item.name + ' ' + item.artist)}&type=release&key=${DISCOGS_CONSUMER_KEY}&secret=${DISCOGS_CONSUMER_SECRET}`;
                
                const response = await fetch(searchUrl, {
                    headers: {
                        'Origin': window.location.origin,
                        'User-Agent': 'MusicPopularityTracker/1.0'
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`Discogs API error: ${response.status}`);
                }
                
                const data = await response.json();
                
                // If we found a match, enhance the item with additional data
                if (data.results && data.results.length > 0) {
                    const discogsData = data.results[0];
                    
                    return {
                        ...item,
                        // Use higher quality image from Discogs if available
                        image: discogsData.cover_image || item.image,
                        // Add additional data from Discogs
                        year: discogsData.year || 'Unknown',
                        genre: discogsData.genre ? discogsData.genre.join(', ') : 'Unknown',
                        style: discogsData.style ? discogsData.style.join(', ') : '',
                        label: discogsData.label ? discogsData.label.join(', ') : 'Unknown',
                        // Add a flag to indicate this item has enhanced data
                        isEnhanced: true
                    };
                }
                
                // If no match found, return the original item
                return { ...item, isEnhanced: false };
                
            } catch (error) {
                console.warn(`Failed to enhance item ${item.name}:`, error);
                // Return the original item if enhancement fails
                return { ...item, isEnhanced: false };
            }
        }));
        
        return enhancedItems;
    } catch (error) {
        console.error('Error enhancing with Discogs data:', error);
        // Return original items if the overall process fails
        return items;
    }
}
