// Playlist Shuffler — client-side PKCE Spotify tool
// IMPORTANT: replace CLIENT_ID with your Spotify app client id or set it here
const CLIENT_ID = "2e8c78e744f244758e048cf8311097db";
const REDIRECT_URI = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) + "/callback.html";
const SCOPES =
    "playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private user-read-private";

let accessToken = null;
let playlists = [];
let tracks = [];

// UI elements
const loginCard = document.getElementById("loginCard");
const appCard = document.getElementById("appCard");
const loginBtn = document.getElementById("loginBtn");
const homeBtn = document.getElementById("homeBtn");
const logoutBtn = document.getElementById("logoutBtn");
const playlistSelect = document.getElementById("playlistSelect");
const customDropdown = document.getElementById("customDropdown");
const customDropdownTrigger = customDropdown.querySelector('.custom-dropdown-trigger');
const customDropdownValue = customDropdown.querySelector('.custom-dropdown-value');
const playlistOptions = document.getElementById("playlistOptions");
const playlistSearch = document.getElementById("playlistSearch");
const loadBtn = document.getElementById("loadBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const trackCountEl = document.getElementById("trackCount");
const previewList = document.getElementById("previewList");
const statusEl = document.getElementById("status");
const applyBtn = document.getElementById("applyBtn");
const newPlaylistOptions = document.getElementById("newPlaylistOptions");
const newNameInput = document.getElementById("newName");
const newPublicInput = document.getElementById("newPublic");

function setStatus(msg, isError) {
    statusEl.textContent = msg || "";
    statusEl.style.color = isError ? "#ff6b6b" : "#9CA3AF";
}

function generateRandomString(length) {
    const possible =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from(crypto.getRandomValues(new Uint8Array(length)))
        .map((x) => possible[x % possible.length])
        .join("");
}

async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

loginBtn.addEventListener("click", async () => {
    if (CLIENT_ID === "YOUR_CLIENT_ID_HERE") {
        alert(
            "Please set CLIENT_ID in playlist-shuffler.js to your Spotify app client id and add the redirect URI to your app settings: " +
                REDIRECT_URI
        );
        return;
    }
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateRandomString(16);
    localStorage.setItem("ps_code_verifier", codeVerifier);
    localStorage.setItem("ps_auth_state", state);
    localStorage.setItem("spotify_return_to", window.location.pathname);

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

async function exchangeCodeForToken(code) {
    const codeVerifier = localStorage.getItem("ps_code_verifier");
    const resp = await fetch("https://accounts.spotify.com/api/token", {
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
    if (!resp.ok) throw new Error("Token exchange failed");
    const data = await resp.json();
    localStorage.removeItem("ps_code_verifier");
    localStorage.removeItem("ps_auth_state");
    return data.access_token;
}

function getCodeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    if (error) {
        alert("Auth error: " + error);
        return null;
    }
    const saved = localStorage.getItem("ps_auth_state");
    if (state && saved && state !== saved) {
        alert("State mismatch");
        return null;
    }
    return code;
}

async function fetchAllPlaylists() {
    playlists = [];
    let url = "https://api.spotify.com/v1/me/playlists?limit=50";
    setStatus("Loading playlists...");
    try {
        while (url) {
            const r = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!r.ok) throw new Error("Failed to fetch playlists");
            const data = await r.json();
            playlists = playlists.concat(data.items || []);
            url = data.next || null; // Ensure url is null if next is undefined
        }
        populatePlaylists();
        setStatus(`Loaded ${playlists.length} playlists.`);
    } catch (err) {
        setStatus("Error: " + err.message, true);
    }
}

function populatePlaylists() {
    playlistSelect.innerHTML = "";
    playlistOptions.innerHTML = "";
    
    if (playlists.length === 0) {
        playlistOptions.innerHTML = '<div class="custom-dropdown-option" style="cursor: default; opacity: 0.5;">No playlists found</div>';
        return;
    }
    
    playlists.forEach((p, index) => {
        // Hidden select for compatibility
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = `${p.name} — ${p.tracks.total} tracks`;
        playlistSelect.appendChild(opt);
        
        // Custom dropdown option
        const optDiv = document.createElement("div");
        optDiv.className = "custom-dropdown-option";
        optDiv.dataset.id = p.id;
        optDiv.dataset.name = p.name.toLowerCase();
        optDiv.innerHTML = `
            <div class="custom-dropdown-option-name">${escapeHtml(p.name)}</div>
            <div class="custom-dropdown-option-info">${p.tracks.total} tracks</div>
        `;
        
        optDiv.addEventListener('click', () => {
            selectPlaylist(p.id, `${p.name} — ${p.tracks.total} tracks`);
        });
        
        playlistOptions.appendChild(optDiv);
    });
    
    // Select first playlist by default
    if (playlists.length > 0) {
        selectPlaylist(playlists[0].id, `${playlists[0].name} — ${playlists[0].tracks.total} tracks`);
    }
}

function selectPlaylist(id, displayText) {
    playlistSelect.value = id;
    customDropdownValue.textContent = displayText;
    customDropdownValue.classList.remove('placeholder');
    
    // Update selected state
    playlistOptions.querySelectorAll('.custom-dropdown-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.id === id);
    });
    
    // Close dropdown
    customDropdown.classList.remove('active');
}

async function fetchPlaylistTracks(playlistId) {
    tracks = [];
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
    setStatus("Loading tracks...");
    try {
        while (url) {
            const r = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!r.ok) throw new Error("Failed to fetch tracks");
            const data = await r.json();
            // keep track objects with track.uri and name
            const items = (data.items || []).map((it) => ({
                uri: it.track?.uri,
                name: it.track?.name,
                artists: (it.track?.artists || [])
                    .map((a) => a.name)
                    .join(", "),
            }));
            tracks = tracks.concat(items);
            url = data.next || null; // Ensure url is null if next is undefined
        }
        trackCountEl.textContent = tracks.length;
        setStatus(`Loaded ${tracks.length} tracks.`);
    } catch (err) {
        setStatus("Error: " + err.message, true);
    }
}

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

shuffleBtn.addEventListener("click", () => {
    if (!tracks || tracks.length === 0) {
        alert("Load a playlist tracks first.");
        return;
    }
    const shuffled = shuffleArray(tracks);
    // save current preview order in dataset for export/apply
    playlistSelect.dataset.shuffled = JSON.stringify(
        shuffled.map((t) => t.uri)
    );
    setStatus(`Shuffled ${shuffled.length} tracks successfully!`);
});

applyBtn.addEventListener("click", async () => {
    const mode = document.querySelector('input[name="saveMode"]:checked').value;
    const shuffledUris = playlistSelect.dataset.shuffled
        ? JSON.parse(playlistSelect.dataset.shuffled)
        : tracks.map((t) => t.uri);
    if (!shuffledUris || shuffledUris.length === 0)
        return alert("Nothing to apply. Shuffle first.");

    setStatus("Applying changes...");
    try {
        if (mode === "overwrite") {
            const playlistId = playlistSelect.value;
            // Replace all items in playlist with new URIs (in order). Use PUT /playlists/{playlist_id}/tracks
            // Spotify accepts up to 100 URIs in PUT body. If more than 100, replace with first 100 then add rest via POST.
            if (shuffledUris.length <= 100) {
                const r = await fetch(
                    `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
                    {
                        method: "PUT",
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ uris: shuffledUris }),
                    }
                );
                if (!r.ok) throw new Error("Failed to replace playlist tracks");
            } else {
                // replace with first 100, then append remaining in batches
                const first = shuffledUris.slice(0, 100);
                let r = await fetch(
                    `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
                    {
                        method: "PUT",
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ uris: first }),
                    }
                );
                if (!r.ok)
                    throw new Error(
                        "Failed to replace playlist tracks (initial)"
                    );
                const rest = shuffledUris.slice(100);
                for (let i = 0; i < rest.length; i += 100) {
                    const batch = rest.slice(i, i + 100);
                    r = await fetch(
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
                    if (!r.ok)
                        throw new Error("Failed to append tracks to playlist");
                }
            }
            setStatus("Playlist overwritten successfully.");
        } else {
            // create new playlist under current user
            const me = await (
                await fetch("https://api.spotify.com/v1/me", {
                    headers: { Authorization: `Bearer ${accessToken}` },
                })
            ).json();
            const name = (
                newNameInput.value ||
                `Shuffled — ${
                    playlists.find((p) => p.id === playlistSelect.value)
                        ?.name || ""
                }`
            ).slice(0, 100);
            const createResp = await fetch(
                `https://api.spotify.com/v1/users/${me.id}/playlists`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        name,
                        public: !!newPublicInput.checked,
                        description: "Shuffled with Playlist Shuffler",
                    }),
                }
            );
            if (!createResp.ok) throw new Error("Failed to create playlist");
            const created = await createResp.json();
            // add tracks in batches of 100
            for (let i = 0; i < shuffledUris.length; i += 100) {
                const batch = shuffledUris.slice(i, i + 100);
                const r = await fetch(
                    `https://api.spotify.com/v1/playlists/${created.id}/tracks`,
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ uris: batch }),
                    }
                );
                if (!r.ok)
                    throw new Error("Failed to add tracks to new playlist");
            }
            setStatus(`Created new playlist: ${name}`);
        }
    } catch (err) {
        setStatus("Error: " + err.message, true);
        return;
    }
});

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// toggle new playlist options
document.querySelectorAll('input[name="saveMode"]').forEach((r) =>
    r.addEventListener("change", (e) => {
        newPlaylistOptions.classList.toggle("hidden", e.target.value !== "new");
    })
);

