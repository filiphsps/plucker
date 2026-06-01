#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: dl-playlist.sh [OPTIONS] <youtube-playlist-url>

Downloads a YouTube playlist as tagged MP3s.

Options:
  --skip-download   Skip downloading, only tag existing files in the folder
  --skip-tagging    Skip tagging, only download
  --skip-rename     Skip renaming files after tagging
  --folder NAME     Use a specific folder name instead of the playlist title
  -h, --help        Show this help
USAGE
  exit 0
}

[[ $# -eq 0 ]] && usage

SKIP_DOWNLOAD=false
SKIP_TAGGING=false
SKIP_RENAME=false
FOLDER_OVERRIDE=""
URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-download) SKIP_DOWNLOAD=true; shift ;;
    --skip-tagging)  SKIP_TAGGING=true; shift ;;
    --skip-rename)   SKIP_RENAME=true; shift ;;
    --folder)        FOLDER_OVERRIDE="$2"; shift 2 ;;
    -h|--help)       usage ;;
    -*)              printf 'Unknown option: %s\n' "$1" >&2; exit 1 ;;
    *)               URL="$1"; shift ;;
  esac
done

if [ -z "$URL" ] && ! $SKIP_DOWNLOAD; then
  printf 'Error: playlist URL required (unless --skip-download with --folder)\n' >&2
  exit 1
fi

for cmd in yt-dlp kid3-cli curl jq; do
  command -v "$cmd" &>/dev/null || { printf 'Missing dependency: %s (try: brew install %s)\n' "$cmd" "$cmd" >&2; exit 1; }
done

# Determine folder name
if [ -n "$FOLDER_OVERRIDE" ]; then
  FOLDER="$FOLDER_OVERRIDE"
elif [ -n "$URL" ]; then
  FOLDER=$(yt-dlp --cookies-from-browser edge --flat-playlist \
    --print "%(playlist_title)s" --playlist-items 1 "$URL" 2>/dev/null | head -1)
  FOLDER="${FOLDER:-playlist_$(date +%Y%m%d_%H%M%S)}"
else
  printf 'Error: --folder is required when using --skip-download without a URL\n' >&2
  exit 1
fi

# Sanitize: remove filesystem-unsafe chars, trim leading dots/spaces
FOLDER=$(printf '%s' "$FOLDER" | tr -d '/<>:"|?*\\' | sed 's/^[. ]*//')
[ -z "$FOLDER" ] && FOLDER="playlist_$(date +%Y%m%d_%H%M%S)"

mkdir -p "$FOLDER"

# --- Download phase ---
if ! $SKIP_DOWNLOAD; then
  printf '==> Downloading to: %s/\n\n' "$FOLDER"
  yt-dlp \
    --cookies-from-browser edge \
    --ignore-errors \
    --extract-audio \
    --audio-format mp3 \
    --audio-quality 320K \
    --embed-thumbnail \
    --embed-metadata \
    -o "$FOLDER/%(artist,uploader)s - %(track,title)s.%(ext)s" \
    --playlist-reverse \
    --compat-options playlist-index \
    --yes-playlist \
    "$URL"
  printf '\nDownload complete.\n'
else
  printf '==> Skipping download.\n'
fi

# --- Cache + helpers ---
CACHE_DIR=".cache"
mkdir -p "$CACHE_DIR"
MB_UA="dl-playlist/1.0 (filiph@robo10.com)"
MAX_PARALLEL=4

cached_curl() {
  local url="$1"
  local cache_key
  cache_key=$(printf '%s' "$url" | md5)
  local cache_file="$CACHE_DIR/$cache_key"

  if [ -f "$cache_file" ]; then
    cat "$cache_file"
    return 0
  fi

  local tmp="$cache_file.tmp.$$"
  local attempts=0
  while [ $attempts -lt 3 ]; do
    if curl -sf -H "User-Agent: $MB_UA" -o "$tmp" "$url" 2>/dev/null && [ -s "$tmp" ]; then
      mv "$tmp" "$cache_file"
      cat "$cache_file"
      return 0
    fi
    ((attempts++))
    sleep $((attempts * 2))
  done
  rm -f "$tmp"
  return 1
}

kid3_set() {
  local tag="$1" val="$2" file="$3"
  [ -z "$val" ] && return
  val="${val//\'/\'\\\'\'}"
  kid3-cli -c "set '${tag}' '${val}' 2" "$file" 2>/dev/null || true
}

urlencode() {
  python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.stdin.read().strip()))" <<< "$1"
}

