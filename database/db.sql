-- =====================================================
-- CINETOK / REELTOK PLATFORM
-- Cinematic hub combining MovieTok short-form energy 
-- with Letterboxd-style deep film tracking
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "hstore";

-- =====================================================
-- ENUM TYPES
-- =====================================================
CREATE TYPE user_role AS ENUM ('user', 'critic', 'curator', 'moderator', 'admin', 'creator');
CREATE TYPE list_visibility AS ENUM ('private', 'followers', 'public');
CREATE TYPE watch_status AS ENUM ('planned', 'watching', 'anticipated', 'dropped', 'completed');
CREATE TYPE notification_type AS ENUM ('like', 'comment', 'follow', 'circle_invite', 'list_featured', 'milestone', 'system', 'hype', 'duet', 'stitch');
CREATE TYPE challenge_type AS ENUM ('daily', 'weekly', 'monthly', 'custom');
CREATE TYPE challenge_status AS ENUM ('active', 'completed', 'expired');
CREATE TYPE list_type AS ENUM ('custom', 'top_10', 'award_winners', 'curated', 'ranking');
CREATE TYPE content_type AS ENUM ('movie', 'tv_series', 'tv_season', 'tv_episode', 'miniseries', 'documentary', 'short_film', 'trailer', 'clip');
CREATE TYPE post_type AS ENUM ('video_reaction', 'video_edit', 'hot_take', 'review', 'ranking', 'theory', 'meme', 'trailer_reaction');
CREATE TYPE vibe_rating AS ENUM ('tense', 'funny', 'emotional', 'rewatchable', 'mind_bending', 'action_packed', 'romantic', 'scary');

-- =====================================================
-- 1. USERS TABLE (Enhanced with Creator Features)
-- =====================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(100),
    bio TEXT,
    avatar_url TEXT,
    profile_banner_url TEXT,
    
    -- Film/TV preferences
    favorite_genres TEXT[],
    favorite_directors TEXT[],
    favorite_actors TEXT[],
    favorite_movies UUID[],
    favorite_tv_shows UUID[],
    vibe_preferences TEXT[], -- 'elevated_horror', 'comfort_rewatch', etc.
    
    -- Stats
    total_films_logged INTEGER DEFAULT 0,
    total_episodes_logged INTEGER DEFAULT 0,
    total_series_logged INTEGER DEFAULT 0,
    total_diary_entries INTEGER DEFAULT 0,
    total_lists_created INTEGER DEFAULT 0,
    total_followers INTEGER DEFAULT 0,
    total_following INTEGER DEFAULT 0,
    total_likes_received INTEGER DEFAULT 0,
    total_hype_received INTEGER DEFAULT 0,
    total_duets INTEGER DEFAULT 0,
    
    -- Watch stats
    watch_streak_days INTEGER DEFAULT 0,
    longest_streak_days INTEGER DEFAULT 0,
    last_watched_date DATE,
    total_minutes_watched INTEGER DEFAULT 0,
    
    -- Creator stats
    total_posts INTEGER DEFAULT 0,
    total_video_edits INTEGER DEFAULT 0,
    total_reactions INTEGER DEFAULT 0,
    total_theories INTEGER DEFAULT 0,
    creator_level INTEGER DEFAULT 1,
    creator_points INTEGER DEFAULT 0,
    
    -- Years active
    member_since DATE DEFAULT CURRENT_DATE,
    
    -- Privacy
    is_public BOOLEAN DEFAULT FALSE,
    show_activity BOOLEAN DEFAULT TRUE,
    
    -- Role & Status
    role user_role DEFAULT 'user',
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_creator BOOLEAN DEFAULT FALSE,
    
    -- Social links
    letterboxd_username VARCHAR(100),
    tmdb_username VARCHAR(100),
    trakt_username VARCHAR(100),
    tiktok_username VARCHAR(100),
    instagram_username VARCHAR(100),
    youtube_username VARCHAR(100),
    twitter_username VARCHAR(100),
    
    -- Series tracking preferences
    auto_track_episodes BOOLEAN DEFAULT TRUE,
    binge_warning_threshold INTEGER DEFAULT 5,
    
    -- Aesthetic preferences
    theme_preference VARCHAR(20) DEFAULT 'dark', -- 'dark', 'light', 'neon', 'cinematic'
    ui_animations BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- User indexes
