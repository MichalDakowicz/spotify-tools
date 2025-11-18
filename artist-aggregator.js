// Spotify Artist Collector JS
const CLIENT_ID = "2e8c78e744f244758e048cf8311097db";
const REDIRECT_URI = window.location.origin + window.location.pathname;
const SCOPES = [
    "user-library-read",
    "playlist-modify-public",
    "playlist-modify-private",
].join(" ");

let accessToken = null;
let currentArtist = null;
let userId = null;

// Elements
const loginCard = document.getElementById("loginCard");
const appCard = document.getElementById("appCard");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const homeBtn = document.getElementById("homeBtn");

const searchSection = document.getElementById("searchSection");
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

const artistSection = document.getElementById("artistSection");
const selectedArtistImg = document.getElementById("selectedArtistImg");
const selectedArtistName = document.getElementById("selectedArtistName");
const selectedArtistFollowers = document.getElementById(
    "selectedArtistFollowers"
);

const includeAlbums = document.getElementById("includeAlbums");
const includeSingles = document.getElementById("includeSingles");
const includeAppearsOn = document.getElementById("includeAppearsOn");
const includeCompilations = document.getElementById("includeCompilations");
const playlistName = document.getElementById("playlistName");

const collectBtn = document.getElementById("collectBtn");
const backBtn = document.getElementById("backBtn");

const statusSection = document.getElementById("statusSection");
const statusText = document.getElementById("statusText");
const progressFill = document.getElementById("progressFill");

const linkModal = document.getElementById("linkModal");
const openLinkModal = document.getElementById("openLinkModal");
const cancelLinkBtn = document.getElementById("cancelLinkBtn");
const submitLinkBtn = document.getElementById("submitLinkBtn");
const artistLinkInput = document.getElementById("artistLinkInput");

// Helper function to add delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to retry fetch with exponential backoff
async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        const response = await fetch(url, options);
        
        // If rate limited (429), wait and retry
        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, i) * 1000;
            console.log(`Rate limited. Waiting ${waitTime}ms before retry ${i + 1}/${maxRetries}...`);
            await delay(waitTime);
            continue;
        }
        
        return response;
    }
    
    // If all retries failed, make one last attempt
    return fetch(url, options);
}

// Generate random string
function generateRandomString(length) {
    const possible =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from(crypto.getRandomValues(new Uint8Array(length)))
        .map((x) => possible[x % possible.length])
        .join("");
}

// Generate code challenge for PKCE
async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

// Login to Spotify with PKCE
loginBtn.addEventListener("click", async () => {
    if (CLIENT_ID === "YOUR_CLIENT_ID_HERE") {
        alert(
            "Please set up your Spotify Client ID first!\n\n1. Go to https://developer.spotify.com/dashboard\n2. Create an app\n3. Add this URL to Redirect URIs: " +
                REDIRECT_URI +
                "\n4. Copy the Client ID and paste it in the code"
        );
        return;
    }

    const codeVerifier = generateRandomString(64);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateRandomString(16);

    localStorage.setItem("code_verifier", codeVerifier);
    localStorage.setItem("auth_state", state);

    const authUrl = new URL("https://accounts.spotify.com/authorize");
    authUrl.searchParams.append("client_id", CLIENT_ID);
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.append("scope", SCOPES);
    authUrl.searchParams.append("state", state);
    authUrl.searchParams.append("code_challenge", codeChallenge);
    authUrl.searchParams.append("code_challenge_method", "S256");

    window.location = authUrl.toString();
});

// Exchange authorization code for access token
async function exchangeCodeForToken(code) {
    const codeVerifier = localStorage.getItem("code_verifier");

    const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: "authorization_code",
            code: code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier,
        }),
    });

    if (!response.ok) {
        throw new Error("Failed to exchange code for token");
    }

    const data = await response.json();
    localStorage.removeItem("code_verifier");
    localStorage.removeItem("auth_state");

    return data.access_token;
}

// Parse code from URL
function getCodeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    if (error) {
        alert("Authentication error: " + error);
        return null;
    }

    const savedState = localStorage.getItem("auth_state");
    if (state && savedState && state !== savedState) {
        alert("State mismatch. Possible security issue.");
        return null;
    }

    return code;
}

