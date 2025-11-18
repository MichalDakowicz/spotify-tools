# spotify-tools

A collection of lightweight Spotify utilities built with vanilla JavaScript.

## Tools

### Album Picker

Picks a random album from your Spotify library.

**Features:**

-   Browse your saved albums
-   Get a random pick with one click
-   Direct link to play the album on Spotify

### Playlist Shuffler

Shuffle a playlist and overwrite it or save the shuffled order to a new playlist.

**Features:**

-   Shuffle any of your playlists
-   Option to overwrite existing playlist
-   Option to create a new shuffled playlist
-   Preserves all track information

### Artist Collector

Collect all tracks from an artist and add them to a playlist.

**Features:**

-   Search for any artist on Spotify
-   Choose what to include: Albums, Singles, EPs, Appears On, Compilations
-   Automatically removes duplicate tracks
-   Creates a new playlist with all collected tracks
-   Shows progress during collection

### Playlist Analyzer

Analyze your playlists to get detailed statistics and insights.

**Features:**

-   View total tracks, duration, and unique artists
-   Analyze audio features (energy, danceability, valence, acousticness)
-   See your top artists in each playlist
-   Get average track length statistics

### Duplicate Track Finder

Find and remove duplicate tracks from your playlists.

**Features:**

-   Scan any playlist for duplicate tracks
-   View all duplicates with their positions
-   Remove individual duplicates or all at once
-   Keep the first occurrence of each track

### Playlist Merger

Combine multiple playlists into a single playlist.

**Features:**

-   Select multiple playlists to merge
-   Automatic duplicate removal option
-   Create new merged playlist with custom name
-   Choose public or private visibility

### Top Tracks

Export your most played tracks to a new playlist.

**Features:**

-   View your top tracks for different time ranges (4 weeks, 6 months, all time)
-   Choose how many tracks to export (10, 20, or 50)
-   Preview your top tracks before creating playlist
-   Automatically creates playlist with descriptive name

## Technologies

-   Vanilla JavaScript (no frameworks)
-   Spotify Web API with PKCE authentication
-   Tailwind CSS for styling