CREATE INDEX idx_users_username ON users(username) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_favorite_genres ON users USING GIN(favorite_genres);
CREATE INDEX idx_users_stats ON users(total_films_logged DESC, total_followers DESC);
CREATE INDEX idx_users_creator ON users(creator_points DESC) WHERE is_creator = TRUE;

-- =====================================================
-- 2. CONTENT TABLE (Movies + TV Series + Clips)
-- =====================================================
CREATE TABLE content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tmdb_id BIGINT UNIQUE,
    imdb_id VARCHAR(20) UNIQUE,
    tvdb_id INTEGER UNIQUE,
    
    -- Content classification
    content_type content_type NOT NULL,
    
    -- Basic info
    title VARCHAR(255) NOT NULL,
    original_title VARCHAR(255),
    year INTEGER,
    release_date DATE,
    
    -- For series: parent relationships
    parent_series_id UUID REFERENCES content(id),
    season_number INTEGER,
    episode_number INTEGER,
    episode_title VARCHAR(255),
    
    -- Series-specific
    number_of_seasons INTEGER,
    number_of_episodes INTEGER,
    series_status VARCHAR(50),
    last_air_date DATE,
    next_episode_date DATE,
    episode_runtime INTEGER,
    
    -- Descriptions
    synopsis TEXT,
    tagline TEXT,
    
    -- Media
    poster_url TEXT,
    backdrop_url TEXT,
    trailer_url TEXT,
    clip_urls TEXT[],
    
    -- Details
    runtime INTEGER,
    age_rating VARCHAR(10),
    
    -- Credits
    genres TEXT[],
    directors TEXT[],
    writers TEXT[],
    cast_members TEXT[],
    producers TEXT[],
    showrunners TEXT[],
    creators TEXT[],
    
    -- Ratings
    tmdb_rating DECIMAL(3,1),
    tmdb_vote_count INTEGER,
    imdb_rating DECIMAL(3,1),
    imdb_vote_count INTEGER,
    metacritic_score INTEGER,
    rotten_tomatoes_score INTEGER,
    
    -- Vibe ratings (community aggregated)
    vibe_tense DECIMAL(3,1),
    vibe_funny DECIMAL(3,1),
    vibe_emotional DECIMAL(3,1),
    vibe_rewatchable DECIMAL(3,1),
    vibe_mind_bending DECIMAL(3,1),
    vibe_action_packed DECIMAL(3,1),
    vibe_romantic DECIMAL(3,1),
    vibe_scary DECIMAL(3,1),
    
    -- Awards
    awards_won TEXT[],
    awards_nominated TEXT[],
    
    -- Availability
    streaming_platforms JSONB,
    
    -- Popularity
    popularity_score DECIMAL(10,2),
    trending_rank INTEGER,
    viral_score DECIMAL(10,2), -- Based on social media mentions
    
    -- Language
    original_language VARCHAR(10),
    spoken_languages TEXT[],
    
    -- External links
    wikipedia_url TEXT,
    official_website TEXT,
    
    -- Community stats
    total_hypes INTEGER DEFAULT 0,
    total_theories INTEGER DEFAULT 0,
    total_video_edits INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Content indexes
CREATE INDEX idx_content_title ON content USING GIN(title gin_trgm_ops);
CREATE INDEX idx_content_year ON content(year DESC);
CREATE INDEX idx_content_genres ON content USING GIN(genres);
CREATE INDEX idx_content_type ON content(content_type);
CREATE INDEX idx_content_parent ON content(parent_series_id) WHERE parent_series_id IS NOT NULL;
CREATE INDEX idx_content_series_lookup ON content(tmdb_id, content_type, season_number, episode_number);
CREATE INDEX idx_content_rating ON content(tmdb_rating DESC);
CREATE INDEX idx_content_tmdb_id ON content(tmdb_id);
CREATE INDEX idx_content_imdb_id ON content(imdb_id);
CREATE INDEX idx_content_viral ON content(viral_score DESC);
CREATE INDEX idx_content_trending ON content(trending_rank);

