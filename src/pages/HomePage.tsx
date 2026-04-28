import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Play, Clock, Tag, Search, Film, Upload, LogOut, User } from 'lucide-react';

interface Show {
  id: string;
  title: string;
  description: string;
  poster_url: string;
  video_url: string;
  genre: string;
  duration: string;
  created_at: string;
}

interface HomePageProps {
  onWatch: (show: Show) => void;
  onUpload: () => void;
}

const PLACEHOLDER_POSTERS = [
  'https://images.pexels.com/photos/1484584/pexels-photo-1484584.jpeg?auto=compress&cs=tinysrgb&w=600',
  'https://images.pexels.com/photos/33129/popcorn-movie-party-entertainment.jpg?auto=compress&cs=tinysrgb&w=600',
  'https://images.pexels.com/photos/1114690/pexels-photo-1114690.jpeg?auto=compress&cs=tinysrgb&w=600',
  'https://images.pexels.com/photos/2873485/pexels-photo-2873485.jpeg?auto=compress&cs=tinysrgb&w=600',
  'https://images.pexels.com/photos/668935/pexels-photo-668935.jpeg?auto=compress&cs=tinysrgb&w=600',
  'https://images.pexels.com/photos/1091447/pexels-photo-1091447.jpeg?auto=compress&cs=tinysrgb&w=600',
];

export default function HomePage({ onWatch, onUpload }: HomePageProps) {
  const { user, isAdmin, signOut } = useAuth();
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');

  useEffect(() => {
    fetchShows();
  }, []);

  const fetchShows = async () => {
    const { data } = await supabase
      .from('shows')
      .select('*')
      .order('created_at', { ascending: false });
    setShows(data ?? []);
    setLoading(false);
  };

  const genres = ['All', ...Array.from(new Set(shows.map(s => s.genre).filter(Boolean)))];

  const filtered = shows.filter(s => {
    const matchesSearch = s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase());
    const matchesGenre = selectedGenre === 'All' || s.genre === selectedGenre;
    return matchesSearch && matchesGenre;
  });

  const getPoster = (show: Show, index: number) => {
    if (show.poster_url) return show.poster_url;
    return PLACEHOLDER_POSTERS[index % PLACEHOLDER_POSTERS.length];
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-red-500 to-red-700 rounded-lg flex items-center justify-center">
                <Film className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white tracking-tight">CineVault</span>
            </div>

            <div className="flex items-center gap-3">
              {isAdmin && (
                <button
                  onClick={onUpload}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Upload</span>
                </button>
              )}
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <User className="w-4 h-4" />
                <span className="hidden sm:inline max-w-[160px] truncate">{user?.email}</span>
              </div>
              <button
                onClick={signOut}
                className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-red-950/20 via-transparent to-[#0a0a0a]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 tracking-tight">
            Discover Films
          </h1>
          <p className="text-gray-400 text-lg max-w-xl">
            Browse our curated collection of shows and start watching instantly.
          </p>
        </div>
      </section>

      {/* Search & Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shows..."
              className="w-full bg-[#141414] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/40 transition-all text-sm"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {genres.map(genre => (
              <button
                key={genre}
                onClick={() => setSelectedGenre(genre)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  selectedGenre === genre
                    ? 'bg-red-600 text-white'
                    : 'bg-[#141414] text-gray-400 hover:text-white border border-white/5 hover:border-white/10'
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Shows Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="bg-[#141414] rounded-2xl aspect-[2/3] mb-3" />
                <div className="bg-[#141414] rounded-lg h-4 w-3/4 mb-2" />
                <div className="bg-[#141414] rounded-lg h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Film className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-300 mb-2">No shows found</h3>
            <p className="text-gray-500">
              {shows.length === 0
                ? isAdmin
                  ? 'Upload your first show to get started.'
                  : 'No shows have been uploaded yet. Check back soon!'
                : 'Try adjusting your search or filters.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((show, index) => (
              <button
                key={show.id}
                onClick={() => onWatch(show)}
                className="group text-left transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <div className="relative aspect-[2/3] rounded-2xl overflow-hidden mb-3 bg-[#141414]">
                  <img
                    src={getPoster(show, index)}
                    alt={show.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="w-14 h-14 bg-red-600/90 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 backdrop-blur-sm">
                      <Play className="w-6 h-6 text-white ml-1" fill="white" />
                    </div>
                  </div>
                  {show.genre && (
                    <div className="absolute top-3 left-3">
                      <span className="inline-flex items-center gap-1 bg-black/60 backdrop-blur-sm text-xs font-medium text-white px-2.5 py-1 rounded-lg">
                        <Tag className="w-3 h-3" />
                        {show.genre}
                      </span>
                    </div>
                  )}
                </div>
                <h3 className="text-white font-semibold text-sm mb-1 truncate">{show.title}</h3>
                <div className="flex items-center gap-3 text-gray-500 text-xs">
                  {show.duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {show.duration}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
