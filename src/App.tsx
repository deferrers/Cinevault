import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import UploadPage from './pages/UploadPage';
import WatchPage from './pages/WatchPage';

type View = 'home' | 'upload' | 'watch';

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

function AppContent() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<View>('home');
  const [activeShow, setActiveShow] = useState<Show | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const handleWatch = (show: Show) => {
    setActiveShow(show);
    setView('watch');
  };

  const handleBack = () => {
    setView('home');
    setActiveShow(null);
  };

  switch (view) {
    case 'upload':
      return <UploadPage onBack={handleBack} />;
    case 'watch':
      return activeShow ? <WatchPage show={activeShow} onBack={handleBack} /> : <HomePage onWatch={handleWatch} onUpload={() => setView('upload')} />;
    default:
      return <HomePage onWatch={handleWatch} onUpload={() => setView('upload')} />;
  }
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