-- =====================================================
-- 3. JOURNAL ENTRIES (Enhanced with Vibe Ratings)
-- =====================================================
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content_id UUID REFERENCES content(id) ON DELETE SET NULL,
    
    -- Viewing details
    watched_date DATE NOT NULL,
    watch_count INTEGER DEFAULT 1,
    
    -- For episode binging
    episode_range_start INTEGER,
    episode_range_end INTEGER,
    episodes_watched_count INTEGER DEFAULT 1,
    
    viewing_platform VARCHAR(100),
    
    -- Rating (supports half-star increments)
    rating DECIMAL(3,1) CHECK (rating >= 0 AND rating <= 10),
    rating_stars INTEGER GENERATED ALWAYS AS (ROUND(rating / 2)) STORED,
    
    -- Vibe ratings (personal)
    vibe_tense INTEGER CHECK (vibe_tense >= 0 AND vibe_tense <= 10),
    vibe_funny INTEGER CHECK (vibe_funny >= 0 AND vibe_funny <= 10),
    vibe_emotional INTEGER CHECK (vibe_emotional >= 0 AND vibe_emotional <= 10),
    vibe_rewatchable INTEGER CHECK (vibe_rewatchable >= 0 AND vibe_rewatchable <= 10),
    vibe_mind_bending INTEGER CHECK (vibe_mind_bending >= 0 AND vibe_mind_bending <= 10),
    vibe_action_packed INTEGER CHECK (vibe_action_packed >= 0 AND vibe_action_packed <= 10),
    vibe_romantic INTEGER CHECK (vibe_romantic >= 0 AND vibe_romantic <= 10),
    vibe_scary INTEGER CHECK (vibe_scary >= 0 AND vibe_scary <= 10),
    
    -- Review content
    title VARCHAR(255),
    thoughts TEXT,
    spoiler_warning BOOLEAN DEFAULT FALSE,
    
    -- Emotional tags
    moods TEXT[],
    watched_with TEXT[],
    
    -- Personal categorization
    tags TEXT[],
    rewatch_worth_it BOOLEAN,
    
    -- Series tracking
    season_number INTEGER,
    episode_number INTEGER,
    episode_title VARCHAR(255),
    is_binge_session BOOLEAN DEFAULT FALSE,
    binge_session_id UUID,
    
    -- Social
    visibility BOOLEAN DEFAULT FALSE,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    hypes_count INTEGER DEFAULT 0,
    
    -- Short-form video reaction
    video_reaction_url TEXT,
    video_reaction_thumbnail TEXT,
    video_duration INTEGER, -- in seconds
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Journal entry indexes
CREATE INDEX idx_entries_user ON journal_entries(user_id, watched_date DESC);
CREATE INDEX idx_entries_content ON journal_entries(content_id);
CREATE INDEX idx_entries_rating ON journal_entries(rating DESC);
CREATE INDEX idx_entries_visibility ON journal_entries(visibility, created_at DESC);
CREATE INDEX idx_entries_moods ON journal_entries USING GIN(moods);
CREATE INDEX idx_entries_tags ON journal_entries USING GIN(tags);
CREATE INDEX idx_entries_date ON journal_entries(watched_date DESC);
CREATE INDEX idx_entries_series ON journal_entries(user_id, content_id, season_number, episode_number);
CREATE INDEX idx_entries_binge ON journal_entries(binge_session_id);
CREATE INDEX idx_entries_video ON journal_entries(video_reaction_url) WHERE video_reaction_url IS NOT NULL;

-- =====================================================
-- 4. WATCHLIST (Unified + Trending Categories)
-- =====================================================
CREATE TABLE watchlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content_id UUID REFERENCES content(id) ON DELETE CASCADE,
    
    status watch_status DEFAULT 'planned',
    priority INTEGER DEFAULT 1,
    added_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    
    -- For series tracking
    season_target INTEGER,
    episode_target INTEGER,
    current_season INTEGER DEFAULT 1,
    current_episode INTEGER DEFAULT 0,
    
    -- Watchlist categorization
    category VARCHAR(50),
    vibe_category VARCHAR(50), -- 'spooky', 'date_night', 'mind_bending', 'comfort'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, content_id)
);

-- Watchlist indexes
CREATE INDEX idx_watchlist_user ON watchlist(user_id, status);
CREATE INDEX idx_watchlist_content ON watchlist(content_id);
CREATE INDEX idx_watchlist_priority ON watchlist(user_id, priority DESC);
CREATE INDEX idx_watchlist_series_progress ON watchlist(user_id, current_season, current_episode);
CREATE INDEX idx_watchlist_vibe ON watchlist(user_id, vibe_category);