process_file() {
  local mp3="$1"
  local log="$2"
  local bn
  bn=$(basename "$mp3")
  printf '  %s\n' "$bn" >> "$log"

  # Backup YouTube-embedded thumbnail
  local yt_art
  yt_art=$(mktemp /tmp/ytart_XXXXXX)
  kid3-cli -c "get picture:$yt_art" "$mp3" 2>/dev/null || true

  # Parse YouTube title to extract real artist/track
  local yt_title
  yt_title=$(kid3-cli -c "get title" "$mp3" 2>/dev/null || true)
  if [ -z "$yt_title" ]; then
    rm -f "$yt_art"; return
  fi

  local search_artist="" search_title=""
  if [[ "$yt_title" == *" - "* ]]; then
    search_artist="${yt_title%% - *}"
    search_title="${yt_title#* - }"
    search_title=$(printf '%s' "$search_title" | sed -E 's/ *[\(\[].*$//')
  else
    search_title=$(printf '%s' "$yt_title" | sed -E 's/ *[\(\[].*$//')
  fi
  if [ -z "$search_title" ]; then
    rm -f "$yt_art"; return
  fi

  # Search MusicBrainz for the recording
  local query=""
  [ -n "$search_artist" ] && query="artist:\"${search_artist}\" AND "
  query="${query}recording:\"${search_title}\""
  local eq
  eq=$(urlencode "$query")

  local mb_json
  mb_json=$(cached_curl "https://musicbrainz.org/ws/2/recording?query=${eq}&fmt=json&limit=5" || true)

  if [ -z "$mb_json" ]; then
    printf '    ✗ MusicBrainz search failed\n' >> "$log"
    rm -f "$yt_art"; return
  fi

  # Pick the best match — prefer albums over singles/compilations
  local mb_rec
  mb_rec=$(printf '%s' "$mb_json" | jq -r '
    [.recordings[] | select(.score >= 80)] |
    if length == 0 then null
    else
      [ .[] | .releases as $all | {
        artist: (."artist-credit"[0].artist.name // null),
        title: .title,
        score: .score,
        release: (
          [$all[]? | select(."release-group"."primary-type" == "Album")] |
          if length > 0 then .[0]
          else ($all[0] // null) end
        ),
        id: .id
      }] | sort_by(-.score) | .[0]
    end' 2>/dev/null)

  if [ -z "$mb_rec" ] || [ "$mb_rec" = "null" ]; then
    printf '    ✗ no match (score < 80)\n' >> "$log"
    rm -f "$yt_art"; return
  fi

  local mb_artist mb_title mb_album mb_date mb_year mb_release_id mb_rec_id
  mb_artist=$(printf '%s' "$mb_rec" | jq -r '.artist // empty')
  mb_title=$(printf '%s' "$mb_rec" | jq -r '.title // empty')
  mb_album=$(printf '%s' "$mb_rec" | jq -r '.release.title // empty')
  mb_date=$(printf '%s' "$mb_rec" | jq -r '.release.date // empty')
  mb_year=$(printf '%s' "$mb_date" | grep -oE '^[0-9]{4}' || true)
  mb_release_id=$(printf '%s' "$mb_rec" | jq -r '.release.id // empty')
  mb_rec_id=$(printf '%s' "$mb_rec" | jq -r '.id // empty')

  local summary="    → ${mb_artist} - ${mb_title}"
  [ -n "$mb_album" ] && summary="${summary} [${mb_album}]"
  [ -n "$mb_year" ] && summary="${summary} (${mb_year})"
  printf '%s\n' "$summary" >> "$log"

  # Set core tags via kid3-cli
  kid3_set "Artist" "$mb_artist" "$mp3"
  kid3_set "Title" "$mb_title" "$mp3"
  kid3_set "Album" "$mb_album" "$mp3"
  kid3_set "Date" "$mb_date" "$mp3"

  # Get track number from release lookup
  if [ -n "$mb_release_id" ] && [ -n "$mb_rec_id" ]; then
    local rel_json
    rel_json=$(cached_curl "https://musicbrainz.org/ws/2/release/${mb_release_id}?inc=recordings&fmt=json" || true)
    if [ -n "$rel_json" ]; then
      local track_num
      track_num=$(printf '%s' "$rel_json" | jq -r --arg rid "$mb_rec_id" \
        '[.media[].tracks[] | select(.recording.id == $rid)][0].number // empty')
      kid3_set "Track Number" "$track_num" "$mp3"
    fi
  fi

  # Get genre from release group
  local rg_id
  rg_id=$(printf '%s' "$mb_rec" | jq -r '.release."release-group".id // empty')
  if [ -n "$rg_id" ]; then
    local rg_json genre
    rg_json=$(cached_curl "https://musicbrainz.org/ws/2/release-group/${rg_id}?inc=genres&fmt=json" || true)
    genre=$(printf '%s' "$rg_json" | jq -r '.genres | sort_by(-.count) | .[0].name // empty')
    kid3_set "Genre" "$genre" "$mp3"
  fi

  kid3-cli -c "save" "$mp3" 2>/dev/null || true

  # Fetch album cover from Cover Art Archive, YouTube thumbnail as fallback
  local got_cover=false
  if [ -n "$mb_release_id" ]; then
    local cover
    cover=$(mktemp /tmp/mbcover_XXXXXX)
    if curl -sfL -o "$cover" "https://coverartarchive.org/release/${mb_release_id}/front-500" \
       && [ -s "$cover" ] && file -b "$cover" | grep -qi image; then
      kid3-cli -c "set picture:$cover 'Front Cover'" -c "save" "$mp3" 2>/dev/null && got_cover=true
    fi
    rm -f "$cover"
  fi

  if ! $got_cover && [ -s "$yt_art" ]; then
    kid3-cli -c "set picture:$yt_art 'Front Cover'" -c "save" "$mp3" 2>/dev/null || true
  fi

  rm -f "$yt_art"
}

# --- Tagging phase ---
if ! $SKIP_TAGGING; then
  printf '\n==> Tagging files in %s/ via MusicBrainz lookup (%d parallel)...\n\n' "$FOLDER" "$MAX_PARALLEL"

  shopt -s nullglob
  files=("$FOLDER"/*.mp3)
  shopt -u nullglob

  if [ ${#files[@]} -eq 0 ]; then
    printf 'No mp3 files found in %s/\n' "$FOLDER"
    exit 0
  fi

  # Process files in parallel batches
  batch=0
  while [ $batch -lt ${#files[@]} ]; do
    pids=()
    logs=()
    end=$((batch + MAX_PARALLEL))
    [ $end -gt ${#files[@]} ] && end=${#files[@]}

    for ((i=batch; i<end; i++)); do
      log=$(mktemp /tmp/dlpl_log_XXXXXX)
      logs+=("$log")
      process_file "${files[$i]}" "$log" &
      pids+=($!)
    done

    for pid in "${pids[@]}"; do
      wait "$pid" 2>/dev/null || true
    done

    for log in "${logs[@]}"; do
      [ -f "$log" ] && cat "$log"
      rm -f "$log"
    done

    batch=$end
  done

  printf '\nTagging complete.\n'
else
  printf '\n==> Skipping tagging.\n'
fi

# --- Rename phase ---
if ! $SKIP_RENAME; then
  printf '\n==> Renaming files based on tags...\n\n'

  shopt -s nullglob
  files=("$FOLDER"/*.mp3)
  shopt -u nullglob

  if [ ${#files[@]} -eq 0 ]; then
    printf 'No mp3 files found in %s/\n' "$FOLDER"
    exit 0
  fi

  rename_file() {
    local mp3="$1" log="$2"
    local artist title track album year name newpath

    artist=$(kid3-cli -c "get artist" "$mp3" 2>/dev/null || true)
    title=$(kid3-cli -c "get title" "$mp3" 2>/dev/null || true)
    track=$(kid3-cli -c "get tracknumber" "$mp3" 2>/dev/null || true)
    album=$(kid3-cli -c "get album" "$mp3" 2>/dev/null || true)
    year=$(kid3-cli -c "get date" "$mp3" 2>/dev/null || true)
    [ -z "$year" ] && year=$(kid3-cli -c "get year" "$mp3" 2>/dev/null || true)
    year=$(printf '%s' "$year" | grep -oE '^[0-9]{4}' || true)

    [ -z "$artist" ] && [ -z "$title" ] && return

    track=$(printf '%s' "$track" | sed 's|/.*||')
    if [[ "$track" =~ ^[0-9]+$ ]]; then
      track=$(printf '%02d' "$((10#$track))")
    fi

    name=""
    [ -n "$artist" ] && name="$artist"
    if [ -n "$track" ]; then
      name="${name:+$name - }${track}. ${title}"
    elif [ -n "$title" ]; then
      name="${name:+$name - }${title}"
    fi
    if [ -n "$album" ] && [ -n "$year" ]; then
      name="${name} - ${album} (${year})"
    elif [ -n "$album" ]; then
      name="${name} - ${album}"
    elif [ -n "$year" ]; then
      name="${name} (${year})"
    fi

    name=$(printf '%s' "$name" | tr -d '/<>:"|?*\\' | sed 's/^[. ]*//; s/ *$//')
    [ -z "$name" ] && return

    newpath="$FOLDER/${name}.mp3"
    if [ "$mp3" != "$newpath" ] && [ ! -e "$newpath" ]; then
      mv "$mp3" "$newpath"
      printf '  %s → %s\n' "$(basename "$mp3")" "${name}.mp3" >> "$log"
    fi
  }

  batch=0
  renamed_count=0
  while [ $batch -lt ${#files[@]} ]; do
    pids=()
    logs=()
    end=$((batch + MAX_PARALLEL))
    [ $end -gt ${#files[@]} ] && end=${#files[@]}

    for ((i=batch; i<end; i++)); do
      log=$(mktemp /tmp/dlpl_ren_XXXXXX)
      logs+=("$log")
      rename_file "${files[$i]}" "$log" &
      pids+=($!)
    done

    for pid in "${pids[@]}"; do
      wait "$pid" 2>/dev/null || true
    done

    for log in "${logs[@]}"; do
      if [ -f "$log" ] && [ -s "$log" ]; then
        cat "$log"
        renamed_count=$((renamed_count + $(wc -l < "$log")))
      fi
      rm -f "$log"
    done

    batch=$end
  done

  printf '\nRenamed %d files.\n' "$renamed_count"
else
  printf '\n==> Skipping rename.\n'
fi