// Get current user profile
async function getCurrentUser() {
    const response = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to fetch user profile:", response.status, errorText);
        throw new Error("Failed to fetch user profile");
    }
    
    const data = await response.json();
    userId = data.id;
    
    if (!userId) {
        throw new Error("User ID not found in profile data");
    }
    
    console.log("User ID set:", userId);
}

// Search for artists
let searchTimeout;
searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();

    if (query.length < 2) {
        searchResults.innerHTML = "";
        return;
    }

    searchTimeout = setTimeout(() => searchArtists(query), 300);
});

async function searchArtists(query) {
    try {
        const response = await fetchWithRetry(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(
                query
            )}&type=artist&limit=5`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );

        if (!response.ok) throw new Error("Failed to search artists");
        const data = await response.json();

        displaySearchResults(data.artists.items);
    } catch (error) {
        console.error("Search error:", error);
        searchResults.innerHTML =
            '<p class="text-red-500 text-center">Failed to search artists</p>';
    }
}

function displaySearchResults(artists) {
    if (artists.length === 0) {
        searchResults.innerHTML =
            '<p class="text-gray-400 text-center">No artists found</p>';
        return;
    }

    searchResults.innerHTML = artists
        .map(
            (artist) => `
        <div class="artist-result" data-artist-id="${artist.id}">
            <img src="${
                artist.images[0]?.url || "https://via.placeholder.com/60"
            }" 
                 alt="${artist.name}" 
                 class="artist-img" />
            <div class="flex-1">
                <div class="font-semibold">${artist.name}</div>
                <div class="small-muted">${artist.followers.total.toLocaleString()} followers</div>
            </div>
        </div>
    `
        )
        .join("");

    // Add click listeners
    searchResults.querySelectorAll(".artist-result").forEach((el) => {
        el.addEventListener("click", () => {
            const artistId = el.getAttribute("data-artist-id");
            const artist = artists.find((a) => a.id === artistId);
            selectArtist(artist);
        });
    });
}

function selectArtist(artist) {
    currentArtist = artist;

    // Update UI
    selectedArtistImg.src =
        artist.images[0]?.url || "https://via.placeholder.com/128";
    selectedArtistName.textContent = artist.name;
    selectedArtistFollowers.textContent = `${artist.followers.total.toLocaleString()} followers`;
    playlistName.value = `${artist.name} - Complete Collection`;

    // Show artist section, hide search
    searchSection.classList.add("hidden");
    artistSection.classList.remove("hidden");
}

// Modal functionality
openLinkModal.addEventListener("click", () => {
    linkModal.classList.remove("hidden");
    artistLinkInput.value = "";
    artistLinkInput.focus();
});

cancelLinkBtn.addEventListener("click", () => {
    linkModal.classList.add("hidden");
});

// Close modal on overlay click
linkModal.addEventListener("click", (e) => {
    if (e.target === linkModal) {
        linkModal.classList.add("hidden");
    }
});

// Keyboard support for modal
artistLinkInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        submitLinkBtn.click();
    } else if (e.key === "Escape") {
        linkModal.classList.add("hidden");
    }
});

// Submit artist link
submitLinkBtn.addEventListener("click", async () => {
    const input = artistLinkInput.value.trim();
    
    if (!input) {
        alert("Please enter an artist link or URI");
        return;
    }
    
    // Extract artist ID from various Spotify URL formats
    const artistId = extractArtistId(input);
    
    if (!artistId) {
        alert("Invalid Spotify artist link. Please make sure you're using a valid artist URL or URI.");
        return;
    }
    
    try {
        submitLinkBtn.disabled = true;
        submitLinkBtn.textContent = "Loading...";
        
        const artist = await fetchArtistById(artistId);
        linkModal.classList.add("hidden");
        selectArtist(artist);
    } catch (error) {
        console.error("Error loading artist:", error);
        alert("Failed to load artist. Please check the link and try again.");
    } finally {
        submitLinkBtn.disabled = false;
        submitLinkBtn.textContent = "Load Artist";
    }
});

// Extract artist ID from Spotify URL or URI
function extractArtistId(input) {
    // Match various Spotify URL formats
    // https://open.spotify.com/artist/1234567890
    // spotify:artist:1234567890
    // https://open.spotify.com/intl-es/artist/1234567890
    
    const patterns = [
        /spotify:artist:([a-zA-Z0-9]+)/,
        /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?artist\/([a-zA-Z0-9]+)/,
    ];
    
    for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) {
            return match[1];
        }
    }
    
    // If it's just an ID (alphanumeric string)
    if (/^[a-zA-Z0-9]{22}$/.test(input)) {
        return input;
    }
    
    return null;
}

// Fetch artist by ID
async function fetchArtistById(artistId) {
    const response = await fetchWithRetry(
        `https://api.spotify.com/v1/artists/${artistId}`,
        {
            headers: { Authorization: `Bearer ${accessToken}` },
        }
    );
    
    if (!response.ok) {
        throw new Error("Failed to fetch artist");
    }
    
    return await response.json();
}