-- =====================================================
-- 5. LISTS (Enhanced with Rankings)
-- =====================================================
CREATE TABLE lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    list_type list_type DEFAULT 'custom',
    visibility list_visibility DEFAULT 'public',
    
    -- Themes
    cover_image_url TEXT,
    header_image_url TEXT,
    
    -- Ranking specifics
    ranking_type VARCHAR(50), -- 'tier_list', 'top_10', 'ranking_1_to_10'
    tier_colors JSONB, -- For tier lists: {'S': '#gold', 'A': '#silver', ...}
    
    -- Stats
    total_items INTEGER DEFAULT 0,
    total_likes INTEGER DEFAULT 0,
    total_shares INTEGER DEFAULT 0,
    total_duets INTEGER DEFAULT 0,
    
    -- Featured
    is_featured BOOLEAN DEFAULT FALSE,
    featured_until TIMESTAMP WITH TIME ZONE,
    
    -- Viral challenge
    is_challenge BOOLEAN DEFAULT FALSE,
    challenge_id UUID,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- List items (unified for movies + series)
CREATE TABLE list_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    list_id UUID REFERENCES lists(id) ON DELETE CASCADE,
    content_id UUID REFERENCES content(id) ON DELETE CASCADE,
    
    rank_position INTEGER,
    tier_rank VARCHAR(2), -- For tier lists: 'S', 'A', 'B', 'C', 'D', 'F'
    notes TEXT,
    
    -- For series, can specify specific seasons/episodes
    specific_season INTEGER,
    specific_episode INTEGER,
    
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(list_id, content_id)
);

-- List likes
CREATE TABLE list_likes (
    list_id UUID REFERENCES lists(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (list_id, user_id)
);

-- List indexes
CREATE INDEX idx_lists_user ON lists(user_id);
CREATE INDEX idx_lists_featured ON lists(is_featured, created_at DESC);
CREATE INDEX idx_lists_challenge ON lists(is_challenge);
CREATE INDEX idx_list_items_list ON list_items(list_id, rank_position);
CREATE INDEX idx_list_items_tier ON list_items(list_id, tier_rank);

-- =====================================================
-- 6. SOCIAL FEATURES + SHORT-FORM VIDEO
-- =====================================================
-- User follows
CREATE TABLE follows (
    follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);

-- Entry likes
CREATE TABLE entry_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, entry_id)
);

-- Entry hypes (🔥 Hype reaction)
CREATE TABLE entry_hypes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
    hype_type VARCHAR(20) DEFAULT 'fire', -- 'fire', 'mind_blown', 'laughing', 'crying'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, entry_id, hype_type)
);

-- Entry comments (with replies)
CREATE TABLE entry_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES entry_comments(id) ON DELETE CASCADE,
    
    comment_text TEXT NOT NULL,
    
    -- Stats
    likes_count INTEGER DEFAULT 0,
    hype_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Comment likes
CREATE TABLE comment_likes (
    comment_id UUID REFERENCES entry_comments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (comment_id, user_id)
);