// Wire navigation buttons (home/logout)
if (homeBtn) {
    homeBtn.addEventListener("click", () => {
        // Navigate back to the tools index (if available)
        window.location.href = "index.html";
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        // Clear token and reload to show login
        logout();
    });
}

// Check for existing token or code on load
window.addEventListener("load", async () => {
    // Accept either the playlist-shuffler token key or the album-picker's key
    let stored = localStorage.getItem("ps_access_token");
    const alt = localStorage.getItem("spotify_access_token");
    if (!stored && alt) {
        // If an access token exists under the other app's key, use it here too
        stored = alt;
        localStorage.setItem("ps_access_token", alt);
    }
    if (stored) {
        accessToken = stored;
        document.documentElement.classList.remove('ps-show-login');
        document.documentElement.classList.add('ps-show-app');
        await fetchAllPlaylists();
        return;
    }
    const code = getCodeFromUrl();
    if (code) {
        try {
            accessToken = await exchangeCodeForToken(code);
            localStorage.setItem("ps_access_token", accessToken);
            window.history.replaceState(
                {},
                document.title,
                window.location.pathname
            );
            document.documentElement.classList.remove('ps-show-login');
            document.documentElement.classList.add('ps-show-app');
            await fetchAllPlaylists();
        } catch (err) {
            setStatus("Auth failed: " + err.message, true);
        }
    }
});