// Back to search
backBtn.addEventListener("click", () => {
    artistSection.classList.add("hidden");
    searchSection.classList.remove("hidden");
    searchInput.value = "";
    searchResults.innerHTML = "";
    currentArtist = null;
    statusSection.classList.add("hidden");
});

// Collect tracks
collectBtn.addEventListener("click", async () => {
    if (!currentArtist) return;

    const name = playlistName.value.trim();
    if (!name) {
        alert("Please enter a playlist name");
        return;
    }

    collectBtn.disabled = true;
    backBtn.disabled = true;
    statusSection.classList.remove("hidden");

    try {
        // Get artist albums
        updateStatus("Fetching albums...", 10);
        const albums = await fetchArtistAlbums();

        if (albums.length === 0) {
            alert("No albums found for this artist with the selected options");
            return;
        }

        // Get all tracks
        updateStatus(`Collecting tracks from ${albums.length} albums...`, 30);
        const tracks = await fetchTracksFromAlbums(albums);

        if (tracks.length === 0) {
            alert("No tracks found");
            return;
        }

        // Remove duplicates
        updateStatus("Removing duplicates...", 70);
        const uniqueTracks = removeDuplicateTracks(tracks);

        // Create playlist
        updateStatus("Creating playlist...", 80);
        const playlistId = await createPlaylist(name);

        // Add tracks to playlist
        updateStatus("Adding tracks to playlist...", 90);
        await addTracksToPlaylist(playlistId, uniqueTracks);

        updateStatus(
            `✓ Success! Added ${uniqueTracks.length} tracks to playlist`,
            100
        );

        // Show success message
        setTimeout(() => {
            const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;
            if (
                confirm(
                    `Playlist created successfully with ${uniqueTracks.length} tracks!\n\nOpen in Spotify?`
                )
            ) {
                window.open(playlistUrl, "_blank");
            }

            // Reset
            backBtn.click();
        }, 1500);
    } catch (error) {
        console.error("Collection error:", error);
        updateStatus(`✗ Error: ${error.message}`, 0);
        alert("Failed to collect tracks: " + error.message);
    } finally {
        collectBtn.disabled = false;
        backBtn.disabled = false;
    }
});

function updateStatus(text, progress) {
    statusText.textContent = text;
    progressFill.style.width = `${progress}%`;
}

async function fetchArtistAlbums() {
    const includeGroups = [];
    if (includeAlbums.checked) includeGroups.push("album");
    if (includeSingles.checked) includeGroups.push("single");
    if (includeAppearsOn.checked) includeGroups.push("appears_on");
    if (includeCompilations.checked) includeGroups.push("compilation");

    if (includeGroups.length === 0) {
        throw new Error("Please select at least one album type");
    }

    const albums = [];
    let url = `https://api.spotify.com/v1/artists/${
        currentArtist.id
    }/albums?include_groups=${includeGroups.join(",")}&limit=50`;

    while (url) {
        const response = await fetchWithRetry(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) throw new Error("Failed to fetch albums");
        const data = await response.json();
        // Keep track of album_group for each album
        albums.push(...data.items.map(item => ({
            ...item,
            album_group: item.album_group
        })));
        url = data.next;
    }

    return albums;
}