-- =====================================================
-- 7. MOVIETOK POSTS (Short-form video + hot takes)
-- =====================================================
CREATE TABLE movietok_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content_id UUID REFERENCES content(id) ON DELETE SET NULL,
    
    post_type post_type NOT NULL,
    title VARCHAR(255),
    description TEXT,
    
    -- Video content
    video_url TEXT NOT NULL,
    video_thumbnail TEXT,
    video_duration INTEGER, -- in seconds
    video_audio_url TEXT,
    trending_audio_id UUID,
    
    -- For duets/stitches
    original_post_id UUID REFERENCES movietok_posts(id),
    is_duet BOOLEAN DEFAULT FALSE,
    is_stitch BOOLEAN DEFAULT FALSE,
    
    -- Text-based content
    text_content TEXT,
    
    -- Ranking data (for ranking posts)
    ranking_data JSONB, -- {'items': [{'title': 'Movie A', 'rank': 1}], 'type': 'top_10'}
    
    -- Vibe tags
    vibe_tags TEXT[],
    genre_tags TEXT[],
    mood_tags TEXT[],
    
    -- Hashtags
    hashtags TEXT[],
    
    -- Stats
    views_count INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    hypes_count INTEGER DEFAULT 0,
    duets_count INTEGER DEFAULT 0,
    stitches_count INTEGER DEFAULT 0,
    
    -- Social
    visibility BOOLEAN DEFAULT TRUE,
    spoiler_warning BOOLEAN DEFAULT FALSE,
    
    -- Trending
    is_trending BOOLEAN DEFAULT FALSE,
    trending_score DECIMAL(10,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Movietok post indexes
CREATE INDEX idx_movietok_user ON movietok_posts(user_id, created_at DESC);
CREATE INDEX idx_movietok_content ON movietok_posts(content_id);
CREATE INDEX idx_movietok_type ON movietok_posts(post_type);
CREATE INDEX idx_movietok_trending ON movietok_posts(is_trending, trending_score DESC);
CREATE INDEX idx_movietok_hashtags ON movietok_posts USING GIN(hashtags);
CREATE INDEX idx_movietok_vibes ON movietok_posts USING GIN(vibe_tags);
CREATE INDEX idx_movietok_views ON movietok_posts(views_count DESC);
CREATE INDEX idx_movietok_original ON movietok_posts(original_post_id) WHERE original_post_id IS NOT NULL;

-- =====================================================
-- 8. TRENDING TOPICS & HASHTAGS
-- =====================================================
CREATE TABLE trending_topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50), -- 'movie', 'actor', 'genre', 'trope', 'challenge', 'event'
    description TEXT,
    thumbnail_url TEXT,
    
    -- Stats
    mention_count INTEGER DEFAULT 0,
    post_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    
    -- Trending
    trending_score DECIMAL(10,2),
    is_active BOOLEAN DEFAULT TRUE,
    peak_timestamp TIMESTAMP WITH TIME ZONE,
    
    -- Related
    related_movies UUID[],
    related_actors TEXT[],
    related_hashtags TEXT[],
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Hashtag tracking
CREATE TABLE hashtags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hashtag VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50),
    
    post_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Topic following
CREATE TABLE topic_follows (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES trending_topics(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, topic_id)
);

-- Trending indexes
CREATE INDEX idx_trending_score ON trending_topics(trending_score DESC, is_active);
CREATE INDEX idx_trending_category ON trending_topics(category);
CREATE INDEX idx_hashtags_name ON hashtags(hashtag);
CREATE INDEX idx_hashtags_count ON hashtags(post_count DESC);

-- =====================================================
-- 9. SERIES PROGRESS TRACKING
-- =====================================================
CREATE TABLE series_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    series_id UUID REFERENCES content(id) ON DELETE CASCADE,
    
    current_season INTEGER DEFAULT 1,
    current_episode INTEGER DEFAULT 0,
    last_watched_episode_id UUID REFERENCES content(id),
    last_watched_date TIMESTAMP WITH TIME ZONE,
    
    total_episodes_watched INTEGER DEFAULT 0,
    total_seasons_completed INTEGER DEFAULT 0,
    percent_complete DECIMAL(5,2) DEFAULT 0,
    
    is_completed BOOLEAN DEFAULT FALSE,
    is_dropped BOOLEAN DEFAULT FALSE,
    dropped_at_season INTEGER,
    dropped_at_episode INTEGER,
    dropped_reason TEXT,
    
    rewatch_count INTEGER DEFAULT 0,
    last_rewatch_started_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, series_id)
);

CREATE TABLE episode_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    episode_id UUID REFERENCES content(id) ON DELETE CASCADE,
    
    watched BOOLEAN DEFAULT FALSE,
    watched_date TIMESTAMP WITH TIME ZONE,
    rating DECIMAL(3,1) CHECK (rating >= 0 AND rating <= 10),
    notes TEXT,
    rewatch_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, episode_id)
);

-- Indexes for series tracking
CREATE INDEX idx_series_progress_user ON series_progress(user_id);
CREATE INDEX idx_series_progress_series ON series_progress(series_id);
CREATE INDEX idx_episode_progress_user ON episode_progress(user_id);
CREATE INDEX idx_episode_progress_episode ON episode_progress(episode_id);

-- =====================================================
-- 10. FILM CIRCLES (Enhanced with Watch Parties)
-- =====================================================
CREATE TABLE film_circles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    created_by UUID REFERENCES users(id),
    
    -- Settings
    is_private BOOLEAN DEFAULT FALSE,
    requires_approval BOOLEAN DEFAULT FALSE,
    allow_video_posts BOOLEAN DEFAULT TRUE,
    
    -- Stats
    total_members INTEGER DEFAULT 0,
    total_posts INTEGER DEFAULT 0,
    total_watch_parties INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Circle members