// Load tracks button
loadBtn.addEventListener("click", async () => {
    const pid = playlistSelect.value;
    if (!pid) return alert("Choose a playlist first");
    await fetchPlaylistTracks(pid);
});

// small helper to clear token (not exposed in UI)
function logout() {
    accessToken = null;
    localStorage.removeItem("ps_access_token");
    localStorage.removeItem("spotify_access_token"); // Also clear the alternate token key
    window.location.href = window.location.pathname;
}

// expose simple global for debugging if needed
window.ps = { logout };

// Custom Dropdown Functionality
customDropdownTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    customDropdown.classList.toggle('active');
    if (customDropdown.classList.contains('active')) {
        playlistSearch.focus();
    }
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!customDropdown.contains(e.target)) {
        customDropdown.classList.remove('active');
    }
});

// Search functionality
playlistSearch.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    playlistOptions.querySelectorAll('.custom-dropdown-option').forEach(opt => {
        const name = opt.dataset.name || '';
        const matches = name.includes(searchTerm);
        opt.classList.toggle('hidden', !matches);
    });
});

// Clear search when dropdown closes
customDropdown.addEventListener('transitionend', (e) => {
    if (!customDropdown.classList.contains('active') && e.propertyName === 'opacity') {
        playlistSearch.value = '';
        playlistOptions.querySelectorAll('.custom-dropdown-option').forEach(opt => {
            opt.classList.remove('hidden');
        });
    }
});

// Keyboard navigation for dropdown
customDropdown.addEventListener('keydown', (e) => {
    if (!customDropdown.classList.contains('active')) return;
    
    const options = Array.from(playlistOptions.querySelectorAll('.custom-dropdown-option:not(.hidden)'));
    const currentIndex = options.findIndex(opt => opt.classList.contains('selected'));
    
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, options.length - 1);
        if (options[nextIndex]) {
            options[nextIndex].scrollIntoView({ block: 'nearest' });
            options[nextIndex].click();
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = Math.max(currentIndex - 1, 0);
        if (options[prevIndex]) {
            options[prevIndex].scrollIntoView({ block: 'nearest' });
            options[prevIndex].click();
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (options[currentIndex]) {
            options[currentIndex].click();
        }
    } else if (e.key === 'Escape') {
        customDropdown.classList.remove('active');
    }
});
