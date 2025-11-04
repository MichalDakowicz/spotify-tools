// Spotify Album Picker JS (extracted)
// NOTE: Keep CLIENT_ID updated with your Spotify app client id
const CLIENT_ID = "2e8c78e744f244758e048cf8311097db";
// Use the current page as the redirect URI so it works when served as /album-picker.html
const REDIRECT_URI = window.location.origin + window.location.pathname;
const SCOPES = "user-library-read";

let accessToken = null;
let albums = [];

// Elements
const loginCard = document.getElementById("loginCard");
const appCard = document.getElementById("appCard");
const loginBtn = document.getElementById("loginBtn");
const pickBtn = document.getElementById("pickBtn");
const logoutBtn = document.getElementById("logoutBtn");
const homeBtn = document.getElementById("homeBtn");
const albumDisplay = document.getElementById("albumDisplay");
const loading = document.getElementById("loading");
const albumArt = document.getElementById("albumArt");
const albumName = document.getElementById("albumName");
const artistName = document.getElementById("artistName");
const spotifyLink = document.getElementById("spotifyLink");
const totalAlbums = document.getElementById("totalAlbums");

// Generate random string
function generateRandomString(length) {
    const possible =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from(crypto.getRandomValues(new Uint8Array(length)))
        .map((x) => possible[x % possible.length])
        .join("");
}

// Generate code verifier and challenge for PKCE
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

    // Store code verifier for later use
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

// Fetch all saved albums
async function fetchAllAlbums() {
    albums = [];
    let url = "https://api.spotify.com/v1/me/albums?limit=50";

    loading.classList.remove("hidden");

    try {
        while (url) {
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!response.ok) throw new Error("Failed to fetch albums");
            const data = await response.json();
            albums = albums.concat(data.items);
            url = data.next;
        }

        totalAlbums.textContent = albums.length;
        loading.classList.add("hidden");

        if (albums.length === 0)
            alert(
                "No albums found in your library. Save some albums on Spotify first!"
            );
    } catch (error) {
        loading.classList.add("hidden");
        alert("Error fetching albums: " + error.message);
        logout();
    }
}

// Pick random album
function pickRandomAlbum() {
    if (albums.length === 0) {
        alert(
            "No albums available. Please make sure you have saved albums in your Spotify library."
        );
        return;
    }
    const randomIndex = Math.floor(Math.random() * albums.length);
    const album = albums[randomIndex].album;

    albumArt.src = album.images[0]?.url || "";
    albumName.textContent = album.name;
    artistName.textContent = album.artists.map((a) => a.name).join(", ");
    spotifyLink.href = album.external_urls.spotify;

    albumDisplay.classList.remove("hidden");
}

// Logout
function logout() {
    accessToken = null;
    albums = [];
    localStorage.removeItem("spotify_access_token");
    window.history.replaceState({}, document.title, window.location.pathname);
    appCard.classList.add("hidden");
    loginCard.classList.remove("hidden");
    albumDisplay.classList.add("hidden");
}

// Event listeners
pickBtn.addEventListener("click", pickRandomAlbum);
logoutBtn.addEventListener("click", logout);
// Home button — navigate back to the tools menu
if (homeBtn) {
    homeBtn.addEventListener("click", () => {
        // If the menu is available at index.html, go there
        window.location.href = "index.html";
    });
}

// Check for authorization code or existing token on load
window.addEventListener("load", async () => {
    // Check for stored token first
    const storedToken = localStorage.getItem("spotify_access_token");
    if (storedToken) {
        accessToken = storedToken;
        loginCard.classList.add("hidden");
        appCard.classList.remove("hidden");
        fetchAllAlbums();
        return;
    }

    // Check for authorization code
    const code = getCodeFromUrl();
    if (code) {
        try {
            accessToken = await exchangeCodeForToken(code);
            localStorage.setItem("spotify_access_token", accessToken);
            // Clean up URL
            window.history.replaceState(
                {},
                document.title,
                window.location.pathname
            );
            loginCard.classList.add("hidden");
            appCard.classList.remove("hidden");
            fetchAllAlbums();
        } catch (error) {
            alert("Authentication failed: " + error.message);
            logout();
        }
    }
});

// EOF