CREATE TABLE circle_members (
    circle_id UUID REFERENCES film_circles(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (circle_id, user_id)
);

-- Circle posts (group discussions)
CREATE TABLE circle_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID REFERENCES film_circles(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content_id UUID REFERENCES content(id) ON DELETE SET NULL,
    
    title VARCHAR(255),
    content TEXT,
    media_url TEXT[],
    media_type VARCHAR(20), -- 'image', 'video', 'gif'
    
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Watch parties (supporting movies + series episodes)
CREATE TABLE watch_parties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID REFERENCES film_circles(id) ON DELETE CASCADE,
    content_id UUID REFERENCES content(id),
    
    -- For series watch parties (specific episode)
    specific_season INTEGER,
    specific_episode INTEGER,
    
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    timezone VARCHAR(50),
    duration_minutes INTEGER,
    created_by UUID REFERENCES users(id),
    
    -- Party details
    title VARCHAR(255),
    description TEXT,
    max_participants INTEGER DEFAULT 20,
    current_participants INTEGER DEFAULT 0,
    
    -- Series marathon mode
    is_marathon BOOLEAN DEFAULT FALSE,
    episodes_to_watch INTEGER,
    
    -- Live chat enabled
    live_chat_enabled BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Watch party participants
CREATE TABLE watch_party_participants (
    party_id UUID REFERENCES watch_parties(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (party_id, user_id)
);

-- Watch party chat messages
CREATE TABLE watch_party_chat (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    party_id UUID REFERENCES watch_parties(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_highlight BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 11. STATS & ACHIEVEMENTS (Gamification)
-- =====================================================
CREATE MATERIALIZED VIEW user_stats AS
SELECT 
    u.id as user_id,
    COUNT(DISTINCT CASE WHEN c.content_type IN ('movie', 'short_film', 'documentary') THEN je.id END) as total_films,
    COUNT(DISTINCT CASE WHEN c.content_type IN ('tv_episode') THEN je.id END) as total_episodes,
    COUNT(DISTINCT CASE WHEN c.content_type IN ('tv_series', 'miniseries') THEN je.content_id END) as total_series_started,
    COUNT(DISTINCT je.content_id) as unique_content,
    AVG(je.rating) as average_rating,
    SUM(CASE WHEN c.runtime IS NOT NULL THEN c.runtime * je.episodes_watched_count ELSE 0 END) as total_minutes,
    COUNT(DISTINCT EXTRACT(YEAR FROM je.watched_date)) as active_years,
    MIN(je.watched_date) as first_watch,
    MAX(je.watched_date) as last_watch,
    COUNT(DISTINCT DATE_TRUNC('month', je.watched_date)) as months_active,
    SUM(CASE WHEN EXTRACT(YEAR FROM je.watched_date) = EXTRACT(YEAR FROM CURRENT_DATE) THEN 1 ELSE 0 END) as content_this_year,
    COUNT(DISTINCT mp.id) as total_movietok_posts,
    SUM(mp.views_count) as total_video_views,
    SUM(mp.hypes_count) as total_hypes_received
FROM users u
LEFT JOIN journal_entries je ON u.id = je.user_id
LEFT JOIN content c ON je.content_id = c.id
LEFT JOIN movietok_posts mp ON u.id = mp.user_id AND mp.deleted_at IS NULL
GROUP BY u.id;

-- Achievements (expanded for video creators)
CREATE TABLE achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    badge_icon_url TEXT,
    category VARCHAR(50),
    points INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User achievements
CREATE TABLE user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    achievement_id UUID REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, achievement_id)
);

-- Insert default achievements (expanded for TikTok-style engagement)
INSERT INTO achievements (name, description, category, points) VALUES
    ('First Entry', 'Logged your first film or episode', 'milestone', 10),
    ('Film Buff', 'Logged 100 films', 'milestone', 100),
    ('Cinephile', 'Logged 500 films', 'milestone', 500),
    ('Weekend Warrior', 'Watched 5 films in one weekend', 'streak', 50),
    ('Genre Explorer', 'Watched content from 10 different genres', 'genre', 50),
    ('Director Fan', 'Watched 10 films from same director', 'milestone', 30),
    ('Reviewer', 'Wrote 50 detailed reviews', 'social', 100),
    ('Social Butterfly', 'Gained 100 followers', 'social', 200),
    ('Challenge Master', 'Completed 5 film challenges', 'challenge', 150),
    ('Series Binger', 'Completed a full TV series (all episodes)', 'series', 25),
    ('Marathon Runner', 'Watched 20+ episodes in 24 hours', 'series', 75),
    ('Completionist', 'Completed 10 different TV series', 'series', 200),
    ('Up-to-Date', 'Caught up on a currently airing series', 'series', 30),
    ('Weekend Binger', 'Watched an entire season in 3 days', 'series', 50),
    ('Video Creator', 'Created your first MovieTok video', 'creator', 25),
    ('Viral Sensation', 'Got 10,000 views on a video', 'creator', 200),
    ('Duet Star', 'Created 10 duets', 'creator', 50),
    ('Trend Setter', 'Started a trending topic', 'creator', 150),
    ('Hot Take Artist', 'Made 50 hot take posts', 'creator', 75),
    ('Theory Crafter', 'Posted 20 film theories', 'creator', 100);

-- =====================================================
-- 12. RECOMMENDATIONS ENGINE (Enhanced)
-- =====================================================
CREATE TABLE recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content_id UUID REFERENCES content(id) ON DELETE CASCADE,
    
    -- Recommendation source
    source_type VARCHAR(50),
    source_reference_id UUID,
    
    -- Scores
    relevance_score DECIMAL(5,2),
    confidence_score DECIMAL(5,2),
    viral_score DECIMAL(5,2),
    
    -- Status
    is_viewed BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    is_watchlisted BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(user_id, content_id)
);

-- Recommendation indexes
CREATE INDEX idx_recs_user ON recommendations(user_id, relevance_score DESC);
CREATE INDEX idx_recs_content ON recommendations(content_id);
CREATE INDEX idx_recs_viral ON recommendations(viral_score DESC);

-- =====================================================
-- 13. ACTIVITY FEED
-- =====================================================
CREATE TABLE user_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    reference_id UUID,
    metadata JSONB,
    
    -- Visibility
    is_public BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Activity feed indexes
CREATE INDEX idx_activities_user ON user_activities(user_id, created_at DESC);
CREATE INDEX idx_activities_public ON user_activities(is_public, created_at DESC);
CREATE INDEX idx_activities_type ON user_activities(activity_type);

-- =====================================================
-- 14. NOTIFICATIONS
-- =====================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id),
    type notification_type NOT NULL,
    
    title VARCHAR(255) NOT NULL,
    message TEXT,
    data JSONB,
    
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notification indexes
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- =====================================================
-- 15. USER SESSIONS & SECURITY
-- =====================================================
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_info TEXT,
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    logout_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE user_two_factor (
    id SERIAL PRIMARY KEY,
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT FALSE,
    method VARCHAR(10) DEFAULT 'email' CHECK (method IN ('email', 'totp', 'sms')),
    secret VARCHAR(255),
    backup_codes TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE two_factor_codes (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP WITH TIME ZONE,
    platform TEXT CHECK (platform IN ('ios', 'android', 'web')),
    purpose VARCHAR(10) CHECK (purpose IN ('enable', 'login', 'disable')),
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE user_moderation (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL CHECK (action IN ('ban', 'suspension', 'warning', 'restrict')),
    reason TEXT NOT NULL,
    details TEXT,
    issued_by UUID REFERENCES users(id),
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    lifted_at TIMESTAMP WITH TIME ZONE,
    lifted_by UUID REFERENCES users(id),
    active BOOLEAN DEFAULT TRUE
);

-- =====================================================
-- 16. PREMIUM FEATURES
-- =====================================================
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    plan VARCHAR(50) DEFAULT 'free' CHECK (plan IN ('free', 'premium', 'critic', 'creator', 'family')),
    
    -- Premium features
    can_create_private_lists BOOLEAN DEFAULT TRUE,
    can_export_data BOOLEAN DEFAULT FALSE,
    ad_free BOOLEAN DEFAULT FALSE,
    early_access BOOLEAN DEFAULT FALSE,
    advanced_stats BOOLEAN DEFAULT FALSE,
    unlimited_lists BOOLEAN DEFAULT FALSE,
    video_upload_quality VARCHAR(20) DEFAULT 'hd', -- 'hd', '4k', '8k'
    priority_support BOOLEAN DEFAULT FALSE,
    creator_badge BOOLEAN DEFAULT FALSE,
    analytics_dashboard BOOLEAN DEFAULT FALSE,
    
    stripe_subscription_id VARCHAR(255),
    ends_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 17. ANALYTICS & INSIGHTS (For creators)
-- =====================================================
CREATE TABLE creator_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Daily metrics
    date DATE NOT NULL,
    posts_created INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    total_likes INTEGER DEFAULT 0,
    total_hypes INTEGER DEFAULT 0,
    total_duets INTEGER DEFAULT 0,
    total_stitches INTEGER DEFAULT 0,
    total_shares INTEGER DEFAULT 0,
    new_followers INTEGER DEFAULT 0,
    
    -- Engagement rates
    engagement_rate DECIMAL(5,2),
    like_rate DECIMAL(5,2),
    share_rate DECIMAL(5,2),
    
    -- Audience demographics (aggregated)
    top_age_groups JSONB,
    top_locations JSONB,
    top_genres_interest JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

-- Creator analytics indexes
CREATE INDEX idx_analytics_user_date ON creator_analytics(user_id, date DESC);
CREATE INDEX idx_analytics_engagement ON creator_analytics(engagement_rate DESC);

-- =====================================================
-- 18. TRENDING VIRAL CONTENT
-- =====================================================
CREATE TABLE viral_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_type VARCHAR(20) NOT NULL, -- 'video', 'post', 'movie', 'trend'
    reference_id UUID NOT NULL, -- references various tables
    
    viral_score DECIMAL(10,2) DEFAULT 0,
    peak_viral_score DECIMAL(10,2) DEFAULT 0,
    velocity_score DECIMAL(10,2) DEFAULT 0, -- How fast it's growing
    
    -- Categories
    category VARCHAR(50),
    subcategory VARCHAR(50),
    
    -- Timeline
    started_trending_at TIMESTAMP WITH TIME ZONE,
    peak_trending_at TIMESTAMP WITH TIME ZONE,
    ended_trending_at TIMESTAMP WITH TIME ZONE,
    
    -- Stats at peak
    peak_views INTEGER,
    peak_engagement INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Viral content indexes
CREATE INDEX idx_viral_score ON viral_content(viral_score DESC);
CREATE INDEX idx_viral_type ON viral_content(content_type, viral_score DESC);
CREATE INDEX idx_viral_category ON viral_content(category);

-- =====================================================
-- 19. CONTENT FLAGGING & REPORTING
-- =====================================================
CREATE TABLE content_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID REFERENCES users(id) ON DELETE CASCADE,
    target_type VARCHAR(20) NOT NULL, -- 'post', 'comment', 'user', 'movie'
    target_id UUID NOT NULL,
    
    reason VARCHAR(50) NOT NULL,
    description TEXT,
    
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Content reports indexes
CREATE INDEX idx_reports_status ON content_reports(status);
CREATE INDEX idx_reports_target ON content_reports(target_type, target_id);

-- =====================================================
-- 20. SPOILER MANAGEMENT
-- =====================================================
CREATE TABLE spoiler_markers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_id UUID REFERENCES content(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Spoiler details
    spoiler_type VARCHAR(20) DEFAULT 'plot', -- 'plot', 'ending', 'character', 'twist'
    severity INTEGER CHECK (severity >= 1 AND severity <= 5),
    description TEXT,
    
    -- Scope
    is_global BOOLEAN DEFAULT FALSE, -- If true, applies to all users
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User spoiler preferences
CREATE TABLE user_spoiler_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    allow_all_spoilers BOOLEAN DEFAULT FALSE,
    allow_plot_spoilers BOOLEAN DEFAULT FALSE,
    allow_ending_spoilers BOOLEAN DEFAULT FALSE,
    allow_character_spoilers BOOLEAN DEFAULT FALSE,
    allow_twist_spoilers BOOLEAN DEFAULT FALSE,
    min_severity_to_show INTEGER DEFAULT 3,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Spoiler indexes
CREATE INDEX idx_spoilers_content ON spoiler_markers(content_id);
CREATE INDEX idx_spoilers_user ON spoiler_markers(user_id);

-- =====================================================
-- Additional indexes for performance optimization
-- =====================================================
CREATE INDEX idx_content_search ON content USING GIN(to_tsvector('english', title || ' ' || COALESCE(synopsis, '')));
CREATE INDEX idx_users_search ON users USING GIN(to_tsvector('english', username || ' ' || COALESCE(full_name, '') || ' ' || COALESCE(bio, '')));
CREATE INDEX idx_movietok_search ON movietok_posts USING GIN(to_tsvector('english', title || ' ' || COALESCE(description, '')));