async function fetchTracksFromAlbums(albums) {
    const tracks = [];
    const batchSize = 5; // Reduced batch size to avoid rate limits

    for (let i = 0; i < albums.length; i += batchSize) {
        const batch = albums.slice(i, i + batchSize);
        const batchPromises = batch.map((album) => 
            fetchAlbumTracks(album.id, album.album_group)
        );
        const batchResults = await Promise.all(batchPromises);

        batchResults.forEach((albumTracks) => {
            tracks.push(...albumTracks);
        });

        // Update progress
        const progress = 30 + ((i + batch.length) / albums.length) * 40;
        updateStatus(
            `Collecting tracks from ${albums.length} albums... (${
                i + batch.length
            }/${albums.length})`,
            progress
        );
        
        // Add a small delay between batches to avoid rate limiting
        if (i + batchSize < albums.length) {
            await delay(100);
        }
    }

    return tracks;
}

async function fetchAlbumTracks(albumId, albumGroup) {
    const tracks = [];
    let url = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`;

    while (url) {
        const response = await fetchWithRetry(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) throw new Error("Failed to fetch album tracks");
        const data = await response.json();
        
        // If it's an "appears_on" album, only add tracks where the artist is featured
        if (albumGroup === 'appears_on') {
            const filteredTracks = data.items.filter(track => 
                track.artists.some(artist => artist.id === currentArtist.id)
            );
            tracks.push(...filteredTracks);
        } else {
            // For other album types, add all tracks
            tracks.push(...data.items);
        }
        
        url = data.next;
    }

    return tracks;
}

function removeDuplicateTracks(tracks) {
    const seen = new Set();
    return tracks.filter((track) => {
        // Use track name + first artist as a simple duplicate check
        const key = `${track.name.toLowerCase()}-${track.artists[0].name.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function createPlaylist(name) {
    if (!userId) {
        throw new Error("User ID not available. Please try logging in again.");
    }
    
    const response = await fetchWithRetry(
        `https://api.spotify.com/v1/users/${userId}/playlists`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: name,
                description: `Complete collection of ${currentArtist.name} tracks`,
                public: false,
            }),
        }
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Playlist creation failed:", errorData);
        throw new Error(`Failed to create playlist: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.id;
}

async function addTracksToPlaylist(playlistId, tracks) {
    const trackUris = tracks.map((track) => track.uri);
    const batchSize = 100; // Spotify API limit

    for (let i = 0; i < trackUris.length; i += batchSize) {
        const batch = trackUris.slice(i, i + batchSize);

        const response = await fetchWithRetry(
            `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ uris: batch }),
            }
        );

        if (!response.ok) throw new Error("Failed to add tracks to playlist");

        // Update progress
        const progress =
            90 + ((i + batch.length) / trackUris.length) * 10;
        updateStatus(
            `Adding tracks to playlist... (${i + batch.length}/${
                trackUris.length
            })`,
            progress
        );
        
        // Add a small delay between batches
        if (i + batchSize < trackUris.length) {
            await delay(100);
        }
    }
}

// Logout
logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("spotify_access_token");
    accessToken = null;
    loginCard.classList.remove("hidden");
    appCard.classList.add("hidden");
    window.history.replaceState({}, document.title, REDIRECT_URI);
});

// Home button
homeBtn.addEventListener("click", () => {
    window.location.href = "index.html";
});

// Initialize on load
window.addEventListener("DOMContentLoaded", async () => {
    const code = getCodeFromUrl();

    if (code) {
        try {
            accessToken = await exchangeCodeForToken(code);
            localStorage.setItem("spotify_access_token", accessToken);
            window.history.replaceState({}, document.title, REDIRECT_URI);
        } catch (error) {
            console.error("Token exchange failed:", error);
            alert("Authentication failed. Please try again.");
            return;
        }
    } else {
        accessToken = localStorage.getItem("spotify_access_token");
    }

    if (accessToken) {
        try {
            await getCurrentUser();
            loginCard.classList.add("hidden");
            appCard.classList.remove("hidden");
        } catch (error) {
            console.error("Failed to get user:", error);
            localStorage.removeItem("spotify_access_token");
            accessToken = null;
        }
    }
});
