import { ArrowLeft, Clock, Tag } from 'lucide-react';

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

interface WatchPageProps {
  show: Show;
  onBack: () => void;
}

export default function WatchPage({ show, onBack }: WatchPageProps) {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center h-16 gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm">Back</span>
            </button>
            <h1 className="text-lg font-semibold text-white truncate">{show.title}</h1>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Video Player */}
        <div className="relative aspect-video bg-black rounded-2xl overflow-hidden mb-8 shadow-2xl shadow-black/50">
          <video
            src={show.video_url}
            controls
            autoPlay
            className="w-full h-full object-contain"
          >
            Your browser does not support the video tag.
          </video>
        </div>

        {/* Show Info */}
        <div className="space-y-4">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">{show.title}</h2>

          <div className="flex flex-wrap items-center gap-3">
            {show.genre && (
              <span className="inline-flex items-center gap-1.5 bg-[#141414] border border-white/5 text-gray-300 text-sm px-3 py-1.5 rounded-lg">
                <Tag className="w-3.5 h-3.5 text-red-400" />
                {show.genre}
              </span>
            )}
            {show.duration && (
              <span className="inline-flex items-center gap-1.5 bg-[#141414] border border-white/5 text-gray-300 text-sm px-3 py-1.5 rounded-lg">
                <Clock className="w-3.5 h-3.5 text-red-400" />
                {show.duration}
              </span>
            )}
          </div>

          {show.description && (
            <p className="text-gray-400 leading-relaxed max-w-2xl">{show.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
