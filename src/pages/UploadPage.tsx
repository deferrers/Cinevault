import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { ArrowLeft, Upload, X, Loader2, Image, Video, Cloud, Plus, Trash2, ChevronDown, ChevronUp, Film, Layers, FolderOpen } from 'lucide-react';

interface UploadPageProps {
  onBack: () => void;
}

interface ExistingSeason {
  id: string;
  season_number: number;
  title: string;
  episode_count: number;
}

interface ExistingShow {
  id: string;
  title: string;
  genre: string;
  seasons: ExistingSeason[];
}

interface EpisodeDraft {
  episode_number: number;
  title: string;
  description: string;
  duration: string;
  videoFile: File | null;
  videoPreview: string | null;
}

interface SeasonDraft {
  season_number: number;
  title: string;
  description: string;
  episodes: EpisodeDraft[];
  expanded: boolean;
}

type UploadMode = 'new' | 'existing';

export default function UploadPage({ onBack }: UploadPageProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<UploadMode>('new');

  // New show fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('');
  const [duration, setDuration] = useState('');
  const [ageRating, setAgeRating] = useState('');
  const [isSeries, setIsSeries] = useState(false);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);

  const [seasons, setSeasons] = useState<SeasonDraft[]>([]);

  // Existing show fields
  const [existingShows, setExistingShows] = useState<ExistingShow[]>([]);
  const [selectedShowId, setSelectedShowId] = useState('');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [newSeasonNumber, setNewSeasonNumber] = useState(0);
  const [addNewSeason, setAddNewSeason] = useState(false);
  const [newSeasonTitle, setNewSeasonTitle] = useState('');
  const [existingEpisodes, setExistingEpisodes] = useState<EpisodeDraft[]>([
    { episode_number: 1, title: '', description: '', duration: '', videoFile: null, videoPreview: null },
  ]);

  // Shared state
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');

  const videoInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);

  // Fetch existing shows with seasons
  useEffect(() => {
    const fetchShows = async () => {
      const { data: showsData } = await supabase
        .from('shows')
        .select('id, title, genre')
        .order('created_at', { ascending: false });

      if (!showsData) return;

      const showsWithSeasons = await Promise.all(
        showsData.map(async (show) => {
          const { data: seasonsData } = await supabase
            .from('seasons')
            .select('id, season_number, title')
            .eq('show_id', show.id)
            .order('season_number');

          const seasonsWithCount = await Promise.all(
            (seasonsData ?? []).map(async (season) => {
              const { count } = await supabase
                .from('episodes')
                .select('*', { count: 'exact', head: true })
                .eq('season_id', season.id);
              return { ...season, episode_count: count ?? 0 };
            })
          );

          return { ...show, seasons: seasonsWithCount } as ExistingShow;
        })
      );

      setExistingShows(showsWithSeasons);
    };
    fetchShows();
  }, []);

  // Update new season number when show/season selection changes
  useEffect(() => {
    if (mode !== 'existing') return;
    const show = existingShows.find(s => s.id === selectedShowId);
    if (show && show.seasons.length > 0) {
      setNewSeasonNumber(Math.max(...show.seasons.map(s => s.season_number)) + 1);
    } else {
      setNewSeasonNumber(1);
    }
  }, [selectedShowId, existingShows, mode]);

  const selectedShow = existingShows.find(s => s.id === selectedShowId);

  const handleVideoSelect = useCallback((file: File) => {
    if (!file.type.startsWith('video/')) { setError('Please select a video file'); return; }
    if (file.size > 15 * 1024 * 1024 * 1024) { setError(`Video "${file.name}" is ${(file.size / 1024 / 1024 / 1024).toFixed(1)}GB. Maximum supported size is 15GB.`); return; }
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
    setError('');
  }, []);

  const handlePosterSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please select an image file'); return; }
    setPosterFile(file);
    setPosterPreview(URL.createObjectURL(file));
    setError('');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, type: 'video' | 'poster') => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (type === 'video') handleVideoSelect(file);
    else handlePosterSelect(file);
  }, [handleVideoSelect, handlePosterSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const MAX_DIRECT_UPLOAD = 50 * 1024 * 1024;

  const uploadFile = async (bucket: string, path: string, file: File) => {
    if (file.size > MAX_DIRECT_UPLOAD) {
      return uploadLargeFile(bucket, path, file);
    }
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) throw new Error(`Upload failed for ${file.name}: ${error.message}`);
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  };

  const uploadLargeFile = async (bucket: string, path: string, file: File) => {
    const CHUNK_SIZE = 8 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let uploadId: string | undefined;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const chunkFile = new File([chunk], file.name, { type: file.type });

      const { data, error } = await supabase.storage.from(bucket).upload(path, chunkFile, {
        upsert: i === 0,
        contentType: file.type,
        ...(uploadId ? { headers: { 'x-upload-id': uploadId, 'x-upload-offset': String(start) } } : {}),
      });

      if (error) {
        if (error.message.includes('Payload too large') || error.message.includes('413')) {
          throw new Error(`File "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)}MB) is too large. Try a smaller or more compressed video.`);
        }
        throw new Error(`Upload failed for ${file.name} (chunk ${i + 1}/${totalChunks}): ${error.message}`);
      }

      if (data?.id) uploadId = data.id;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  };

  // Season/Episode management (new show)
  const addSeason = () => {
    setSeasons(prev => [...prev, {
      season_number: prev.length + 1,
      title: '',
      description: '',
      episodes: [],
      expanded: true,
    }]);
  };

  const removeSeason = (idx: number) => {
    setSeasons(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, season_number: i + 1 })));
  };

  const toggleSeason = (idx: number) => {
    setSeasons(prev => prev.map((s, i) => i === idx ? { ...s, expanded: !s.expanded } : s));
  };

  const updateSeason = (idx: number, field: keyof SeasonDraft, value: string | boolean | EpisodeDraft[]) => {
    setSeasons(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const addEpisode = (seasonIdx: number) => {
    setSeasons(prev => prev.map((s, i) => {
      if (i !== seasonIdx) return s;
      return { ...s, episodes: [...s.episodes, {
        episode_number: s.episodes.length + 1,
        title: '',
        description: '',
        duration: '',
        videoFile: null,
        videoPreview: null,
      }]};
    }));
  };

  const removeEpisode = (seasonIdx: number, epIdx: number) => {
    setSeasons(prev => prev.map((s, i) => {
      if (i !== seasonIdx) return s;
      return { ...s, episodes: s.episodes.filter((_, j) => j !== epIdx).map((ep, j) => ({ ...ep, episode_number: j + 1 })) };
    }));
  };

  const updateEpisode = (seasonIdx: number, epIdx: number, field: keyof EpisodeDraft, value: string | File | null) => {
    setSeasons(prev => prev.map((s, i) => {
      if (i !== seasonIdx) return s;
      return { ...s, episodes: s.episodes.map((ep, j) => j === epIdx ? { ...ep, [field]: value } : ep) };
    }));
  };

  const handleEpisodeVideo = (seasonIdx: number, epIdx: number, file: File) => {
    if (!file.type.startsWith('video/')) { setError('Please select a video file'); return; }
    if (file.size > 15 * 1024 * 1024 * 1024) { setError(`Video "${file.name}" is ${(file.size / 1024 / 1024 / 1024).toFixed(1)}GB. Maximum supported size is 15GB.`); return; }
    updateEpisode(seasonIdx, epIdx, 'videoFile', file);
    updateEpisode(seasonIdx, epIdx, 'videoPreview', URL.createObjectURL(file));
    setError('');
  };

  // Existing show episode management
  const addExistingEpisode = () => {
    setExistingEpisodes(prev => [...prev, {
      episode_number: prev.length + 1,
      title: '',
      description: '',
      duration: '',
      videoFile: null,
      videoPreview: null,
    }]);
  };

  const removeExistingEpisode = (idx: number) => {
    setExistingEpisodes(prev => prev.filter((_, i) => i !== idx).map((ep, i) => ({ ...ep, episode_number: i + 1 })));
  };

  const updateExistingEpisode = (idx: number, field: keyof EpisodeDraft, value: string | File | null) => {
    setExistingEpisodes(prev => prev.map((ep, i) => i === idx ? { ...ep, [field]: value } : ep));
  };

  const handleExistingEpisodeVideo = (idx: number, file: File) => {
    if (!file.type.startsWith('video/')) { setError('Please select a video file'); return; }
    if (file.size > 15 * 1024 * 1024 * 1024) { setError(`Video "${file.name}" is ${(file.size / 1024 / 1024 / 1024).toFixed(1)}GB. Maximum supported size is 15GB.`); return; }
    updateExistingEpisode(idx, 'videoFile', file);
    updateExistingEpisode(idx, 'videoPreview', URL.createObjectURL(file));
    setError('');
  };

  // Submit for new show
  const handleSubmitNew = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!isSeries && !videoFile) { setError('Video file is required'); return; }
    if (isSeries && seasons.length === 0) { setError('Add at least one season'); return; }
    if (isSeries && seasons.some(s => s.episodes.length === 0)) { setError('Each season needs at least one episode'); return; }
    if (isSeries && seasons.some(s => s.episodes.some(ep => !ep.title.trim() || !ep.videoFile))) {
      setError('All episodes need a title and video file'); return;
    }

    setUploading(true);
    setError('');
    setSuccess(false);

    try {
      const timestamp = Date.now();
      const safeName = title.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40);

      let posterUrl = '';
      if (posterFile) {
        setUploadStage('Uploading poster...');
        setUploadProgress(5);
        const posterExt = posterFile.name.split('.').pop();
        posterUrl = await uploadFile('shows', `posters/${safeName}-${timestamp}.${posterExt}`, posterFile);
      }

      let videoUrl = '';
      if (!isSeries && videoFile) {
        setUploadStage('Uploading video...');
        setUploadProgress(15);
        const videoExt = videoFile.name.split('.').pop();
        videoUrl = await uploadFile('shows', `videos/${safeName}-${timestamp}.${videoExt}`, videoFile);
      }

      setUploadStage('Creating show...');
      setUploadProgress(isSeries ? 10 : 80);
      const { data: showData, error: insertError } = await supabase.from('shows').insert({
        title: title.trim(),
        description: description.trim(),
        genre: genre.trim(),
        duration: isSeries ? '' : duration.trim(),
        age_rating: ageRating,
        video_url: videoUrl,
        poster_url: posterUrl,
        uploaded_by: user?.id,
      }).select('id').single();

      if (insertError) throw insertError;
      const showId = showData.id;

      if (isSeries) {
        const totalEpisodes = seasons.reduce((sum, s) => sum + s.episodes.length, 0);
        let completedUploads = 0;
        const baseProgress = 15;
        const progressPerUpload = 75 / (totalEpisodes + seasons.length);

        for (const season of seasons) {
          setUploadStage(`Creating Season ${season.season_number}...`);
          const { data: seasonData, error: seasonError } = await supabase.from('seasons').insert({
            show_id: showId,
            season_number: season.season_number,
            title: season.title.trim(),
            description: season.description.trim(),
          }).select('id').single();

          if (seasonError) throw seasonError;
          setUploadProgress(Math.round(baseProgress + (completedUploads + 1) * progressPerUpload));
          completedUploads++;

          for (const episode of season.episodes) {
            setUploadStage(`Uploading S${season.season_number}E${episode.episode_number}...`);
            const epExt = episode.videoFile!.name.split('.').pop();
            const epVideoPath = `videos/${safeName}-s${season.season_number}e${episode.episode_number}-${timestamp}.${epExt}`;
            const epVideoUrl = await uploadFile('shows', epVideoPath, episode.videoFile!);

            const { error: epError } = await supabase.from('episodes').insert({
              season_id: seasonData.id,
              show_id: showId,
              episode_number: episode.episode_number,
              title: episode.title.trim(),
              description: episode.description.trim(),
              duration: episode.duration.trim(),
              video_url: epVideoUrl,
            });

            if (epError) throw epError;
            completedUploads++;
            setUploadProgress(Math.round(baseProgress + completedUploads * progressPerUpload));
          }
        }
      }

      setUploadProgress(100);
      setSuccess(true);
      setTitle(''); setDescription(''); setGenre(''); setDuration(''); setAgeRating('');
      setVideoFile(null); setPosterFile(null); setVideoPreview(null); setPosterPreview(null);
      setSeasons([]); setIsSeries(false);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false); setUploadStage(''); setUploadProgress(0);
    }
  };

  // Submit for existing show
  const handleSubmitExisting = async () => {
    if (!selectedShowId) { setError('Select a show'); return; }
    if (!addNewSeason && !selectedSeasonId) { setError('Select a season or create a new one'); return; }
    if (addNewSeason && !newSeasonTitle.trim()) { setError('New season needs a title'); return; }
    if (existingEpisodes.length === 0) { setError('Add at least one episode'); return; }
    if (existingEpisodes.some(ep => !ep.title.trim() || !ep.videoFile)) {
      setError('All episodes need a title and video file'); return;
    }

    setUploading(true);
    setError('');
    setSuccess(false);

    try {
      const show = existingShows.find(s => s.id === selectedShowId)!;
      const safeName = show.title.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40);
      const timestamp = Date.now();

      let seasonId = selectedSeasonId;
      let seasonNum: number;

      if (addNewSeason) {
        seasonNum = newSeasonNumber;
        setUploadStage(`Creating Season ${seasonNum}...`);
        setUploadProgress(5);
        const { data: seasonData, error: seasonError } = await supabase.from('seasons').insert({
          show_id: selectedShowId,
          season_number: seasonNum,
          title: newSeasonTitle.trim(),
        }).select('id').single();

        if (seasonError) throw seasonError;
        seasonId = seasonData.id;
      } else {
        const season = show.seasons.find(s => s.id === selectedSeasonId)!;
        seasonNum = season.season_number;
      }

      // Get existing episode count to continue numbering
      const { count } = await supabase
        .from('episodes')
        .select('*', { count: 'exact', head: true })
        .eq('season_id', seasonId);
      const startEpNum = (count ?? 0) + 1;

      const totalEpisodes = existingEpisodes.length;
      let completed = 0;
      const baseProgress = addNewSeason ? 10 : 5;
      const progressPer = (90 - baseProgress) / totalEpisodes;

      for (let i = 0; i < existingEpisodes.length; i++) {
        const ep = existingEpisodes[i];
        const epNum = startEpNum + i;
        setUploadStage(`Uploading S${seasonNum}E${epNum}...`);
        setUploadProgress(Math.round(baseProgress + completed * progressPer));

        const epExt = ep.videoFile!.name.split('.').pop();
        const epVideoPath = `videos/${safeName}-s${seasonNum}e${epNum}-${timestamp}.${epExt}`;
        const epVideoUrl = await uploadFile('shows', epVideoPath, ep.videoFile!);

        const { error: epError } = await supabase.from('episodes').insert({
          season_id: seasonId,
          show_id: selectedShowId,
          episode_number: epNum,
          title: ep.title.trim(),
          description: ep.description.trim(),
          duration: ep.duration.trim(),
          video_url: epVideoUrl,
        });

        if (epError) throw epError;
        completed++;
        setUploadProgress(Math.round(baseProgress + completed * progressPer));
      }

      setUploadProgress(100);
      setSuccess(true);
      setSelectedShowId(''); setSelectedSeasonId(''); setAddNewSeason(false);
      setNewSeasonTitle(''); setExistingEpisodes([{ episode_number: 1, title: '', description: '', duration: '', videoFile: null, videoPreview: null }]);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false); setUploadStage(''); setUploadProgress(0);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'new') handleSubmitNew();
    else handleSubmitExisting();
  };

  const renderEpisodeForm = (
    episode: EpisodeDraft,
    epIdx: number,
    onRemove: (idx: number) => void,
    onUpdate: (idx: number, field: keyof EpisodeDraft, value: string | File | null) => void,
    onVideoSelect: (idx: number, file: File) => void,
    inputIdPrefix: string,
  ) => (
    <div key={epIdx} className="bg-[#0a0a0a] border border-white/5 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400">Episode {episode.episode_number}</span>
        <button type="button" onClick={() => onRemove(epIdx)} className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-600/10 transition-colors">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-[10px] font-medium text-gray-500 mb-1">Title <span className="text-red-500">*</span></label>
          <input type="text" value={episode.title} onChange={(e) => onUpdate(epIdx, 'title', e.target.value)} className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 text-sm" placeholder="Episode title" />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">Duration</label>
          <input type="text" value={episode.duration} onChange={(e) => onUpdate(epIdx, 'duration', e.target.value)} className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 text-sm" placeholder="45m" />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-medium text-gray-500 mb-1">Description</label>
        <input type="text" value={episode.description} onChange={(e) => onUpdate(epIdx, 'description', e.target.value)} className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 text-sm" placeholder="Optional" />
      </div>
      <div>
        <label className="block text-[10px] font-medium text-gray-500 mb-1">Video <span className="text-red-500">*</span></label>
        <input type="file" accept="video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) onVideoSelect(epIdx, f); }} className="hidden" id={`${inputIdPrefix}-${epIdx}`} />
        {episode.videoPreview ? (
          <div className="relative group">
            <video src={episode.videoPreview} className="w-full aspect-video object-cover rounded-lg border border-white/10" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
              <label htmlFor={`${inputIdPrefix}-${epIdx}`} className="text-white text-xs font-medium bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg hover:bg-white/20 transition-colors cursor-pointer">Change</label>
            </div>
            <button type="button" onClick={() => { onUpdate(epIdx, 'videoFile', null); onUpdate(epIdx, 'videoPreview', ''); }} className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 backdrop-blur-sm rounded-lg flex items-center justify-center text-white hover:bg-red-600 transition-colors"><X className="w-3 h-3" /></button>
          </div>
        ) : (
          <label htmlFor={`${inputIdPrefix}-${epIdx}`} className="block border-2 border-dashed border-white/10 hover:border-red-500/40 rounded-lg p-4 text-center cursor-pointer transition-all group">
            <Cloud className="w-5 h-5 text-red-400 mx-auto mb-1 group-hover:scale-110 transition-transform" />
            <p className="text-gray-400 text-xs">Select video</p>
          </label>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center h-16 gap-4">
            <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm">Back</span>
            </button>
            <h1 className="text-lg font-semibold text-white">Upload</h1>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="bg-[#141414] border border-white/5 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-red-600/10 rounded-xl flex items-center justify-center">
              <Upload className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Upload Content</h2>
              <p className="text-gray-500 text-sm">Create a new show or add episodes to an existing one</p>
            </div>
          </div>

          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-emerald-400 text-sm mb-6 flex items-center justify-between">
              Uploaded successfully!
              <button onClick={() => setSuccess(false)}><X className="w-4 h-4" /></button>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm mb-6 flex items-start justify-between gap-3">
              <span className="leading-relaxed">{error}</span>
              <button onClick={() => setError('')} className="flex-shrink-0 mt-0.5"><X className="w-4 h-4" /></button>
            </div>
          )}

          {uploading && (
            <div className="bg-[#1a1a1a] border border-white/5 rounded-xl px-4 py-4 mb-6">
              <div className="flex items-center gap-3 mb-3">
                <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
                <span className="text-sm text-gray-300">{uploadStage}</span>
              </div>
              <div className="w-full bg-[#0a0a0a] rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-500" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Mode Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Upload Type</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setMode('new'); setError(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all border ${
                    mode === 'new'
                      ? 'bg-red-600/10 border-red-500/30 text-red-400'
                      : 'bg-[#1a1a1a] border-white/5 text-gray-400 hover:text-white hover:border-white/10'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  New Show
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('existing'); setError(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all border ${
                    mode === 'existing'
                      ? 'bg-red-600/10 border-red-500/30 text-red-400'
                      : 'bg-[#1a1a1a] border-white/5 text-gray-400 hover:text-white hover:border-white/10'
                  }`}
                >
                  <FolderOpen className="w-4 h-4" />
                  Add to Existing
                </button>
              </div>
            </div>

            {/* ===================== NEW SHOW ===================== */}
            {mode === 'new' && (
              <>
                {/* Film / Series Toggle */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setIsSeries(false); setSeasons([]); }}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all border ${
                        !isSeries
                          ? 'bg-red-600/10 border-red-500/30 text-red-400'
                          : 'bg-[#1a1a1a] border-white/5 text-gray-400 hover:text-white hover:border-white/10'
                      }`}
                    >
                      <Film className="w-4 h-4" />
                      Film
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsSeries(true); if (seasons.length === 0) addSeason(); }}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all border ${
                        isSeries
                          ? 'bg-red-600/10 border-red-500/30 text-red-400'
                          : 'bg-[#1a1a1a] border-white/5 text-gray-400 hover:text-white hover:border-white/10'
                      }`}
                    >
                      <Layers className="w-4 h-4" />
                      Series
                    </button>
                  </div>
                </div>

                {/* Poster Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Poster Image</label>
                  <input ref={posterInputRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePosterSelect(f); }} className="hidden" />
                  {posterPreview ? (
                    <div className="relative group w-48">
                      <img src={posterPreview} alt="Poster preview" className="w-full aspect-[2/3] object-cover rounded-xl border border-white/10" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                        <button type="button" onClick={() => posterInputRef.current?.click()} className="text-white text-xs font-medium bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg hover:bg-white/20 transition-colors">Change</button>
                      </div>
                      <button type="button" onClick={() => { setPosterFile(null); setPosterPreview(null); }} className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/60 backdrop-blur-sm rounded-lg flex items-center justify-center text-white hover:bg-red-600 transition-colors"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <div onDrop={(e) => handleDrop(e, 'poster')} onDragOver={handleDragOver} onClick={() => posterInputRef.current?.click()} className="border-2 border-dashed border-white/10 hover:border-red-500/40 rounded-xl p-6 text-center cursor-pointer transition-all group w-48">
                      <div className="w-10 h-10 bg-red-600/10 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-red-600/20 transition-colors"><Image className="w-5 h-5 text-red-400" /></div>
                      <p className="text-gray-400 text-xs font-medium">Add poster</p>
                      <p className="text-gray-600 text-[10px] mt-0.5">JPG, PNG, WebP</p>
                    </div>
                  )}
                </div>

                {/* Text Fields */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Title <span className="text-red-500">*</span></label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/40 transition-all text-sm" placeholder="Enter show title" required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/40 transition-all text-sm resize-none" placeholder="Brief description of the show" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Genre</label>
                    <input type="text" value={genre} onChange={(e) => setGenre(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/40 transition-all text-sm" placeholder="e.g. Drama, Comedy" />
                  </div>
                  {!isSeries && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Duration</label>
                      <input type="text" value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/40 transition-all text-sm" placeholder="e.g. 1h 30m" />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Age Rating</label>
                  <div className="flex flex-wrap gap-2">
                    {['', 'G', 'PG', 'PG-13', 'R', 'NC-17', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'].map(rating => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => setAgeRating(rating)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          ageRating === rating
                            ? 'bg-red-600 text-white'
                            : 'bg-[#1a1a1a] text-gray-400 hover:text-white border border-white/5 hover:border-white/10'
                        }`}
                      >
                        {rating || 'Unrated'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Standalone Film Video Upload */}
                {!isSeries && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Video File <span className="text-red-500">*</span></label>
                    <input ref={videoInputRef} type="file" accept="video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVideoSelect(f); }} className="hidden" />
                    {videoPreview ? (
                      <div className="relative group">
                        <video src={videoPreview} className="w-full aspect-video object-cover rounded-xl border border-white/10" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                          <button type="button" onClick={() => videoInputRef.current?.click()} className="text-white text-sm font-medium bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg hover:bg-white/20 transition-colors">Change Video</button>
                        </div>
                        <button type="button" onClick={() => { setVideoFile(null); setVideoPreview(null); }} className="absolute top-2 right-2 w-8 h-8 bg-black/60 backdrop-blur-sm rounded-lg flex items-center justify-center text-white hover:bg-red-600 transition-colors"><X className="w-4 h-4" /></button>
                        <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1 text-xs text-white flex items-center gap-1.5"><Video className="w-3 h-3 text-red-400" />{videoFile?.name} {videoFile ? `(${(videoFile.size / 1024 / 1024).toFixed(1)}MB)` : ''}</div>
                      </div>
                    ) : (
                      <div onDrop={(e) => handleDrop(e, 'video')} onDragOver={handleDragOver} onClick={() => videoInputRef.current?.click()} className="border-2 border-dashed border-white/10 hover:border-red-500/40 rounded-xl p-8 text-center cursor-pointer transition-all group">
                        <div className="w-14 h-14 bg-red-600/10 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-red-600/20 transition-colors"><Cloud className="w-7 h-7 text-red-400" /></div>
                        <p className="text-gray-300 text-sm font-medium mb-1">Drop your video here or click to browse</p>
                        <p className="text-gray-600 text-xs">MP4, MOV, WebM supported</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Seasons & Episodes (Series) */}
                {isSeries && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-300">Seasons & Episodes</label>
                      <button type="button" onClick={addSeason} className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-sm font-medium transition-colors">
                        <Plus className="w-4 h-4" />
                        Add Season
                      </button>
                    </div>

                    {seasons.length === 0 && (
                      <div className="text-center py-8 text-gray-500 text-sm border border-dashed border-white/10 rounded-xl">
                        No seasons added yet. Click "Add Season" to start.
                      </div>
                    )}

                    {seasons.map((season, sIdx) => (
                      <div key={sIdx} className="bg-[#1a1a1a] border border-white/5 rounded-xl overflow-hidden">
                        <button type="button" onClick={() => toggleSeason(sIdx)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 bg-red-600/10 rounded-lg flex items-center justify-center text-red-400 text-xs font-bold">{season.season_number}</span>
                            <span className="text-white text-sm font-medium">
                              {season.title || `Season ${season.season_number}`}
                            </span>
                            <span className="text-gray-600 text-xs">{season.episodes.length} {season.episodes.length === 1 ? 'episode' : 'episodes'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={(e) => { e.stopPropagation(); removeSeason(sIdx); }} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-600/10 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            {season.expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                          </div>
                        </button>

                        {season.expanded && (
                          <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1.5">Season Title</label>
                                <input type="text" value={season.title} onChange={(e) => updateSeason(sIdx, 'title', e.target.value)} className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 text-sm" placeholder={`Season ${season.season_number}`} />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1.5">Season Description</label>
                                <input type="text" value={season.description} onChange={(e) => updateSeason(sIdx, 'description', e.target.value)} className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 text-sm" placeholder="Optional description" />
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-gray-400">Episodes</span>
                                <button type="button" onClick={() => addEpisode(sIdx)} className="flex items-center gap-1 text-red-400 hover:text-red-300 text-xs font-medium transition-colors">
                                  <Plus className="w-3 h-3" />
                                  Add Episode
                                </button>
                              </div>

                              {season.episodes.length === 0 && (
                                <div className="text-center py-4 text-gray-600 text-xs border border-dashed border-white/5 rounded-lg">
                                  No episodes yet
                                </div>
                              )}

                              {season.episodes.map((ep, epIdx) => renderEpisodeForm(
                                ep, epIdx,
                                (idx) => removeEpisode(sIdx, idx),
                                (idx, field, val) => updateEpisode(sIdx, idx, field, val),
                                (idx, file) => handleEpisodeVideo(sIdx, idx, file),
                                `new-ep-${sIdx}`,
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ===================== EXISTING SHOW ===================== */}
            {mode === 'existing' && (
              <>
                {/* Show Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Select Show <span className="text-red-500">*</span></label>
                  {existingShows.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 text-sm border border-dashed border-white/10 rounded-xl">
                      No shows found. Create a new show first.
                    </div>
                  ) : (
                    <select
                      value={selectedShowId}
                      onChange={(e) => { setSelectedShowId(e.target.value); setSelectedSeasonId(''); setAddNewSeason(false); }}
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500/40 text-sm appearance-none cursor-pointer"
                    >
                      <option value="">Choose a show...</option>
                      {existingShows.map(show => (
                        <option key={show.id} value={show.id}>{show.title} ({show.seasons.length} {show.seasons.length === 1 ? 'season' : 'seasons'})</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Season Selector */}
                {selectedShow && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Select Season <span className="text-red-500">*</span></label>
                    <div className="space-y-2">
                      {selectedShow.seasons.map(season => (
                        <button
                          key={season.id}
                          type="button"
                          onClick={() => { setSelectedSeasonId(season.id); setAddNewSeason(false); }}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all border ${
                            selectedSeasonId === season.id && !addNewSeason
                              ? 'bg-red-600/10 border-red-500/30 text-red-400'
                              : 'bg-[#1a1a1a] border-white/5 text-gray-300 hover:text-white hover:border-white/10'
                          }`}
                        >
                          <span className="font-medium">Season {season.season_number}{season.title ? `: ${season.title}` : ''}</span>
                          <span className="text-xs text-gray-500">{season.episode_count} {season.episode_count === 1 ? 'episode' : 'episodes'}</span>
                        </button>
                      ))}

                      {/* Add New Season */}
                      <button
                        type="button"
                        onClick={() => { setAddNewSeason(true); setSelectedSeasonId(''); }}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all border border-dashed ${
                          addNewSeason
                            ? 'bg-red-600/10 border-red-500/30 text-red-400'
                            : 'border-white/10 text-gray-400 hover:text-white hover:border-red-500/40'
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                        Create New Season {newSeasonNumber}
                      </button>
                    </div>

                    {/* New Season Title */}
                    {addNewSeason && (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Season {newSeasonNumber} Title</label>
                        <input
                          type="text"
                          value={newSeasonTitle}
                          onChange={(e) => setNewSeasonTitle(e.target.value)}
                          className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 text-sm"
                          placeholder={`Season ${newSeasonNumber}`}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Episodes to Add */}
                {(selectedSeasonId || addNewSeason) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-300">New Episodes</label>
                      <button type="button" onClick={addExistingEpisode} className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-sm font-medium transition-colors">
                        <Plus className="w-4 h-4" />
                        Add Episode
                      </button>
                    </div>

                    {existingEpisodes.map((ep, epIdx) => renderEpisodeForm(
                      ep, epIdx,
                      removeExistingEpisode,
                      (idx, field, val) => updateExistingEpisode(idx, field, val),
                      handleExistingEpisodeVideo,
                      'exist-ep',
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button type="submit" disabled={uploading || (mode === 'new' && !isSeries && !videoFile) || (mode === 'existing' && !selectedShowId)} className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/20">
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Uploading...</>
                ) : (
                  <><Upload className="w-4 h-4" />{mode === 'new' ? `Upload ${isSeries ? 'Series' : 'Film'}` : 'Add Episodes'}</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
